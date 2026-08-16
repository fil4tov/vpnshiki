export function formatMoney(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function isNegativeMoney(value: string): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount < 0;
}
