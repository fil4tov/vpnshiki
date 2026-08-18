import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.billing.scheduler import request_vpn_sync_processing
from app.config import Settings

from .client import YooMoneyClient
from .models import YooMoneyPayment, YooMoneyPaymentStatus
from .service import parse_history_operation, reconcile_operation

logger = logging.getLogger(__name__)
RECONCILIATION_INTERVAL_SECONDS = 300
RECONCILIATION_WINDOW = timedelta(days=7)
MAX_HISTORY_PAGES = 100


class YooMoneyReconciliationScheduler:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings,
    ) -> None:
        self._session_factory = session_factory
        self._enabled = settings.yoomoney_enabled and settings.yoomoney_reconciliation_enabled
        self._client = YooMoneyClient(settings) if self._enabled else None
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._enabled:
            self._task = asyncio.create_task(self._loop(), name="yoomoney-reconciliation")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await self._task

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self._reconcile()
            except Exception:
                logger.exception("Не удалось сверить платежи YooMoney")
            try:
                await asyncio.wait_for(
                    self._stop.wait(), timeout=RECONCILIATION_INTERVAL_SECONDS
                )
            except TimeoutError:
                pass

    async def _reconcile(self) -> None:
        cutoff = datetime.now(UTC) - RECONCILIATION_WINDOW
        async with self._session_factory() as db:
            earliest = await db.scalar(
                select(func.min(YooMoneyPayment.created_at)).where(
                    YooMoneyPayment.status == YooMoneyPaymentStatus.PENDING.value,
                    YooMoneyPayment.created_at >= cutoff,
                )
            )
        if earliest is None or self._client is None:
            return
        if earliest.tzinfo is None:
            earliest = earliest.replace(tzinfo=UTC)
        start_record: str | None = None
        for _ in range(MAX_HISTORY_PAGES):
            payload = await self._client.operation_history(
                from_datetime=earliest,
                start_record=start_record,
            )
            operations = payload.get("operations", [])
            if not isinstance(operations, list):
                raise TypeError("YooMoney вернул некорректный список операций")
            for operation in operations:
                await self._reconcile_operation(operation)
            next_record = payload.get("next_record")
            if not isinstance(next_record, str) or not next_record:
                return
            start_record = next_record
        logger.warning("Сверка YooMoney остановлена после %s страниц", MAX_HISTORY_PAGES)

    async def _reconcile_operation(self, operation: object) -> None:
        if not isinstance(operation, dict):
            return
        parsed = parse_history_operation(operation)
        if parsed is None:
            return
        label, operation_id, received_amount, paid_at = parsed
        async with self._session_factory() as db:
            if await reconcile_operation(
                db,
                label=label,
                operation_id=operation_id,
                received_amount=received_amount,
                paid_at=paid_at,
            ):
                request_vpn_sync_processing()
