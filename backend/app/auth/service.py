from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.models import AuthSession
from app.auth.schemas import Credentials
from app.auth.security import (
    DUMMY_PASSWORD_HASH,
    digest_session_token,
    generate_session_token,
    verify_password,
)
from app.config import get_settings
from app.errors import ApiError
from app.users.models import User


def _session_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=get_settings().session_days)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def new_session(user: User) -> tuple[AuthSession, str]:
    token = generate_session_token()
    return (
        AuthSession(user=user, token_hash=digest_session_token(token), expires_at=_session_expiry()),
        token,
    )


async def login_user(db: AsyncSession, credentials: Credentials) -> tuple[User, str]:
    user = await db.scalar(
        select(User).where(
            or_(User.name == credentials.name, func.lower(User.name) == credentials.name.lower()),
            User.deleted_at.is_(None),
        )
    )
    encoded = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
    if user is None or not verify_password(credentials.password, encoded):
        raise ApiError(status_code=401, code="invalid_credentials", message="Неверное имя или пароль")
    auth_session, token = new_session(user)
    db.add(auth_session)
    await db.commit()
    return user, token


async def get_session_user(db: AsyncSession, token: str | None) -> User:
    if not token:
        raise ApiError(
            status_code=401,
            code="unauthenticated",
            message="Требуется войти в аккаунт",
            clear_session=True,
        )
    auth_session = await db.scalar(
        select(AuthSession)
        .options(selectinload(AuthSession.user))
        .where(AuthSession.token_hash == digest_session_token(token))
    )
    if (
        auth_session is None
        or _as_utc(auth_session.expires_at) <= datetime.now(UTC)
        or auth_session.user.deleted_at is not None
    ):
        if auth_session is not None:
            await db.delete(auth_session)
            await db.commit()
        raise ApiError(
            status_code=401,
            code="unauthenticated",
            message="Сессия завершена. Войдите снова",
            clear_session=True,
        )
    return auth_session.user


async def revoke_session(db: AsyncSession, token: str | None) -> None:
    if token:
        await db.execute(delete(AuthSession).where(AuthSession.token_hash == digest_session_token(token)))
        await db.commit()


async def replace_all_sessions(db: AsyncSession, user: User) -> str:
    await db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    auth_session, token = new_session(user)
    db.add(auth_session)
    await db.commit()
    return token
