import { describe, expect, it } from 'vitest';
import { CRC, USD, equivalentAmounts, formatEquivalents, formatMoney } from './money';

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

describe('equivalentAmounts / formatEquivalents (DualAmount)', () => {
  const eq = { usd: 50, crc: 26000 };

  it('an amount in ₡ shows its $ equivalent', () => {
    expect(equivalentAmounts('CRC', eq)).toEqual([{ amount: 50, currency: USD }]);
    expect(formatEquivalents('CRC', eq)).toBe('≈ $50.00');
  });

  it('an amount in $ shows its ₡ equivalent', () => {
    expect(equivalentAmounts('USD', eq)).toEqual([{ amount: 26000, currency: CRC }]);
    expect(formatEquivalents('USD', eq)).toBe('≈ ₡26.000');
  });

  it('an amount in another currency shows ₡ and $', () => {
    expect(formatEquivalents('EUR', eq)).toBe('≈ ₡26.000 · $50.00');
  });

  it('keeps negative values (e.g. Utilidad, Saldo a favor)', () => {
    expect(formatEquivalents('USD', { usd: -10, crc: -5200 })).toBe('≈ -₡5.200');
  });
});
