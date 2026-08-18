from uuid import UUID

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.auth.dependencies import CurrentAdmin, CurrentUser, Database
from app.billing.scheduler import request_vpn_sync_processing
from app.config import get_settings
from app.errors import ApiError
from app.users.models import User

from .models import YooMoneyPayment
from .schemas import YooMoneyAdminPaymentRead, YooMoneyPaymentCreate, YooMoneyPaymentRead
from .service import (
    create_payment,
    get_user_payment,
    parse_notification_body,
    payment_read,
    process_notification,
    reconcile_user_payment,
    verify_notification_signature,
)

router = APIRouter(tags=["payments"])


@router.get(
    "/api/admin/top-up-payments",
    response_model=list[YooMoneyAdminPaymentRead],
    tags=["admin", "payments"],
)
async def list_admin_yoomoney_payments(
    _admin: CurrentAdmin,
    db: Database,
) -> list[YooMoneyAdminPaymentRead]:
    rows = (
        await db.execute(
            select(YooMoneyPayment, User.name)
            .join(User, User.id == YooMoneyPayment.user_id)
            .order_by(YooMoneyPayment.created_at.desc(), YooMoneyPayment.id.desc())
        )
    ).all()
    return [
        YooMoneyAdminPaymentRead.model_validate(
            {**payment.__dict__, "user_name": user_name}
        )
        for payment, user_name in rows
    ]


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


@router.post(
    "/api/users/me/top-up-payments/{payment_id}/reconcile",
    response_model=YooMoneyPaymentRead,
)
async def reconcile_yoomoney_payment(
    payment_id: UUID,
    user: CurrentUser,
    db: Database,
) -> YooMoneyPaymentRead:
    payment, reactivated = await reconcile_user_payment(
        db,
        payment_id=payment_id,
        user_id=user.id,
        settings=get_settings(),
    )
    if reactivated:
        request_vpn_sync_processing()
    return payment_read(payment)


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
