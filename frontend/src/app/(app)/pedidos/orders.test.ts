import { describe, expect, it } from 'vitest';
import { orderWhere, parseQuantity } from './orders';

describe('orderWhere', () => {
  it('has no conditions without filters', () => {
    expect(orderWhere({ trip: { kind: 'all' }, customerId: null, status: null })).toEqual({});
  });
  it('filters Personal Pedidos (no Viaje)', () => {
    expect(orderWhere({ trip: { kind: 'personal' }, customerId: null, status: null })).toEqual({
      trip_id: { _is_null: true },
    });
  });
  it('combines Viaje, Cliente and status', () => {
    expect(orderWhere({ trip: { kind: 'trip', id: 't1' }, customerId: 'c1', status: 'pending' })).toEqual({
      trip_id: { _eq: 't1' },
      customer_id: { _eq: 'c1' },
      status: { _eq: 'pending' },
    });
  });
});

describe('parseQuantity', () => {
  it('accepts whole numbers greater than 0', () => {
    expect(parseQuantity('1')).toBe(1);
    expect(parseQuantity(' 12 ')).toBe(12);
  });
  it('rejects zero, negatives, decimals and garbage', () => {
    for (const text of ['0', '-1', '1.5', '', 'abc', '2e3']) expect(parseQuantity(text), text).toBeNull();
  });
});
