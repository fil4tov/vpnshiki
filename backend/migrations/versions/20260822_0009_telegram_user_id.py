"""Add an optional Telegram user ID to users."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260822_0009"
down_revision: str | None = "20260818_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("tg_user_id", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "tg_user_id")
