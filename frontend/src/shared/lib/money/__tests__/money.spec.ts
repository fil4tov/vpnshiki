import { formatMoney, isNegativeMoney } from '../money';

describe('formatMoney', () => {
  it('formats exact API values as Russian rubles', () => {
    expect(formatMoney('1250.50')).toContain('1 250,50');
  });

  it('does not expose NaN', () => {
    expect(formatMoney('invalid')).toBe('—');
  });
});

describe('isNegativeMoney', () => {
  it('recognizes only finite amounts below zero', () => {
    expect(isNegativeMoney('-125.50')).toBe(true);
    expect(isNegativeMoney('0.00')).toBe(false);
    expect(isNegativeMoney('-0.00')).toBe(false);
    expect(isNegativeMoney('invalid')).toBe(false);
  });
});
