import logging

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)
NOTIFICATION_TIMEOUT_SECONDS = 10.0


class TelegramNotificationClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._url = settings.tg_notification_url
        token = settings.tg_notification_token
        self._token = token.get_secret_value() if token is not None else None
        self._transport = transport

    @property
    def enabled(self) -> bool:
        return self._url is not None and self._token is not None

    async def send(self, tg_user_id: str, text: str) -> bool:
        if not self.enabled:
            return False
        assert self._url is not None and self._token is not None
        try:
            async with httpx.AsyncClient(
                timeout=NOTIFICATION_TIMEOUT_SECONDS,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                response = await client.post(
                    self._url,
                    headers={"Authorization": f"Bearer {self._token}"},
                    json={"tgid": int(tg_user_id), "text": text},
                )
        except (httpx.HTTPError, ValueError):
            logger.warning("Telegram notification request failed", exc_info=True)
            return False
        if not response.is_success:
            logger.warning("Telegram notification API returned HTTP %s", response.status_code)
            return False
        try:
            payload = response.json()
        except ValueError:
            logger.warning("Telegram notification API returned invalid JSON")
            return False
        if not isinstance(payload, dict) or payload.get("ok") is not True:
            logger.warning("Telegram notification API rejected notification")
            return False
        return True
