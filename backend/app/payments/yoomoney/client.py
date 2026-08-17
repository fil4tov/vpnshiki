from datetime import datetime
from typing import Any

import httpx

from app.config import Settings


class YooMoneyClient:
    def __init__(self, settings: Settings) -> None:
        token = settings.yoomoney_access_token
        if token is None:
            raise RuntimeError("Не задан YOOMONEY_ACCESS_TOKEN")
        self._token = token.get_secret_value()

    async def operation_history(
        self,
        *,
        from_datetime: datetime,
        start_record: str | None = None,
    ) -> dict[str, Any]:
        data = {
            "from": from_datetime.isoformat(),
            "records": "100",
            "details": "false",
        }
        if start_record is not None:
            data["start_record"] = start_record
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://yoomoney.ru/api/operation-history",
                headers={"Authorization": f"Bearer {self._token}"},
                data=data,
            )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise TypeError("YooMoney вернул некорректную историю операций")
        if payload.get("error"):
            raise RuntimeError(f"YooMoney operation-history: {payload['error']}")
        return payload
