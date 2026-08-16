import os
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.billing.service import process_billing_date
from app.tariff_plans.models import TariffPlan
from app.users.models import User

POSTGRES_TEST_URL = os.getenv("TEST_POSTGRES_URL")

pytestmark = pytest.mark.skipif(
    POSTGRES_TEST_URL is None,
    reason="TEST_POSTGRES_URL is required for PostgreSQL integration tests",
)


async def test_billing_locks_users_after_historical_status_query() -> None:
    assert POSTGRES_TEST_URL is not None
    engine = create_async_engine(POSTGRES_TEST_URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    billing_date = date(2026, 8, 16)
    try:
        async with factory() as db:
            user = User(
                name="postgres-billing-user",
                password_hash="unused",
                balance=Decimal("1000.00"),
                created_at=datetime(2026, 8, 15, 12, tzinfo=UTC),
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

            assert run.charged_users_count == 1
            assert run.daily_charge == Decimal("100.00")
            await db.refresh(user)
            assert user.balance == Decimal("900.00")
    finally:
        await engine.dispose()
