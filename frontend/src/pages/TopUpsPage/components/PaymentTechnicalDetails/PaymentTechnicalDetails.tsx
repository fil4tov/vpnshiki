import { useState } from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';

import type { AdminYooMoneyPayment } from '#entities/payment';
import { formatMoney } from '#shared/lib/money';

import { formatPaymentDate, formatPaymentTime, paymentTypeLabel } from '../../utils';
import styles from './PaymentTechnicalDetails.module.scss';

function CopyValue({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be unavailable in restricted browser contexts.
    }
  };
  return (
    <div className={styles.copyValue}>
      <dt>{label}</dt>
      <dd><code title={value ?? undefined}>{value ?? '—'}</code>{value && (
        <button type="button" onClick={() => void copy()} aria-label={`Скопировать ${label}`}>
          {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
        </button>
      )}</dd>
    </div>
  );
}

export function PaymentTechnicalDetails({ payment }: { payment: AdminYooMoneyPayment }) {
  return (
    <dl className={styles.details}>
      <CopyValue label="ID платежа" value={payment.id} />
      <CopyValue label="Label YooMoney" value={payment.label} />
      <CopyValue label="ID операции" value={payment.operation_id} />
      <div><dt>Способ оплаты</dt><dd>{paymentTypeLabel(payment.payment_type)}</dd></div>
      <div><dt>Списано</dt><dd className={styles.money}>{payment.withdrawn_amount ? formatMoney(payment.withdrawn_amount) : '—'}</dd></div>
      <div><dt>Последняя проверка</dt><dd>{payment.last_reconciliation_check_at
        ? `${formatPaymentDate(payment.last_reconciliation_check_at)}, ${formatPaymentTime(payment.last_reconciliation_check_at)}`
        : 'Не выполнялась'}</dd></div>
    </dl>
  );
}
