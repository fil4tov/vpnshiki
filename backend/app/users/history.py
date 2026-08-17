from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.models import UserDailyCharge, UserTopUp
from app.tariff_plans.models import TariffPlan
from app.users.schemas import UserChargeRead, UserTopUpRead


async def get_user_charge_history(db: AsyncSession, user_id: UUID) -> list[UserChargeRead]:
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


async def get_user_top_up_history(db: AsyncSession, user_id: UUID) -> list[UserTopUpRead]:
    top_ups = (
        await db.scalars(
            select(UserTopUp)
            .where(UserTopUp.user_id == user_id)
            .order_by(UserTopUp.created_at.desc())
        )
    ).all()
    return [UserTopUpRead.model_validate(top_up) for top_up in top_ups]
