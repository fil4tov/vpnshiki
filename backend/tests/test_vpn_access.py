import json
from urllib.parse import quote, unquote

import httpx
import pytest
from httpx import AsyncClient

from app.config import Settings
from app.errors import ApiError
from app.main import app
from app.users.models import AccountStatus
from app.vpn_access.dependencies import get_xui_client
from app.vpn_access.schemas import (
    VpnAccessRead,
    VpnClientProfileRead,
    VpnConnectionRead,
)
from app.vpn_access.service import VpnProfileState, XuiClient, profile_matches

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


def full_provider_client(email: str, sub_id: str = "sub-id-123") -> dict:
    return {
        "email": email,
        "subId": sub_id,
        "id": 42,
        "uuid": f"client-uuid-{email}",
        "password": "password",
        "auth": "none",
        "flow": "xtls-rprx-vision",
        "security": "auto",
        "totalGB": 123,
        "expiryTime": 456,
        "limitIp": 2,
        "tgId": 789,
        "reset": 0,
        "group": "customers",
        "comment": "keep exactly",
        "enable": True,
        "allowedIPs": ["10.0.0.1"],
    }


def provider_links(email: str) -> list[str]:
    encoded_email = quote(email, safe="-")
    return [
        (
            "vless://preview@example.test:443?type=xhttp&security=reality"
            f"#ru-fin-vless-443-{encoded_email}"
        ),
        (
            "hysteria2://preview@example.test:4443?sni=example.test"
            f"#ru-fr-hysteria-4443-{encoded_email}"
        ),
    ]


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


def test_profile_matching_is_case_insensitive_and_has_a_strict_boundary() -> None:
    assert profile_matches("web-Moxxie", "web-moxxie")
    assert profile_matches("WEB-MOXXIE-Mobile", "web-moxxie")
    assert not profile_matches("web-moxxie2-mobile", "web-moxxie")
    assert not profile_matches("prefix-web-moxxie-mobile", "web-moxxie")
    assert not profile_matches("[web]-moxxie", "web-moxxie")


async def test_client_lists_and_fetches_all_matching_profiles() -> None:
    emails = [
        "web-Миша-mobile",
        "WEB-Миша-PC",
        "web-Миша2-tablet",
        "[web]-Миша",
    ]
    clients = {
        email: full_provider_client(email, f"sub-{index}")
        for index, email in enumerate(emails)
    }
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/clients/list"):
            return httpx.Response(200, json={"success": True, "obj": list(clients.values())})
        email = unquote(request.url.path.rsplit("/", 1)[-1])
        if "/clients/get/" in request.url.path:
            return httpx.Response(
                200,
                json={"success": True, "obj": {"client": clients[email]}},
            )
        return httpx.Response(200, json={"success": True, "obj": provider_links(email)})

    result = await XuiClient(
        vpn_settings(), transport=httpx.MockTransport(handler)
    ).fetch_access("web-Миша")

    assert [profile.email for profile in result.profiles] == [
        "web-Миша-mobile",
        "WEB-Миша-PC",
    ]
    assert [profile.label for profile in result.profiles] == ["Миша-mobile", "Миша-PC"]
    assert [profile.subscription_url for profile in result.profiles] == [
        "https://subscription.example.test/gatewaysubru/sub-0",
        "https://subscription.example.test/gatewaysubru/sub-1",
    ]
    assert result.profiles[0].connections[0].model_dump() == {
        "name": "ru-fin-vless-443-web-Миша-mobile",
        "protocol": "vless",
        "transport": "xhttp",
        "security": "reality",
        "url": provider_links("web-Миша-mobile")[0],
    }
    assert result.profiles[0].connections[1].security == "tls"
    assert len(requests) == 5
    assert all(request.headers["Authorization"] == "Bearer provider-secret" for request in requests)


async def test_client_returns_empty_connection_list_with_subscription() -> None:
    email = "web-user-mobile"
    provider_client = full_provider_client(email)

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/clients/list"):
            payload = {"success": True, "obj": [provider_client]}
        elif "/clients/get/" in request.url.path:
            payload = {"success": True, "obj": {"client": provider_client}}
        else:
            payload = {"success": True, "obj": []}
        return httpx.Response(200, json=payload)

    result = await XuiClient(
        vpn_settings(), transport=httpx.MockTransport(handler)
    ).fetch_access("web-user")
    assert result.profiles[0].subscription_url.endswith("/sub-id-123")
    assert result.profiles[0].connections == []


