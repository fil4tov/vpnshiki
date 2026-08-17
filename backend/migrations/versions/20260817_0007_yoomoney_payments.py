"""Add YooMoney payment attempts and link successful top-ups."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260817_0007"
down_revision: str | None = "20260816_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "yoomoney_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("payment_type", sa.String(length=2), nullable=False),
        sa.Column("credit_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("payable_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("received_amount", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("operation_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("review_reason", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("payment_type IN ('PC', 'AC')", name="ck_yoomoney_payment_type"),
        sa.CheckConstraint(
            "status IN ('pending', 'succeeded', 'review_required')",
            name="ck_yoomoney_payment_status",
        ),
        sa.CheckConstraint("credit_amount > 0", name="ck_yoomoney_credit_positive"),
        sa.CheckConstraint(
            "payable_amount >= credit_amount",
            name="ck_yoomoney_payable_not_less_than_credit",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("label", name="uq_yoomoney_payments_label"),
        sa.UniqueConstraint("operation_id", name="uq_yoomoney_payments_operation_id"),
    )
    op.create_index(
        "ix_yoomoney_payments_status_created",
        "yoomoney_payments",
        ["status", "created_at"],
    )
    op.add_column("user_top_ups", sa.Column("yoomoney_payment_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_user_top_ups_yoomoney_payment",
        "user_top_ups",
        "yoomoney_payments",
        ["yoomoney_payment_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_unique_constraint(
        "uq_user_top_ups_yoomoney_payment_id",
        "user_top_ups",
        ["yoomoney_payment_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_user_top_ups_yoomoney_payment_id", "user_top_ups", type_="unique"
    )
    op.drop_constraint(
        "fk_user_top_ups_yoomoney_payment", "user_top_ups", type_="foreignkey"
    )
    op.drop_column("user_top_ups", "yoomoney_payment_id")
    op.drop_index("ix_yoomoney_payments_status_created", table_name="yoomoney_payments")
    op.drop_table("yoomoney_payments")
