import importlib
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.models import AuthSession
from app.auth.security import hash_password
from app.billing.models import (
    StatusChangeSource,
    UserDailyCharge,
    UserStatusHistory,
    VpnSyncJob,
)
from app.errors import ApiError
from app.main import app
from app.payments.models import YooMoneyPayment, YooMoneyPaymentStatus
from app.tariff_plans.models import TariffPlan
from app.users.models import AccountStatus, User
from app.vpn_access.dependencies import get_xui_client


class FakeStatusXuiClient:
    def __init__(self, online_clients: set[str] | None = None) -> None:
        self.updates: list[tuple[str, bool]] = []
        self.online_clients = online_clients or set()

    async def set_matching_enabled(self, email: str, enabled: bool) -> None:
        self.updates.append((email, enabled))

    async def list_online_clients(self) -> set[str]:
        return self.online_clients


class FailingStatusXuiClient:
    async def set_matching_enabled(self, _email: str, _enabled: bool) -> None:
        raise ApiError(
            status_code=502,
            code="vpn_provider_unavailable",
            message="VPN-панель временно недоступна",
        )

    async def list_online_clients(self) -> set[str]:
        raise ApiError(
            status_code=502,
            code="vpn_provider_unavailable",
            message="VPN-панель временно недоступна",
        )


async def login(client: AsyncClient, name: str = "admin", password: str = "admin-password"):
    return await client.post("/api/auth/login", json={"name": name, "password": password})


async def test_login_me_logout_and_exact_money(client: AsyncClient) -> None:
    response = await login(client, name="ADMIN")
    assert response.status_code == 200
    assert response.json()["balance"] == "100.10"
    assert response.json()["negative_balance_limit"] == "500.00"
    assert response.json()["account_status"] == "active"
    assert "is_active" not in response.json()
    assert "is_blocked" not in response.json()
    assert (await client.get("/api/auth/me")).json()["name"] == "admin"
    assert (await client.post("/api/auth/logout")).status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_invalid_login_uses_stable_error(client: AsyncClient) -> None:
    response = await login(client, password="wrong-password")
    assert response.status_code == 401
    assert response.json() == {"code": "invalid_credentials", "message": "Неверное имя или пароль"}


