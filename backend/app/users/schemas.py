from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_serializer

from app.users.models import AccountStatus, UserRole

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=64)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Money = Annotated[Decimal, Field(max_digits=14, decimal_places=2)]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    balance: Decimal
    negative_balance_limit: Decimal
    role: UserRole
    account_status: AccountStatus
    created_at: datetime
    updated_at: datetime

    @field_serializer("balance", "negative_balance_limit")
    def serialize_money(self, value: Decimal) -> str:
        return f"{value:.2f}"


class DailyChargeRead(BaseModel):
    daily_charge: Decimal | None

    @field_serializer("daily_charge")
    def serialize_daily_charge(self, value: Decimal | None) -> str | None:
        return f"{value:.2f}" if value is not None else None


class PasswordChange(BaseModel):
    current_password: str
    new_password: Password


class AdminUserCreate(BaseModel):
    name: Name
    password: Password
    balance: Money = Decimal("0.00")
    negative_balance_limit: Annotated[Money, Field(ge=0)] = Decimal("0.00")
    role: UserRole = UserRole.USER
    account_status: AccountStatus = AccountStatus.ACTIVE


class AdminUserUpdate(BaseModel):
    name: Name | None = None
    balance: Money | None = None
    negative_balance_limit: Annotated[Money, Field(ge=0)] | None = None
    role: UserRole | None = None
    account_status: AccountStatus | None = None


class AdminPasswordReset(BaseModel):
    new_password: Password
