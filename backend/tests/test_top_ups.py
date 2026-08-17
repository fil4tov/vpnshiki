from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.security import hash_password
from app.billing.models import (
    StatusChangeSource,
    UserStatusHistory,
    UserTopUp,
    VpnSyncJob,
)
from app.users.models import AccountStatus, User


async def _create_user(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    name: str,
    balance: Decimal,
    negative_balance_limit: Decimal,
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


async def test_top_up_adds_exact_money_and_history(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Пополнение",
        balance=Decimal("0.20"),
        negative_balance_limit=Decimal("100.00"),
    )
    await _login(client, "Пополнение")

    response = await client.post("/api/users/me/top-ups", json={"amount": "0.10"})

    assert response.status_code == 200
    assert response.json()["balance"] == "0.30"
    history_response = await client.get("/api/users/me/top-ups")
    assert history_response.status_code == 200
    assert [item["amount"] for item in history_response.json()] == ["0.10"]
    async with session_factory() as db:
        top_ups = (
            await db.scalars(select(UserTopUp).where(UserTopUp.user_id == user_id))
        ).all()
        assert len(top_ups) == 1
        assert top_ups[0].amount == Decimal("0.10")
        assert top_ups[0].balance_before == Decimal("0.20")
        assert top_ups[0].balance_after == Decimal("0.30")


@pytest.mark.parametrize("amount", ["0", "-1", "0.001", "1000000000000.00"])
async def test_top_up_rejects_invalid_amounts(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    amount: str,
) -> None:
    await _create_user(
        session_factory,
        name=f"Ошибка-{amount}",
        balance=Decimal("0.00"),
        negative_balance_limit=Decimal("100.00"),
    )
    await _login(client, f"Ошибка-{amount}")

    response = await client.post("/api/users/me/top-ups", json={"amount": amount})

    assert response.status_code == 422


async def test_top_up_rejects_resulting_balance_overflow(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Переполнение",
        balance=Decimal("999999999999.99"),
        negative_balance_limit=Decimal("0.00"),
    )
    await _login(client, "Переполнение")

    response = await client.post("/api/users/me/top-ups", json={"amount": "0.01"})

    assert response.status_code == 400
    assert response.json()["field_errors"] == {
        "amount": "Итоговый баланс превышает допустимое значение"
    }
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.balance == Decimal("999999999999.99")
        assert await db.scalar(select(UserTopUp).where(UserTopUp.user_id == user_id)) is None


async def test_top_up_requires_authentication(client: AsyncClient) -> None:
    response = await client.post("/api/users/me/top-ups", json={"amount": "10.00"})

    assert response.status_code == 401
    assert (await client.get("/api/users/me/top-ups")).status_code == 401
    assert (await client.get("/api/users/me/charges")).status_code == 401


async def test_top_up_reactivates_billing_block_at_exact_limit(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Финансовая блокировка",
        balance=Decimal("-150.00"),
        negative_balance_limit=Decimal("100.00"),
        status=AccountStatus.BLOCKED,
        status_source=StatusChangeSource.BILLING,
    )
    await _login(client, "Финансовая блокировка")

    response = await client.post("/api/users/me/top-ups", json={"amount": "50.00"})

    assert response.status_code == 200
    assert response.json()["balance"] == "-100.00"
    assert response.json()["account_status"] == AccountStatus.ACTIVE.value
    async with session_factory() as db:
        statuses = (
            await db.scalars(
                select(UserStatusHistory)
                .where(UserStatusHistory.user_id == user_id)
                .order_by(UserStatusHistory.created_at)
            )
        ).all()
        assert [item.source for item in statuses] == ["billing", "top_up"]
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
        assert job is not None
        assert job.desired_enabled is True


async def test_partial_top_up_keeps_billing_blocked(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Частичное пополнение",
        balance=Decimal("-150.00"),
        negative_balance_limit=Decimal("100.00"),
        status=AccountStatus.BLOCKED,
        status_source=StatusChangeSource.BILLING,
    )
    await _login(client, "Частичное пополнение")

    response = await client.post("/api/users/me/top-ups", json={"amount": "49.99"})

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.BLOCKED.value
    async with session_factory() as db:
        assert await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id)) is None


@pytest.mark.parametrize(
    ("status", "source"),
    [
        (AccountStatus.BLOCKED, StatusChangeSource.ADMIN),
        (AccountStatus.PAUSED, StatusChangeSource.ADMIN),
    ],
)
async def test_top_up_preserves_non_billing_inactive_status(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    status: AccountStatus,
    source: StatusChangeSource,
) -> None:
    user_id = await _create_user(
        session_factory,
        name=f"Статус-{status.value}",
        balance=Decimal("-150.00"),
        negative_balance_limit=Decimal("100.00"),
        status=status,
        status_source=source,
    )
    await _login(client, f"Статус-{status.value}")

    response = await client.post("/api/users/me/top-ups", json={"amount": "100.00"})

    assert response.status_code == 200
    assert response.json()["account_status"] == status.value
    async with session_factory() as db:
        assert await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id)) is None


@pytest.mark.parametrize(
    "payload",
    [
        {"balance": "-100.00"},
        {"negative_balance_limit": "150.00"},
        {"balance": "-120.00", "negative_balance_limit": "120.00"},
    ],
)
async def test_admin_financial_change_reactivates_without_top_up_history(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    payload: dict[str, str],
) -> None:
    user_id = await _create_user(
        session_factory,
        name=f"Админ-{len(payload)}-{payload.get('balance', 'limit')}",
        balance=Decimal("-150.00"),
        negative_balance_limit=Decimal("100.00"),
        status=AccountStatus.BLOCKED,
        status_source=StatusChangeSource.BILLING,
    )
    await _login(client, "admin", "admin-password")

    response = await client.patch(f"/api/admin/users/{user_id}", json=payload)

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.ACTIVE.value
    users = (await client.get("/api/admin/users")).json()
    target = next(user for user in users if user["id"] == str(user_id))
    assert target["total_top_ups"] == "0.00"
    async with session_factory() as db:
        assert await db.scalar(select(UserTopUp).where(UserTopUp.user_id == user_id)) is None
        status_change = await db.scalar(
            select(UserStatusHistory)
            .where(
                UserStatusHistory.user_id == user_id,
                UserStatusHistory.source == StatusChangeSource.ADMIN.value,
                UserStatusHistory.new_status == AccountStatus.ACTIVE.value,
            )
        )
        assert status_change is not None
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
        assert job is not None
        assert job.desired_enabled is True


async def test_admin_limit_change_does_not_immediately_block_active_user(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Новый лимит",
        balance=Decimal("-150.00"),
        negative_balance_limit=Decimal("200.00"),
    )
    await _login(client, "admin", "admin-password")

    response = await client.patch(
        f"/api/admin/users/{user_id}", json={"negative_balance_limit": "100.00"}
    )

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.ACTIVE.value


async def test_admin_balance_change_preserves_manual_block(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Ручная блокировка",
        balance=Decimal("-150.00"),
        negative_balance_limit=Decimal("100.00"),
        status=AccountStatus.BLOCKED,
        status_source=StatusChangeSource.ADMIN,
    )
    await _login(client, "admin", "admin-password")

    response = await client.patch(
        f"/api/admin/users/{user_id}", json={"balance": "100.00"}
    )

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.BLOCKED.value
