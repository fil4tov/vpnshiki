from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import UserProfileCount

ADDITIONAL_PROFILE_RATE = Decimal("0.50")


def additional_profiles_charge(daily_charge: Decimal, profile_count: int) -> Decimal:
    additional_profiles_count = max(profile_count - 1, 0)
    per_profile_charge = (daily_charge * ADDITIONAL_PROFILE_RATE).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    return per_profile_charge * additional_profiles_count


async def profile_count_for_date(
    db: AsyncSession,
    user_id: UUID,
    billing_date: date,
) -> int | None:
    return await db.scalar(
        select(UserProfileCount.profile_count)
        .where(
            UserProfileCount.user_id == user_id,
            UserProfileCount.billing_date <= billing_date,
        )
        .order_by(UserProfileCount.billing_date.desc())
        .limit(1)
    )
