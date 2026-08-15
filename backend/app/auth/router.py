from fastapi import APIRouter, Response, status

from app.auth.cookies import clear_session_cookie, set_session_cookie
from app.auth.dependencies import CurrentUser, Database, SessionCookie
from app.auth.schemas import Credentials
from app.auth.service import login_user, revoke_session
from app.config import get_settings
from app.users.schemas import UserRead

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserRead)
async def login(credentials: Credentials, response: Response, db: Database) -> UserRead:
    user, token = await login_user(db, credentials)
    set_session_cookie(response, token, get_settings())
    return UserRead.model_validate(user)


@router.get("/me", response_model=UserRead)
async def me(response: Response, user: CurrentUser) -> UserRead:
    response.headers["Cache-Control"] = "no-store"
    return UserRead.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(db: Database, session_token: SessionCookie = None) -> Response:
    await revoke_session(db, session_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response, get_settings())
    return response

