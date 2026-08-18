from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import parse_qs

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.payments.client as client_module
from app.auth.security import hash_password
from app.config import Settings
from app.payments.client import YooMoneyClient
from app.payments.models import YooMoneyPayment, YooMoneyPaymentStatus
from app.payments.scheduler import YooMoneyReconciliationScheduler
from app.users.models import User


async def test_operation_history_sends_exact_label_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, list[str]] = {}
    real_async_client = httpx.AsyncClient

    async def handler(request: httpx.Request) -> httpx.Response:
        captured.update(parse_qs((await request.aread()).decode()))
        assert request.headers["Authorization"] == "Bearer token"
        return httpx.Response(200, json={"operations": []})

    monkeypatch.setattr(
        client_module.httpx,
        "AsyncClient",
        lambda **_kwargs: real_async_client(transport=httpx.MockTransport(handler)),
    )
    settings = Settings(yoomoney_access_token="token")

    await YooMoneyClient(settings).operation_history(
        from_datetime=datetime(2026, 8, 18, tzinfo=UTC),
        label="pay_exact_label",
    )

    assert captured["label"] == ["pay_exact_label"]
    assert captured["from"] == ["2026-08-18T00:00:00+00:00"]


class FakeHistoryClient:
    def __init__(self, label: str) -> None:
        self.label = label
        self.calls: list[str | None] = []

    async def operation_history(
        self,
        *,
        from_datetime: datetime,
        label: str | None = None,
        start_record: str | None = None,
    ):
        assert from_datetime.tzinfo is not None
        assert label is None
        self.calls.append(start_record)
        if start_record is None:
            return {
                "operations": [
                    {
                        "operation_id": "ignored-operation",
                        "status": "success",
                        "direction": "in",
                        "amount": 100,
                        "datetime": "2026-08-17T10:00:00Z",
                        "label": "another_project_123",
                    }
                ],
                "next_record": "1",
            }
        return {
            "operations": [
                {
                    "operation_id": "reconciled-operation",
                    "status": "success",
                    "direction": "in",
                    "amount": 100.01,
                    "datetime": "2026-08-17T10:00:00Z",
                    "label": self.label,
                },
                {
                    "operation_id": "outgoing-operation",
                    "status": "success",
                    "direction": "out",
                    "amount": 100,
                    "datetime": "2026-08-17T10:00:00Z",
                    "label": self.label,
                },
            ]
        }


async def test_reconciliation_paginates_and_credits_only_matching_incoming_payment(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as db:
        user = User(
            name="Сверка",
            password_hash=hash_password("user-password"),
            balance=Decimal("0.00"),
            negative_balance_limit=Decimal("100.00"),
        )
        db.add(user)
        await db.flush()
        payment = YooMoneyPayment(
            user_id=user.id,
            label="pay_1234567890abcdef1234567890abcdef",
            requested_amount=Decimal("103.10"),
            created_at=datetime.now(UTC),
        )
        db.add(payment)
        await db.commit()
        payment_id = payment.id
        user_id = user.id
        label = payment.label

    settings = Settings(
        yoomoney_enabled=True,
        yoomoney_receiver="41001123456789",
        yoomoney_notification_secret="secret",
        yoomoney_access_token="token",
        yoomoney_reconciliation_enabled=True,
        public_app_url="https://vpn.example.test",
    )
    scheduler = YooMoneyReconciliationScheduler(session_factory, settings)
    fake_client = FakeHistoryClient(label)
    scheduler._client = fake_client

    await scheduler._reconcile()

    assert fake_client.calls == [None, "1"]
    async with session_factory() as db:
        stored_payment = await db.get(YooMoneyPayment, payment_id)
        stored_user = await db.get(User, user_id)
        assert stored_payment is not None
        assert stored_payment.status == YooMoneyPaymentStatus.SUCCEEDED.value
        assert stored_payment.operation_id == "reconciled-operation"
        assert stored_payment.requested_amount == Decimal("103.10")
        assert stored_payment.received_amount == Decimal("100.01")
        assert stored_payment.withdrawn_amount is None
        assert stored_payment.payment_type is None
        assert stored_user is not None and stored_user.balance == Decimal("100.01")
