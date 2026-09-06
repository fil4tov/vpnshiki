from datetime import UTC
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.models import (
    DailyChargeKind,
    StatusChangeSource,
    UserDailyCharge,
    UserProfileCount,
    UserStatusHistory,
)
from app.payments.models import YooMoneyPayment, YooMoneyPaymentStatus
from app.tariff_plans.models import TariffPlan
from app.users.models import AccountStatus, User
from app.users.schemas import AccountBlockSource, UserChargeRead, UserRead, UserTopUpRead

MOSCOW = ZoneInfo("Europe/Moscow")


def account_block_source(
    account_status: str,
    latest_status_source: str | None,
) -> AccountBlockSource | None:
    if account_status != AccountStatus.BLOCKED.value:
        return None
    if latest_status_source == StatusChangeSource.BILLING.value:
        return AccountBlockSource.BILLING
    return AccountBlockSource.ADMIN


async def get_user_read(db: AsyncSession, user: User) -> UserRead:
    latest_status_source = None
    if user.account_status == AccountStatus.BLOCKED.value:
        latest_status_source = await db.scalar(
            select(UserStatusHistory.source)
            .where(UserStatusHistory.user_id == user.id)
            .order_by(
                UserStatusHistory.effective_at.desc(),
                UserStatusHistory.created_at.desc(),
            )
            .limit(1)
        )
    return UserRead.model_validate(
        {
            **user.__dict__,
            "block_source": account_block_source(
                user.account_status,
                latest_status_source,
            ),
        }
    )


async def get_user_charge_history(db: AsyncSession, user_id: UUID) -> list[UserChargeRead]:
    rows = (
        await db.execute(
            select(UserDailyCharge, TariffPlan.name)
            .join(TariffPlan, TariffPlan.id == UserDailyCharge.tariff_plan_id)
            .where(UserDailyCharge.user_id == user_id)
            .order_by(
                UserDailyCharge.created_at.desc(),
                UserDailyCharge.kind.asc(),
            )
        )
    ).all()
    snapshots = list(
        (
            await db.scalars(
                select(UserProfileCount)
                .where(UserProfileCount.user_id == user_id)
                .order_by(UserProfileCount.billing_date)
            )
        ).all()
    )
    result: list[UserChargeRead] = []
    for charge, tariff_plan_name in rows:
        created_at = charge.created_at
        normalized = created_at.replace(tzinfo=UTC) if created_at.tzinfo is None else created_at
        charge_date = normalized.astimezone(MOSCOW).date()
        snapshot = next(
            (
                item
                for item in reversed(snapshots)
                if item.billing_date <= charge_date
            ),
            None,
        )
        additional_profiles_count = (
            max(snapshot.profile_count - 1, 0)
            if charge.kind == DailyChargeKind.ADDITIONAL_PROFILES.value
            and snapshot is not None
            else None
        )
        result.append(
            UserChargeRead(
                id=charge.id,
                amount=charge.amount,
                tariff_plan_id=charge.tariff_plan_id,
                tariff_plan_name=tariff_plan_name,
                kind=charge.kind,
                additional_profiles_count=additional_profiles_count,
                created_at=charge.created_at,
            )
        )
    return result


async def get_user_top_up_history(db: AsyncSession, user_id: UUID) -> list[UserTopUpRead]:
    payments = (
        await db.scalars(
            select(YooMoneyPayment)
            .where(
                YooMoneyPayment.user_id == user_id,
                YooMoneyPayment.status == YooMoneyPaymentStatus.SUCCEEDED.value,
                YooMoneyPayment.received_amount.is_not(None),
                YooMoneyPayment.paid_at.is_not(None),
            )
            .order_by(YooMoneyPayment.paid_at.desc(), YooMoneyPayment.id.desc())
        )
    ).all()
    return [
        UserTopUpRead(
            id=payment.id,
            amount=payment.received_amount,
            created_at=payment.paid_at,
        )
        for payment in payments
    ]
