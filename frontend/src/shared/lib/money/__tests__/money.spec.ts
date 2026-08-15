import { formatMoney } from '../money';

describe('formatMoney', () => {
  it('formats exact API values as Russian rubles', () => {
    expect(formatMoney('1250.50')).toContain('1 250,50');
  });

  it('does not expose NaN', () => {
    expect(formatMoney('invalid')).toBe('—');
  });
});

