import logging
from calendar import monthrange
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.errors import ApiError
from app.tariff_plans.models import TariffPlan
from app.users.models import AccountStatus, User
from app.vpn_access.service import XuiClient, profile_matches

from .models import (
    BillingRun,
    BillingRunStatus,
    StatusChangeSource,
    UserDailyCharge,
    UserStatusHistory,
    VpnSyncJob,
)

logger = logging.getLogger(__name__)
MOSCOW = ZoneInfo("Europe/Moscow")
BILLING_LOCK_ID = 846_202_608_16
RETRY_INTERVAL = timedelta(minutes=1)


def moscow_today() -> date:
    return datetime.now(MOSCOW).date()


def billing_timestamp(billing_date: date) -> datetime:
    return datetime.combine(billing_date, time.min, MOSCOW).astimezone(UTC)


def profile_email(user: User) -> str:
    return f"web-{user.name}"


async def record_status_change(
    db: AsyncSession,
    user: User,
    new_status: AccountStatus | str,
    *,
    source: StatusChangeSource,
    changed_by_user_id: UUID | None,
    effective_at: datetime | None = None,
) -> bool:
    status = new_status.value if isinstance(new_status, AccountStatus) else new_status
    if user.account_status == status:
        return False
    db.add(
        UserStatusHistory(
            user_id=user.id,
            previous_status=user.account_status,
            new_status=status,
            changed_by_user_id=changed_by_user_id,
            source=source.value,
            effective_at=effective_at or datetime.now(UTC),
        )
    )
    user.account_status = status
    return True


async def add_initial_status_history(
    db: AsyncSession,
    user: User,
    *,
    source: StatusChangeSource,
    changed_by_user_id: UUID | None,
    effective_at: datetime | None = None,
) -> None:
    await db.flush()
    db.add(
        UserStatusHistory(
            user_id=user.id,
            previous_status=None,
            new_status=user.account_status,
            changed_by_user_id=changed_by_user_id,
            source=source.value,
            effective_at=effective_at or user.created_at,
        )
    )


async def queue_vpn_sync(db: AsyncSession, user_id: UUID, desired_enabled: bool) -> None:
    job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
    now = datetime.now(UTC)
    if job is None:
        db.add(
            VpnSyncJob(
                user_id=user_id,
                desired_enabled=desired_enabled,
                next_attempt_at=now,
            )
        )
        return
    job.desired_enabled = desired_enabled
    job.attempts = 0
    job.next_attempt_at = now
    job.last_error = None


async def reactivate_if_billing_blocked(
    db: AsyncSession,
    user: User,
    *,
    source: StatusChangeSource,
    changed_by_user_id: UUID | None,
) -> bool:
    if user.account_status != AccountStatus.BLOCKED.value:
        return False
    if user.balance < -user.negative_balance_limit:
        return False
    latest_status = await db.scalar(
        select(UserStatusHistory)
        .where(UserStatusHistory.user_id == user.id)
        .order_by(
            UserStatusHistory.effective_at.desc(),
            UserStatusHistory.created_at.desc(),
        )
        .limit(1)
    )
    if (
        latest_status is None
        or latest_status.new_status != AccountStatus.BLOCKED.value
        or latest_status.source != StatusChangeSource.BILLING.value
    ):
        return False
    await record_status_change(
        db,
        user,
        AccountStatus.ACTIVE,
        source=source,
        changed_by_user_id=changed_by_user_id,
    )
    await queue_vpn_sync(db, user.id, True)
    return True


async def _ensure_status_baselines(
    db: AsyncSession, plan_start_date: date
) -> None:
    users = (
        await db.scalars(
            select(User).where(
                ~select(UserStatusHistory.id)
                .where(UserStatusHistory.user_id == User.id)
                .exists()
            )
        )
    ).all()
    start_at = billing_timestamp(plan_start_date)
    for user in users:
        created_at = user.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        await add_initial_status_history(
            db,
            user,
            source=StatusChangeSource.BOOTSTRAP,
            changed_by_user_id=None,
            effective_at=max(created_at, start_at),
        )


