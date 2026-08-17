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
from app.billing.models import StatusChangeSource, UserStatusHistory, UserTopUp, VpnSyncJob
from app.config import Settings
from app.payments.yoomoney.models import (
    YooMoneyPayment,
    YooMoneyPaymentStatus,
    YooMoneyPaymentType,
)
from app.payments.yoomoney.service import calculate_payable_amount, notification_signature
from app.users.models import AccountStatus, User

SECRET = "notification-secret"


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
    router_module = importlib.import_module("app.payments.yoomoney.router")
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
                    AccountStatus.ACTIVE.value if status == AccountStatus.BLOCKED else None
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


async def _create_payment(
    client: AsyncClient, amount: str, payment_type: str = "AC"
) -> dict[str, object]:
    response = await client.post(
        "/api/users/me/top-up-payments",
        json={"amount": amount, "payment_type": payment_type},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _notification(
    payment: dict[str, object],
    *,
    amount: str | None = None,
    operation_id: str = "operation-1",
    **overrides: str,
) -> dict[str, str]:
    checkout = payment["checkout"]
    assert isinstance(checkout, dict)
    fields = checkout["fields"]
    assert isinstance(fields, dict)
    params = {
        "notification_type": (
            "p2p-incoming" if payment["payment_type"] == "PC" else "card-incoming"
        ),
        "operation_id": operation_id,
        "amount": amount or str(payment["credit_amount"]),
        "withdraw_amount": str(payment["payable_amount"]),
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


@pytest.mark.parametrize(
    ("payment_type", "credit", "payable"),
    [("PC", "100.00", "101.00"), ("AC", "100.00", "103.10"), ("AC", "10.01", "10.32")],
)
def test_payable_amount_is_rounded_up(
    payment_type: str, credit: str, payable: str
) -> None:
    assert calculate_payable_amount(
        Decimal(credit), YooMoneyPaymentType(payment_type)
    ) == Decimal(payable)


async def test_payment_creation_uses_authenticated_account_and_neutral_label(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(session_factory, name="Плательщик")
    await _login(client, "Плательщик")

    payment = await _create_payment(client, "100.00", "AC")

    assert payment["status"] == "pending"
    assert payment["credit_amount"] == "100.00"
    assert payment["payable_amount"] == "103.10"
    checkout = payment["checkout"]
    assert isinstance(checkout, dict)
    assert checkout["action"] == "https://yoomoney.ru/quickpay/confirm"
    fields = checkout["fields"]
    assert isinstance(fields, dict)
    assert fields["label"].startswith("pay_")
    assert len(fields["label"]) == 36
    assert fields["label"][4:].isalnum()
    assert fields["successURL"] == f"https://vpn.example.test/payments/{payment['id']}"
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
        "/api/users/me/top-up-payments", json={"amount": amount, "payment_type": "AC"}
    )
    assert response.status_code == 422


async def test_direct_top_up_is_no_longer_available(client: AsyncClient) -> None:
    response = await client.post("/api/users/me/top-ups", json={"amount": "100.00"})
    assert response.status_code in {401, 405}


async def test_signed_notification_credits_exact_internal_amount_and_history(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(session_factory, name="Успешный", balance=Decimal("0.20"))
    await _login(client, "Успешный")
    payment = await _create_payment(client, "100.00", "AC")

    response = await _send_notification(client, _notification(payment, amount="100.01"))

    assert response.status_code == 200
    status = await client.get(f"/api/users/me/top-up-payments/{payment['id']}")
    assert status.json()["status"] == "succeeded"
    assert status.json()["checkout"] is None
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.balance == Decimal("100.20")
        top_up = await db.scalar(select(UserTopUp).where(UserTopUp.user_id == user_id))
        assert top_up is not None
        assert top_up.amount == Decimal("100.00")
        assert top_up.yoomoney_payment_id == UUID(str(payment["id"]))


async def test_duplicate_notification_is_idempotent(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(session_factory, name="Дубликат")
    await _login(client, "Дубликат")
    payment = await _create_payment(client, "25.00", "PC")
    notification = _notification(payment)

    assert (await _send_notification(client, notification)).status_code == 200
    assert (await _send_notification(client, notification)).status_code == 200

    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.balance == Decimal("25.00")
        top_ups = (await db.scalars(select(UserTopUp).where(UserTopUp.user_id == user_id))).all()
        assert len(top_ups) == 1


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
        {"withdraw_amount": "1.00"},
        {"notification_type": "p2p-incoming"},
        {"unaccepted": "true"},
    ],
)
async def test_signed_mismatch_requires_review(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    overrides: dict[str, str],
) -> None:
    user_id = await _create_user(session_factory, name=f"Проверка-{next(iter(overrides))}")
    await _login(client, f"Проверка-{next(iter(overrides))}")
    payment = await _create_payment(client, "10.00", "AC")

    assert (await _send_notification(client, _notification(payment, **overrides))).status_code == 200

    status = (await client.get(f"/api/users/me/top-up-payments/{payment['id']}")).json()
    assert status["status"] == "review_required"
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.balance == Decimal("0.00")


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
    payment = await _create_payment(client, "50.00", "PC")

    assert (await _send_notification(client, _notification(payment))).status_code == 200

    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.account_status == AccountStatus.ACTIVE.value
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
        assert job is not None and job.desired_enabled is True


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


async def test_balance_overflow_requires_review(
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
    assert status["status"] == YooMoneyPaymentStatus.REVIEW_REQUIRED.value
    assert status["review_reason"] == "balance_overflow"
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
