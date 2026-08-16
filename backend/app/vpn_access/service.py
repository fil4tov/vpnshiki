import asyncio
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlsplit

import httpx

from app.config import Settings
from app.errors import ApiError

from .schemas import VpnAccessRead, VpnProfileRead

PROVIDER_TIMEOUT_SECONDS = 8.0


def _unconfigured() -> ApiError:
    return ApiError(
        status_code=503,
        code="vpn_integration_unconfigured",
        message="Интеграция с VPN-панелью не настроена",
    )


def _provider_unavailable() -> ApiError:
    return ApiError(
        status_code=502,
        code="vpn_provider_unavailable",
        message="VPN-панель временно недоступна",
    )


def _profile_not_found() -> ApiError:
    return ApiError(
        status_code=404,
        code="vpn_profile_not_found",
        message="VPN-профиль не найден",
    )


def _response_payload(response: httpx.Response, *, missing_is_not_found: bool) -> dict[str, Any]:
    if not response.is_success:
        raise _provider_unavailable()
    try:
        payload = response.json()
    except ValueError as error:
        raise _provider_unavailable() from error
    if not isinstance(payload, dict):
        raise _provider_unavailable()
    if payload.get("success") is not True:
        message = payload.get("msg")
        if missing_is_not_found and isinstance(message, str) and "not found" in message.lower():
            raise _profile_not_found()
        raise _provider_unavailable()
    return payload


def _parse_profile(url: str) -> VpnProfileRead:
    try:
        parsed = urlsplit(url)
        protocol = parsed.scheme.lower()
        name = unquote(parsed.fragment).strip()
        query = parse_qs(parsed.query)
    except (TypeError, ValueError) as error:
        raise _provider_unavailable() from error
    if not protocol or not name:
        raise _provider_unavailable()

    transport = query.get("type", [None])[0]
    security = query.get("security", [None])[0]
    if protocol == "hysteria2" and not security:
        security = "tls"
    return VpnProfileRead(
        name=name,
        protocol=protocol,
        transport=transport.lower() if isinstance(transport, str) else None,
        security=security.lower() if isinstance(security, str) else None,
        url=url,
    )


class XuiClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._transport = transport

    async def fetch_access(self, email: str) -> VpnAccessRead:
        api_url = self._settings.x_ui_api_url
        token = self._settings.x_ui_token
        subscription_url = self._settings.x_ui_subscription_url
        if not api_url or token is None or not subscription_url:
            raise _unconfigured()

        encoded_email = quote(email, safe="")
        base_url = api_url.rstrip("/")
        headers = {"Authorization": f"Bearer {token.get_secret_value()}"}
        try:
            async with httpx.AsyncClient(
                headers=headers,
                timeout=PROVIDER_TIMEOUT_SECONDS,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                client_response, links_response = await asyncio.gather(
                    client.get(f"{base_url}/clients/get/{encoded_email}"),
                    client.get(f"{base_url}/clients/links/{encoded_email}"),
                )
        except httpx.HTTPError as error:
            raise _provider_unavailable() from error

        client_payload = _response_payload(client_response, missing_is_not_found=True)
        links_payload = _response_payload(links_response, missing_is_not_found=False)
        try:
            sub_id = client_payload["obj"]["client"]["subId"]
            links = links_payload["obj"]
        except (KeyError, TypeError) as error:
            raise _provider_unavailable() from error
        if not isinstance(sub_id, str) or not sub_id.strip() or not isinstance(links, list):
            raise _provider_unavailable()
        if not all(isinstance(link, str) for link in links):
            raise _provider_unavailable()

        return VpnAccessRead(
            subscription_url=f"{subscription_url.rstrip('/')}/{quote(sub_id, safe='')}",
            profiles=[_parse_profile(link) for link in links],
        )
