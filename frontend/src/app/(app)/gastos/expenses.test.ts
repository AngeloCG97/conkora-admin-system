import { describe, expect, it } from 'vitest';
import { expenseWhere, parseAmount } from './expenses';

describe('expenseWhere', () => {
  it('has no conditions for every Viaje, category and kind', () => {
    expect(expenseWhere({ trip: { kind: 'all' }, category: null, personal: null })).toEqual({});
  });
  it('filters General Gastos (no Viaje)', () => {
    expect(expenseWhere({ trip: { kind: 'general' }, category: null, personal: null })).toEqual({
      trip_id: { _is_null: true },
    });
  });
  it('filters by Viaje and category', () => {
    expect(expenseWhere({ trip: { kind: 'trip', id: 'abc' }, category: 'merchandise', personal: null })).toEqual({
      trip_id: { _eq: 'abc' },
      category: { _eq: 'merchandise' },
    });
  });
  it('filters Gastos personales or del negocio', () => {
    expect(expenseWhere({ trip: { kind: 'all' }, category: null, personal: true })).toEqual({ is_personal: { _eq: true } });
    expect(expenseWhere({ trip: { kind: 'all' }, category: null, personal: false })).toEqual({
      is_personal: { _eq: false },
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
