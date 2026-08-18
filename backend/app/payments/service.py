import hmac
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from urllib.parse import parse_qsl, quote, urlencode
from uuid import UUID, uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.models import StatusChangeSource
from app.billing.service import restore_if_billing_blocked
from app.config import Settings
from app.errors import ApiError
from app.users.models import User

from .client import YooMoneyClient
from .models import YooMoneyPayment, YooMoneyPaymentStatus, YooMoneyPaymentType
from .schemas import YooMoneyCheckout, YooMoneyPaymentCreate, YooMoneyPaymentRead

logger = logging.getLogger(__name__)

KOPECK = Decimal("0.01")
MAX_MONEY = Decimal("999999999999.99")
YOOMONEY_FORM_URL = "https://yoomoney.ru/quickpay/confirm"
LABEL_PREFIX = "pay_"
DEFAULT_PAYMENT_TYPE = YooMoneyPaymentType.CARD
NOTIFICATION_PAYMENT_TYPES = {
    "p2p-incoming": YooMoneyPaymentType.WALLET,
    "card-incoming": YooMoneyPaymentType.CARD,
}
RECONCILIATION_CHECK_INTERVAL = timedelta(seconds=10)


def parse_notification_body(body: bytes) -> dict[str, str]:
    try:
        pairs = parse_qsl(body.decode("utf-8"), keep_blank_values=True, strict_parsing=True)
    except (UnicodeDecodeError, ValueError) as error:
        raise ApiError(
            status_code=400,
            code="invalid_notification",
            message="Некорректное уведомление YooMoney",
        ) from error
    params: dict[str, str] = {}
    for key, value in pairs:
        if key in params:
            raise ApiError(
                status_code=400,
                code="invalid_notification",
                message="Параметры уведомления не должны повторяться",
            )
        params[key] = value
    return params


def notification_signature(params: dict[str, str], secret: str) -> str:
    unsigned = sorted((key, value) for key, value in params.items() if key != "sign")
    canonical = urlencode(unsigned, quote_via=quote, safe="")
    return hmac.new(secret.encode(), canonical.encode(), sha256).hexdigest()


def verify_notification_signature(params: dict[str, str], secret: str) -> bool:
    received = params.get("sign", "")
    expected = notification_signature(params, secret)
    return bool(received) and hmac.compare_digest(received, expected)


def _require_enabled(settings: Settings) -> None:
    if not settings.yoomoney_enabled:
        raise ApiError(
            status_code=503,
            code="payments_unavailable",
            message="Пополнение баланса временно недоступно",
        )


def payment_read(
    payment: YooMoneyPayment, checkout: YooMoneyCheckout | None = None
) -> YooMoneyPaymentRead:
    return YooMoneyPaymentRead(
        id=payment.id,
        status=YooMoneyPaymentStatus(payment.status),
        requested_amount=payment.requested_amount,
        received_amount=payment.received_amount,
        created_at=payment.created_at,
        paid_at=payment.paid_at,
        checkout=checkout,
    )


