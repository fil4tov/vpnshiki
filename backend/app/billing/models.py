from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class BillingRunStatus(StrEnum):
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class StatusChangeSource(StrEnum):
    BOOTSTRAP = "bootstrap"
    ADMIN = "admin"
    BILLING = "billing"


class UserDailyCharge(Base):
    __tablename__ = "user_daily_charges"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tariff_plan_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("tariff_plans.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "created_at", name="uq_user_daily_charges_user_created"),
        CheckConstraint("amount >= 0", name="ck_user_daily_charges_amount_nonnegative"),
        Index("ix_user_daily_charges_created_at", "created_at"),
        Index("ix_user_daily_charges_tariff_plan_id", "tariff_plan_id"),
    )


class UserStatusHistory(Base):
    __tablename__ = "user_status_history"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    previous_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    new_status: Mapped[str] = mapped_column(String(16), nullable=False)
    changed_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        CheckConstraint(
            "previous_status IS NULL OR previous_status IN ('active', 'paused', 'blocked')",
            name="ck_user_status_history_previous",
        ),
        CheckConstraint(
            "new_status IN ('active', 'paused', 'blocked')",
            name="ck_user_status_history_new",
        ),
        CheckConstraint(
            "source IN ('bootstrap', 'admin', 'billing')",
            name="ck_user_status_history_source",
        ),
        Index(
            "ix_user_status_history_user_effective",
            "user_id",
            "effective_at",
            "created_at",
        ),
        Index("ix_user_status_history_changed_by", "changed_by_user_id"),
    )


class BillingRun(Base):
    __tablename__ = "billing_runs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    billing_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    tariff_plan_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("tariff_plans.id", ondelete="RESTRICT"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=BillingRunStatus.PROCESSING.value
    )
    active_users_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    charged_users_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blocked_users_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    daily_charge: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('processing', 'completed', 'failed')",
            name="ck_billing_runs_status",
        ),
        CheckConstraint(
            "active_users_count >= 0 AND charged_users_count >= 0 "
            "AND blocked_users_count >= 0",
            name="ck_billing_runs_counts_nonnegative",
        ),
    )


class VpnSyncJob(Base):
    __tablename__ = "vpn_sync_jobs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    desired_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        CheckConstraint("attempts >= 0", name="ck_vpn_sync_jobs_attempts_nonnegative"),
        Index("ix_vpn_sync_jobs_next_attempt_at", "next_attempt_at"),
    )
