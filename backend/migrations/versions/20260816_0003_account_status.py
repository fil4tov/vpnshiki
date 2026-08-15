"""Replace user activity flags with an account status."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260816_0003"
down_revision: str | None = "20260815_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "account_status",
            sa.String(length=16),
            server_default="active",
            nullable=False,
        ),
    )
    op.execute(
        "UPDATE users SET account_status = CASE "
        "WHEN is_blocked THEN 'blocked' "
        "WHEN NOT is_active THEN 'paused' "
        "ELSE 'active' END"
    )
    op.create_check_constraint(
        "ck_users_account_status",
        "users",
        "account_status IN ('active', 'paused', 'blocked')",
    )
    op.drop_column("users", "is_blocked")
    op.drop_column("users", "is_active")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("is_blocked", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.execute(
        "UPDATE users SET "
        "is_active = (account_status = 'active'), "
        "is_blocked = (account_status = 'blocked')"
    )
    op.drop_constraint("ck_users_account_status", "users", type_="check")
    op.drop_column("users", "account_status")
