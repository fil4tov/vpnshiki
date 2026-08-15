from datetime import date

from httpx import AsyncClient

from app.auth.security import hash_password
from app.users.models import User


async def login(client: AsyncClient, name: str = "admin", password: str = "admin-password"):
    return await client.post("/api/auth/login", json={"name": name, "password": password})


def freeze_moscow_day(monkeypatch, value: date) -> None:
    monkeypatch.setattr("app.tariff_plans.service.moscow_today", lambda: value)


async def create_plan(client: AsyncClient, amount: str, start_date: str):
    return await client.post(
        "/api/admin/tariff-plans",
        json={"monthly_amount": amount, "start_date": start_date},
    )


async def test_first_plan_may_start_in_past_and_serializes_money(client, monkeypatch) -> None:
    freeze_moscow_day(monkeypatch, date(2026, 8, 15))
    await login(client)

    response = await create_plan(client, "1234.50", "2026-08-01")

    assert response.status_code == 201
    payload = response.json()
    assert {key: payload[key] for key in (
        "name", "monthly_amount", "start_date", "end_date", "status", "is_editable"
    )} == {
        "name": "TP_01.08.2026",
        "monthly_amount": "1234.50",
        "start_date": "2026-08-01",
        "end_date": None,
        "status": "active",
        "is_editable": False,
    }


async def test_inserting_future_plan_rebuilds_inclusive_periods(client, monkeypatch) -> None:
    freeze_moscow_day(monkeypatch, date(2026, 8, 15))
    await login(client)
    await create_plan(client, "1000.00", "2026-08-01")
    await create_plan(client, "1300.00", "2026-09-01")
    inserted = await create_plan(client, "1200.00", "2026-08-20")

    assert inserted.status_code == 201
    plans = (await client.get("/api/admin/tariff-plans")).json()
    assert [(plan["start_date"], plan["end_date"]) for plan in plans] == [
        ("2026-08-01", "2026-08-19"),
        ("2026-08-20", "2026-08-31"),
        ("2026-09-01", None),
    ]


async def test_future_plan_can_be_edited_and_deleted(client, monkeypatch) -> None:
    freeze_moscow_day(monkeypatch, date(2026, 8, 15))
    await login(client)
    await create_plan(client, "1000.00", "2026-08-01")
    future = (await create_plan(client, "1200.00", "2026-09-01")).json()
    later = (await create_plan(client, "1400.00", "2026-10-01")).json()

    updated = await client.patch(
        f"/api/admin/tariff-plans/{future['id']}",
        json={"monthly_amount": "1250.25", "start_date": "2026-08-25"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "TP_25.08.2026"
    assert updated.json()["monthly_amount"] == "1250.25"

    assert (await client.delete(f"/api/admin/tariff-plans/{future['id']}")).status_code == 204
    plans = (await client.get("/api/admin/tariff-plans")).json()
    assert [(plan["start_date"], plan["end_date"]) for plan in plans] == [
        ("2026-08-01", "2026-09-30"),
        ("2026-10-01", None),
    ]

    assert (await client.delete(f"/api/admin/tariff-plans/{later['id']}")).status_code == 204
    assert (await client.get("/api/admin/tariff-plans")).json()[0]["end_date"] is None


async def test_started_plan_is_immutable_and_new_dates_must_be_future(client, monkeypatch) -> None:
    freeze_moscow_day(monkeypatch, date(2026, 8, 15))
    await login(client)
    current = (await create_plan(client, "1000.00", "2026-08-01")).json()

    update = await client.patch(
        f"/api/admin/tariff-plans/{current['id']}", json={"monthly_amount": "999.00"}
    )
    assert update.status_code == 409
    assert update.json()["code"] == "tariff_plan_started"
    assert (await client.delete(f"/api/admin/tariff-plans/{current['id']}")).status_code == 409

    not_future = await create_plan(client, "1100.00", "2026-08-15")
    assert not_future.status_code == 409
    assert not_future.json()["code"] == "tariff_plan_date_conflict"
    assert not_future.json()["field_errors"]["start_date"]


async def test_duplicate_start_and_server_owned_fields_are_rejected(client, monkeypatch) -> None:
    freeze_moscow_day(monkeypatch, date(2026, 8, 15))
    await login(client)
    await create_plan(client, "1000.00", "2026-09-01")

    duplicate = await create_plan(client, "1100.00", "2026-09-01")
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "tariff_plan_date_conflict"

    owned = await client.post(
        "/api/admin/tariff-plans",
        json={
            "name": "custom",
            "monthly_amount": "1200.00",
            "start_date": "2026-10-01",
            "end_date": "2026-10-31",
        },
    )
    assert owned.status_code == 422


async def test_end_date_is_inclusive_for_status(client, monkeypatch) -> None:
    freeze_moscow_day(monkeypatch, date(2026, 8, 15))
    await login(client)
    await create_plan(client, "1000.00", "2026-08-01")
    await create_plan(client, "1200.00", "2026-08-16")

    plans = (await client.get("/api/admin/tariff-plans")).json()
    assert [plan["status"] for plan in plans] == ["active", "scheduled"]

    freeze_moscow_day(monkeypatch, date(2026, 8, 16))
    plans = (await client.get("/api/admin/tariff-plans")).json()
    assert [plan["status"] for plan in plans] == ["completed", "active"]


async def test_tariff_plans_require_admin(client, session_factory, monkeypatch) -> None:
    freeze_moscow_day(monkeypatch, date(2026, 8, 15))
    async with session_factory() as db:
        db.add(User(name="Илья", password_hash=hash_password("user-password")))
        await db.commit()

    await login(client, "Илья", "user-password")
    assert (await client.get("/api/admin/tariff-plans")).status_code == 403
    assert (await create_plan(client, "1000.00", "2026-09-01")).status_code == 403
