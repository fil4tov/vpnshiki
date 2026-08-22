import json
from decimal import Decimal

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.notifications.client import TelegramNotificationClient
from app.notifications.service import (
    BalanceNotificationKind,
    blocked_balance_notification,
    daily_balance_notification,
    merge_balance_notification,
)
from app.users.models import User


def make_user(*, balance: str, limit: str = "300.00", tg_user_id: str | None = "258373830") -> User:
    return User(
        name="telegram-user",
        password_hash="not-used",
        balance=Decimal(balance),
        negative_balance_limit=Decimal(limit),
        tg_user_id=tg_user_id,
    )


def test_telegram_settings_are_optional_as_a_pair() -> None:
    assert TelegramNotificationClient(Settings()).enabled is False
    settings = Settings(
        TG_NOTIFICATION_URL="https://notify.example.test/send",
        TG_NOTIFICATION_TOKEN="secret-token",
    )
    assert TelegramNotificationClient(settings).enabled is True


@pytest.mark.parametrize(
    ("url", "token"),
    [
        ("https://notify.example.test/send", ""),
        ("", "secret-token"),
        ("ftp://notify.example.test/send", "secret-token"),
        ("http://", "secret-token"),
    ],
)
def test_telegram_settings_reject_partial_or_invalid_configuration(
    url: str,
    token: str,
) -> None:
    with pytest.raises(ValidationError):
        Settings(TG_NOTIFICATION_URL=url, TG_NOTIFICATION_TOKEN=token)


async def test_telegram_client_posts_expected_contract() -> None:
    captured: httpx.Request | None = None

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured
        captured = request
        return httpx.Response(200, json={"ok": True})

    client = TelegramNotificationClient(
        Settings(
            TG_NOTIFICATION_URL="https://notify.example.test/send",
            TG_NOTIFICATION_TOKEN="secret-token",
        ),
        transport=httpx.MockTransport(handler),
    )

    assert await client.send("258373830", "Проверка") is True
    assert captured is not None
    assert captured.headers["Authorization"] == "Bearer secret-token"
    assert captured.headers["Content-Type"] == "application/json"
    assert json.loads(captured.content) == {"tgid": 258373830, "text": "Проверка"}


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(503, json={"ok": False}),
        httpx.Response(200, text="not-json"),
        httpx.Response(200, json={"ok": False}),
        httpx.Response(200, json=[]),
    ],
)
async def test_telegram_client_treats_invalid_responses_as_failure(
    response: httpx.Response,
) -> None:
    client = TelegramNotificationClient(
        Settings(
            TG_NOTIFICATION_URL="https://notify.example.test/send",
            TG_NOTIFICATION_TOKEN="secret-token",
        ),
        transport=httpx.MockTransport(lambda _request: response),
    )

    assert await client.send("258373830", "Проверка") is False


async def test_telegram_client_swallows_transport_errors() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    client = TelegramNotificationClient(
        Settings(
            TG_NOTIFICATION_URL="https://notify.example.test/send",
            TG_NOTIFICATION_TOKEN="secret-token",
        ),
        transport=httpx.MockTransport(fail),
    )

    assert await client.send("258373830", "Проверка") is False


async def test_telegram_client_swallows_timeouts() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    client = TelegramNotificationClient(
        Settings(
            TG_NOTIFICATION_URL="https://notify.example.test/send",
            TG_NOTIFICATION_TOKEN="secret-token",
        ),
        transport=httpx.MockTransport(fail),
    )

    assert await client.send("258373830", "Проверка") is False


@pytest.mark.parametrize(
    ("balance_before", "balance_after", "limit", "charge", "blocked", "expected"),
    [
        ("0.00", "-20.00", "300.00", "20.00", False, BalanceNotificationKind.NEGATIVE_BALANCE),
        ("-50.00", "-70.00", "300.00", "20.00", False, None),
        ("-260.00", "-280.00", "300.00", "20.00", False, None),
        ("-270.00", "-290.00", "300.00", "20.00", False, BalanceNotificationKind.LAST_DAY),
        ("5.00", "-15.00", "20.00", "20.00", False, BalanceNotificationKind.LAST_DAY),
        ("-290.00", "-310.00", "300.00", "20.00", True, BalanceNotificationKind.BLOCKED),
    ],
)
def test_daily_notification_rules_and_priority(
    balance_before: str,
    balance_after: str,
    limit: str,
    charge: str,
    blocked: bool,
    expected: BalanceNotificationKind | None,
) -> None:
    user = make_user(balance=balance_after, limit=limit)

    notification = daily_balance_notification(
        user,
        balance_before=Decimal(balance_before),
        daily_charge=Decimal(charge),
        became_blocked=blocked,
    )

    assert (notification.kind if notification is not None else None) == expected


def test_notification_is_omitted_without_telegram_id() -> None:
    user = make_user(balance="-20.00", tg_user_id=None)

    assert (
        daily_balance_notification(
            user,
            balance_before=Decimal("0.00"),
            daily_charge=Decimal("20.00"),
            became_blocked=False,
        )
        is None
    )
    assert blocked_balance_notification(user) is None


def test_negative_balance_notification_includes_allowed_limit() -> None:
    user = make_user(balance="-11.90", limit="300.00")

    notification = daily_balance_notification(
        user,
        balance_before=Decimal("8.10"),
        daily_charge=Decimal("20.00"),
        became_blocked=False,
    )

    assert notification is not None
    assert notification.text == (
        "⚠️ Баланс стал отрицательным\n\n"
        "Текущий баланс: -11,90 ₽, допустимый минус: 300,00 ₽. "
        "Пополните баланс, чтобы избежать блокировки аккаунта."
    )


def test_catch_up_aggregation_keeps_one_highest_priority_notification() -> None:
    user = make_user(balance="-20.00")
    notifications = {}
    negative = daily_balance_notification(
        user,
        balance_before=Decimal("0.00"),
        daily_charge=Decimal("20.00"),
        became_blocked=False,
    )
    user.balance = Decimal("-290.00")
    last_day = daily_balance_notification(
        user,
        balance_before=Decimal("-270.00"),
        daily_charge=Decimal("20.00"),
        became_blocked=False,
    )
    user.balance = Decimal("-310.00")
    blocked = blocked_balance_notification(user)

    merge_balance_notification(notifications, negative)
    merge_balance_notification(notifications, last_day)
    merge_balance_notification(notifications, blocked)

    assert list(notifications.values()) == [blocked]
    assert "-310,00 ₽" in notifications[user.id].text
