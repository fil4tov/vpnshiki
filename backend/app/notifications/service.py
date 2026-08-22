import asyncio
import logging
from dataclasses import dataclass
from decimal import Decimal
from enum import IntEnum
from typing import Protocol
from uuid import UUID

from app.users.models import User

logger = logging.getLogger(__name__)


class BalanceNotificationKind(IntEnum):
    NEGATIVE_BALANCE = 1
    LAST_DAY = 2
    BLOCKED = 3


class NotificationSender(Protocol):
    async def send(self, tg_user_id: str, text: str) -> bool: ...


@dataclass(frozen=True, slots=True)
class BalanceNotification:
    user_id: UUID
    tg_user_id: str
    kind: BalanceNotificationKind
    balance: Decimal
    negative_balance_limit: Decimal
    daily_charge: Decimal | None = None

    @property
    def text(self) -> str:
        balance = format_money(self.balance)
        limit = format_money(self.negative_balance_limit)
        if self.kind == BalanceNotificationKind.BLOCKED:
            return (
                "⛔ Аккаунт заблокирован\n\n"
                f"Текущий баланс: {balance} ₽, допустимый минус: {limit} ₽. "
                "Пополните баланс до допустимого уровня — после зачисления доступ "
                "восстановится автоматически."
            )
        if self.kind == BalanceNotificationKind.LAST_DAY:
            assert self.daily_charge is not None
            return (
                "⏳ Остался один день до блокировки\n\n"
                f"Текущий баланс: {balance} ₽, допустимый минус: {limit} ₽. "
                f"Следующее ежедневное списание {format_money(self.daily_charge)} ₽ "
                "приведёт к блокировке. Пожалуйста, пополните баланс."
            )
        return (
            "⚠️ Баланс стал отрицательным\n\n"
            f"Текущий баланс: {balance} ₽, допустимый минус: {limit} ₽. "
            "Пополните баланс, чтобы избежать блокировки аккаунта."
        )


def format_money(value: Decimal) -> str:
    return f"{value:.2f}".replace(".", ",")


def daily_balance_notification(
    user: User,
    *,
    balance_before: Decimal,
    daily_charge: Decimal,
    became_blocked: bool,
) -> BalanceNotification | None:
    if user.tg_user_id is None:
        return None
    if became_blocked:
        kind = BalanceNotificationKind.BLOCKED
    elif user.balance - daily_charge < -user.negative_balance_limit:
        kind = BalanceNotificationKind.LAST_DAY
    elif balance_before >= 0 and user.balance < 0:
        kind = BalanceNotificationKind.NEGATIVE_BALANCE
    else:
        return None
    return BalanceNotification(
        user_id=user.id,
        tg_user_id=user.tg_user_id,
        kind=kind,
        balance=user.balance,
        negative_balance_limit=user.negative_balance_limit,
        daily_charge=daily_charge if kind == BalanceNotificationKind.LAST_DAY else None,
    )


def blocked_balance_notification(user: User) -> BalanceNotification | None:
    if user.tg_user_id is None:
        return None
    return BalanceNotification(
        user_id=user.id,
        tg_user_id=user.tg_user_id,
        kind=BalanceNotificationKind.BLOCKED,
        balance=user.balance,
        negative_balance_limit=user.negative_balance_limit,
    )


def merge_balance_notification(
    notifications: dict[UUID, BalanceNotification],
    notification: BalanceNotification | None,
) -> None:
    if notification is None:
        return
    current = notifications.get(notification.user_id)
    if current is None or notification.kind >= current.kind:
        notifications[notification.user_id] = notification


async def send_balance_notifications(
    sender: NotificationSender,
    notifications: list[BalanceNotification],
) -> None:
    results = await asyncio.gather(
        *(sender.send(item.tg_user_id, item.text) for item in notifications),
        return_exceptions=True,
    )
    for notification, result in zip(notifications, results, strict=True):
        if isinstance(result, BaseException):
            logger.warning(
                "Unexpected Telegram notification failure for user %s",
                notification.user_id,
                exc_info=(type(result), result, result.__traceback__),
            )
