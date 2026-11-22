import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

const USD = { code: 'USD', symbol: '$' };
const CRC = { code: 'CRC', symbol: '₡' };

describe('formatMoney', () => {
  it('formats USD with comma thousands and two decimals', () => {
    expect(formatMoney(1250, USD)).toBe('$1,250.00');
    expect(formatMoney(0, USD)).toBe('$0.00');
    expect(formatMoney(1234567.891, USD)).toBe('$1,234,567.89');
  });

  it('formats CRC with dot thousands and no decimals', () => {
    expect(formatMoney(505000, CRC)).toBe('₡505.000');
    expect(formatMoney(999, CRC)).toBe('₡999');
  });

  it('uses the USD style for other currencies', () => {
    expect(formatMoney(1500.5, { code: 'EUR', symbol: '€' })).toBe('€1,500.50');
  });

  it('puts the sign before the symbol', () => {
    expect(formatMoney(-1250, USD)).toBe('-$1,250.00');
    expect(formatMoney(-0.001, USD)).toBe('$0.00');
  });
});
