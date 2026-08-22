from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
)
from pydantic_core import PydanticCustomError

from app.users.models import AccountStatus, UserRole

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=64)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Money = Annotated[Decimal, Field(max_digits=14, decimal_places=2)]


def normalize_tg_user_id(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise PydanticCustomError(
            "string_type",
            "Telegram User ID должен быть строкой",
        )
    stripped = value.strip()
    if not stripped:
        return None
    if not stripped.isascii() or not stripped.isdecimal():
        raise ValueError("Telegram User ID должен содержать только цифры")
    normalized = str(int(stripped))
    if normalized == "0":
        raise ValueError("Telegram User ID должен быть положительным")
    if len(normalized) > 20:
        raise ValueError("Telegram User ID должен содержать не более 20 цифр")
    return normalized


TelegramUserId = Annotated[str | None, BeforeValidator(normalize_tg_user_id)]


class VpnProfileStatus(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"


class VpnProfileSummaryRead(BaseModel):
    label: str
    status: VpnProfileStatus
    enabled: bool


class AccountBlockSource(StrEnum):
    BILLING = "billing"
    ADMIN = "admin"


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    name: str
    balance: Decimal
    negative_balance_limit: Decimal
    role: UserRole
    account_status: AccountStatus
    block_source: AccountBlockSource | None = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("balance", "negative_balance_limit")
    def serialize_money(self, value: Decimal) -> str:
        return f"{value:.2f}"


class AdminUserMutationRead(UserRead):
    tg_user_id: str | None = Field(default=None, serialization_alias="tgUserId")


class AdminUserRead(AdminUserMutationRead):
    total_charged: Decimal
    total_top_ups: Decimal
    vpn_profiles: list[VpnProfileSummaryRead] | None = Field(
        serialization_alias="vpnProfiles"
    )

    @field_serializer("total_charged", "total_top_ups")
    def serialize_totals(self, value: Decimal) -> str:
        return f"{value:.2f}"


class UserChargeRead(BaseModel):
    id: UUID
    amount: Decimal
    tariff_plan_id: UUID
    tariff_plan_name: str
    created_at: datetime

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return f"{value:.2f}"


class UserTopUpRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    amount: Decimal
    created_at: datetime

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return f"{value:.2f}"


class UserStatusHistoryRead(BaseModel):
    id: UUID
    previous_status: AccountStatus | None
    new_status: AccountStatus
    changed_by_user_id: UUID | None
    changed_by_name: str | None
    source: str
    effective_at: datetime


class DailyChargeRead(BaseModel):
    daily_charge: Decimal | None

    @field_serializer("daily_charge")
    def serialize_daily_charge(self, value: Decimal | None) -> str | None:
        return f"{value:.2f}" if value is not None else None


class PasswordChange(BaseModel):
    current_password: str
    new_password: Password


class AdminUserCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Name
    password: Password
    balance: Money = Decimal("0.00")
    negative_balance_limit: Annotated[Money, Field(ge=0)] = Decimal("0.00")
    role: UserRole = UserRole.USER
    account_status: AccountStatus = AccountStatus.ACTIVE
    tg_user_id: TelegramUserId = Field(
        default=None,
        validation_alias="tgUserId",
    )


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Name | None = None
    balance: Money | None = None
    negative_balance_limit: Annotated[Money, Field(ge=0)] | None = None
    role: UserRole | None = None
    account_status: AccountStatus | None = None
    tg_user_id: TelegramUserId = Field(
        default=None,
        validation_alias="tgUserId",
    )


class AdminPasswordReset(BaseModel):
    new_password: Password
