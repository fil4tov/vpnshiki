from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from app.auth.dependencies import CurrentAdmin, Database
from app.auth.models import AuthSession
from app.auth.security import hash_password
from app.billing.models import StatusChangeSource, UserDailyCharge, UserStatusHistory
from app.billing.scheduler import request_vpn_sync_processing
from app.billing.service import (
    add_initial_status_history,
    block_if_balance_below_limit,
    profile_email,
    record_status_change,
    restore_if_billing_blocked,
)
from app.errors import ApiError
from app.notifications.dependencies import TelegramNotifier
from app.notifications.service import (
    blocked_balance_notification,
    send_balance_notifications,
)
from app.payments.models import YooMoneyPayment, YooMoneyPaymentStatus
from app.users.history import (
    account_block_source,
    get_user_charge_history,
    get_user_read,
    get_user_top_up_history,
)
from app.users.models import AccountStatus, User, UserRole
from app.users.schemas import (
    AdminPasswordReset,
    AdminUserCreate,
    AdminUserMutationRead,
    AdminUserRead,
    AdminUserUpdate,
    UserChargeRead,
    UserRead,
    UserStatusHistoryRead,
    UserTopUpRead,
    VpnProfileStatus,
    VpnProfileSummaryRead,
)
from app.vpn_access.dependencies import XuiProvider
from app.vpn_access.service import VpnProfileState, profile_matches

router = APIRouter(prefix="/api/admin/users", tags=["admin"])


def _user_vpn_profiles(
    user: User,
    profile_states: dict[str, VpnProfileState] | None,
) -> list[VpnProfileSummaryRead] | None:
    if profile_states is None:
        return None
    prefix = profile_email(user)
    return [
        VpnProfileSummaryRead(
            label=email[4:],
            status=(
                VpnProfileStatus.ONLINE if profile_state.online else VpnProfileStatus.OFFLINE
            ),
            enabled=profile_state.enabled,
        )
        for email, profile_state in sorted(
            profile_states.items(), key=lambda item: item[0].casefold()
        )
        if profile_matches(email, prefix)
    ]


