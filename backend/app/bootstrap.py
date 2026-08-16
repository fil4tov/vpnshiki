from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password
from app.billing.models import StatusChangeSource
from app.billing.service import add_initial_status_history
from app.config import Settings
from app.users.models import User, UserRole


async def ensure_admin(db: AsyncSession, settings: Settings) -> None:
    admin = await db.scalar(
        select(User.id)
        .where(User.role == UserRole.ADMIN.value, User.deleted_at.is_(None))
        .limit(1)
    )
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
    user = User(
        name=settings.admin_name.strip(),
        password_hash=hash_password(settings.admin_password),
        role=UserRole.ADMIN.value,
    )
    db.add(user)
    await add_initial_status_history(
        db,
        user,
        source=StatusChangeSource.BOOTSTRAP,
        changed_by_user_id=None,
    )
    await db.commit()
