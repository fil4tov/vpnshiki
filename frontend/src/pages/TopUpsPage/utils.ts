import type { AdminYooMoneyPayment, YooMoneyPaymentType } from '#entities/payment';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

export function formatPaymentDate(value: string | null): string {
  if (!value) return '—';
  return dateFormatter.format(new Date(value)).replace(/\s+г\.$/, '');
}

export function formatPaymentTime(value: string | null): string {
  if (!value) return '';
  return timeFormatter.format(new Date(value));
}

export function paymentTypeLabel(type: YooMoneyPaymentType | null): string {
  if (type === 'AC') return 'Карта';
  if (type === 'PC') return 'Кошелёк';
  return 'Не определён';
}

export function sumPayments(
  payments: AdminYooMoneyPayment[],
  field: 'requested_amount' | 'withdrawn_amount' | 'received_amount',
): string {
  return payments.reduce((total, payment) => total + Number(payment[field] ?? 0), 0).toFixed(2);
}

export const paymentStatusView = {
  pending: { label: 'Ожидает', tone: 'warning' },
  succeeded: { label: 'Зачислен', tone: 'positive' },
} as const;
