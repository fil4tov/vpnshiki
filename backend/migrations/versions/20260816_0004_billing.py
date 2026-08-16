"""Add daily billing, status history, VPN sync jobs, and soft deletion."""

from collections.abc import Sequence
from datetime import UTC, datetime, time
from uuid import uuid4
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from alembic import op

revision: str = "20260816_0004"
down_revision: str | None = "20260816_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "billing_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("billing_date", sa.Date(), nullable=False),
        sa.Column("tariff_plan_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("active_users_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("charged_users_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("blocked_users_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("daily_charge", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('processing', 'completed', 'failed')",
            name="ck_billing_runs_status",
        ),
        sa.CheckConstraint(
            "active_users_count >= 0 AND charged_users_count >= 0 "
            "AND blocked_users_count >= 0",
            name="ck_billing_runs_counts_nonnegative",
        ),
        sa.ForeignKeyConstraint(["tariff_plan_id"], ["tariff_plans.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("billing_date"),
    )

    op.create_table(
        "user_daily_charges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("tariff_plan_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount >= 0", name="ck_user_daily_charges_amount_nonnegative"),
        sa.ForeignKeyConstraint(["tariff_plan_id"], ["tariff_plans.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "created_at", name="uq_user_daily_charges_user_created"
        ),
    )
    op.create_index(
        "ix_user_daily_charges_created_at", "user_daily_charges", ["created_at"]
    )
    op.create_index(
        "ix_user_daily_charges_tariff_plan_id", "user_daily_charges", ["tariff_plan_id"]
    )

    op.create_table(
        "user_status_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("previous_status", sa.String(length=16), nullable=True),
        sa.Column("new_status", sa.String(length=16), nullable=False),
        sa.Column("changed_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "previous_status IS NULL OR previous_status IN ('active', 'paused', 'blocked')",
            name="ck_user_status_history_previous",
        ),
        sa.CheckConstraint(
            "new_status IN ('active', 'paused', 'blocked')",
            name="ck_user_status_history_new",
        ),
        sa.CheckConstraint(
            "source IN ('bootstrap', 'admin', 'billing')",
            name="ck_user_status_history_source",
        ),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_status_history_user_effective",
        "user_status_history",
        ["user_id", "effective_at", "created_at"],
    )
    op.create_index(
        "ix_user_status_history_changed_by", "user_status_history", ["changed_by_user_id"]
    )

    op.create_table(
        "vpn_sync_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("desired_enabled", sa.Boolean(), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("attempts >= 0", name="ck_vpn_sync_jobs_attempts_nonnegative"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_vpn_sync_jobs_next_attempt_at", "vpn_sync_jobs", ["next_attempt_at"])

    connection = op.get_bind()
    today = datetime.now(ZoneInfo("Europe/Moscow")).date()
    plan_start = connection.execute(
        sa.text(
            "SELECT start_date FROM tariff_plans "
            "WHERE start_date <= :today AND (end_date IS NULL OR end_date >= :today) "
            "ORDER BY start_date DESC LIMIT 1"
        ),
        {"today": today},
    ).scalar_one_or_none()
    plan_start_at = (
        datetime.combine(plan_start, time.min, ZoneInfo("Europe/Moscow")).astimezone(UTC)
        if plan_start is not None
        else None
    )
    users = connection.execute(sa.text("SELECT id, account_status, created_at FROM users")).mappings()
    history_table = sa.table(
        "user_status_history",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("previous_status", sa.String()),
        sa.column("new_status", sa.String()),
        sa.column("changed_by_user_id", sa.Uuid()),
        sa.column("source", sa.String()),
        sa.column("effective_at", sa.DateTime(timezone=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    now = datetime.now(UTC)
    for user in users:
        created_at = user["created_at"]
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        effective_at = max(created_at, plan_start_at) if plan_start_at is not None else created_at
        connection.execute(
            history_table.insert().values(
                id=uuid4(),
                user_id=user["id"],
                previous_status=None,
                new_status=user["account_status"],
                changed_by_user_id=None,
                source="bootstrap",
                effective_at=effective_at,
                created_at=now,
            )
        )


def downgrade() -> None:
    op.drop_index("ix_vpn_sync_jobs_next_attempt_at", table_name="vpn_sync_jobs")
    op.drop_table("vpn_sync_jobs")
    op.drop_index("ix_user_status_history_changed_by", table_name="user_status_history")
    op.drop_index("ix_user_status_history_user_effective", table_name="user_status_history")
    op.drop_table("user_status_history")
    op.drop_index("ix_user_daily_charges_tariff_plan_id", table_name="user_daily_charges")
    op.drop_index("ix_user_daily_charges_created_at", table_name="user_daily_charges")
    op.drop_table("user_daily_charges")
    op.drop_table("billing_runs")
    op.drop_column("users", "deleted_at")
