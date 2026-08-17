from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from .models import YooMoneyPaymentStatus, YooMoneyPaymentType

PaymentAmount = Annotated[
    Decimal,
    Field(ge=Decimal("10.00"), le=Decimal("5000.00"), max_digits=14, decimal_places=2),
]


class YooMoneyPaymentCreate(BaseModel):
    amount: PaymentAmount
    payment_type: YooMoneyPaymentType


class YooMoneyCheckout(BaseModel):
    action: str
    method: Literal["POST"] = "POST"
    fields: dict[str, str]


class YooMoneyPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: YooMoneyPaymentStatus
    payment_type: YooMoneyPaymentType
    credit_amount: Decimal
    payable_amount: Decimal
    received_amount: Decimal | None
    review_reason: str | None
    created_at: datetime
    paid_at: datetime | None
    checkout: YooMoneyCheckout | None = None

    @field_serializer("credit_amount", "payable_amount", "received_amount")
    def serialize_amount(self, value: Decimal | None) -> str | None:
        return f"{value:.2f}" if value is not None else None
