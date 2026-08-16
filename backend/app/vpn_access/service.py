import asyncio
import logging
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlsplit

import httpx

from app.config import Settings
from app.errors import ApiError

from .schemas import VpnAccessRead, VpnClientProfileRead, VpnConnectionRead

PROVIDER_TIMEOUT_SECONDS = 8.0
logger = logging.getLogger(__name__)


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
        logger.warning("3xUI returned HTTP %s", response.status_code)
        raise _provider_unavailable()
    try:
        payload = response.json()
    except ValueError as error:
        raise _provider_unavailable() from error
    if not isinstance(payload, dict):
        raise _provider_unavailable()
    if payload.get("success") is not True:
        message = payload.get("msg")
        logger.warning("3xUI rejected request: %s", message)
        if missing_is_not_found and isinstance(message, str) and "not found" in message.lower():
            raise _profile_not_found()
        raise _provider_unavailable()
    return payload


def profile_matches(email: str, profile_prefix: str) -> bool:
    normalized_email = email.casefold()
    normalized_prefix = profile_prefix.casefold()
    return normalized_email == normalized_prefix or normalized_email.startswith(
        f"{normalized_prefix}-"
    )


def _parse_profile(url: str) -> VpnConnectionRead:
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
    return VpnConnectionRead(
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

    def _connection(self) -> tuple[str, dict[str, str]]:
        api_url = self._settings.x_ui_api_url
        token = self._settings.x_ui_token
        if not api_url or token is None:
            raise _unconfigured()
        return api_url.rstrip("/"), {
            "Authorization": f"Bearer {token.get_secret_value()}"
        }

    async def get_client(self, email: str) -> dict[str, Any]:
        base_url, headers = self._connection()
        encoded_email = quote(email, safe="")
        try:
            async with httpx.AsyncClient(
                headers=headers,
                timeout=PROVIDER_TIMEOUT_SECONDS,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                response = await client.get(f"{base_url}/clients/get/{encoded_email}")
        except httpx.HTTPError as error:
            raise _provider_unavailable() from error
        payload = _response_payload(response, missing_is_not_found=True)
        try:
            provider_client = payload["obj"]["client"]
        except (KeyError, TypeError) as error:
            raise _provider_unavailable() from error
        if not isinstance(provider_client, dict):
            raise _provider_unavailable()
        return provider_client

    async def _list_clients(self) -> list[dict[str, Any]]:
        base_url, headers = self._connection()
        try:
            async with httpx.AsyncClient(
                headers=headers,
                timeout=PROVIDER_TIMEOUT_SECONDS,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                response = await client.get(f"{base_url}/clients/list")
        except httpx.HTTPError as error:
            raise _provider_unavailable() from error
        payload = _response_payload(response, missing_is_not_found=False)
        clients = payload.get("obj")
        if isinstance(clients, dict):
            clients = clients.get("clients")
        if not isinstance(clients, list) or not all(
            isinstance(item, dict) for item in clients
        ):
            raise _provider_unavailable()
        return clients

    async def find_client_emails(self, profile_prefix: str) -> list[str]:
        clients = await self._list_clients()
        emails = {
            email
            for item in clients
            if isinstance((email := item.get("email")), str)
            and profile_matches(email, profile_prefix)
        }
        return sorted(emails, key=str.casefold)

    async def list_client_states(self) -> dict[str, bool]:
        clients = await self._list_clients()
        states: dict[str, bool] = {}
        for item in clients:
            email = item.get("email")
            enabled = item.get("enable")
            if isinstance(email, str) and isinstance(enabled, bool):
                states[email] = enabled
        return states

    async def list_online_clients(self) -> set[str]:
        base_url, headers = self._connection()
        try:
            async with httpx.AsyncClient(
                headers=headers,
                timeout=PROVIDER_TIMEOUT_SECONDS,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                response = await client.post(f"{base_url}/clients/onlines")
        except httpx.HTTPError as error:
            raise _provider_unavailable() from error
        payload = _response_payload(response, missing_is_not_found=False)
        clients = payload.get("obj")
        if not isinstance(clients, list) or not all(
            isinstance(email, str) for email in clients
        ):
            raise _provider_unavailable()
        return {email for email in clients if email.casefold().startswith("web-")}

    async def set_enabled(self, email: str, enabled: bool) -> None:
        provider_client = await self.get_client(email)
        required_fields = (
            "email",
            "subId",
            "uuid",
            "password",
            "auth",
            "flow",
            "security",
            "totalGB",
            "expiryTime",
            "limitIp",
            "tgId",
            "reset",
            "group",
            "comment",
        )
        if provider_client.get("email") != email or any(
            field not in provider_client for field in required_fields
        ):
            raise _provider_unavailable()
        update = {
            "email": provider_client["email"],
            "subId": provider_client["subId"],
            "id": provider_client["uuid"],
            "password": provider_client["password"],
            "auth": provider_client["auth"],
            "flow": provider_client["flow"],
            "security": provider_client["security"],
            "totalGB": provider_client["totalGB"],
            "expiryTime": provider_client["expiryTime"],
            "limitIp": provider_client["limitIp"],
            "tgId": provider_client["tgId"],
            "reset": provider_client["reset"],
            "group": provider_client["group"],
            "comment": provider_client["comment"],
            "enable": enabled,
        }
        reverse = provider_client.get("reverse")
        if isinstance(reverse, dict) and reverse.get("tag"):
            update["reverse"] = {"tag": reverse["tag"]}

        base_url, headers = self._connection()
        encoded_email = quote(email, safe="")
        try:
            async with httpx.AsyncClient(
                headers=headers,
                timeout=PROVIDER_TIMEOUT_SECONDS,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                response = await client.post(
                    f"{base_url}/clients/update/{encoded_email}", json=update
                )
        except httpx.HTTPError as error:
            raise _provider_unavailable() from error
        _response_payload(response, missing_is_not_found=False)

    async def set_matching_enabled(self, profile_prefix: str, enabled: bool) -> None:
        emails = await self.find_client_emails(profile_prefix)
        if not emails:
            return
        results = await asyncio.gather(
            *(self.set_enabled(email, enabled) for email in emails),
            return_exceptions=True,
        )
        errors = [result for result in results if isinstance(result, BaseException)]
        if errors:
            first_error = errors[0]
            if isinstance(first_error, ApiError):
                raise first_error
            raise _provider_unavailable() from first_error

    async def _fetch_client_profile(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        subscription_url: str,
        email: str,
    ) -> VpnClientProfileRead:
        encoded_email = quote(email, safe="")
        client_response, links_response = await asyncio.gather(
            client.get(f"{base_url}/clients/get/{encoded_email}"),
            client.get(f"{base_url}/clients/links/{encoded_email}"),
        )
        client_payload = _response_payload(client_response, missing_is_not_found=False)
        links_payload = _response_payload(links_response, missing_is_not_found=False)
        try:
            provider_client = client_payload["obj"]["client"]
            sub_id = provider_client["subId"]
            returned_email = provider_client["email"]
            links = links_payload["obj"]
        except (KeyError, TypeError) as error:
            raise _provider_unavailable() from error
        if (
            returned_email != email
            or not isinstance(sub_id, str)
            or not sub_id.strip()
            or not isinstance(links, list)
            or not all(isinstance(link, str) for link in links)
        ):
            raise _provider_unavailable()
        return VpnClientProfileRead(
            email=email,
            label=email[4:],
            subscription_url=(
                f"{subscription_url.rstrip('/')}/{quote(sub_id, safe='')}"
            ),
            connections=[_parse_profile(link) for link in links],
        )

    async def fetch_access(self, profile_prefix: str) -> VpnAccessRead:
        api_url = self._settings.x_ui_api_url
        token = self._settings.x_ui_token
        subscription_url = self._settings.x_ui_subscription_url
        if not api_url or token is None or not subscription_url:
            raise _unconfigured()

        base_url = api_url.rstrip("/")
        headers = {"Authorization": f"Bearer {token.get_secret_value()}"}
        try:
            async with httpx.AsyncClient(
                headers=headers,
                timeout=PROVIDER_TIMEOUT_SECONDS,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                list_response = await client.get(f"{base_url}/clients/list")
                list_payload = _response_payload(
                    list_response, missing_is_not_found=False
                )
                clients = list_payload.get("obj")
                if isinstance(clients, dict):
                    clients = clients.get("clients")
                if not isinstance(clients, list) or not all(
                    isinstance(item, dict) for item in clients
                ):
                    raise _provider_unavailable()
                emails = sorted(
                    {
                        email
                        for item in clients
                        if isinstance((email := item.get("email")), str)
                        and profile_matches(email, profile_prefix)
                    },
                    key=str.casefold,
                )
                if not emails:
                    raise _profile_not_found()
                profiles = await asyncio.gather(
                    *(
                        self._fetch_client_profile(
                            client, base_url, subscription_url, email
                        )
                        for email in emails
                    )
                )
        except httpx.HTTPError as error:
            raise _provider_unavailable() from error
        return VpnAccessRead(profiles=list(profiles))
