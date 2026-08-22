from typing import Annotated

from fastapi import Depends

from app.config import get_settings

from .client import TelegramNotificationClient


def get_telegram_notification_client() -> TelegramNotificationClient:
    return TelegramNotificationClient(get_settings())


TelegramNotifier = Annotated[
    TelegramNotificationClient,
    Depends(get_telegram_notification_client),
]