async def test_admin_creates_and_updates_user(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    provider = FakeStatusXuiClient({"web-Лена-mobile"})
    app.dependency_overrides[get_xui_client] = lambda: provider
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={
            "name": "Лена",
            "password": "strong-password",
            "balance": "-25.40",
            "negative_balance_limit": "300.00",
            "role": "user",
            "account_status": "active",
        },
    )
    assert created.status_code == 201
    user_id = UUID(created.json()["id"])
    assert created.json()["balance"] == "-25.40"

    updated = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"account_status": "blocked", "balance": "12.34"},
    )
    assert updated.status_code == 200
    assert updated.json()["account_status"] == "blocked"
    assert updated.json()["balance"] == "12.34"
    assert provider.updates == [("web-Лена", False)]

    async with session_factory() as db:
        plan = TariffPlan(
            name="TP_01.08.2026",
            monthly_amount=Decimal("3100.00"),
            start_date=date(2026, 8, 1),
        )
        db.add(plan)
        await db.flush()
        db.add_all(
            [
                UserDailyCharge(
                    user_id=user_id,
                    amount=Decimal("10.25"),
                    tariff_plan_id=plan.id,
                    created_at=datetime(2026, 8, 1, tzinfo=UTC),
                ),
                UserDailyCharge(
                    user_id=user_id,
                    amount=Decimal("20.50"),
                    tariff_plan_id=plan.id,
                    created_at=datetime(2026, 8, 2, tzinfo=UTC),
                ),
                YooMoneyPayment(
                    user_id=user_id,
                    label="pay_history_older",
                    requested_amount=Decimal("5.00"),
                    received_amount=Decimal("4.75"),
                    operation_id="history-operation-older",
                    status=YooMoneyPaymentStatus.SUCCEEDED.value,
                    balance_before=Decimal("2.34"),
                    balance_after=Decimal("7.09"),
                    created_at=datetime(2026, 8, 3, tzinfo=UTC),
                    paid_at=datetime(2026, 8, 3, 12, tzinfo=UTC),
                ),
                YooMoneyPayment(
                    user_id=user_id,
                    label="pay_history_newer",
                    requested_amount=Decimal("5.50"),
                    received_amount=Decimal("5.25"),
                    operation_id="history-operation-newer",
                    status=YooMoneyPaymentStatus.SUCCEEDED.value,
                    balance_before=Decimal("7.09"),
                    balance_after=Decimal("12.34"),
                    created_at=datetime(2026, 8, 4, tzinfo=UTC),
                    paid_at=datetime(2026, 8, 4, 12, tzinfo=UTC),
                ),
                YooMoneyPayment(
                    user_id=user_id,
                    label="pay_history_pending",
                    requested_amount=Decimal("100.00"),
                    status=YooMoneyPaymentStatus.PENDING.value,
                    created_at=datetime(2026, 8, 5, tzinfo=UTC),
                ),
            ]
        )
        await db.commit()

    users = (await client.get("/api/admin/users")).json()
    assert [user["name"] for user in users] == ["admin", "Лена"]
    assert {user["name"]: user["total_charged"] for user in users} == {
        "admin": "0.00",
        "Лена": "30.75",
    }
    assert {user["name"]: user["total_top_ups"] for user in users} == {
        "admin": "0.00",
        "Лена": "10.00",
    }
    assert {user["name"]: user["vpnStatus"] for user in users} == {
        "admin": "offline",
        "Лена": "online",
    }
    history = (await client.get(f"/api/admin/users/{user_id}/charges")).json()
    assert [entry["created_at"][:10] for entry in history] == ["2026-08-02", "2026-08-01"]
    assert [entry["amount"] for entry in history] == ["20.50", "10.25"]
    assert [entry["tariff_plan_name"] for entry in history] == [
        "TP_01.08.2026",
        "TP_01.08.2026",
    ]
    top_ups = (await client.get(f"/api/admin/users/{user_id}/top-ups")).json()
    assert [entry["amount"] for entry in top_ups] == ["5.25", "4.75"]
    assert [entry["created_at"][:10] for entry in top_ups] == ["2026-08-04", "2026-08-03"]

    await client.post("/api/auth/logout")
    await login(client, "Лена", "strong-password")
    own_charges = (await client.get("/api/users/me/charges")).json()
    own_top_ups = (await client.get("/api/users/me/top-ups")).json()
    assert [entry["id"] for entry in own_charges] == [entry["id"] for entry in history]
    assert [entry["id"] for entry in own_top_ups] == [entry["id"] for entry in top_ups]
    assert (await client.get(f"/api/admin/users/{user_id}/top-ups")).status_code == 403


async def test_admin_reads_user_status_history_with_actor(
    client: AsyncClient,
) -> None:
    provider = FakeStatusXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={"name": "История статуса", "password": "user-password"},
    )
    user_id = created.json()["id"]
    updated = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"account_status": "paused"},
    )
    assert updated.status_code == 200

    response = await client.get(f"/api/admin/users/{user_id}/status-history")

    assert response.status_code == 200
    history = response.json()
    assert [item["new_status"] for item in history] == ["paused", "active"]
    assert [item["previous_status"] for item in history] == ["active", None]
    assert [item["source"] for item in history] == ["admin", "admin"]
    assert [item["changed_by_name"] for item in history] == ["admin", "admin"]

    await client.post("/api/auth/logout")
    await login(client, "История статуса", "user-password")
    forbidden = await client.get(f"/api/admin/users/{user_id}/status-history")
    assert forbidden.status_code == 403


