import asyncio
import importlib
from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import urlencode
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.security import hash_password
from app.billing.models import StatusChangeSource, UserStatusHistory, VpnSyncJob
from app.config import Settings
from app.payments.models import (
    YooMoneyPayment,
    YooMoneyPaymentStatus,
    YooMoneyPaymentType,
)
from app.payments.service import notification_signature
from app.users.models import AccountStatus, User

SECRET = "notification-secret"


class FakeYooMoneyClient:
    def __init__(
        self,
        payload: dict[str, object] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.payload = payload or {"operations": []}
        self.error = error
        self.calls: list[tuple[datetime, str | None]] = []

    async def operation_history(
        self,
        *,
        from_datetime: datetime,
        label: str | None = None,
        start_record: str | None = None,
    ) -> dict[str, object]:
        assert start_record is None
        self.calls.append((from_datetime, label))
        if self.error is not None:
            raise self.error
        return self.payload


@pytest.fixture(autouse=True)
def yoomoney_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    settings = Settings(
        yoomoney_enabled=True,
        yoomoney_receiver="41001123456789",
        yoomoney_notification_secret=SECRET,
        yoomoney_access_token="access-token",
        yoomoney_reconciliation_enabled=False,
        public_app_url="https://vpn.example.test",
    )
    router_module = importlib.import_module("app.payments.router")
    monkeypatch.setattr(router_module, "get_settings", lambda: settings)
    return settings


async def _create_user(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    name: str,
    balance: Decimal = Decimal("0.00"),
    negative_balance_limit: Decimal = Decimal("100.00"),
    status: AccountStatus = AccountStatus.ACTIVE,
    status_source: StatusChangeSource = StatusChangeSource.ADMIN,
    previous_status: AccountStatus | None = None,
) -> UUID:
    async with session_factory() as db:
        user = User(
            name=name,
            password_hash=hash_password("user-password"),
            balance=balance,
            negative_balance_limit=negative_balance_limit,
            account_status=status.value,
        )
        db.add(user)
        await db.flush()
        db.add(
            UserStatusHistory(
                user_id=user.id,
                previous_status=(
                    previous_status.value
                    if previous_status is not None
                    else AccountStatus.ACTIVE.value
                    if status == AccountStatus.BLOCKED
                    else None
                ),
                new_status=status.value,
                changed_by_user_id=None,
                source=status_source.value,
                effective_at=datetime.now(UTC),
            )
        )
        await db.commit()
        return user.id


async def _login(client: AsyncClient, name: str, password: str = "user-password") -> None:
    response = await client.post("/api/auth/login", json={"name": name, "password": password})
    assert response.status_code == 200, response.text


async def _create_payment(client: AsyncClient, amount: str) -> dict[str, object]:
    response = await client.post(
        "/api/users/me/top-up-payments",
        json={"amount": amount},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _notification(
    payment: dict[str, object],
    *,
    amount: str | None = None,
    operation_id: str = "operation-1",
    notification_type: str = "card-incoming",
    **overrides: str,
) -> dict[str, str]:
    checkout = payment["checkout"]
    assert isinstance(checkout, dict)
    fields = checkout["fields"]
    assert isinstance(fields, dict)
    params = {
        "notification_type": notification_type,
        "operation_id": operation_id,
        "amount": amount or str(payment["requested_amount"]),
        "withdraw_amount": str(payment["requested_amount"]),
        "currency": "643",
        "datetime": "2026-08-17T10:00:00Z",
        "sender": "",
        "codepro": "false",
        "label": str(fields["label"]),
        "unaccepted": "false",
    }
    params.update(overrides)
    params["sign"] = notification_signature(params, SECRET)
    return params


async def _send_notification(client: AsyncClient, params: dict[str, str]):
    return await client.post(
        "/api/payments/yoomoney/webhook",
        content=urlencode(params),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


def _enable_targeted_reconciliation(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    fake_client: FakeYooMoneyClient,
) -> None:
    settings.yoomoney_reconciliation_enabled = True
    service_module = importlib.import_module("app.payments.service")
    monkeypatch.setattr(service_module, "YooMoneyClient", lambda _settings: fake_client)


async def test_payment_creation_uses_authenticated_account_and_neutral_label(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(session_factory, name="Плательщик")
    await _login(client, "Плательщик")

    payment = await _create_payment(client, "100.00")

    assert payment["status"] == "pending"
    assert payment["requested_amount"] == "100.00"
    assert payment["received_amount"] is None
    checkout = payment["checkout"]
    assert isinstance(checkout, dict)
    assert checkout["action"] == "https://yoomoney.ru/quickpay/confirm"
    fields = checkout["fields"]
    assert isinstance(fields, dict)
    assert fields["label"].startswith("pay_")
    assert len(fields["label"]) == 36
    assert fields["label"][4:].isalnum()
    assert fields["successURL"] == f"https://vpn.example.test/payments/{payment['id']}"
    assert fields["paymentType"] == "AC"
    assert fields["sum"] == "100.00"
    async with session_factory() as db:
        stored = await db.get(YooMoneyPayment, UUID(str(payment["id"])))
        assert stored is not None
        assert stored.user_id == user_id


@pytest.mark.parametrize("amount", ["9.99", "5000.01", "0", "0.001"])
async def test_payment_creation_validates_amount(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    amount: str,
) -> None:
    await _create_user(session_factory, name=f"Ошибка-{amount}")
    await _login(client, f"Ошибка-{amount}")
    response = await client.post(
        "/api/users/me/top-up-payments", json={"amount": amount}
    )
    assert response.status_code == 422


async def test_direct_top_up_is_no_longer_available(client: AsyncClient) -> None:
    response = await client.post("/api/users/me/top-ups", json={"amount": "100.00"})
    assert response.status_code in {401, 405}


async def test_signed_notification_credits_received_amount_and_history(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(session_factory, name="Успешный", balance=Decimal("0.20"))
    await _login(client, "Успешный")
    payment = await _create_payment(client, "100.00")

    response = await _send_notification(client, _notification(payment, amount="97.00"))

    assert response.status_code == 200
    status = await client.get(f"/api/users/me/top-up-payments/{payment['id']}")
    assert status.json()["status"] == "succeeded"
    assert status.json()["checkout"] is None
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.balance == Decimal("97.20")
        stored_payment = await db.get(YooMoneyPayment, UUID(str(payment["id"])))
        assert stored_payment is not None
        assert stored_payment.received_amount == Decimal("97.00")
        assert stored_payment.balance_before == Decimal("0.20")
        assert stored_payment.balance_after == Decimal("97.20")


async def test_duplicate_notification_is_idempotent(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(session_factory, name="Дубликат")
    await _login(client, "Дубликат")
    payment = await _create_payment(client, "25.00")
    notification = _notification(payment)

    assert (await _send_notification(client, notification)).status_code == 200
    assert (await _send_notification(client, notification)).status_code == 200

    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.balance == Decimal("25.00")
        stored_payment = await db.get(YooMoneyPayment, UUID(str(payment["id"])))
        assert stored_payment is not None
        assert stored_payment.status == YooMoneyPaymentStatus.SUCCEEDED.value
        assert stored_payment.balance_before == Decimal("0.00")
        assert stored_payment.balance_after == Decimal("25.00")


async def test_invalid_signature_does_not_change_balance(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(session_factory, name="Подпись")
    await _login(client, "Подпись")
    payment = await _create_payment(client, "10.00")
    notification = _notification(payment)
    notification["sign"] = "invalid"

    assert (await _send_notification(client, notification)).status_code == 400
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.balance == Decimal("0.00")


async def test_test_notification_is_acknowledged_without_credit(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(session_factory, name="Тестовое")
    await _login(client, "Тестовое")
    payment = await _create_payment(client, "10.00")
    notification = _notification(payment, test_notification="true")
    notification["sign"] = notification_signature(notification, SECRET)

    assert (await _send_notification(client, notification)).status_code == 200
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.balance == Decimal("0.00")


async def test_empty_settings_notification_is_acknowledged(client: AsyncClient) -> None:
    response = await client.post(
        "/api/payments/yoomoney/webhook",
        content=b"",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200


@pytest.mark.parametrize(
    "overrides",
    [
        {"currency": "840"},
        {"notification_type": "unknown-incoming"},
        {"unaccepted": "true"},
        {"amount": "0.00"},
        {"withdraw_amount": "0.00"},
    ],
)
async def test_invalid_signed_notification_keeps_payment_pending(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    overrides: dict[str, str],
) -> None:
    user_id = await _create_user(session_factory, name=f"Проверка-{next(iter(overrides))}")
    await _login(client, f"Проверка-{next(iter(overrides))}")
    payment = await _create_payment(client, "10.00")

    assert (await _send_notification(client, _notification(payment, **overrides))).status_code == 200

    status = (await client.get(f"/api/users/me/top-up-payments/{payment['id']}")).json()
    assert status["status"] == "pending"
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.balance == Decimal("0.00")


async def test_wallet_notification_accepts_changed_withdrawn_amount(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(session_factory, name="Кошелёк")
    await _login(client, "Кошелёк")
    payment = await _create_payment(client, "10.00")

    notification = _notification(
        payment,
        amount="9.90",
        notification_type="p2p-incoming",
        withdraw_amount="11.00",
    )
    assert (await _send_notification(client, notification)).status_code == 200

    status = (await client.get(f"/api/users/me/top-up-payments/{payment['id']}")).json()
    assert status["status"] == "succeeded"
    assert status["requested_amount"] == "10.00"
    assert status["received_amount"] == "9.90"
    async with session_factory() as db:
        user = await db.get(User, user_id)
        stored = await db.get(YooMoneyPayment, UUID(str(payment["id"])))
        assert user is not None and user.balance == Decimal("9.90")
        assert stored is not None
        assert stored.withdrawn_amount == Decimal("11.00")
        assert stored.payment_type == YooMoneyPaymentType.WALLET.value


async def test_payment_status_is_private(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _create_user(session_factory, name="Владелец")
    await _create_user(session_factory, name="Другой")
    await _login(client, "Владелец")
    payment = await _create_payment(client, "10.00")
    await _login(client, "Другой")
    assert (await client.get(f"/api/users/me/top-up-payments/{payment['id']}")).status_code == 404


async def test_targeted_reconciliation_credits_matching_operation(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    yoomoney_settings: Settings,
) -> None:
    user_id = await _create_user(session_factory, name="Адресная сверка")
    await _login(client, "Адресная сверка")
    payment = await _create_payment(client, "100.00")
    checkout = payment["checkout"]
    assert isinstance(checkout, dict)
    fields = checkout["fields"]
    assert isinstance(fields, dict)
    label = str(fields["label"])
    fake_client = FakeYooMoneyClient(
        {
            "operations": [
                {
                    "operation_id": "targeted-operation",
                    "status": "success",
                    "direction": "in",
                    "amount": "97.00",
                    "datetime": "2026-08-18T00:00:00Z",
                    "label": label,
                }
            ]
        }
    )
    _enable_targeted_reconciliation(monkeypatch, yoomoney_settings, fake_client)

    response = await client.post(
        f"/api/users/me/top-up-payments/{payment['id']}/reconcile"
    )

    assert response.status_code == 200
    assert response.json()["status"] == "succeeded"
    assert response.json()["received_amount"] == "97.00"
    assert len(fake_client.calls) == 1
    from_datetime, requested_label = fake_client.calls[0]
    assert from_datetime.tzinfo is not None
    assert requested_label == label
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None and user.balance == Decimal("97.00")


async def test_targeted_reconciliation_respects_cooldown_when_operation_is_missing(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    yoomoney_settings: Settings,
) -> None:
    await _create_user(session_factory, name="Cooldown")
    await _login(client, "Cooldown")
    payment = await _create_payment(client, "20.00")
    fake_client = FakeYooMoneyClient()
    _enable_targeted_reconciliation(monkeypatch, yoomoney_settings, fake_client)

    first, second = await asyncio.gather(
        client.post(f"/api/users/me/top-up-payments/{payment['id']}/reconcile"),
        client.post(f"/api/users/me/top-up-payments/{payment['id']}/reconcile"),
    )

    assert first.status_code == 200 and first.json()["status"] == "pending"
    assert second.status_code == 200 and second.json()["status"] == "pending"
    assert len(fake_client.calls) == 1
    async with session_factory() as db:
        stored = await db.get(YooMoneyPayment, UUID(str(payment["id"])))
        assert stored is not None and stored.last_reconciliation_check_at is not None


async def test_targeted_reconciliation_hides_provider_error_and_keeps_pending(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    yoomoney_settings: Settings,
) -> None:
    await _create_user(session_factory, name="Ошибка сверки")
    await _login(client, "Ошибка сверки")
    payment = await _create_payment(client, "20.00")
    fake_client = FakeYooMoneyClient(error=RuntimeError("provider unavailable"))
    _enable_targeted_reconciliation(monkeypatch, yoomoney_settings, fake_client)

    response = await client.post(
        f"/api/users/me/top-up-payments/{payment['id']}/reconcile"
    )

    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    assert len(fake_client.calls) == 1


async def test_targeted_reconciliation_is_local_when_disabled(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    yoomoney_settings: Settings,
) -> None:
    await _create_user(session_factory, name="Сверка выключена")
    await _login(client, "Сверка выключена")
    payment = await _create_payment(client, "20.00")
    fake_client = FakeYooMoneyClient()
    service_module = importlib.import_module("app.payments.service")
    monkeypatch.setattr(service_module, "YooMoneyClient", lambda _settings: fake_client)

    response = await client.post(
        f"/api/users/me/top-up-payments/{payment['id']}/reconcile"
    )

    assert yoomoney_settings.yoomoney_reconciliation_enabled is False
    assert response.status_code == 200 and response.json()["status"] == "pending"
    assert fake_client.calls == []


async def test_targeted_reconciliation_short_circuits_succeeded_and_private_payments(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    yoomoney_settings: Settings,
) -> None:
    await _create_user(session_factory, name="Владелец сверки")
    await _create_user(session_factory, name="Чужая сверка")
    await _login(client, "Владелец сверки")
    payment = await _create_payment(client, "20.00")
    assert (await _send_notification(client, _notification(payment, amount="19.40"))).is_success
    fake_client = FakeYooMoneyClient()
    _enable_targeted_reconciliation(monkeypatch, yoomoney_settings, fake_client)

    succeeded = await client.post(
        f"/api/users/me/top-up-payments/{payment['id']}/reconcile"
    )
    await _login(client, "Чужая сверка")
    private = await client.post(
        f"/api/users/me/top-up-payments/{payment['id']}/reconcile"
    )

    assert succeeded.status_code == 200 and succeeded.json()["status"] == "succeeded"
    assert private.status_code == 404
    assert fake_client.calls == []


async def test_successful_payment_reactivates_only_billing_block(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Финансовая блокировка",
        balance=Decimal("-150.00"),
        status=AccountStatus.BLOCKED,
        status_source=StatusChangeSource.BILLING,
    )
    await _login(client, "Финансовая блокировка")
    payment = await _create_payment(client, "50.00")

    assert (await _send_notification(client, _notification(payment))).status_code == 200

    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.account_status == AccountStatus.ACTIVE.value
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
        assert job is not None and job.desired_enabled is True


async def test_successful_payment_restores_paused_status_before_billing_block(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Приостановленная финансовая блокировка",
        balance=Decimal("-150.00"),
        status=AccountStatus.BLOCKED,
        status_source=StatusChangeSource.BILLING,
        previous_status=AccountStatus.PAUSED,
    )
    await _login(client, "Приостановленная финансовая блокировка")
    payment = await _create_payment(client, "50.00")

    assert (await _send_notification(client, _notification(payment))).status_code == 200

    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.account_status == AccountStatus.PAUSED.value
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
        assert job is not None and job.desired_enabled is False


async def test_successful_payment_preserves_manual_block(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Ручная блокировка",
        balance=Decimal("-20.00"),
        status=AccountStatus.BLOCKED,
        status_source=StatusChangeSource.ADMIN,
    )
    await _login(client, "Ручная блокировка")
    payment = await _create_payment(client, "20.00")
    assert (await _send_notification(client, _notification(payment))).status_code == 200
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.account_status == AccountStatus.BLOCKED.value
        assert await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id)) is None


async def test_balance_overflow_keeps_payment_pending(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Переполнение",
        balance=Decimal("999999999999.99"),
    )
    await _login(client, "Переполнение")
    payment = await _create_payment(client, "10.00")
    assert (await _send_notification(client, _notification(payment))).status_code == 200
    status = (await client.get(f"/api/users/me/top-up-payments/{payment['id']}")).json()
    assert status["status"] == YooMoneyPaymentStatus.PENDING.value
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None and user.balance == Decimal("999999999999.99")


def test_signature_uses_all_fields_and_rfc3986_encoding() -> None:
    params = {
        "amount": "100.00",
        "empty": "",
        "label": "pay_123",
        "message": "Иван + тест/путь",
        "sign": "ignored",
    }
    first = notification_signature(params, SECRET)
    assert first == notification_signature({**params, "sign": "other"}, SECRET)
    assert first != notification_signature({**params, "empty": "changed"}, SECRET)
