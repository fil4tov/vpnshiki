from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.auth.dependencies import CurrentAdmin, Database
from app.auth.models import AuthSession
from app.auth.security import hash_password
from app.billing.models import StatusChangeSource, UserDailyCharge
from app.billing.service import add_initial_status_history, profile_email, record_status_change
from app.errors import ApiError
from app.tariff_plans.models import TariffPlan
from app.users.models import AccountStatus, User, UserRole
from app.users.schemas import (
    AdminPasswordReset,
    AdminUserCreate,
    AdminUserRead,
    AdminUserUpdate,
    UserChargeRead,
    UserRead,
    VpnStatus,
)
from app.vpn_access.dependencies import XuiProvider

router = APIRouter(prefix="/api/admin/users", tags=["admin"])


async def _get_user(db: Database, user_id: UUID) -> User:
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise ApiError(status_code=404, code="user_not_found", message="Пользователь не найден")
    return user


def _name_taken(error: IntegrityError) -> ApiError:
    return ApiError(
        status_code=409,
        code="name_taken",
        message="Это имя уже занято",
        field_errors={"name": "Это имя уже занято"},
    )


async def _commit_unique(db: Database) -> None:
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise _name_taken(error) from error


@router.get("", response_model=list[AdminUserRead])
async def list_users(
    _admin: CurrentAdmin,
    db: Database,
    provider: XuiProvider,
) -> list[AdminUserRead]:
    charge_totals = (
        select(
            UserDailyCharge.user_id,
            func.sum(UserDailyCharge.amount).label("total_charged"),
        )
        .group_by(UserDailyCharge.user_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(
                User,
                func.coalesce(charge_totals.c.total_charged, 0).label("total_charged"),
            )
            .outerjoin(charge_totals, charge_totals.c.user_id == User.id)
            .where(User.deleted_at.is_(None))
            .order_by(func.lower(User.name))
        )
    ).all()
    try:
        online_clients = await provider.list_online_clients()
    except ApiError:
        online_clients = None
    return [
        AdminUserRead.model_validate(
            {
                **UserRead.model_validate(user).model_dump(),
                "total_charged": total_charged,
                "vpn_status": (
                    VpnStatus.UNKNOWN
                    if online_clients is None
                    else VpnStatus.ONLINE
                    if profile_email(user) in online_clients
                    else VpnStatus.OFFLINE
                ),
            }
        )
        for user, total_charged in rows
    ]


@router.get("/{user_id}/charges", response_model=list[UserChargeRead])
async def list_user_charges(
    user_id: UUID,
    _admin: CurrentAdmin,
    db: Database,
) -> list[UserChargeRead]:
    await _get_user(db, user_id)
    rows = (
        await db.execute(
            select(UserDailyCharge, TariffPlan.name)
            .join(TariffPlan, TariffPlan.id == UserDailyCharge.tariff_plan_id)
            .where(UserDailyCharge.user_id == user_id)
            .order_by(UserDailyCharge.created_at.desc())
        )
    ).all()
    return [
        UserChargeRead(
            id=charge.id,
            amount=charge.amount,
            tariff_plan_id=charge.tariff_plan_id,
            tariff_plan_name=tariff_plan_name,
            created_at=charge.created_at,
        )
        for charge, tariff_plan_name in rows
    ]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreate, admin: CurrentAdmin, db: Database
) -> UserRead:
    user = User(
        name=payload.name,
        password_hash=hash_password(payload.password),
        balance=payload.balance,
        negative_balance_limit=payload.negative_balance_limit,
        role=payload.role.value,
        account_status=payload.account_status.value,
    )
    db.add(user)
    try:
        await add_initial_status_history(
            db,
            user,
            source=StatusChangeSource.ADMIN,
            changed_by_user_id=admin.id,
        )
    except IntegrityError as error:
        await db.rollback()
        raise _name_taken(error) from error
    await _commit_unique(db)
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    admin: CurrentAdmin,
    db: Database,
    provider: XuiProvider,
) -> UserRead:
    user = await _get_user(db, user_id)
    changes = payload.model_dump(exclude_unset=True)
    target_role = changes.get("role")
    if user.role == UserRole.ADMIN.value and target_role == UserRole.USER:
        admin_count = await db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == UserRole.ADMIN.value, User.deleted_at.is_(None))
        )
        if admin_count == 1:
            raise ApiError(
                status_code=409,
                code="last_admin",
                message="Нельзя понизить роль последнего администратора",
            )
    target_status = changes.pop("account_status", None)
    if target_status is not None and target_status.value != user.account_status:
        if target_status in (AccountStatus.ACTIVE, AccountStatus.BLOCKED):
            await provider.set_enabled(
                profile_email(user), target_status == AccountStatus.ACTIVE
            )
        await record_status_change(
            db,
            user,
            target_status,
            source=StatusChangeSource.ADMIN,
            changed_by_user_id=admin.id,
        )
    for field, value in changes.items():
        setattr(user, field, value.value if isinstance(value, (AccountStatus, UserRole)) else value)
    await _commit_unique(db)
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    admin: CurrentAdmin,
    db: Database,
    provider: XuiProvider,
) -> None:
    user = await _get_user(db, user_id)
    if user.id == admin.id:
        raise ApiError(
            status_code=409,
            code="cannot_delete_self",
            message="Нельзя удалить собственный аккаунт",
        )
    await provider.set_enabled(profile_email(user), False)
    await record_status_change(
        db,
        user,
        AccountStatus.BLOCKED,
        source=StatusChangeSource.ADMIN,
        changed_by_user_id=admin.id,
    )
    user.deleted_at = datetime.now(UTC)
    await db.execute(AuthSession.__table__.delete().where(AuthSession.user_id == user.id))
    await db.commit()


@router.post("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    user_id: UUID,
    payload: AdminPasswordReset,
    _admin: CurrentAdmin,
    db: Database,
) -> None:
    user = await _get_user(db, user_id)
    user.password_hash = hash_password(payload.new_password)
    await db.flush()
    await db.execute(AuthSession.__table__.delete().where(AuthSession.user_id == user.id))
    await db.commit()