async def _plan_for_date(db: AsyncSession, billing_date: date) -> TariffPlan | None:
    return await db.scalar(
        select(TariffPlan)
        .where(
            TariffPlan.start_date <= billing_date,
            or_(TariffPlan.end_date.is_(None), TariffPlan.end_date >= billing_date),
        )
        .order_by(TariffPlan.start_date.desc())
        .limit(1)
    )


async def _active_users_at(db: AsyncSession, cutoff: datetime) -> list[User]:
    ranked_statuses = (
        select(
            UserStatusHistory.user_id.label("user_id"),
            UserStatusHistory.new_status.label("status"),
            func.row_number()
            .over(
                partition_by=UserStatusHistory.user_id,
                order_by=(
                    UserStatusHistory.effective_at.desc(),
                    UserStatusHistory.created_at.desc(),
                ),
            )
            .label("position"),
        )
        .where(UserStatusHistory.effective_at <= cutoff)
        .subquery()
    )
    user_ids = list(
        (
            await db.scalars(
                select(User.id)
                .join(ranked_statuses, ranked_statuses.c.user_id == User.id)
                .where(
                    ranked_statuses.c.position == 1,
                    ranked_statuses.c.status == AccountStatus.ACTIVE.value,
                    User.created_at <= cutoff,
                    or_(User.deleted_at.is_(None), User.deleted_at > cutoff),
                )
                .order_by(User.id)
            )
        ).all()
    )
    if not user_ids:
        return []
    return list(
        (
            await db.scalars(
                select(User)
                .where(User.id.in_(user_ids))
                .order_by(User.id)
                .with_for_update()
            )
        ).all()
    )


async def _has_later_status(
    db: AsyncSession, user_id: UUID, effective_at: datetime
) -> bool:
    return bool(
        await db.scalar(
            select(UserStatusHistory.id)
            .where(
                UserStatusHistory.user_id == user_id,
                UserStatusHistory.effective_at > effective_at,
            )
            .limit(1)
        )
    )


async def _billing_lock(db: AsyncSession) -> None:
    if db.get_bind().dialect.name == "postgresql":
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id)"),
            {"lock_id": BILLING_LOCK_ID},
        )