async def _get_user(db: Database, user_id: UUID, *, for_update: bool = False) -> User:
    if for_update:
        user = await db.scalar(
            select(User)
            .where(User.id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    else:
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


async def _admin_user_read(db: Database, user: User) -> AdminUserMutationRead:
    user_read = await get_user_read(db, user)
    return AdminUserMutationRead.model_validate(
        {**user_read.model_dump(), "tg_user_id": user.tg_user_id}
    )


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
    top_up_totals = (
        select(
            YooMoneyPayment.user_id,
            func.sum(YooMoneyPayment.received_amount).label("total_top_ups"),
        )
        .where(YooMoneyPayment.status == YooMoneyPaymentStatus.SUCCEEDED.value)
        .group_by(YooMoneyPayment.user_id)
        .subquery()
    )
    latest_status_source = (
        select(UserStatusHistory.source)
        .where(UserStatusHistory.user_id == User.id)
        .order_by(
            UserStatusHistory.effective_at.desc(),
            UserStatusHistory.created_at.desc(),
        )
        .limit(1)
        .correlate(User)
        .scalar_subquery()
    )
    rows = (
        await db.execute(
            select(
                User,
                func.coalesce(charge_totals.c.total_charged, 0).label("total_charged"),
                func.coalesce(top_up_totals.c.total_top_ups, 0).label("total_top_ups"),
                latest_status_source.label("latest_status_source"),
            )
            .outerjoin(charge_totals, charge_totals.c.user_id == User.id)
            .outerjoin(top_up_totals, top_up_totals.c.user_id == User.id)
            .where(User.deleted_at.is_(None))
            .order_by(User.created_at.desc())
        )
    ).all()
    try:
        profile_states = await provider.list_profile_states()
    except ApiError:
        profile_states = None
    return [
        AdminUserRead.model_validate(
            {
                **UserRead.model_validate(user).model_dump(),
                "tg_user_id": user.tg_user_id,
                "total_charged": total_charged,
                "total_top_ups": total_top_ups,
                "block_source": account_block_source(
                    user.account_status,
                    latest_status_source,
                ),
                "vpn_profiles": _user_vpn_profiles(user, profile_states),
            }
        )
        for user, total_charged, total_top_ups, latest_status_source in rows
    ]


@router.get("/{user_id}/charges", response_model=list[UserChargeRead])
async def list_user_charges(
    user_id: UUID,
    _admin: CurrentAdmin,
    db: Database,
) -> list[UserChargeRead]:
    await _get_user(db, user_id)
    return await get_user_charge_history(db, user_id)


@router.get("/{user_id}/top-ups", response_model=list[UserTopUpRead])
async def list_user_top_ups(
    user_id: UUID,
    _admin: CurrentAdmin,
    db: Database,
) -> list[UserTopUpRead]:
    await _get_user(db, user_id)
    return await get_user_top_up_history(db, user_id)


@router.get("/{user_id}/status-history", response_model=list[UserStatusHistoryRead])
async def list_user_status_history(
    user_id: UUID,
    _admin: CurrentAdmin,
    db: Database,
) -> list[UserStatusHistoryRead]:
    await _get_user(db, user_id)
    changed_by = aliased(User)
    rows = (
        await db.execute(
            select(UserStatusHistory, changed_by.name)
            .outerjoin(changed_by, changed_by.id == UserStatusHistory.changed_by_user_id)
            .where(UserStatusHistory.user_id == user_id)
            .order_by(
                UserStatusHistory.effective_at.desc(),
                UserStatusHistory.created_at.desc(),
            )
        )
    ).all()
    return [
        UserStatusHistoryRead(
            id=history.id,
            previous_status=history.previous_status,
            new_status=history.new_status,
            changed_by_user_id=history.changed_by_user_id,
            changed_by_name=changed_by_name,
            source=history.source,
            effective_at=history.effective_at,
        )
        for history, changed_by_name in rows
    ]


@router.post("", response_model=AdminUserMutationRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreate, admin: CurrentAdmin, db: Database
) -> AdminUserMutationRead:
    user = User(
        name=payload.name,
        tg_user_id=payload.tg_user_id,
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
    return await _admin_user_read(db, user)


@router.patch("/{user_id}", response_model=AdminUserMutationRead)
async def update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    admin: CurrentAdmin,
    db: Database,
    provider: XuiProvider,
    notifier: TelegramNotifier,
) -> AdminUserMutationRead:
    user = await _get_user(db, user_id, for_update=True)
    original_status = user.account_status
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
    manual_status_changed = (
        target_status is not None and target_status.value != user.account_status
    )
    if manual_status_changed:
        await record_status_change(
            db,
            user,
            target_status,
            source=StatusChangeSource.ADMIN,
            changed_by_user_id=admin.id,
        )
    financial_terms_changed = False
    for field, value in changes.items():
        normalized = value.value if isinstance(value, (AccountStatus, UserRole)) else value
        if field in {"balance", "negative_balance_limit"} and getattr(user, field) != normalized:
            financial_terms_changed = True
        setattr(user, field, normalized)
    financial_status_changed = False
    if financial_terms_changed:
        if original_status == AccountStatus.BLOCKED.value:
            if not manual_status_changed:
                financial_status_changed = await restore_if_billing_blocked(
                    db,
                    user,
                    source=StatusChangeSource.ADMIN,
                    changed_by_user_id=admin.id,
                )
        else:
            financial_status_changed = await block_if_balance_below_limit(db, user)
    notification = (
        blocked_balance_notification(user)
        if financial_status_changed
        and user.account_status == AccountStatus.BLOCKED.value
        else None
    )
    if manual_status_changed and not financial_status_changed:
        assert target_status is not None
        if target_status != AccountStatus.PAUSED:
            await provider.set_matching_enabled(
                profile_email(user), target_status == AccountStatus.ACTIVE
            )
    await _commit_unique(db)
    if financial_status_changed:
        request_vpn_sync_processing()
    await db.refresh(user)
    if notification is not None:
        await send_balance_notifications(notifier, [notification])
    return await _admin_user_read(db, user)


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
    await provider.set_matching_enabled(profile_email(user), False)
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