async def test_client_maps_no_new_format_profiles_to_stable_error() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "success": True,
                "obj": [
                    full_provider_client("[web]-missing"),
                    full_provider_client("web-missing2-mobile"),
                ],
            },
        )

    try:
        await XuiClient(
            vpn_settings(), transport=httpx.MockTransport(handler)
        ).fetch_access("web-missing")
    except ApiError as error:
        assert error.status_code == 404
        assert error.code == "vpn_profile_not_found"
    else:
        raise AssertionError("Expected vpn_profile_not_found")


async def test_client_rejects_a_malformed_matching_profile_without_partial_data() -> None:
    valid_email = "web-user-mobile"
    malformed_email = "web-user-pc"
    clients = {
        valid_email: full_provider_client(valid_email),
        malformed_email: {**full_provider_client(malformed_email), "subId": ""},
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/clients/list"):
            return httpx.Response(200, json={"success": True, "obj": list(clients.values())})
        email = unquote(request.url.path.rsplit("/", 1)[-1])
        if "/clients/get/" in request.url.path:
            return httpx.Response(200, json={"success": True, "obj": {"client": clients[email]}})
        return httpx.Response(200, json={"success": True, "obj": provider_links(email)})

    try:
        await XuiClient(
            vpn_settings(), transport=httpx.MockTransport(handler)
        ).fetch_access("web-user")
    except ApiError as error:
        assert error.code == "vpn_provider_unavailable"
    else:
        raise AssertionError("Expected vpn_provider_unavailable")


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
            ).fetch_access("web-user")
        except ApiError as error:
            assert error.status_code == 502
            assert error.code == "vpn_provider_unavailable"
        else:
            raise AssertionError("Expected vpn_provider_unavailable")


async def test_client_requires_all_configuration() -> None:
    integration = XuiClient(vpn_settings(x_ui_token=None))
    try:
        await integration.fetch_access("web-user")
    except ApiError as error:
        assert error.status_code == 503
        assert error.code == "vpn_integration_unconfigured"
    else:
        raise AssertionError("Expected vpn_integration_unconfigured")


async def test_client_disables_exact_profile_with_preserved_update_payload() -> None:
    requests: list[httpx.Request] = []
    email = "web-Миша-mobile"
    provider_client = full_provider_client(email)

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(
                200,
                json={"success": True, "obj": {"client": provider_client}},
            )
        return httpx.Response(200, json={"success": True, "obj": None})

    await XuiClient(
        vpn_settings(), transport=httpx.MockTransport(handler)
    ).set_enabled(email, False)

    assert [request.method for request in requests] == ["GET", "POST"]
    payload = json.loads(requests[1].content)
    assert payload == {
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
        "enable": False,
    }


async def test_client_updates_every_matching_profile_and_ignores_no_matches() -> None:
    emails = ["web-user-mobile", "web-user-pc", "web-user2-mobile"]
    clients = {email: full_provider_client(email) for email in emails}
    updated: set[str] = set()

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/clients/list"):
            return httpx.Response(200, json={"success": True, "obj": list(clients.values())})
        email = unquote(request.url.path.rsplit("/", 1)[-1])
        if request.method == "GET":
            return httpx.Response(200, json={"success": True, "obj": {"client": clients[email]}})
        updated.add(email)
        return httpx.Response(200, json={"success": True, "obj": None})

    integration = XuiClient(vpn_settings(), transport=httpx.MockTransport(handler))
    await integration.set_matching_enabled("web-user", False)
    assert updated == {"web-user-mobile", "web-user-pc"}

    updated.clear()
    await integration.set_matching_enabled("web-nobody", False)
    assert updated == set()


