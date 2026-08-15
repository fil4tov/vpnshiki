from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password
from app.config import Settings
from app.users.models import User, UserRole


async def ensure_admin(db: AsyncSession, settings: Settings) -> None:
    admin = await db.scalar(select(User.id).where(User.role == UserRole.ADMIN.value).limit(1))
    if admin is not None:
        return
    if not settings.admin_name or not settings.admin_password:
        raise RuntimeError(
            "ADMIN_NAME and ADMIN_PASSWORD are required when the database has no administrator"
        )
    if not 2 <= len(settings.admin_name.strip()) <= 64:
        raise RuntimeError("ADMIN_NAME must contain from 2 to 64 characters")
    if not 8 <= len(settings.admin_password) <= 128:
        raise RuntimeError("ADMIN_PASSWORD must contain from 8 to 128 characters")
    db.add(
        User(
            name=settings.admin_name.strip(),
            password_hash=hash_password(settings.admin_password),
            role=UserRole.ADMIN.value,
        )
    )
    await db.commit()