async def test_names_are_unique_case_insensitively(client: AsyncClient) -> None:
    await login(client)
    response = await client.post(
        "/api/admin/users",
        json={"name": "ADMIN", "password": "another-password"},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "name_taken"


async def test_regular_user_cannot_change_account_status(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as db:
        user = User(name="Илья", password_hash=hash_password("user-password"))
        db.add(user)
        await db.commit()
        await db.refresh(user)
        user_id = user.id

    login_response = await login(client, "Илья", "user-password")
    assert login_response.status_code == 200, login_response.text
    update = await client.patch("/api/users/me/activity", json={"account_status": "paused"})
    assert update.status_code == 404
    assert (await client.get("/api/admin/users")).status_code == 403

    async with session_factory() as db:
        unchanged_user = await db.get(User, user_id)
        assert unchanged_user is not None
        assert unchanged_user.account_status == AccountStatus.ACTIVE.value


async def test_daily_charge_uses_current_plan_and_active_users(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    admin: User,
    monkeypatch,
) -> None:
    provider = FakeStatusXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    monkeypatch.setattr("app.tariff_plans.service.moscow_today", lambda: date(2026, 8, 16))
    async with session_factory() as db:
        db.add(
            TariffPlan(
                name="TP_01.08.2026",
                monthly_amount=Decimal("3100.00"),
                start_date=date(2026, 8, 1),
            )
        )
        db.add(User(name="Участник", password_hash=hash_password("user-password")))
        await db.commit()

    await login(client)
    response = await client.get("/api/users/me/daily-charge")
    assert response.status_code == 200
    assert response.json() == {"daily_charge": "50.00"}

    await client.patch(
        f"/api/admin/users/{admin.id}",
        json={"account_status": "paused"},
    )
    assert provider.updates == []
    paused_response = await client.get("/api/users/me/daily-charge")
    assert paused_response.json() == {"daily_charge": "0.00"}


async def test_last_admin_cannot_be_demoted(client: AsyncClient, admin: User) -> None:
    await login(client)
    response = await client.patch(f"/api/admin/users/{admin.id}", json={"role": "user"})
    assert response.status_code == 409
    assert response.json()["code"] == "last_admin"


async def test_provider_failure_rejects_manual_status_change(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={"name": "Без связи", "password": "user-password"},
    )
    user_id = UUID(created.json()["id"])
    app.dependency_overrides[get_xui_client] = lambda: FailingStatusXuiClient()

    response = await client.patch(
        f"/api/admin/users/{user_id}", json={"account_status": "blocked"}
    )

    assert response.status_code == 502
    assert response.json()["code"] == "vpn_provider_unavailable"
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        assert user.account_status == AccountStatus.ACTIVE.value
        statuses = (
            await db.scalars(
                select(UserStatusHistory).where(UserStatusHistory.user_id == user_id)
            )
        ).all()
        assert [item.new_status for item in statuses] == [AccountStatus.ACTIVE.value]


async def test_pausing_account_does_not_require_vpn_provider(client: AsyncClient) -> None:
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={"name": "Отложенная пауза", "password": "user-password"},
    )
    user_id = UUID(created.json()["id"])
    app.dependency_overrides[get_xui_client] = lambda: FailingStatusXuiClient()

    response = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"account_status": "paused"},
    )

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.PAUSED.value


async def test_reactivating_paused_account_enables_vpn_immediately(client: AsyncClient) -> None:
    provider = FakeStatusXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={
            "name": "Возобновление",
            "password": "user-password",
            "account_status": "paused",
        },
    )
    user_id = UUID(created.json()["id"])

    response = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"account_status": "active"},
    )

    assert response.status_code == 200
    assert provider.updates == [("web-Возобновление", True)]


@pytest.mark.parametrize(
    ("initial_status", "initial_balance", "initial_limit", "changes"),
    [
        (AccountStatus.ACTIVE, "0.00", "300.00", {"balance": "-300.01"}),
        (
            AccountStatus.PAUSED,
            "-200.00",
            "300.00",
            {"negative_balance_limit": "199.99"},
        ),
    ],
)
async def test_financial_admin_edit_blocks_active_and_paused_accounts(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    initial_status: AccountStatus,
    initial_balance: str,
    initial_limit: str,
    changes: dict[str, str],
) -> None:
    provider = FakeStatusXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    sync_requests = 0

    def request_sync() -> None:
        nonlocal sync_requests
        sync_requests += 1

    router_module = importlib.import_module("app.admin.router")
    monkeypatch.setattr(router_module, "request_vpn_sync_processing", request_sync)
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={
            "name": f"Финансовая блокировка {initial_status.value}",
            "password": "user-password",
            "balance": initial_balance,
            "negative_balance_limit": initial_limit,
            "account_status": initial_status.value,
        },
    )
    user_id = UUID(created.json()["id"])

    response = await client.patch(f"/api/admin/users/{user_id}", json=changes)

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.BLOCKED.value
    assert response.json()["block_source"] == StatusChangeSource.BILLING.value
    assert provider.updates == []
    assert sync_requests == 1
    async with session_factory() as db:
        billing_status = await db.scalar(
            select(UserStatusHistory).where(
                UserStatusHistory.user_id == user_id,
                UserStatusHistory.source == StatusChangeSource.BILLING.value,
            )
        )
        assert billing_status is not None
        assert billing_status.previous_status == initial_status.value
        assert billing_status.new_status == AccountStatus.BLOCKED.value
        assert billing_status.changed_by_user_id is None
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
        assert job is not None and job.desired_enabled is False
    await client.post("/api/auth/logout")
    login_response = await login(
        client,
        f"Финансовая блокировка {initial_status.value}",
        "user-password",
    )
    assert login_response.json()["block_source"] == StatusChangeSource.BILLING.value
    assert (await client.get("/api/auth/me")).json()["block_source"] == (
        StatusChangeSource.BILLING.value
    )


