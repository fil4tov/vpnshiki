from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.bootstrap import ensure_admin
from app.config import Settings
from app.users.models import User, UserRole


async def test_bootstrap_creates_admin_once(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    settings = Settings(admin_name="root", admin_password="bootstrap-password")
    async with session_factory() as db:
        await ensure_admin(db, settings)
        await ensure_admin(db, settings)
        users = (await db.scalars(select(User))).all()
        assert len(users) == 1
        assert users[0].role == UserRole.ADMIN.value
        assert users[0].password_hash != "bootstrap-password"

