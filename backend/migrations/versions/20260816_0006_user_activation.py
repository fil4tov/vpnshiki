"""Allow user-initiated account activation status history."""

from collections.abc import Sequence

from alembic import op

revision: str = "20260816_0006"
down_revision: str | None = "20260816_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_user_status_history_source",
        "user_status_history",
        type_="check",
    )
    op.create_check_constraint(
        "ck_user_status_history_source",
        "user_status_history",
        "source IN ('bootstrap', 'admin', 'billing', 'top_up', 'user')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_user_status_history_source",
        "user_status_history",
        type_="check",
    )
    op.execute("UPDATE user_status_history SET source = 'admin' WHERE source = 'user'")
    op.create_check_constraint(
        "ck_user_status_history_source",
        "user_status_history",
        "source IN ('bootstrap', 'admin', 'billing', 'top_up')",
    )
