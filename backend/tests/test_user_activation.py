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
    VpnSyncJob,
)
from app.users.models import AccountStatus, User


async def _create_user(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    name: str,
    status: AccountStatus,
    balance: Decimal = Decimal("0.00"),
    negative_balance_limit: Decimal = Decimal("100.00"),
) -> UUID:
    async with session_factory() as db:
        user = User(
            name=name,
            password_hash=hash_password("user-password"),
            account_status=status.value,
            balance=balance,
            negative_balance_limit=negative_balance_limit,
        )
        db.add(user)
        await db.flush()
        db.add(
            UserStatusHistory(
                user_id=user.id,
                previous_status=None,
                new_status=status.value,
                changed_by_user_id=None,
                source=StatusChangeSource.ADMIN.value,
                effective_at=user.created_at,
            )
        )
        await db.commit()
        return user.id


async def _login(client: AsyncClient, name: str) -> None:
    response = await client.post(
        "/api/auth/login",
        json={"name": name, "password": "user-password"},
    )
    assert response.status_code == 200, response.text


async def test_activation_requires_authentication(client: AsyncClient) -> None:
    response = await client.post("/api/users/me/activation")

    assert response.status_code == 401


async def test_paused_user_activates_at_exact_balance_limit(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sync_requests = 0

    def request_vpn_sync() -> None:
        nonlocal sync_requests
        sync_requests += 1

    monkeypatch.setattr("app.users.router.request_vpn_sync_processing", request_vpn_sync)
    user_id = await _create_user(
        session_factory,
        name="Самоактивация",
        status=AccountStatus.PAUSED,
        balance=Decimal("-100.00"),
    )
    await _login(client, "Самоактивация")

    response = await client.post("/api/users/me/activation")

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.ACTIVE.value
    assert sync_requests == 1
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.account_status == AccountStatus.ACTIVE.value
        history = (
            await db.scalars(
                select(UserStatusHistory)
                .where(UserStatusHistory.user_id == user_id)
                .order_by(UserStatusHistory.created_at)
            )
        ).all()
        assert [entry.new_status for entry in history] == ["paused", "active"]
        assert history[-1].previous_status == AccountStatus.PAUSED.value
        assert history[-1].source == StatusChangeSource.USER.value
        assert history[-1].changed_by_user_id == user_id
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
        assert job is not None
        assert job.desired_enabled is True


async def test_activation_rejects_insufficient_balance(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Недостаточный баланс",
        status=AccountStatus.PAUSED,
        balance=Decimal("-100.01"),
    )
    await _login(client, "Недостаточный баланс")

    response = await client.post("/api/users/me/activation")

    assert response.status_code == 409
    assert response.json()["code"] == "insufficient_balance"
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.account_status == AccountStatus.PAUSED.value
        assert await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id)) is None


@pytest.mark.parametrize("status", [AccountStatus.ACTIVE, AccountStatus.BLOCKED])
async def test_activation_rejects_accounts_that_are_not_paused(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    status: AccountStatus,
) -> None:
    name = f"Неверный статус {status.value}"
    user_id = await _create_user(session_factory, name=name, status=status)
    await _login(client, name)

    response = await client.post("/api/users/me/activation")

    assert response.status_code == 409
    assert response.json()["code"] == "account_not_paused"
    async with session_factory() as db:
        history = (
            await db.scalars(select(UserStatusHistory).where(UserStatusHistory.user_id == user_id))
        ).all()
        assert len(history) == 1
        assert await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id)) is None


async def test_activation_rolls_back_status_when_vpn_job_cannot_be_queued(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = await _create_user(
        session_factory,
        name="Атомарная активация",
        status=AccountStatus.PAUSED,
    )
    await _login(client, "Атомарная активация")

    async def fail_to_queue(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("queue unavailable")

    monkeypatch.setattr("app.users.router.queue_vpn_sync", fail_to_queue)

    with pytest.raises(RuntimeError, match="queue unavailable"):
        await client.post("/api/users/me/activation")

    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.account_status == AccountStatus.PAUSED.value
        history = (
            await db.scalars(select(UserStatusHistory).where(UserStatusHistory.user_id == user_id))
        ).all()
        assert len(history) == 1
        assert await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id)) is None
