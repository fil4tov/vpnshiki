from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.models import AuthSession
from app.auth.security import hash_password
from app.main import app
from app.users.models import User


async def login(client: AsyncClient, name: str = "admin", password: str = "admin-password"):
    return await client.post("/api/auth/login", json={"name": name, "password": password})


async def test_login_me_logout_and_exact_money(client: AsyncClient) -> None:
    response = await login(client, name="ADMIN")
    assert response.status_code == 200
    assert response.json()["balance"] == "100.10"
    assert response.json()["negative_balance_limit"] == "500.00"
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
            "is_active": True,
            "is_blocked": False,
        },
    )
    assert created.status_code == 201
    user_id = created.json()["id"]
    assert created.json()["balance"] == "-25.40"

    updated = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"is_blocked": True, "is_active": False, "balance": "12.34"},
    )
    assert updated.status_code == 200
    assert updated.json()["is_blocked"] is True
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


async def test_regular_user_can_toggle_until_blocked(
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
    toggled = await client.patch("/api/users/me/activity", json={"is_active": False})
    assert toggled.status_code == 200
    assert toggled.json()["is_active"] is False
    assert (await client.get("/api/admin/users")).status_code == 403

    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        user.is_blocked = True
        await db.commit()

    blocked = await client.patch("/api/users/me/activity", json={"is_active": True})
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "user_blocked"


async def test_last_admin_cannot_be_demoted(client: AsyncClient, admin: User) -> None:
    await login(client)
    response = await client.patch(f"/api/admin/users/{admin.id}", json={"role": "user"})
    assert response.status_code == 409
    assert response.json()["code"] == "last_admin"


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
