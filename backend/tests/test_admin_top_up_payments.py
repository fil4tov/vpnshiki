from datetime import UTC, datetime, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.security import hash_password
from app.payments.models import YooMoneyPayment, YooMoneyPaymentStatus, YooMoneyPaymentType
from app.users.models import User


async def _login(client: AsyncClient, name: str, password: str) -> None:
    response = await client.post("/api/auth/login", json={"name": name, "password": password})
    assert response.status_code == 200, response.text


async def test_admin_lists_complete_yoomoney_payment_records(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    created_at = datetime(2026, 8, 18, 10, 0, tzinfo=UTC)
    async with session_factory() as db:
        user = User(
            name="Плательщик",
            password_hash=hash_password("user-password"),
            balance=Decimal("97.40"),
        )
        db.add(user)
        await db.flush()
        pending = YooMoneyPayment(
            user_id=user.id,
            label="pay_pending",
            requested_amount=Decimal("50.00"),
            status=YooMoneyPaymentStatus.PENDING.value,
            last_reconciliation_check_at=created_at + timedelta(minutes=1),
            created_at=created_at + timedelta(hours=1),
        )
        succeeded = YooMoneyPayment(
            user_id=user.id,
            label="pay_succeeded",
            requested_amount=Decimal("100.00"),
            withdrawn_amount=Decimal("103.00"),
            received_amount=Decimal("97.40"),
            payment_type=YooMoneyPaymentType.CARD.value,
            operation_id="operation-42",
            status=YooMoneyPaymentStatus.SUCCEEDED.value,
            created_at=created_at,
            paid_at=created_at + timedelta(minutes=2),
        )
        db.add_all([pending, succeeded])
        await db.commit()

    await _login(client, "admin", "admin-password")
    response = await client.get("/api/admin/top-up-payments")

    assert response.status_code == 200
    payments = response.json()
    assert [payment["label"] for payment in payments] == ["pay_pending", "pay_succeeded"]
    assert payments[0] == {
        "id": str(pending.id),
        "user_id": str(user.id),
        "user_name": "Плательщик",
        "label": "pay_pending",
        "requested_amount": "50.00",
        "withdrawn_amount": None,
        "received_amount": None,
        "payment_type": None,
        "operation_id": None,
        "status": "pending",
        "last_reconciliation_check_at": "2026-08-18T10:01:00",
        "created_at": "2026-08-18T11:00:00",
        "paid_at": None,
    }
    assert payments[1]["requested_amount"] == "100.00"
    assert payments[1]["withdrawn_amount"] == "103.00"
    assert payments[1]["received_amount"] == "97.40"
    assert payments[1]["payment_type"] == "AC"
    assert payments[1]["operation_id"] == "operation-42"


async def test_admin_payment_list_rejects_regular_user(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as db:
        user = User(
            name="Не администратор",
            password_hash=hash_password("user-password"),
            balance=Decimal("0.00"),
        )
        db.add(user)
        await db.commit()

    await _login(client, "Не администратор", "user-password")
    response = await client.get("/api/admin/top-up-payments")

    assert response.status_code == 403
