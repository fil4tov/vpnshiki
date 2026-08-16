import asyncio
from urllib.parse import unquote

import httpx
from httpx import AsyncClient

from app.config import Settings
from app.errors import ApiError
from app.main import app
from app.users.models import AccountStatus
from app.vpn_access.dependencies import get_xui_client
from app.vpn_access.schemas import VpnAccessRead, VpnProfileRead
from app.vpn_access.service import XuiClient

from .test_auth_and_users import login


def vpn_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": "sqlite+aiosqlite://",
        "x_ui_api_url": "https://xui.example.test/base/panel/api",
        "x_ui_token": "provider-secret",
        "x_ui_subscription_url": "https://subscription.example.test/gatewaysubru",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def provider_payloads(email: str = "[web]-Миша") -> tuple[dict, dict]:
    encoded_name = email.replace("[", "%5B").replace("]", "%5D")
    return (
        {"success": True, "msg": "", "obj": {"client": {"subId": "sub-id-123"}}},
        {
            "success": True,
            "msg": "",
            "obj": [
                (
                    "vless://preview@example.test:443?type=xhttp&security=reality"
                    f"#ru-fin-vless-443-{encoded_name}"
                ),
                (
                    "hysteria2://preview@example.test:4443?sni=example.test"
                    f"#ru-fr-hysteria-4443-{encoded_name}"
                ),
            ],
        },
    )


def test_settings_read_renamed_x_ui_environment(monkeypatch) -> None:
    monkeypatch.setenv("X_UI_API_URL", "https://xui.example.test/panel/api")
    monkeypatch.setenv("X_UI_TOKEN", "provider-secret")
    monkeypatch.setenv(
        "X_UI_SUBSCRIPTION_URL",
        "https://subscription.example.test/gatewaysubru",
    )
    settings = Settings(_env_file=None)
    assert settings.x_ui_api_url == "https://xui.example.test/panel/api"
    assert settings.x_ui_token is not None
    assert settings.x_ui_token.get_secret_value() == "provider-secret"
    assert settings.x_ui_subscription_url.endswith("/gatewaysubru")


async def test_client_builds_encoded_parallel_bearer_requests_and_parses_profiles() -> None:
    get_payload, links_payload = provider_payloads()
    requests: list[httpx.Request] = []
    both_started = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=0.5)
        payload = get_payload if "/clients/get/" in request.url.path else links_payload
        return httpx.Response(200, json=payload)

    integration = XuiClient(vpn_settings(), transport=httpx.MockTransport(handler))
    result = await integration.fetch_access("[web]-Миша")

    assert len(requests) == 2
    assert all(request.headers["Authorization"] == "Bearer provider-secret" for request in requests)
    assert all(request.url.path.startswith("/base/panel/api/clients/") for request in requests)
    assert {unquote(request.url.path.rsplit("/", 1)[-1]) for request in requests} == {"[web]-Миша"}
    assert result.subscription_url == (
        "https://subscription.example.test/gatewaysubru/sub-id-123"
    )
    assert result.profiles[0].model_dump() == {
        "name": "ru-fin-vless-443-[web]-Миша",
        "protocol": "vless",
        "transport": "xhttp",
        "security": "reality",
        "url": links_payload["obj"][0],
    }
    assert result.profiles[1].protocol == "hysteria2"
    assert result.profiles[1].transport is None
    assert result.profiles[1].security == "tls"


async def test_client_returns_empty_profile_list_with_subscription() -> None:
    get_payload, links_payload = provider_payloads()
    links_payload["obj"] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=get_payload if "/clients/get/" in request.url.path else links_payload,
        )

    result = await XuiClient(
        vpn_settings(), transport=httpx.MockTransport(handler)
    ).fetch_access("[web]-user")
    assert result.subscription_url.endswith("/sub-id-123")
    assert result.profiles == []


async def test_client_maps_missing_profile_to_stable_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/clients/get/" in request.url.path:
            return httpx.Response(
                200,
                json={"success": False, "msg": "Obtain (record not found)", "obj": None},
            )
        return httpx.Response(200, json={"success": True, "msg": "", "obj": []})

    try:
        await XuiClient(
            vpn_settings(), transport=httpx.MockTransport(handler)
        ).fetch_access("[web]-missing")
    except ApiError as error:
        assert error.status_code == 404
        assert error.code == "vpn_profile_not_found"
    else:
        raise AssertionError("Expected vpn_profile_not_found")


async def test_client_maps_timeout_invalid_token_and_malformed_response() -> None:
    async def timeout_handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout")

    async def unauthorized_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "unauthorized"})

    async def malformed_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"success": True, "obj": {"unexpected": True}})

    for handler in (timeout_handler, unauthorized_handler, malformed_handler):
        try:
            await XuiClient(
                vpn_settings(), transport=httpx.MockTransport(handler)
            ).fetch_access("[web]-user")
        except ApiError as error:
            assert error.status_code == 502
            assert error.code == "vpn_provider_unavailable"
        else:
            raise AssertionError("Expected vpn_provider_unavailable")


async def test_client_requires_all_configuration() -> None:
    integration = XuiClient(vpn_settings(x_ui_token=None))
    try:
        await integration.fetch_access("[web]-user")
    except ApiError as error:
        assert error.status_code == 503
        assert error.code == "vpn_integration_unconfigured"
    else:
        raise AssertionError("Expected vpn_integration_unconfigured")


class FakeXuiClient:
    def __init__(self) -> None:
        self.emails: list[str] = []

    async def fetch_access(self, email: str) -> VpnAccessRead:
        self.emails.append(email)
        return VpnAccessRead(
            subscription_url="https://subscription.example.test/gatewaysubru/test",
            profiles=[
                VpnProfileRead(
                    name="ru-fin-vless-443-[web]-admin",
                    protocol="vless",
                    transport="xhttp",
                    security="reality",
                    url="vless://preview@example.test#profile",
                )
            ],
        )


async def test_endpoint_uses_current_user_and_disables_caching(client: AsyncClient) -> None:
    provider = FakeXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    try:
        await login(client)
        response = await client.get("/api/users/me/vpn")
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"
        assert provider.emails == ["[web]-admin"]
        assert response.json()["profiles"][0]["name"].endswith("[web]-admin")
    finally:
        app.dependency_overrides.pop(get_xui_client, None)


async def test_inactive_account_never_calls_provider(client: AsyncClient, admin) -> None:
    provider = FakeXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    try:
        await login(client)
        updated = await client.patch(
            f"/api/admin/users/{admin.id}",
            json={"account_status": AccountStatus.PAUSED.value},
        )
        assert updated.status_code == 200

        response = await client.get("/api/users/me/vpn")
        assert response.status_code == 403
        assert response.json()["code"] == "vpn_access_inactive"
        assert provider.emails == []
    finally:
        app.dependency_overrides.pop(get_xui_client, None)
