import { describe, expect, it } from 'vitest';
import { expenseWhere, parseAmount } from './expenses';

describe('expenseWhere', () => {
  it('has no conditions for every Viaje and category', () => {
    expect(expenseWhere({ trip: { kind: 'all' }, category: null })).toEqual({});
  });
  it('filters Personal Gastos (no Viaje)', () => {
    expect(expenseWhere({ trip: { kind: 'personal' }, category: null })).toEqual({ trip_id: { _is_null: true } });
  });
  it('filters by Viaje and category', () => {
    expect(expenseWhere({ trip: { kind: 'trip', id: 'abc' }, category: 'merchandise' })).toEqual({
      trip_id: { _eq: 'abc' },
      category: { _eq: 'merchandise' },
    });
  });
});

describe('parseAmount', () => {
  it('accepts zero, integers and up to 2 decimals with dot or comma', () => {
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('1250')).toBe(1250);
    expect(parseAmount(' 12.5 ')).toBe(12.5);
    expect(parseAmount('12,75')).toBe(12.75);
  });
  it('rejects negatives, empty text, more than 2 decimals and garbage', () => {
    for (const text of ['-1', '', '1.234', 'abc', '1,000.50', '.5']) expect(parseAmount(text), text).toBeNull();
  });
});