async def process_billing_date(db: AsyncSession, billing_date: date) -> BillingRun:
    try:
        await _billing_lock(db)
        run = await db.scalar(
            select(BillingRun).where(BillingRun.billing_date == billing_date).with_for_update()
        )
        plan = await _plan_for_date(db, billing_date)
        if (
            run is not None
            and run.status == BillingRunStatus.COMPLETED.value
            and (run.tariff_plan_id is not None or plan is None)
        ):
            return run
        now = datetime.now(UTC)
        if run is None:
            run = BillingRun(
                billing_date=billing_date,
                status=BillingRunStatus.PROCESSING.value,
                started_at=now,
            )
            db.add(run)
        else:
            run.status = BillingRunStatus.PROCESSING.value
            run.started_at = now
            run.completed_at = None
        run.tariff_plan_id = None
        run.active_users_count = 0
        run.charged_users_count = 0
        run.blocked_users_count = 0
        run.daily_charge = None
        run.error = None

        if plan is None:
            run.status = BillingRunStatus.COMPLETED.value
            run.completed_at = now
            await db.commit()
            return run

        run.tariff_plan_id = plan.id
        await _ensure_status_baselines(db, plan.start_date)
        await db.flush()
        cutoff = billing_timestamp(billing_date)
        active_users = await _active_users_at(db, cutoff)
        run.active_users_count = len(active_users)
        if not active_users:
            run.status = BillingRunStatus.COMPLETED.value
            run.completed_at = now
            await db.commit()
            return run

        amount = (
            plan.monthly_amount
            / monthrange(billing_date.year, billing_date.month)[1]
            / len(active_users)
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        run.daily_charge = amount

        blocked = 0
        for user in active_users:
            user.balance -= amount
            db.add(
                UserDailyCharge(
                    user_id=user.id,
                    amount=amount,
                    tariff_plan_id=plan.id,
                    created_at=cutoff,
                )
            )
            if user.balance < -user.negative_balance_limit:
                blocked += 1
                db.add(
                    UserStatusHistory(
                        user_id=user.id,
                        previous_status=AccountStatus.ACTIVE.value,
                        new_status=AccountStatus.BLOCKED.value,
                        changed_by_user_id=None,
                        source=StatusChangeSource.BILLING.value,
                        effective_at=cutoff,
                    )
                )
                if not await _has_later_status(db, user.id, cutoff):
                    user.account_status = AccountStatus.BLOCKED.value
                await queue_vpn_sync(db, user.id, False)

        run.charged_users_count = len(active_users)
        run.blocked_users_count = blocked
        run.status = BillingRunStatus.COMPLETED.value
        run.completed_at = datetime.now(UTC)
        await db.commit()
        return run
    except Exception as error:
        await db.rollback()
        try:
            failed_run = await db.scalar(
                select(BillingRun).where(BillingRun.billing_date == billing_date)
            )
            if failed_run is None:
                failed_run = BillingRun(
                    billing_date=billing_date,
                    status=BillingRunStatus.FAILED.value,
                )
                db.add(failed_run)
            failed_run.status = BillingRunStatus.FAILED.value
            failed_run.error = str(error)[:4000]
            failed_run.completed_at = datetime.now(UTC)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Unable to persist failed billing run for %s", billing_date)
        raise


async def catch_up_billing(db: AsyncSession, through_date: date | None = None) -> list[BillingRun]:
    target_date = through_date or moscow_today()
    current_plan = await _plan_for_date(db, target_date)
    if current_plan is None:
        return [await process_billing_date(db, target_date)]
    runs: list[BillingRun] = []
    billing_date = current_plan.start_date
    while billing_date <= target_date:
        runs.append(await process_billing_date(db, billing_date))
        billing_date += timedelta(days=1)
    return runs


async def sync_paused_profiles(
    db: AsyncSession, provider: XuiClient
) -> None:
    paused_users = list(
        (
            await db.scalars(
                select(User).where(
                    User.account_status == AccountStatus.PAUSED.value,
                    User.deleted_at.is_(None),
                )
            )
        ).all()
    )
    if not paused_users:
        return
    try:
        states = await provider.list_client_states()
    except ApiError:
        for user in paused_users:
            await queue_vpn_sync(db, user.id, False)
        await db.commit()
        return
    for user in paused_users:
        prefix = profile_email(user)
        if any(
            enabled and profile_matches(email, prefix)
            for email, enabled in states.items()
        ):
            await queue_vpn_sync(db, user.id, False)
    await db.commit()


async def process_vpn_sync_jobs(
    session_factory: async_sessionmaker[AsyncSession], provider: XuiClient
) -> int:
    processed = 0
    async with session_factory() as db:
        jobs = list(
            (
                await db.scalars(
                    select(VpnSyncJob)
                    .where(VpnSyncJob.next_attempt_at <= datetime.now(UTC))
                    .order_by(VpnSyncJob.next_attempt_at)
                )
            ).all()
        )
        for job in jobs:
            user = await db.get(User, job.user_id)
            if user is None:
                await db.delete(job)
                await db.commit()
                continue
            should_enable = (
                user.deleted_at is None and user.account_status == AccountStatus.ACTIVE.value
            )
            if job.desired_enabled != should_enable:
                await db.delete(job)
                await db.commit()
                continue
            try:
                await provider.set_matching_enabled(
                    profile_email(user), job.desired_enabled
                )
            except ApiError as error:
                if error.code == "vpn_profile_not_found" and not job.desired_enabled:
                    await db.delete(job)
                    await db.commit()
                    processed += 1
                    continue
                job.attempts += 1
                job.last_error = f"{error.code}: {error.message}"
                job.next_attempt_at = datetime.now(UTC) + RETRY_INTERVAL
                await db.commit()
                continue
            await db.delete(job)
            await db.commit()
            processed += 1
    return processed
