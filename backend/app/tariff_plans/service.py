from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.users.models import AccountStatus, User

from .models import TariffPlan
from .schemas import TariffPlanRead, TariffPlanStatus

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
        .where(User.account_status == AccountStatus.ACTIVE.value)
    )
    if not active_users:
        return None

    days_in_month = monthrange(today.year, today.month)[1]
    return (plan.monthly_amount / days_in_month / active_users).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


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
