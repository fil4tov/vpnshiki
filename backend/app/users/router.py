from fastapi import APIRouter, Response

from app.auth.cookies import set_session_cookie
from app.auth.dependencies import CurrentUser, Database
from app.auth.security import hash_password, verify_password
from app.auth.service import replace_all_sessions
from app.config import get_settings
from app.errors import ApiError
from app.users.schemas import ActivityUpdate, PasswordChange, UserRead

router = APIRouter(prefix="/api/users", tags=["users"])


@router.patch("/me/activity", response_model=UserRead)
async def update_activity(payload: ActivityUpdate, user: CurrentUser, db: Database) -> UserRead:
    if user.is_blocked:
        raise ApiError(
            status_code=409,
            code="user_blocked",
            message="Смена участия недоступна, пока аккаунт заблокирован",
        )
    user.is_active = payload.is_active
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.post("/me/password", response_model=UserRead)
async def change_password(
    payload: PasswordChange,
    response: Response,
    user: CurrentUser,
    db: Database,
) -> UserRead:
    if not verify_password(payload.current_password, user.password_hash):
        raise ApiError(
            status_code=400,
            code="invalid_current_password",
            message="Текущий пароль указан неверно",
            field_errors={"current_password": "Текущий пароль указан неверно"},
        )
    user.password_hash = hash_password(payload.new_password)
    await db.flush()
    token = await replace_all_sessions(db, user)
    set_session_cookie(response, token, get_settings())
    return UserRead.model_validate(user)

