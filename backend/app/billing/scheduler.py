import asyncio
import logging
from datetime import datetime, time, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.vpn_access.service import XuiClient

from .service import MOSCOW, catch_up_billing, process_vpn_sync_jobs, sync_paused_profiles

logger = logging.getLogger(__name__)
VPN_SYNC_POLL_INTERVAL_SECONDS = 60
_vpn_sync_requested = asyncio.Event()


def request_vpn_sync_processing() -> None:
    _vpn_sync_requested.set()


class BillingScheduler:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings,
    ) -> None:
        self._session_factory = session_factory
        self._provider = XuiClient(settings)
        self._stop = asyncio.Event()
        self._tasks: list[asyncio.Task[None]] = []

    def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._billing_loop(), name="daily-billing"),
            asyncio.create_task(self._vpn_sync_loop(), name="vpn-sync"),
        ]

    async def stop(self) -> None:
        self._stop.set()
        _vpn_sync_requested.set()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _wait(self, seconds: float) -> bool:
        try:
            await asyncio.wait_for(self._stop.wait(), timeout=max(seconds, 0.0))
        except TimeoutError:
            return False
        return True

    async def _billing_loop(self) -> None:
        while not self._stop.is_set():
            try:
                async with self._session_factory() as db:
                    await catch_up_billing(db)
                    queued_syncs = await sync_paused_profiles(db, self._provider)
                    if queued_syncs:
                        request_vpn_sync_processing()
            except Exception:
                logger.exception("Daily billing cycle failed")
                if await self._wait(60):
                    return
                continue

            now = datetime.now(MOSCOW)
            next_midnight = datetime.combine(now.date() + timedelta(days=1), time.min, MOSCOW)
            if await self._wait((next_midnight - now).total_seconds()):
                return

    async def _wait_for_vpn_sync(self) -> bool:
        try:
            await asyncio.wait_for(
                _vpn_sync_requested.wait(),
                timeout=VPN_SYNC_POLL_INTERVAL_SECONDS,
            )
        except TimeoutError:
            pass
        finally:
            _vpn_sync_requested.clear()
        return self._stop.is_set()

    async def _vpn_sync_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await process_vpn_sync_jobs(self._session_factory, self._provider)
            except Exception:
                logger.exception("VPN synchronization cycle failed")
            if await self._wait_for_vpn_sync():
                return
