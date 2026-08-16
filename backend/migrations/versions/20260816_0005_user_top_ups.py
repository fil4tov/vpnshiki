"""Add user top-up history and top-up status source."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260816_0005"
down_revision: str | None = "20260816_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_top_ups",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("balance_before", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("balance_after", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_user_top_ups_amount_positive"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_top_ups_user_created",
        "user_top_ups",
        ["user_id", "created_at"],
    )
    op.drop_constraint(
        "ck_user_status_history_source",
        "user_status_history",
        type_="check",
    )
    op.create_check_constraint(
        "ck_user_status_history_source",
        "user_status_history",
        "source IN ('bootstrap', 'admin', 'billing', 'top_up')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_user_status_history_source",
        "user_status_history",
        type_="check",
    )
    op.execute("UPDATE user_status_history SET source = 'admin' WHERE source = 'top_up'")
    op.create_check_constraint(
        "ck_user_status_history_source",
        "user_status_history",
        "source IN ('bootstrap', 'admin', 'billing')",
    )
    op.drop_index("ix_user_top_ups_user_created", table_name="user_top_ups")
    op.drop_table("user_top_ups")