async def test_financial_admin_edit_allows_exact_negative_limit(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={
            "name": "Граница лимита",
            "password": "user-password",
            "negative_balance_limit": "300.00",
        },
    )
    user_id = UUID(created.json()["id"])

    response = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"balance": "-300.00"},
    )

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.ACTIVE.value
    async with session_factory() as db:
        assert await db.scalar(
            select(VpnSyncJob).where(VpnSyncJob.user_id == user_id)
        ) is None


@pytest.mark.parametrize("restored_status", [AccountStatus.ACTIVE, AccountStatus.PAUSED])
async def test_financial_admin_edit_restores_status_before_billing_block(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
    restored_status: AccountStatus,
) -> None:
    provider = FakeStatusXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    sync_requests = 0

    def request_sync() -> None:
        nonlocal sync_requests
        sync_requests += 1

    router_module = importlib.import_module("app.admin.router")
    monkeypatch.setattr(router_module, "request_vpn_sync_processing", request_sync)
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={
            "name": f"Восстановление {restored_status.value}",
            "password": "user-password",
            "balance": "-400.00",
            "negative_balance_limit": "300.00",
            "account_status": restored_status.value,
        },
    )
    user_id = UUID(created.json()["id"])
    async with session_factory() as db:
        user = await db.get(User, user_id)
        assert user is not None
        user.account_status = AccountStatus.BLOCKED.value
        db.add(
            UserStatusHistory(
                user_id=user_id,
                previous_status=restored_status.value,
                new_status=AccountStatus.BLOCKED.value,
                changed_by_user_id=None,
                source=StatusChangeSource.BILLING.value,
                effective_at=datetime.now(UTC),
            )
        )
        await db.commit()

    response = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"balance": "-300.00"},
    )

    assert response.status_code == 200
    assert response.json()["account_status"] == restored_status.value
    assert response.json()["block_source"] is None
    assert provider.updates == []
    assert sync_requests == 1
    async with session_factory() as db:
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
        assert job is not None
        assert job.desired_enabled is (restored_status == AccountStatus.ACTIVE)
        history = (
            await db.scalars(
                select(UserStatusHistory)
                .where(UserStatusHistory.user_id == user_id)
                .order_by(UserStatusHistory.created_at)
            )
        ).all()
        assert history[-1].previous_status == AccountStatus.BLOCKED.value
        assert history[-1].new_status == restored_status.value
        assert history[-1].source == StatusChangeSource.ADMIN.value


async def test_financial_admin_edit_does_not_restore_manual_block(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={
            "name": "Ручная блокировка с балансом",
            "password": "user-password",
            "balance": "-400.00",
            "negative_balance_limit": "300.00",
            "account_status": AccountStatus.BLOCKED.value,
        },
    )
    user_id = UUID(created.json()["id"])
    assert created.json()["block_source"] == StatusChangeSource.ADMIN.value

    response = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"balance": "0.00"},
    )

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.BLOCKED.value
    assert response.json()["block_source"] == StatusChangeSource.ADMIN.value
    async with session_factory() as db:
        history_count = await db.scalar(
            select(func.count())
            .select_from(UserStatusHistory)
            .where(UserStatusHistory.user_id == user_id)
        )
        assert history_count == 1


@pytest.mark.parametrize("selected_status", [AccountStatus.ACTIVE, AccountStatus.PAUSED])
async def test_manual_status_overrides_financial_check_for_previously_blocked_account(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    selected_status: AccountStatus,
) -> None:
    provider = FakeStatusXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={
            "name": f"Ручной приоритет {selected_status.value}",
            "password": "user-password",
            "balance": "-500.00",
            "negative_balance_limit": "300.00",
            "account_status": AccountStatus.BLOCKED.value,
        },
    )
    user_id = UUID(created.json()["id"])

    response = await client.patch(
        f"/api/admin/users/{user_id}",
        json={
            "account_status": selected_status.value,
            "balance": "-400.00",
        },
    )

    assert response.status_code == 200
    assert response.json()["account_status"] == selected_status.value
    assert provider.updates == (
        [(f"web-Ручной приоритет {selected_status.value}", True)]
        if selected_status == AccountStatus.ACTIVE
        else []
    )
    async with session_factory() as db:
        billing_status_count = await db.scalar(
            select(func.count())
            .select_from(UserStatusHistory)
            .where(
                UserStatusHistory.user_id == user_id,
                UserStatusHistory.source == StatusChangeSource.BILLING.value,
            )
        )
        assert billing_status_count == 0


