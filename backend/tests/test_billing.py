from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, select

from app.billing.models import (
    BillingRun,
    StatusChangeSource,
    UserDailyCharge,
    UserStatusHistory,
    VpnSyncJob,
)
from app.billing.service import (
    billing_timestamp,
    catch_up_billing,
    process_billing_date,
    process_vpn_sync_jobs,
    sync_paused_profiles,
)
from app.errors import ApiError
from app.tariff_plans.models import TariffPlan
from app.users.models import AccountStatus, User


async def test_daily_billing_is_idempotent_and_blocks_below_limit(
    session_factory, admin
) -> None:
    billing_date = date(2026, 8, 16)
    created_at = datetime(2026, 8, 15, 12, tzinfo=UTC)
    async with session_factory() as db:
        stored_admin = await db.get(User, admin.id)
        assert stored_admin is not None
        stored_admin.created_at = created_at
        stored_admin.balance = Decimal("100.00")
        stored_admin.negative_balance_limit = Decimal("0.00")
        user = User(
            name="Плательщик",
            password_hash="unused",
            balance=Decimal("0.00"),
            negative_balance_limit=Decimal("10.00"),
            created_at=created_at,
        )
        db.add_all(
            [
                user,
                TariffPlan(
                    name="TP_16.08.2026",
                    monthly_amount=Decimal("3100.00"),
                    start_date=billing_date,
                ),
            ]
        )
        await db.commit()

        run = await process_billing_date(db, billing_date)
        repeated_run = await process_billing_date(db, billing_date)

        assert repeated_run.id == run.id
        assert run.daily_charge == Decimal("50.00")
        assert run.active_users_count == 2
        assert run.charged_users_count == 2
        assert run.blocked_users_count == 1
        assert await db.scalar(select(func.count()).select_from(BillingRun)) == 1
        assert await db.scalar(select(func.count()).select_from(UserDailyCharge)) == 2

        await db.refresh(user)
        assert user.balance == Decimal("-50.00")
        assert user.account_status == AccountStatus.BLOCKED.value
        charge = await db.scalar(
            select(UserDailyCharge).where(UserDailyCharge.user_id == user.id)
        )
        assert charge is not None
        created = charge.created_at.replace(tzinfo=UTC) if charge.created_at.tzinfo is None else charge.created_at
        assert created == billing_timestamp(billing_date)
        status = await db.scalar(
            select(UserStatusHistory).where(
                UserStatusHistory.user_id == user.id,
                UserStatusHistory.source == StatusChangeSource.BILLING.value,
            )
        )
        assert status is not None
        assert status.previous_status == AccountStatus.ACTIVE.value
        assert status.new_status == AccountStatus.BLOCKED.value
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user.id))
        assert job is not None
        assert job.desired_enabled is False


async def test_effective_status_controls_historical_daily_charge(
    session_factory, admin
) -> None:
    first_day = date(2026, 8, 16)
    second_day = date(2026, 8, 17)
    created_at = datetime(2026, 8, 15, 12, tzinfo=UTC)
    async with session_factory() as db:
        user = await db.get(User, admin.id)
        assert user is not None
        user.created_at = created_at
        user.account_status = AccountStatus.PAUSED.value
        db.add(
            TariffPlan(
                name="TP_16.08.2026",
                monthly_amount=Decimal("3100.00"),
                start_date=first_day,
            )
        )
        db.add_all(
            [
                UserStatusHistory(
                    user_id=user.id,
                    previous_status=None,
                    new_status=AccountStatus.ACTIVE.value,
                    changed_by_user_id=None,
                    source=StatusChangeSource.BOOTSTRAP.value,
                    effective_at=billing_timestamp(first_day),
                ),
                UserStatusHistory(
                    user_id=user.id,
                    previous_status=AccountStatus.ACTIVE.value,
                    new_status=AccountStatus.PAUSED.value,
                    changed_by_user_id=user.id,
                    source=StatusChangeSource.ADMIN.value,
                    effective_at=datetime(2026, 8, 16, 12, tzinfo=UTC),
                ),
            ]
        )
        await db.commit()

        first_run = await process_billing_date(db, first_day)
        second_run = await process_billing_date(db, second_day)

        assert first_run.charged_users_count == 1
        assert second_run.charged_users_count == 0
        assert await db.scalar(select(func.count()).select_from(UserDailyCharge)) == 1


