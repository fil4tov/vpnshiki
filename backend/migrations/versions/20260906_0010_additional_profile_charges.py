"""Add profile count snapshots and charge kinds."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260906_0010"
down_revision: str | None = "20260822_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_daily_charges",
        sa.Column(
            "kind",
            sa.String(length=24),
            server_default="tarification",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_user_daily_charges_kind",
        "user_daily_charges",
        "kind IN ('tarification', 'additional_profiles')",
    )
    op.drop_constraint(
        "uq_user_daily_charges_user_created",
        "user_daily_charges",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_user_daily_charges_user_created_kind",
        "user_daily_charges",
        ["user_id", "created_at", "kind"],
    )

    op.create_table(
        "user_profile_counts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("billing_date", sa.Date(), nullable=False),
        sa.Column("profile_count", sa.Integer(), nullable=False),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "profile_count >= 0",
            name="ck_user_profile_counts_profile_count_nonnegative",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "billing_date",
            name="uq_user_profile_counts_user_billing_date",
        ),
    )
    op.create_index(
        "ix_user_profile_counts_billing_date",
        "user_profile_counts",
        ["billing_date"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_profile_counts_billing_date",
        table_name="user_profile_counts",
    )
    op.drop_table("user_profile_counts")

    op.execute(
        sa.text(
            """
            UPDATE user_daily_charges AS tarification
            SET amount = tarification.amount + additional.amount
            FROM user_daily_charges AS additional
            WHERE tarification.user_id = additional.user_id
              AND tarification.created_at = additional.created_at
              AND tarification.kind = 'tarification'
              AND additional.kind = 'additional_profiles'
            """
        )
    )
    op.execute(
        sa.text(
            "DELETE FROM user_daily_charges WHERE kind = 'additional_profiles'"
        )
    )
    op.drop_constraint(
        "uq_user_daily_charges_user_created_kind",
        "user_daily_charges",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_user_daily_charges_user_created",
        "user_daily_charges",
        ["user_id", "created_at"],
    )
    op.drop_constraint(
        "ck_user_daily_charges_kind",
        "user_daily_charges",
        type_="check",
    )
    op.drop_column("user_daily_charges", "kind")
