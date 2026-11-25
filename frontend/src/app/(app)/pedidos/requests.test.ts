import { describe, expect, it } from 'vitest';
import { itemCountLabel, moveTargetWhere, requestWhere } from './requests';

describe('requestWhere', () => {
  it('has no conditions without filters', () => {
    expect(requestWhere({ trip: { kind: 'all' }, customerId: null })).toEqual({});
  });
  it('filters General Pedidos (no Viaje)', () => {
    expect(requestWhere({ trip: { kind: 'general' }, customerId: null })).toEqual({ trip_id: { _is_null: true } });
  });
  it('combines Viaje and Cliente', () => {
    expect(requestWhere({ trip: { kind: 'trip', id: 't1' }, customerId: 'c1' })).toEqual({
      trip_id: { _eq: 't1' },
      customer_id: { _eq: 'c1' },
    });
  });
});

describe('moveTargetWhere', () => {
  it('looks for Pendiente Ventas of the same Cliente and Viaje', () => {
    expect(moveTargetWhere('c1', 't1')).toEqual({
      customer_id: { _eq: 'c1' },
      trip_id: { _eq: 't1' },
      status: { _eq: 'pending' },
    });
  });
  it('a General Pedido only matches General Ventas', () => {
    expect(moveTargetWhere('c1', null)).toEqual({
      customer_id: { _eq: 'c1' },
      trip_id: { _is_null: true },
      status: { _eq: 'pending' },
    });
  });
});

describe('itemCountLabel', () => {
  it('pluralizes Artículos', () => {
    expect(itemCountLabel(0)).toBe('Sin Artículos');
    expect(itemCountLabel(1)).toBe('1 Artículo');
    expect(itemCountLabel(4)).toBe('4 Artículos');
  });
});