async def test_catch_up_processes_every_day_from_current_plan_start(
    session_factory, admin
) -> None:
    start_date = date(2026, 8, 1)
    async with session_factory() as db:
        user = await db.get(User, admin.id)
        assert user is not None
        user.created_at = datetime(2026, 7, 31, 12, tzinfo=UTC)
        user.balance = Decimal("1000.00")
        db.add(
            TariffPlan(
                name="TP_01.08.2026",
                monthly_amount=Decimal("3100.00"),
                start_date=start_date,
            )
        )
        await db.commit()

        runs = await catch_up_billing(db, date(2026, 8, 3))

        assert [run.billing_date for run in runs] == [
            date(2026, 8, 1),
            date(2026, 8, 2),
            date(2026, 8, 3),
        ]
        assert await db.scalar(select(func.count()).select_from(UserDailyCharge)) == 3
        await db.refresh(user)
        assert user.balance == Decimal("700.00")


class EventuallyAvailableProvider:
    def __init__(self) -> None:
        self.calls = 0

    async def set_matching_enabled(self, _email: str, _enabled: bool) -> None:
        self.calls += 1
        if self.calls == 1:
            raise ApiError(
                status_code=502,
                code="vpn_provider_unavailable",
                message="VPN-панель временно недоступна",
            )


class ProfileStateProvider:
    async def list_client_states(self) -> dict[str, bool]:
        return {
            "web-admin-mobile": True,
            "web-admin-pc": False,
            "web-admin2-mobile": True,
            "[web]-admin": True,
        }


async def test_paused_profile_sync_queues_one_job_when_any_matching_profile_is_enabled(
    session_factory, admin
) -> None:
    async with session_factory() as db:
        user = await db.get(User, admin.id)
        assert user is not None
        user.account_status = AccountStatus.PAUSED.value
        await db.commit()

        await sync_paused_profiles(db, ProfileStateProvider())

        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user.id))
        assert job is not None
        assert job.desired_enabled is False


async def test_automatic_vpn_failure_remains_queued_for_retry(
    session_factory, admin
) -> None:
    async with session_factory() as db:
        user = await db.get(User, admin.id)
        assert user is not None
        user.account_status = AccountStatus.BLOCKED.value
        db.add(
            VpnSyncJob(
                user_id=user.id,
                desired_enabled=False,
                next_attempt_at=datetime.now(UTC),
            )
        )
        await db.commit()

    provider = EventuallyAvailableProvider()
    assert await process_vpn_sync_jobs(session_factory, provider) == 0
    async with session_factory() as db:
        job = await db.scalar(select(VpnSyncJob))
        assert job is not None
        assert job.attempts == 1
        assert job.last_error is not None
        job.next_attempt_at = datetime.now(UTC)
        await db.commit()

    assert await process_vpn_sync_jobs(session_factory, provider) == 1
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(VpnSyncJob)) == 0


async def test_day_without_plan_is_reprocessed_when_first_plan_is_added(
    session_factory, admin
) -> None:
    billing_date = date(2026, 8, 16)
    async with session_factory() as db:
        user = await db.get(User, admin.id)
        assert user is not None
        user.created_at = datetime(2026, 8, 15, 12, tzinfo=UTC)
        no_plan_run = await process_billing_date(db, billing_date)
        assert no_plan_run.tariff_plan_id is None
        assert no_plan_run.charged_users_count == 0

        db.add(
            TariffPlan(
                name="TP_16.08.2026",
                monthly_amount=Decimal("3100.00"),
                start_date=billing_date,
            )
        )
        await db.commit()
        billed_run = await process_billing_date(db, billing_date)

        assert billed_run.id == no_plan_run.id
        assert billed_run.tariff_plan_id is not None
        assert billed_run.charged_users_count == 1
        assert await db.scalar(select(func.count()).select_from(UserDailyCharge)) == 1
