import { describe, expect, it } from 'vitest';
import { CRC, USD, dualAmountLines, formatMoney } from './money';

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

describe('dualAmountLines (DualAmount)', () => {
  const eq = { usd: 50, crc: 26000 };

  it('an amount in ₡ shows ₡ primary and its $ equivalent', () => {
    expect(dualAmountLines(CRC, 26000, eq)).toEqual({ primary: '₡26.000', secondary: '≈ $50.00' });
  });

  it('an amount in $ still shows ₡ primary and the official $ secondary', () => {
    expect(dualAmountLines(USD, 50, eq)).toEqual({ primary: '₡26.000', secondary: '$50.00' });
  });

  it('an amount in another currency shows ₡ primary, then its official amount and $', () => {
    expect(dualAmountLines({ code: 'EUR', symbol: '€' }, 45, eq)).toEqual({ primary: '₡26.000', secondary: '€45.00 · ≈ $50.00' });
  });

  it('keeps negative values (e.g. Utilidad, Saldo a favor)', () => {
    expect(dualAmountLines(USD, -10, { usd: -10, crc: -5200 })).toEqual({ primary: '-₡5.200', secondary: '-$10.00' });
  });
});
