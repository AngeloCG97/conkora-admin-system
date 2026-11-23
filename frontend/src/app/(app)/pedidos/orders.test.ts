import { describe, expect, it } from 'vitest';
import { orderWhere, parsePaymentAmount, parseQuantity, paymentState } from './orders';

describe('orderWhere', () => {
  it('has no conditions without filters', () => {
    expect(orderWhere({ trip: { kind: 'all' }, customerId: null, status: null })).toEqual({});
  });
  it('filters General Pedidos (no Viaje)', () => {
    expect(orderWhere({ trip: { kind: 'general' }, customerId: null, status: null })).toEqual({
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

describe('parsePaymentAmount', () => {
  it('accepts positive amounts with up to 2 decimals', () => {
    expect(parsePaymentAmount('25000')).toBe(25000);
    expect(parsePaymentAmount(' 12,5 ')).toBe(12.5);
    expect(parsePaymentAmount('0.01')).toBe(0.01);
  });
  it('rejects zero, negatives and invalid text', () => {
    for (const text of ['0', '0.00', '-5', '', 'abc', '1.234']) expect(parsePaymentAmount(text)).toBeNull();
  });
});

describe('paymentState', () => {
  it('is paid when the view says so, pending while there is Saldo', () => {
    expect(paymentState('pending', { balance: 0, is_paid: true })).toBe('paid');
    expect(paymentState('delivered', { balance: -5, is_paid: true })).toBe('paid');
    expect(paymentState('pending', { balance: 10, is_paid: false })).toBe('pending');
  });
  it('shows nothing for a Cancelado, an empty Pedido or a missing summary', () => {
    expect(paymentState('cancelled', { balance: 10, is_paid: false })).toBeNull();
    expect(paymentState('pending', { balance: 0, is_paid: false })).toBeNull();
    expect(paymentState('pending', null)).toBeNull();
  });
});
