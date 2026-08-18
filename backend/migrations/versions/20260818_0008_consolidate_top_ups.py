"""Consolidate successful top-ups into YooMoney payments."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260818_0008"
down_revision: str | None = "20260817_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "yoomoney_payments",
        sa.Column("balance_before", sa.Numeric(precision=14, scale=2), nullable=True),
    )
    op.add_column(
        "yoomoney_payments",
        sa.Column("balance_after", sa.Numeric(precision=14, scale=2), nullable=True),
    )
    op.execute(
        """
        UPDATE yoomoney_payments AS payments
        SET balance_before = top_ups.balance_before,
            balance_after = top_ups.balance_after
        FROM user_top_ups AS top_ups
        WHERE top_ups.yoomoney_payment_id = payments.id
        """
    )
    op.create_index(
        "ix_yoomoney_payments_user_status_paid",
        "yoomoney_payments",
        ["user_id", "status", "paid_at"],
    )
    op.drop_table("user_top_ups")


def downgrade() -> None:
    op.create_table(
        "user_top_ups",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("yoomoney_payment_id", sa.Uuid(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("balance_before", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("balance_after", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_user_top_ups_amount_positive"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["yoomoney_payment_id"],
            ["yoomoney_payments.id"],
            name="fk_user_top_ups_yoomoney_payment",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "yoomoney_payment_id",
            name="uq_user_top_ups_yoomoney_payment_id",
        ),
    )
    op.create_index(
        "ix_user_top_ups_user_created",
        "user_top_ups",
        ["user_id", "created_at"],
    )
    op.execute(
        """
        INSERT INTO user_top_ups (
            id,
            user_id,
            yoomoney_payment_id,
            amount,
            balance_before,
            balance_after,
            created_at
        )
        SELECT
            id,
            user_id,
            id,
            received_amount,
            balance_before,
            balance_after,
            paid_at
        FROM yoomoney_payments
        WHERE status = 'succeeded'
          AND received_amount IS NOT NULL
          AND balance_before IS NOT NULL
          AND balance_after IS NOT NULL
          AND paid_at IS NOT NULL
        """
    )
    op.drop_index(
        "ix_yoomoney_payments_user_status_paid",
        table_name="yoomoney_payments",
    )
    op.drop_column("yoomoney_payments", "balance_after")
    op.drop_column("yoomoney_payments", "balance_before")