async def test_client_attempts_all_matching_updates_before_reporting_failure() -> None:
    emails = ["web-user-mobile", "web-user-pc"]
    clients = {email: full_provider_client(email) for email in emails}
    updated: set[str] = set()

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/clients/list"):
            return httpx.Response(200, json={"success": True, "obj": list(clients.values())})
        email = unquote(request.url.path.rsplit("/", 1)[-1])
        if request.method == "GET":
            return httpx.Response(200, json={"success": True, "obj": {"client": clients[email]}})
        updated.add(email)
        if email.endswith("mobile"):
            return httpx.Response(502, json={"success": False, "msg": "failed"})
        return httpx.Response(200, json={"success": True, "obj": None})

    try:
        await XuiClient(
            vpn_settings(), transport=httpx.MockTransport(handler)
        ).set_matching_enabled("web-user", False)
    except ApiError as error:
        assert error.code == "vpn_provider_unavailable"
    else:
        raise AssertionError("Expected vpn_provider_unavailable")
    assert updated == set(emails)


async def test_client_lists_profile_states() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "success": True,
                "obj": {
                    "clients": [
                        {"email": "web-one-mobile", "enable": True},
                        {"email": "web-two-pc", "enable": False},
                    ]
                },
            },
        )

    states = await XuiClient(
        vpn_settings(), transport=httpx.MockTransport(handler)
    ).list_client_states()
    assert states == {"web-one-mobile": True, "web-two-pc": False}


async def test_client_lists_only_online_web_profiles() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "success": True,
                "obj": [
                    "web-one-mobile",
                    "telegram-user",
                    "WEB-two-pc",
                    "[web]-legacy",
                ],
            },
        )

    clients = await XuiClient(
        vpn_settings(), transport=httpx.MockTransport(handler)
    ).list_online_clients()
    assert clients == {"web-one-mobile", "WEB-two-pc"}


async def test_client_combines_web_profile_online_and_enabled_states() -> None:
    requests: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path.endswith("/clients/list"):
            obj: object = {
                "clients": [
                    {"email": "web-one-mobile", "enable": False},
                    {"email": "WEB-two-pc", "enable": True},
                    {"email": "telegram-user", "enable": True},
                    {"email": "[web]-legacy", "enable": True},
                ]
            }
        else:
            obj = ["WEB-ONE-MOBILE", "telegram-user"]
        return httpx.Response(200, json={"success": True, "obj": obj})

    states = await XuiClient(
        vpn_settings(), transport=httpx.MockTransport(handler)
    ).list_profile_states()

    assert states == {
        "web-one-mobile": VpnProfileState(online=True, enabled=False),
        "WEB-two-pc": VpnProfileState(online=False, enabled=True),
    }
    assert sorted(path.rsplit("/", 1)[-1] for path in requests) == ["list", "onlines"]


async def test_client_rejects_web_profile_without_boolean_enabled_state() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        obj: object = (
            [{"email": "web-one-mobile", "enable": "true"}]
            if request.url.path.endswith("/clients/list")
            else []
        )
        return httpx.Response(200, json={"success": True, "obj": obj})

    with pytest.raises(ApiError) as error:
        await XuiClient(
            vpn_settings(), transport=httpx.MockTransport(handler)
        ).list_profile_states()

    assert error.value.code == "vpn_provider_unavailable"


class FakeXuiClient:
    def __init__(self) -> None:
        self.prefixes: list[str] = []

    async def fetch_access(self, profile_prefix: str) -> VpnAccessRead:
        self.prefixes.append(profile_prefix)
        return VpnAccessRead(
            profiles=[
                VpnClientProfileRead(
                    email="web-admin-pc",
                    label="admin-pc",
                    subscription_url="https://subscription.example.test/test",
                    connections=[
                        VpnConnectionRead(
                            name="ru-fin-vless-443-web-admin-pc",
                            protocol="vless",
                            transport="xhttp",
                            security="reality",
                            url="vless://preview@example.test#profile",
                        )
                    ],
                )
            ]
        )

    async def set_matching_enabled(
        self, _profile_prefix: str, _enabled: bool
    ) -> None:
        return


async def test_endpoint_uses_current_user_and_disables_caching(client: AsyncClient) -> None:
    provider = FakeXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    try:
        await login(client)
        response = await client.get("/api/users/me/vpn")
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"
        assert provider.prefixes == ["web-admin"]
        assert response.json()["profiles"][0]["label"] == "admin-pc"
        assert response.json()["profiles"][0]["connections"][0]["protocol"] == "vless"
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
        assert provider.prefixes == []
    finally:
        app.dependency_overrides.pop(get_xui_client, None)
