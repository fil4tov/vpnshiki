from decimal import Decimal

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.auth.cookies import set_session_cookie
from app.auth.dependencies import CurrentUser, Database
from app.auth.security import hash_password, verify_password
from app.auth.service import replace_all_sessions
from app.billing.models import StatusChangeSource, UserTopUp
from app.billing.scheduler import request_vpn_sync_processing
from app.billing.service import queue_vpn_sync, reactivate_if_billing_blocked, record_status_change
from app.config import get_settings
from app.errors import ApiError
from app.tariff_plans.service import get_user_daily_charge
from app.users.models import AccountStatus, User
from app.users.schemas import DailyChargeRead, PasswordChange, UserRead, UserTopUpCreate

router = APIRouter(prefix="/api/users", tags=["users"])
MAX_MONEY = Decimal("999999999999.99")


@router.get("/me/daily-charge", response_model=DailyChargeRead)
async def read_daily_charge(user: CurrentUser, db: Database) -> DailyChargeRead:
    return DailyChargeRead(daily_charge=await get_user_daily_charge(db, user))


@router.post("/me/activation", response_model=UserRead)
async def activate_account(user: CurrentUser, db: Database) -> UserRead:
    stored_user = await db.scalar(
        select(User)
        .where(User.id == user.id, User.deleted_at.is_(None))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if stored_user is None:
        raise ApiError(status_code=404, code="user_not_found", message="Пользователь не найден")
    if stored_user.account_status != AccountStatus.PAUSED.value:
        raise ApiError(
            status_code=409,
            code="account_not_paused",
            message="Активировать можно только приостановленный аккаунт",
        )
    if stored_user.balance < -stored_user.negative_balance_limit:
        raise ApiError(
            status_code=409,
            code="insufficient_balance",
            message="Пополните баланс для активации",
        )
    await record_status_change(
        db,
        stored_user,
        AccountStatus.ACTIVE,
        source=StatusChangeSource.USER,
        changed_by_user_id=stored_user.id,
    )
    await queue_vpn_sync(db, stored_user.id, True)
    await db.commit()
    request_vpn_sync_processing()
    await db.refresh(stored_user)
    return UserRead.model_validate(stored_user)


@router.post("/me/top-ups", response_model=UserRead)
async def top_up_balance(
    payload: UserTopUpCreate,
    user: CurrentUser,
    db: Database,
) -> UserRead:
    stored_user = await db.scalar(
        select(User)
        .where(User.id == user.id, User.deleted_at.is_(None))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if stored_user is None:
        raise ApiError(status_code=404, code="user_not_found", message="Пользователь не найден")
    balance_before = stored_user.balance
    balance_after = balance_before + payload.amount
    if balance_after > MAX_MONEY:
        raise ApiError(
            status_code=400,
            code="balance_overflow",
            message="Сумма пополнения слишком велика",
            field_errors={"amount": "Итоговый баланс превышает допустимое значение"},
        )
    stored_user.balance = balance_after
    db.add(
        UserTopUp(
            user_id=stored_user.id,
            amount=payload.amount,
            balance_before=balance_before,
            balance_after=balance_after,
        )
    )
    await reactivate_if_billing_blocked(
        db,
        stored_user,
        source=StatusChangeSource.TOP_UP,
        changed_by_user_id=None,
    )
    await db.commit()
    await db.refresh(stored_user)
    return UserRead.model_validate(stored_user)


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
