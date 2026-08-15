import type { TariffPlan } from './types';

const dateParts = (value: string) => {
  const [year = '', month = '', day = ''] = value.split('-');
  return { year, month, day };
};

export function formatTariffPlanName(startDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return 'TP_—';
  const { year, month, day } = dateParts(startDate);
  return `TP_${day}.${month}.${year}`;
}

export function formatCalendarDate(value: string | null): string {
  if (!value) return 'Бессрочно';
  const { year, month, day } = dateParts(value);
  return `${day}.${month}.${year}`;
}

export function addCalendarDays(value: string, days: number): string {
  const { year, month, day } = dateParts(value);
  const result = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days));
  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    String(result.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function getMoscowDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getDaysInMoscowMonth(moscowDate = getMoscowDate()): number {
  const { year, month } = dateParts(moscowDate);
  return new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
}

export function calculateDailyCharge(
  monthlyAmount: string,
  daysInMonth: number,
  activeUsers: number,
): string | null {
  const amount = Number(monthlyAmount);
  if (!Number.isFinite(amount) || amount <= 0 || daysInMonth <= 0 || activeUsers <= 0) {
    return null;
  }

  const monthlyKopecks = Math.round(amount * 100);
  return (Math.round(monthlyKopecks / daysInMonth / activeUsers) / 100).toFixed(2);
}

export function getPreviewEndDate(
  startDate: string,
  plans: TariffPlan[],
  editingId?: string,
): string | null {
  if (!startDate) return null;
  const next = plans
    .filter((plan) => plan.id !== editingId && plan.start_date > startDate)
    .sort((left, right) => left.start_date.localeCompare(right.start_date))[0];
  return next ? addCalendarDays(next.start_date, -1) : null;
}
