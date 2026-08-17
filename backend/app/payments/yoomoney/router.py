from uuid import UUID

from fastapi import APIRouter, Request, Response

from app.auth.dependencies import CurrentUser, Database
from app.billing.scheduler import request_vpn_sync_processing
from app.config import get_settings
from app.errors import ApiError

from .schemas import YooMoneyPaymentCreate, YooMoneyPaymentRead
from .service import (
    create_payment,
    get_user_payment,
    parse_notification_body,
    payment_read,
    process_notification,
    verify_notification_signature,
)

router = APIRouter(tags=["payments"])


@router.post("/api/users/me/top-up-payments", response_model=YooMoneyPaymentRead)
async def create_yoomoney_payment(
    payload: YooMoneyPaymentCreate,
    user: CurrentUser,
    db: Database,
) -> YooMoneyPaymentRead:
    return await create_payment(db, user, payload, get_settings())


@router.get("/api/users/me/top-up-payments/{payment_id}", response_model=YooMoneyPaymentRead)
async def read_yoomoney_payment(
    payment_id: UUID,
    user: CurrentUser,
    db: Database,
) -> YooMoneyPaymentRead:
    return payment_read(await get_user_payment(db, payment_id, user.id))


@router.post("/api/payments/yoomoney/webhook", include_in_schema=False)
async def yoomoney_webhook(request: Request, db: Database) -> Response:
    settings = get_settings()
    if not settings.yoomoney_enabled or settings.yoomoney_notification_secret is None:
        raise ApiError(
            status_code=503,
            code="payments_unavailable",
            message="Приём платежей временно недоступен",
        )
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/x-www-form-urlencoded":
        raise ApiError(
            status_code=415,
            code="invalid_notification_type",
            message="Ожидается form-urlencoded уведомление",
        )
    body = await request.body()
    if not body:
        return Response(status_code=200)
    params = parse_notification_body(body)
    secret = settings.yoomoney_notification_secret.get_secret_value()
    if not verify_notification_signature(params, secret):
        raise ApiError(
            status_code=400,
            code="invalid_notification_signature",
            message="Некорректная подпись уведомления",
        )
    if await process_notification(db, params):
        request_vpn_sync_processing()
    return Response(status_code=200)