async def create_payment(
    db: AsyncSession,
    user: User,
    payload: YooMoneyPaymentCreate,
    settings: Settings,
) -> YooMoneyPaymentRead:
    _require_enabled(settings)
    payment = YooMoneyPayment(
        user_id=user.id,
        label=f"{LABEL_PREFIX}{uuid4().hex}",
        requested_amount=payload.amount,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    receiver = settings.yoomoney_receiver
    public_app_url = settings.public_app_url
    assert receiver is not None
    assert public_app_url is not None
    checkout = YooMoneyCheckout(
        action=YOOMONEY_FORM_URL,
        fields={
            "receiver": receiver,
            "quickpay-form": "button",
            "paymentType": DEFAULT_PAYMENT_TYPE.value,
            "sum": f"{payment.requested_amount:.2f}",
            "label": payment.label,
            "successURL": f"{public_app_url}/payments/{payment.id}",
        },
    )
    return payment_read(payment, checkout)


async def get_user_payment(
    db: AsyncSession, payment_id: UUID, user_id: UUID
) -> YooMoneyPayment:
    payment = await db.scalar(
        select(YooMoneyPayment).where(
            YooMoneyPayment.id == payment_id,
            YooMoneyPayment.user_id == user_id,
        )
    )
    if payment is None:
        raise ApiError(status_code=404, code="payment_not_found", message="Платёж не найден")
    return payment


def _parse_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    try:
        parsed = Decimal(value)
        if not parsed.is_finite():
            return None
        return parsed.quantize(KOPECK)
    except InvalidOperation:
        return None


def _parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def parse_history_operation(
    operation: object,
    *,
    expected_label: str | None = None,
) -> tuple[str, str, Decimal, datetime] | None:
    if not isinstance(operation, dict):
        return None
    label = operation.get("label")
    operation_id = operation.get("operation_id")
    if (
        not isinstance(label, str)
        or not label.startswith(LABEL_PREFIX)
        or (expected_label is not None and label != expected_label)
        or not isinstance(operation_id, str)
        or not operation_id
        or operation.get("status") != "success"
        or operation.get("direction") != "in"
    ):
        return None
    received_amount = _parse_decimal(str(operation.get("amount")))
    paid_at = _parse_datetime(str(operation.get("datetime")))
    if (
        received_amount is None
        or not 0 < received_amount <= MAX_MONEY
        or paid_at is None
    ):
        logger.warning("YooMoney вернул операцию с некорректной суммой или датой")
        return None
    return label, operation_id, received_amount, paid_at


async def _operation_belongs_to_another_payment(
    db: AsyncSession, operation_id: str, payment_id: UUID
) -> bool:
    existing_id = await db.scalar(
        select(YooMoneyPayment.id).where(YooMoneyPayment.operation_id == operation_id)
    )
    return existing_id is not None and existing_id != payment_id


async def apply_successful_payment(
    db: AsyncSession,
    payment: YooMoneyPayment,
    *,
    operation_id: str,
    received_amount: Decimal,
    paid_at: datetime,
    withdrawn_amount: Decimal | None = None,
    payment_type: YooMoneyPaymentType | None = None,
) -> bool:
    if payment.status == YooMoneyPaymentStatus.SUCCEEDED.value:
        return False
    if await _operation_belongs_to_another_payment(db, operation_id, payment.id):
        logger.warning(
            "Операция YooMoney %s уже привязана к другому платежу", operation_id
        )
        return False
    user = await db.scalar(
        select(User)
        .where(User.id == payment.user_id, User.deleted_at.is_(None))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if user is None:
        logger.warning("Не найден пользователь для платежа YooMoney %s", payment.id)
        return False
    balance_before = user.balance
    balance_after = balance_before + received_amount
    if balance_after > MAX_MONEY:
        logger.warning("Пополнение YooMoney %s переполняет баланс", payment.id)
        return False
    user.balance = balance_after
    payment.operation_id = operation_id
    payment.withdrawn_amount = withdrawn_amount
    payment.received_amount = received_amount
    payment.payment_type = payment_type.value if payment_type is not None else None
    payment.paid_at = paid_at
    payment.status = YooMoneyPaymentStatus.SUCCEEDED.value
    payment.balance_before = balance_before
    payment.balance_after = balance_after
    return await restore_if_billing_blocked(
        db,
        user,
        source=StatusChangeSource.TOP_UP,
        changed_by_user_id=None,
    )


async def process_notification(db: AsyncSession, params: dict[str, str]) -> bool:
    if params.get("test_notification", "false").lower() == "true":
        return False
    label = params.get("label", "")
    if not label.startswith(LABEL_PREFIX):
        return False
    payment = await db.scalar(
        select(YooMoneyPayment)
        .where(YooMoneyPayment.label == label)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if payment is None:
        logger.warning("Получено уведомление с неизвестной меткой YooMoney")
        return False
    operation_id = params.get("operation_id", "")
    received_amount = _parse_decimal(params.get("amount"))
    withdrawn_amount = _parse_decimal(params.get("withdraw_amount"))
    paid_at = _parse_datetime(params.get("datetime"))
    payment_type = NOTIFICATION_PAYMENT_TYPES.get(params.get("notification_type", ""))
    checks = {
        "operation_id_missing": bool(operation_id),
        "invalid_amount": (
            received_amount is not None and 0 < received_amount <= MAX_MONEY
        ),
        "invalid_withdraw_amount": (
            withdrawn_amount is not None and 0 < withdrawn_amount <= MAX_MONEY
        ),
        "invalid_datetime": paid_at is not None,
        "invalid_currency": params.get("currency") == "643",
        "invalid_notification_type": payment_type is not None,
        "protected_transfer": params.get("codepro", "false").lower() == "false",
        "unaccepted_transfer": params.get("unaccepted", "false").lower() == "false",
    }
    failed_reason = next((reason for reason, valid in checks.items() if not valid), None)
    if failed_reason is not None:
        logger.warning(
            "Уведомление YooMoney для платежа %s отклонено: %s",
            payment.id,
            failed_reason,
        )
        return False
    assert received_amount is not None
    assert withdrawn_amount is not None
    assert paid_at is not None
    assert payment_type is not None
    reactivated = await apply_successful_payment(
        db,
        payment,
        operation_id=operation_id,
        received_amount=received_amount,
        withdrawn_amount=withdrawn_amount,
        payment_type=payment_type,
        paid_at=paid_at,
    )
    await db.commit()
    return reactivated


async def reconcile_operation(
    db: AsyncSession,
    *,
    label: str,
    operation_id: str,
    received_amount: Decimal,
    paid_at: datetime,
) -> bool:
    payment = await db.scalar(
        select(YooMoneyPayment)
        .where(
            YooMoneyPayment.label == label,
            YooMoneyPayment.status == YooMoneyPaymentStatus.PENDING.value,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if payment is None:
        return False
    if not received_amount.is_finite() or not 0 < received_amount <= MAX_MONEY:
        logger.warning("Сверка YooMoney вернула неположительную сумму для %s", payment.id)
        return False
    reactivated = await apply_successful_payment(
        db,
        payment,
        operation_id=operation_id,
        received_amount=received_amount,
        paid_at=paid_at,
    )
    await db.commit()
    return reactivated


async def reconcile_user_payment(
    db: AsyncSession,
    *,
    payment_id: UUID,
    user_id: UUID,
    settings: Settings,
) -> tuple[YooMoneyPayment, bool]:
    payment = await get_user_payment(db, payment_id, user_id)
    if payment.status == YooMoneyPaymentStatus.SUCCEEDED.value:
        return payment, False
    if (
        not settings.yoomoney_enabled
        or not settings.yoomoney_reconciliation_enabled
        or settings.yoomoney_access_token is None
    ):
        return payment, False

    now = datetime.now(UTC)
    check_before = now - RECONCILIATION_CHECK_INTERVAL
    claimed_payment_id = await db.scalar(
        update(YooMoneyPayment)
        .where(
            YooMoneyPayment.id == payment_id,
            YooMoneyPayment.user_id == user_id,
            YooMoneyPayment.status == YooMoneyPaymentStatus.PENDING.value,
            or_(
                YooMoneyPayment.last_reconciliation_check_at.is_(None),
                YooMoneyPayment.last_reconciliation_check_at <= check_before,
            ),
        )
        .values(last_reconciliation_check_at=now)
        .returning(YooMoneyPayment.id)
        .execution_options(synchronize_session=False)
    )
    if claimed_payment_id is None:
        await db.refresh(payment)
        return payment, False

    label = payment.label
    from_datetime = payment.created_at
    if from_datetime.tzinfo is None:
        from_datetime = from_datetime.replace(tzinfo=UTC)
    await db.commit()

    reactivated = False
    try:
        payload = await YooMoneyClient(settings).operation_history(
            from_datetime=from_datetime,
            label=label,
        )
        operations = payload.get("operations", [])
        if not isinstance(operations, list):
            raise TypeError("YooMoney вернул некорректный список операций")
        for operation in operations:
            parsed = parse_history_operation(operation, expected_label=label)
            if parsed is None:
                continue
            _, operation_id, received_amount, paid_at = parsed
            reactivated = await reconcile_operation(
                db,
                label=label,
                operation_id=operation_id,
                received_amount=received_amount,
                paid_at=paid_at,
            )
            break
    except Exception:
        await db.rollback()
        logger.exception("Не удалось адресно сверить платёж YooMoney %s", payment.id)

    await db.refresh(payment)
    return payment, reactivated
