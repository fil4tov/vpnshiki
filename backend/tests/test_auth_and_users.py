from datetime import date
from decimal import Decimal
from uuid import UUID

from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.models import AuthSession
from app.auth.security import hash_password
from app.main import app
from app.tariff_plans.models import TariffPlan
from app.users.models import AccountStatus, User


async def login(client: AsyncClient, name: str = "admin", password: str = "admin-password"):
    return await client.post("/api/auth/login", json={"name": name, "password": password})


async def test_login_me_logout_and_exact_money(client: AsyncClient) -> None:
    response = await login(client, name="ADMIN")
    assert response.status_code == 200
    assert response.json()["balance"] == "100.10"
    assert response.json()["negative_balance_limit"] == "500.00"
    assert response.json()["account_status"] == "active"
    assert "is_active" not in response.json()
    assert "is_blocked" not in response.json()
    assert (await client.get("/api/auth/me")).json()["name"] == "admin"
    assert (await client.post("/api/auth/logout")).status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_invalid_login_uses_stable_error(client: AsyncClient) -> None:
    response = await login(client, password="wrong-password")
    assert response.status_code == 401
    assert response.json() == {"code": "invalid_credentials", "message": "Неверное имя или пароль"}


async def test_admin_creates_and_updates_user(client: AsyncClient) -> None:
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={
            "name": "Лена",
            "password": "strong-password",
            "balance": "-25.40",
            "negative_balance_limit": "300.00",
            "role": "user",
            "account_status": "active",
        },
    )
    assert created.status_code == 201
    user_id = UUID(created.json()["id"])
    assert created.json()["balance"] == "-25.40"

    updated = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"account_status": "blocked", "balance": "12.34"},
    )
    assert updated.status_code == 200
    assert updated.json()["account_status"] == "blocked"
    assert updated.json()["balance"] == "12.34"
    users = (await client.get("/api/admin/users")).json()
    assert [user["name"] for user in users] == ["admin", "Лена"]


async def test_names_are_unique_case_insensitively(client: AsyncClient) -> None:
    await login(client)
    response = await client.post(
        "/api/admin/users",
        json={"name": "ADMIN", "password": "another-password"},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "name_taken"


async def test_regular_user_cannot_change_account_status(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as db:
        user = User(name="Илья", password_hash=hash_password("user-password"))
        db.add(user)
        await db.commit()
        await db.refresh(user)
        user_id = user.id

    login_response = await login(client, "Илья", "user-password")
    assert login_response.status_code == 200, login_response.text
    update = await client.patch("/api/users/me/activity", json={"account_status": "paused"})
    assert update.status_code == 404
    assert (await client.get("/api/admin/users")).status_code == 403

    async with session_factory() as db:
        unchanged_user = await db.get(User, user_id)
        assert unchanged_user is not None
        assert unchanged_user.account_status == AccountStatus.ACTIVE.value


async def test_daily_charge_uses_current_plan_and_active_users(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    admin: User,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.tariff_plans.service.moscow_today", lambda: date(2026, 8, 16))
    async with session_factory() as db:
        db.add(
            TariffPlan(
                name="TP_01.08.2026",
                monthly_amount=Decimal("3100.00"),
                start_date=date(2026, 8, 1),
            )
        )
        db.add(User(name="Участник", password_hash=hash_password("user-password")))
        await db.commit()

    await login(client)
    response = await client.get("/api/users/me/daily-charge")
    assert response.status_code == 200
    assert response.json() == {"daily_charge": "50.00"}

    await client.patch(
        f"/api/admin/users/{admin.id}",
        json={"account_status": "paused"},
    )
    paused_response = await client.get("/api/users/me/daily-charge")
    assert paused_response.json() == {"daily_charge": "0.00"}


async def test_last_admin_cannot_be_demoted(client: AsyncClient, admin: User) -> None:
    await login(client)
    response = await client.patch(f"/api/admin/users/{admin.id}", json={"role": "user"})
    assert response.status_code == 409
    assert response.json()["code"] == "last_admin"


async def test_admin_deletes_user_and_revokes_sessions(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={"name": "Удаляемый", "password": "user-password"},
    )
    user_id = UUID(created.json()["id"])

    user_client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    try:
        assert (await login(user_client, "Удаляемый", "user-password")).status_code == 200
        response = await client.delete(f"/api/admin/users/{user_id}")
        assert response.status_code == 204
        assert (await user_client.get("/api/auth/me")).status_code == 401

        async with session_factory() as db:
            assert await db.get(User, user_id) is None
            session_count = await db.scalar(
                select(func.count()).select_from(AuthSession).where(AuthSession.user_id == user_id)
            )
            assert session_count == 0
    finally:
        await user_client.aclose()


async def test_admin_cannot_delete_self(client: AsyncClient, admin: User) -> None:
    await login(client)
    response = await client.delete(f"/api/admin/users/{admin.id}")
    assert response.status_code == 409
    assert response.json() == {
        "code": "cannot_delete_self",
        "message": "Нельзя удалить собственный аккаунт",
    }


async def test_password_change_revokes_other_sessions(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    first = await login(client)
    assert first.status_code == 200
    other = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    try:
        assert (await login(other)).status_code == 200
        response = await client.post(
            "/api/users/me/password",
            json={"current_password": "admin-password", "new_password": "new-admin-password"},
        )
        assert response.status_code == 200
        assert (await other.get("/api/auth/me")).status_code == 401
        assert (await client.get("/api/auth/me")).status_code == 200
        async with session_factory() as db:
            count = await db.scalar(select(func.count()).select_from(AuthSession))
            assert count == 1
    finally:
        await other.aclose()
