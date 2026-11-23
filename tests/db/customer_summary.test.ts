import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import {
  insertCustomer, insertOrder, insertOrderItem, insertPayment, insertTrip, setGlobalRate,
} from '../helpers/fixtures.ts';

describe('customer_summary and customer_trip_summary', () => {
  it('Cliente sin Pedidos tiene totales en 0 y cantidad 0, sin filas por Viaje', () => withRollback(async (db) => {
    const customerId = await insertCustomer(db);
    const { rows } = await db.query('SELECT * FROM customer_summary WHERE customer_id = $1', [customerId]);
    expect(rows).toEqual([{ customer_id: customerId, order_count: 0, total_usd: 0, paid_usd: 0, balance_usd: 0 }]);
    const byTrip = await db.query('SELECT * FROM customer_trip_summary WHERE customer_id = $1', [customerId]);
    expect(byTrip.rows).toEqual([]);
  }));

  it('suma Total, Abono y Saldo en USD de varios Pedidos y monedas; los Cancelados no cuentan', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 500);
    const tripId = await insertTrip(db, { rates: { CRC: 400 } });
    const customerId = await insertCustomer(db);

    // Viaje, USD: 100 total, 30 abonado
    const a = await insertOrder(db, { customerId, tripId });
    await insertOrderItem(db, { orderId: a, price: 100 });
    await insertPayment(db, { orderId: a, amount: 30 });
    // Viaje, CRC con tipo del Viaje (400): 40000 = $100, abono 20000 = $50
    const b = await insertOrder(db, { customerId, tripId, currency: 'CRC' });
    await insertOrderItem(db, { orderId: b, price: 20000, quantity: 2 });
    await insertPayment(db, { orderId: b, amount: 20000, currency: 'CRC' });
    // Personal, CRC con tipo global (500): 5000 = $10
    const c = await insertOrder(db, { customerId, currency: 'CRC' });
    await insertOrderItem(db, { orderId: c, price: 5000 });
    // Cancelado (Viaje) con Artículos y Abono: no cuenta
    const x = await insertOrder(db, { customerId, tripId, status: 'cancelled' });
    await insertOrderItem(db, { orderId: x, price: 999 });
    await insertPayment(db, { orderId: x, amount: 500 });
    // Cancelado Personal: no cuenta
    const y = await insertOrder(db, { customerId, status: 'cancelled' });
    await insertOrderItem(db, { orderId: y, price: 777 });

    const { rows: [total] } = await db.query('SELECT * FROM customer_summary WHERE customer_id = $1', [customerId]);
    expect(total).toEqual({ customer_id: customerId, order_count: 3, total_usd: 210, paid_usd: 80, balance_usd: 130 });

    const { rows } = await db.query(
      'SELECT trip_id, order_count, total_usd, paid_usd, balance_usd FROM customer_trip_summary WHERE customer_id = $1',
      [customerId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.trip_id === tripId)).toEqual({
      trip_id: tripId, order_count: 2, total_usd: 200, paid_usd: 80, balance_usd: 120,
    });
    expect(rows.find((r) => r.trip_id === null)).toEqual({
      trip_id: null, order_count: 1, total_usd: 10, paid_usd: 0, balance_usd: 10,
    });
  }));

  it('un Cliente con solo Pedidos Cancelados tiene 0 y no aparece por Viaje', () => withRollback(async (db) => {
    const tripId = await insertTrip(db);
    const customerId = await insertCustomer(db);
    const o = await insertOrder(db, { customerId, tripId, status: 'cancelled' });
    await insertOrderItem(db, { orderId: o, price: 50 });
    const { rows } = await db.query('SELECT order_count, total_usd, balance_usd FROM customer_summary WHERE customer_id = $1', [customerId]);
    expect(rows).toEqual([{ order_count: 0, total_usd: 0, balance_usd: 0 }]);
    const byTrip = await db.query('SELECT 1 FROM customer_trip_summary WHERE customer_id = $1', [customerId]);
    expect(byTrip.rows).toEqual([]);
  }));

  it('el Saldo del Cliente suma los Saldos redondeados de cada Pedido (Total − Abono = Saldo)', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 3);
    const customerId = await insertCustomer(db);
    for (let i = 0; i < 3; i++) {
      const o = await insertOrder(db, { customerId, currency: 'CRC' });
      await insertOrderItem(db, { orderId: o, price: 10 });
      await insertPayment(db, { orderId: o, amount: 1, currency: 'CRC' });
    }
    const { rows: [r] } = await db.query('SELECT total_usd, paid_usd, balance_usd FROM customer_summary WHERE customer_id = $1', [customerId]);
    // each Pedido: total 3.33, abono 0.33, saldo 3.00 (rounded per Pedido, then summed)
    expect(r).toEqual({ total_usd: 9.99, paid_usd: 0.99, balance_usd: 9 });
  }));
});