async def test_financial_block_avoids_transient_vpn_enable(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = FakeStatusXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    sync_requests = 0

    def request_sync() -> None:
        nonlocal sync_requests
        sync_requests += 1

    router_module = importlib.import_module("app.admin.router")
    monkeypatch.setattr(router_module, "request_vpn_sync_processing", request_sync)
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={
            "name": "Без промежуточного включения",
            "password": "user-password",
            "balance": "-200.00",
            "negative_balance_limit": "300.00",
            "account_status": AccountStatus.PAUSED.value,
        },
    )
    user_id = UUID(created.json()["id"])

    response = await client.patch(
        f"/api/admin/users/{user_id}",
        json={
            "account_status": AccountStatus.ACTIVE.value,
            "negative_balance_limit": "100.00",
        },
    )

    assert response.status_code == 200
    assert response.json()["account_status"] == AccountStatus.BLOCKED.value
    assert provider.updates == []
    assert sync_requests == 1
    async with session_factory() as db:
        job = await db.scalar(select(VpnSyncJob).where(VpnSyncJob.user_id == user_id))
        assert job is not None and job.desired_enabled is False


async def test_provider_failure_marks_vpn_status_unknown(client: AsyncClient) -> None:
    await login(client)
    app.dependency_overrides[get_xui_client] = lambda: FailingStatusXuiClient()

    response = await client.get("/api/admin/users")

    assert response.status_code == 200
    assert {item["vpnStatus"] for item in response.json()} == {"unknown"}


async def test_admin_deletes_user_and_revokes_sessions(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    provider = FakeStatusXuiClient()
    app.dependency_overrides[get_xui_client] = lambda: provider
    await login(client)
    created = await client.post(
        "/api/admin/users",
        json={"name": "Удаляемый", "password": "user-password"},
    )
    user_id = UUID(created.json()["id"])

    user_client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    try:
        assert (await login(user_client, "Удаляемый", "user-password")).status_code == 200
        response = await client.delete(f"/api/admin/users/{user_id}")
        assert response.status_code == 204
        assert (await user_client.get("/api/auth/me")).status_code == 401

        async with session_factory() as db:
            deleted_user = await db.get(User, user_id)
            assert deleted_user is not None
            assert deleted_user.deleted_at is not None
            assert deleted_user.account_status == AccountStatus.BLOCKED.value
            session_count = await db.scalar(
                select(func.count()).select_from(AuthSession).where(AuthSession.user_id == user_id)
            )
            assert session_count == 0
            history = (
                await db.scalars(
                    select(UserStatusHistory)
                    .where(UserStatusHistory.user_id == user_id)
                    .order_by(UserStatusHistory.created_at)
                )
            ).all()
            assert [item.new_status for item in history] == ["active", "blocked"]
        assert provider.updates == [("web-Удаляемый", False)]
        assert (await login(user_client, "Удаляемый", "user-password")).status_code == 401
        assert all(
            item["id"] != str(user_id)
            for item in (await client.get("/api/admin/users")).json()
        )
    finally:
        await user_client.aclose()


async def test_admin_cannot_delete_self(client: AsyncClient, admin: User) -> None:
    await login(client)
    response = await client.delete(f"/api/admin/users/{admin.id}")
    assert response.status_code == 409
    assert response.json() == {
        "code": "cannot_delete_self",
        "message": "Нельзя удалить собственный аккаунт",
    }


async def test_password_change_revokes_other_sessions(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    first = await login(client)
    assert first.status_code == 200
    other = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    try:
        assert (await login(other)).status_code == 200
        response = await client.post(
            "/api/users/me/password",
            json={"current_password": "admin-password", "new_password": "new-admin-password"},
        )
        assert response.status_code == 200
        assert (await other.get("/api/auth/me")).status_code == 401
        assert (await client.get("/api/auth/me")).status_code == 200
        async with session_factory() as db:
            count = await db.scalar(select(func.count()).select_from(AuthSession))
            assert count == 1
    finally:
        await other.aclose()
