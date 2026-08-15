import {
  calculateDailyCharge,
  formatCalendarDate,
  formatTariffPlanName,
  getDaysInMoscowMonth,
  getPreviewEndDate,
} from '../utils';
import type { TariffPlan } from '../types';

const plan = (id: string, startDate: string): TariffPlan => ({
  id,
  name: formatTariffPlanName(startDate),
  monthly_amount: '1000.00',
  start_date: startDate,
  end_date: null,
  status: 'scheduled',
  is_editable: true,
  created_at: '2026-08-15T00:00:00Z',
  updated_at: '2026-08-15T00:00:00Z',
});

describe('tariff plan dates', () => {
  it('formats generated names and calendar dates without timezone shifts', () => {
    expect(formatTariffPlanName('2026-08-01')).toBe('TP_01.08.2026');
    expect(formatCalendarDate('2026-08-15')).toBe('15.08.2026');
    expect(formatCalendarDate(null)).toBe('Бессрочно');
  });

  it('previews the inclusive end as the day before the next plan', () => {
    const plans = [plan('one', '2026-08-01'), plan('two', '2026-09-01')];
    expect(getPreviewEndDate('2026-08-15', plans)).toBe('2026-08-31');
    expect(getPreviewEndDate('2026-10-01', plans)).toBeNull();
  });

  it('calculates the month length and rounds a daily per-user charge to kopecks', () => {
    expect(getDaysInMoscowMonth('2028-02-12')).toBe(29);
    expect(getDaysInMoscowMonth('2026-08-15')).toBe(31);
    expect(calculateDailyCharge('12400.00', 31, 8)).toBe('50.00');
    expect(calculateDailyCharge('1000.00', 31, 3)).toBe('10.75');
  });

  it('does not calculate a charge without active users', () => {
    expect(calculateDailyCharge('12400.00', 31, 0)).toBeNull();
  });
});
