from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.security import hash_password
from app.users.models import User


async def _login(
    client: AsyncClient,
    name: str,
    password: str,
) -> None:
    response = await client.post(
        "/api/auth/login",
        json={"name": name, "password": password},
    )
    assert response.status_code == 200, response.text


async def test_api_documentation_requires_authentication(client: AsyncClient) -> None:
    for path in ("/api/docs", "/api/redoc", "/api/openapi.json"):
        response = await client.get(path)
        assert response.status_code == 401


async def test_api_documentation_rejects_regular_user(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as db:
        db.add(User(name="Документация", password_hash=hash_password("user-password")))
        await db.commit()
    await _login(client, "Документация", "user-password")

    for path in ("/api/docs", "/api/redoc", "/api/openapi.json"):
        response = await client.get(path)
        assert response.status_code == 403


async def test_api_documentation_is_available_to_admin(client: AsyncClient) -> None:
    await _login(client, "admin", "admin-password")

    swagger = await client.get("/api/docs")
    redoc = await client.get("/api/redoc")
    schema = await client.get("/api/openapi.json")

    assert swagger.status_code == 200
    assert "Swagger UI" in swagger.text
    assert redoc.status_code == 200
    assert "ReDoc" in redoc.text
    assert schema.status_code == 200
    assert schema.json()["info"]["title"] == "VPNщики API"
    assert swagger.headers["cache-control"] == "no-store"
    assert redoc.headers["cache-control"] == "no-store"
    assert schema.headers["cache-control"] == "no-store"


async def test_default_public_documentation_routes_are_disabled(client: AsyncClient) -> None:
    for path in ("/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"):
        response = await client.get(path)
        assert response.status_code == 404
