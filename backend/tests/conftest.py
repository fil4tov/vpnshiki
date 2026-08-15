from collections.abc import AsyncIterator
from decimal import Decimal

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.auth.security import hash_password
from app.db import Base, get_db
from app.main import app
from app.users.models import User, UserRole


@pytest_asyncio.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def admin(session_factory: async_sessionmaker[AsyncSession]) -> User:
    async with session_factory() as db:
        user = User(
            name="admin",
            password_hash=hash_password("admin-password"),
            role=UserRole.ADMIN.value,
            balance=Decimal("100.10"),
            negative_balance_limit=Decimal("500.00"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest_asyncio.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
    admin: User,
) -> AsyncIterator[AsyncClient]:
    del admin

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client
    app.dependency_overrides.clear()

