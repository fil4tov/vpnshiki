from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class YooMoneyPaymentType(StrEnum):
    WALLET = "PC"
    CARD = "AC"


class YooMoneyPaymentStatus(StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"


class YooMoneyPayment(Base):
    __tablename__ = "yoomoney_payments"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    requested_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    withdrawn_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    received_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    payment_type: Mapped[str | None] = mapped_column(String(2), nullable=True)
    operation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=YooMoneyPaymentStatus.PENDING.value
    )
    balance_before: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    balance_after: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    last_reconciliation_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "payment_type IS NULL OR payment_type IN ('PC', 'AC')",
            name="ck_yoomoney_payment_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'succeeded')",
            name="ck_yoomoney_payment_status",
        ),
        CheckConstraint("requested_amount > 0", name="ck_yoomoney_requested_positive"),
        CheckConstraint(
            "withdrawn_amount IS NULL OR withdrawn_amount > 0",
            name="ck_yoomoney_withdrawn_positive",
        ),
        CheckConstraint(
            "received_amount IS NULL OR received_amount > 0",
            name="ck_yoomoney_received_positive",
        ),
        Index("ix_yoomoney_payments_status_created", "status", "created_at"),
        Index(
            "ix_yoomoney_payments_user_status_paid",
            "user_id",
            "status",
            "paid_at",
        ),
    )
