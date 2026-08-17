import hmac
import logging
from datetime import UTC, datetime
from decimal import ROUND_CEILING, Decimal, InvalidOperation
from hashlib import sha256
from urllib.parse import parse_qsl, quote, urlencode
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.models import StatusChangeSource, UserTopUp
from app.billing.service import reactivate_if_billing_blocked
from app.config import Settings
from app.errors import ApiError
from app.users.models import User

from .models import YooMoneyPayment, YooMoneyPaymentStatus, YooMoneyPaymentType
from .schemas import YooMoneyCheckout, YooMoneyPaymentCreate, YooMoneyPaymentRead

logger = logging.getLogger(__name__)

KOPECK = Decimal("0.01")
MAX_MONEY = Decimal("999999999999.99")
YOOMONEY_FORM_URL = "https://yoomoney.ru/quickpay/confirm"
LABEL_PREFIX = "pay_"
AMOUNT_TOLERANCE = Decimal("0.01")


def calculate_payable_amount(
    credit_amount: Decimal, payment_type: YooMoneyPaymentType
) -> Decimal:
    if payment_type == YooMoneyPaymentType.WALLET:
        raw_amount = credit_amount * Decimal("1.01")
    else:
        raw_amount = credit_amount / Decimal("0.97")
    return raw_amount.quantize(KOPECK, rounding=ROUND_CEILING)


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
        payment_type=YooMoneyPaymentType(payment.payment_type),
        credit_amount=payment.credit_amount,
        payable_amount=payment.payable_amount,
        received_amount=payment.received_amount,
        review_reason=payment.review_reason,
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
    payable_amount = calculate_payable_amount(payload.amount, payload.payment_type)
    payment = YooMoneyPayment(
        user_id=user.id,
        label=f"{LABEL_PREFIX}{uuid4().hex}",
        payment_type=payload.payment_type.value,
        credit_amount=payload.amount,
        payable_amount=payable_amount,
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
            "paymentType": payment.payment_type,
            "sum": f"{payment.payable_amount:.2f}",
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
    except InvalidOperation:
        return None
    if not parsed.is_finite():
        return None
    return parsed.quantize(KOPECK)


def _parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _amount_is_expected(payment: YooMoneyPayment, received_amount: Decimal) -> bool:
    return payment.credit_amount <= received_amount <= payment.credit_amount + AMOUNT_TOLERANCE


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
) -> bool:
    if payment.status == YooMoneyPaymentStatus.SUCCEEDED.value:
        return False
    if await _operation_belongs_to_another_payment(db, operation_id, payment.id):
        payment.status = YooMoneyPaymentStatus.REVIEW_REQUIRED.value
        payment.review_reason = "operation_already_used"
        return False
    user = await db.scalar(
        select(User)
        .where(User.id == payment.user_id, User.deleted_at.is_(None))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if user is None:
        payment.status = YooMoneyPaymentStatus.REVIEW_REQUIRED.value
        payment.review_reason = "user_not_found"
        return False
    balance_before = user.balance
    balance_after = balance_before + payment.credit_amount
    if balance_after > MAX_MONEY:
        payment.status = YooMoneyPaymentStatus.REVIEW_REQUIRED.value
        payment.review_reason = "balance_overflow"
        return False
    user.balance = balance_after
    payment.operation_id = operation_id
    payment.received_amount = received_amount
    payment.paid_at = paid_at
    payment.status = YooMoneyPaymentStatus.SUCCEEDED.value
    payment.review_reason = None
    db.add(
        UserTopUp(
            user_id=user.id,
            yoomoney_payment_id=payment.id,
            amount=payment.credit_amount,
            balance_before=balance_before,
            balance_after=balance_after,
        )
    )
    return await reactivate_if_billing_blocked(
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
    expected_type = (
        "p2p-incoming"
        if payment.payment_type == YooMoneyPaymentType.WALLET.value
        else "card-incoming"
    )
    checks = {
        "operation_id_missing": bool(operation_id),
        "invalid_amount": received_amount is not None,
        "invalid_withdraw_amount": withdrawn_amount is not None,
        "invalid_datetime": paid_at is not None,
        "invalid_currency": params.get("currency") == "643",
        "invalid_notification_type": params.get("notification_type") == expected_type,
        "protected_transfer": params.get("codepro", "false").lower() == "false",
        "unaccepted_transfer": params.get("unaccepted", "false").lower() == "false",
        "withdraw_amount_mismatch": withdrawn_amount == payment.payable_amount,
        "received_amount_mismatch": (
            received_amount is not None and _amount_is_expected(payment, received_amount)
        ),
    }
    failed_reason = next((reason for reason, valid in checks.items() if not valid), None)
    if failed_reason is not None:
        payment.status = YooMoneyPaymentStatus.REVIEW_REQUIRED.value
        payment.review_reason = failed_reason
        payment.received_amount = received_amount
        if operation_id and not await _operation_belongs_to_another_payment(
            db, operation_id, payment.id
        ):
            payment.operation_id = operation_id
        await db.commit()
        return False
    assert received_amount is not None
    assert paid_at is not None
    reactivated = await apply_successful_payment(
        db,
        payment,
        operation_id=operation_id,
        received_amount=received_amount,
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
    if not _amount_is_expected(payment, received_amount):
        payment.status = YooMoneyPaymentStatus.REVIEW_REQUIRED.value
        payment.review_reason = "reconciliation_amount_mismatch"
        payment.received_amount = received_amount
        await db.commit()
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
