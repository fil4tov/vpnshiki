from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.users.models import User, UserRole

from .service import get_session_user

Database = Annotated[AsyncSession, Depends(get_db)]
SessionCookie = Annotated[str | None, Cookie(alias=get_settings().session_cookie_name)]


async def current_user(db: Database, session_token: SessionCookie = None) -> User:
    return await get_session_user(db, session_token)


CurrentUser = Annotated[User, Depends(current_user)]


async def current_admin(user: CurrentUser) -> User:
    if user.role != UserRole.ADMIN.value:
        raise ApiError(status_code=403, code="forbidden", message="Недостаточно прав")
    return user


CurrentAdmin = Annotated[User, Depends(current_admin)]

