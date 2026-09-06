from calendar import monthrange
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.calculations import additional_profiles_charge, profile_count_for_date
from app.billing.models import (
    BillingRun,
    BillingRunStatus,
    DailyChargeKind,
    UserDailyCharge,
)
from app.errors import ApiError
from app.users.models import AccountStatus, User

from .models import TariffPlan
from .schemas import TariffPlanBillingRunRead, TariffPlanRead, TariffPlanStatus

MOSCOW = ZoneInfo("Europe/Moscow")
SCHEDULE_LOCK_ID = 846_202_608_15


def moscow_today() -> date:
    return datetime.now(MOSCOW).date()


def generate_plan_name(start_date: date) -> str:
    return f"TP_{start_date:%d.%m.%Y}"


def plan_status(plan: TariffPlan, today: date | None = None) -> TariffPlanStatus:
    current_date = today or moscow_today()
    if plan.start_date > current_date:
        return TariffPlanStatus.SCHEDULED
    if plan.end_date is not None and plan.end_date < current_date:
        return TariffPlanStatus.COMPLETED
    return TariffPlanStatus.ACTIVE


def serialize_plan(plan: TariffPlan, today: date | None = None) -> TariffPlanRead:
    status = plan_status(plan, today)
    return TariffPlanRead.model_validate(
        {
            **{column.name: getattr(plan, column.name) for column in plan.__table__.columns},
            "status": status,
            "is_editable": status == TariffPlanStatus.SCHEDULED,
        }
    )


async def _locked_plans(db: AsyncSession) -> list[TariffPlan]:
    if db.get_bind().dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": SCHEDULE_LOCK_ID})
    return list(
        (await db.scalars(select(TariffPlan).order_by(TariffPlan.start_date).with_for_update())).all()
    )


def _rebuild_periods(plans: list[TariffPlan]) -> None:
    plans.sort(key=lambda plan: plan.start_date)
    for index, plan in enumerate(plans):
        plan.name = generate_plan_name(plan.start_date)
        plan.end_date = (
            plans[index + 1].start_date - timedelta(days=1)
            if index + 1 < len(plans)
            else None
        )


def _date_conflict(message: str) -> ApiError:
    return ApiError(
        status_code=409,
        code="tariff_plan_date_conflict",
        message=message,
        field_errors={"start_date": message},
    )


async def _commit(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise _date_conflict("Даты тарифных планов конфликтуют") from error


async def list_tariff_plans(db: AsyncSession) -> list[TariffPlanRead]:
    plans = (await db.scalars(select(TariffPlan).order_by(TariffPlan.start_date))).all()
    today = moscow_today()
    return [serialize_plan(plan, today) for plan in plans]


async def list_tariff_plan_billing_runs(
    db: AsyncSession,
    plan_id: UUID,
) -> list[TariffPlanBillingRunRead]:
    plan = await db.get(TariffPlan, plan_id)
    if plan is None:
        raise ApiError(
            status_code=404,
            code="tariff_plan_not_found",
            message="Тарифный план не найден",
        )
    runs = list(
        (
            await db.scalars(
                select(BillingRun)
                .where(
                    BillingRun.tariff_plan_id == plan_id,
                    BillingRun.status == BillingRunStatus.COMPLETED.value,
                    BillingRun.daily_charge.is_not(None),
                    BillingRun.active_users_count > 0,
                )
                .order_by(BillingRun.billing_date.desc())
            )
        ).all()
    )
    charge_rows = (
        await db.execute(
            select(
                UserDailyCharge.created_at,
                UserDailyCharge.kind,
                func.sum(UserDailyCharge.amount),
            )
            .where(UserDailyCharge.tariff_plan_id == plan_id)
            .group_by(UserDailyCharge.created_at, UserDailyCharge.kind)
        )
    ).all()
    totals_by_date: dict[date, dict[str, Decimal]] = {}
    for created_at, kind, total in charge_rows:
        normalized = created_at.replace(tzinfo=UTC) if created_at.tzinfo is None else created_at
        billing_date = normalized.astimezone(MOSCOW).date()
        date_totals = totals_by_date.setdefault(billing_date, {})
        date_totals[kind] = date_totals.get(kind, Decimal("0.00")) + total

    result: list[TariffPlanBillingRunRead] = []
    for run in runs:
        fallback_tarification_total = run.daily_charge * run.active_users_count
        date_totals = totals_by_date.get(run.billing_date, {})
        tarification_total = date_totals.get(
            DailyChargeKind.TARIFICATION.value,
            fallback_tarification_total,
        )
        additional_profiles_total = date_totals.get(
            DailyChargeKind.ADDITIONAL_PROFILES.value,
            Decimal("0.00"),
        )
        result.append(
            TariffPlanBillingRunRead.model_validate(
                {
                    **{
                        column.name: getattr(run, column.name)
                        for column in run.__table__.columns
                    },
                    "tarification_total": tarification_total,
                    "additional_profiles_total": additional_profiles_total,
                    "total_charged": tarification_total + additional_profiles_total,
                }
            )
        )
    return result


async def get_user_daily_charge(db: AsyncSession, user: User) -> Decimal | None:
    today = moscow_today()
    plan = await db.scalar(
        select(TariffPlan)
        .where(
            TariffPlan.start_date <= today,
            or_(TariffPlan.end_date.is_(None), TariffPlan.end_date >= today),
        )
        .order_by(TariffPlan.start_date.desc())
        .limit(1)
    )
    if plan is None:
        return None
    if user.account_status != AccountStatus.ACTIVE.value:
        return Decimal("0.00")

    active_users = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(
            User.account_status == AccountStatus.ACTIVE.value,
            User.deleted_at.is_(None),
        )
    )
    if not active_users:
        return None

    days_in_month = monthrange(today.year, today.month)[1]
    base_charge = (plan.monthly_amount / days_in_month / active_users).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    profile_count = await profile_count_for_date(db, user.id, today)
    return base_charge + additional_profiles_charge(base_charge, profile_count or 0)


