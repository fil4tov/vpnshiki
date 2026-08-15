from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    model_validator,
)

Money = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]


class TariffPlanStatus(StrEnum):
    ACTIVE = "active"
    SCHEDULED = "scheduled"
    COMPLETED = "completed"


class TariffPlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    monthly_amount: Money
    start_date: date


class TariffPlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    monthly_amount: Money | None = None
    start_date: date | None = None

    @model_validator(mode="after")
    def require_change(self) -> "TariffPlanUpdate":
        if not self.model_fields_set:
            raise ValueError("Укажите хотя бы одно изменение")
        return self


class TariffPlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    monthly_amount: Decimal
    start_date: date
    end_date: date | None
    status: TariffPlanStatus
    is_editable: bool
    created_at: datetime
    updated_at: datetime

    @field_serializer("monthly_amount")
    def serialize_money(self, value: Decimal) -> str:
        return f"{value:.2f}"
