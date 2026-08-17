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
    REVIEW_REQUIRED = "review_required"


class YooMoneyPayment(Base):
    __tablename__ = "yoomoney_payments"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    payment_type: Mapped[str] = mapped_column(String(2), nullable=False)
    credit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payable_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    received_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    operation_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=YooMoneyPaymentStatus.PENDING.value
    )
    review_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("payment_type IN ('PC', 'AC')", name="ck_yoomoney_payment_type"),
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'review_required')",
            name="ck_yoomoney_payment_status",
        ),
        CheckConstraint("credit_amount > 0", name="ck_yoomoney_credit_positive"),
        CheckConstraint(
            "payable_amount >= credit_amount",
            name="ck_yoomoney_payable_not_less_than_credit",
        ),
        Index("ix_yoomoney_payments_status_created", "status", "created_at"),
    )