async def create_tariff_plan(
    db: AsyncSession, monthly_amount: Decimal, start_date: date
) -> TariffPlanRead:
    plans = await _locked_plans(db)
    today = moscow_today()
    if plans and start_date <= today:
        raise _date_conflict("Новый план должен начинаться после текущего московского дня")
    if any(plan.start_date == start_date for plan in plans):
        raise _date_conflict("На эту дату уже существует тарифный план")

    plan = TariffPlan(
        name=generate_plan_name(start_date),
        monthly_amount=monthly_amount,
        start_date=start_date,
    )
    db.add(plan)
    plans.append(plan)
    _rebuild_periods(plans)
    await _commit(db)
    await db.refresh(plan)
    return serialize_plan(plan, today)


async def update_tariff_plan(
    db: AsyncSession,
    plan_id: UUID,
    *,
    monthly_amount: Decimal | None,
    start_date: date | None,
) -> TariffPlanRead:
    plans = await _locked_plans(db)
    plan = next((item for item in plans if item.id == plan_id), None)
    if plan is None:
        raise ApiError(
            status_code=404,
            code="tariff_plan_not_found",
            message="Тарифный план не найден",
        )
    today = moscow_today()
    if plan.start_date <= today:
        raise ApiError(
            status_code=409,
            code="tariff_plan_started",
            message="Начавшийся тарифный план нельзя изменить",
        )
    if start_date is not None:
        if start_date <= today:
            raise _date_conflict("План должен начинаться после текущего московского дня")
        if any(item.id != plan.id and item.start_date == start_date for item in plans):
            raise _date_conflict("На эту дату уже существует тарифный план")
        plan.start_date = start_date
    if monthly_amount is not None:
        plan.monthly_amount = monthly_amount
    _rebuild_periods(plans)
    await _commit(db)
    await db.refresh(plan)
    return serialize_plan(plan, today)


async def delete_tariff_plan(db: AsyncSession, plan_id: UUID) -> None:
    plans = await _locked_plans(db)
    plan = next((item for item in plans if item.id == plan_id), None)
    if plan is None:
        raise ApiError(
            status_code=404,
            code="tariff_plan_not_found",
            message="Тарифный план не найден",
        )
    if plan.start_date <= moscow_today():
        raise ApiError(
            status_code=409,
            code="tariff_plan_started",
            message="Начавшийся тарифный план нельзя удалить",
        )
    plans.remove(plan)
    await db.delete(plan)
    _rebuild_periods(plans)
    await _commit(db)
