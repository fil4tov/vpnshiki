"""Add tariff plans schedule."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260815_0002"
down_revision: str | None = "20260815_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tariff_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=32), nullable=False),
        sa.Column("monthly_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("monthly_amount > 0", name="ck_tariff_plans_amount_positive"),
        sa.CheckConstraint(
            "end_date IS NULL OR end_date >= start_date",
            name="ck_tariff_plans_dates_ordered",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("start_date"),
    )
    op.execute(
        "ALTER TABLE tariff_plans ADD CONSTRAINT ex_tariff_plans_dates_overlap "
        "EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&) "
        "DEFERRABLE INITIALLY DEFERRED"
    )


def downgrade() -> None:
    op.drop_table("tariff_plans")
