import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import { insertCustomer, insertOrder, insertOrderItem, insertTrip, setGlobalRate } from '../helpers/fixtures.ts';

async function summary(db: pg.PoolClient, orderId: string) {
  const { rows } = await db.query('SELECT rate, total, total_usd FROM order_summary WHERE order_id = $1', [orderId]);
  return rows[0] as { rate: number; total: number; total_usd: number };
}

describe('order_summary (Total of each Pedido)', () => {
  it('sums price × quantity over several Artículos', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await insertOrderItem(db, { orderId, price: 25.5, quantity: 2 });
      await insertOrderItem(db, { orderId, price: 10, quantity: 3 });
      await insertOrderItem(db, { orderId, price: 0, quantity: 1 });
      expect(await summary(db, orderId)).toEqual({ rate: 1, total: 81, total_usd: 81 });
    }));

  it('a Pedido without Artículos has Total 0, not null', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db), currency: 'CRC' });
      const s = await summary(db, orderId);
      expect(s.total).toBe(0);
      expect(s.total_usd).toBe(0);
    }));

  it('USD Total uses the effective rate of the Viaje', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 505);
      const customerId = await insertCustomer(db);
      const tripId = await insertTrip(db, { rates: { CRC: 500 } });
      const orderId = await insertOrder(db, { customerId, tripId, currency: 'CRC' });
      await insertOrderItem(db, { orderId, price: 12500, quantity: 4 });
      expect(await summary(db, orderId)).toEqual({ rate: 500, total: 50000, total_usd: 100 });
    }));

  it('a Viaje without a rate for the currency, or a General Pedido, uses the global rate', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      await setGlobalRate(db, 'EUR', 0.9);
      const customerId = await insertCustomer(db);
      const tripId = await insertTrip(db, { rates: { EUR: 0.9 } });
      const inTrip = await insertOrder(db, { customerId, tripId, currency: 'CRC' });
      const personal = await insertOrder(db, { customerId, currency: 'CRC' });
      for (const orderId of [inTrip, personal]) {
        await insertOrderItem(db, { orderId, price: 25000 });
        expect(await summary(db, orderId)).toEqual({ rate: 500, total: 25000, total_usd: 50 });
      }
    }));

  it('changing the Viaje rate changes its Pedidos USD Total but not General ones', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      const customerId = await insertCustomer(db);
      const tripId = await insertTrip(db, { rates: { CRC: 500 } });
      const inTrip = await insertOrder(db, { customerId, tripId, currency: 'CRC' });
      const personal = await insertOrder(db, { customerId, currency: 'CRC' });
      await insertOrderItem(db, { orderId: inTrip, price: 10000 });
      await insertOrderItem(db, { orderId: personal, price: 10000 });
      await db.query(`UPDATE trip_rate SET rate = 400 WHERE trip_id = $1 AND currency_code = 'CRC'`, [tripId]);
      expect((await summary(db, inTrip)).total_usd).toBe(25);
      expect((await summary(db, personal)).total_usd).toBe(20);
    }));

  it('rounds the USD Total to 2 decimals', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 505);
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db), currency: 'CRC' });
      await insertOrderItem(db, { orderId, price: 1000 });
      expect((await summary(db, orderId)).total_usd).toBe(1.98); // 1000 / 505 = 1.9801...
    }));

  it('updates when Artículos change and exposes the status', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db), status: 'cancelled' });
      const itemId = await insertOrderItem(db, { orderId, price: 10, quantity: 2 });
      expect((await summary(db, orderId)).total).toBe(20);
      await db.query('UPDATE order_item SET quantity = 5 WHERE id = $1', [itemId]);
      expect((await summary(db, orderId)).total).toBe(50);
      await db.query('DELETE FROM order_item WHERE id = $1', [itemId]);
      expect((await summary(db, orderId)).total).toBe(0);
      const { rows } = await db.query('SELECT status FROM order_summary WHERE order_id = $1', [orderId]);
      expect(rows[0].status).toBe('cancelled');
    }));
});

describe('order and order_item integrity', () => {
  it('deleting a Pedido deletes its Artículos', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await insertOrderItem(db, { orderId, price: 5 });
      await insertOrderItem(db, { orderId, price: 6 });
      await db.query('DELETE FROM "order" WHERE id = $1', [orderId]);
      const { rows } = await db.query('SELECT count(*)::int AS n FROM order_item WHERE order_id = $1', [orderId]);
      expect(rows[0].n).toBe(0);
    }));

  it('rejects a negative price', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await expect(insertOrderItem(db, { orderId, price: -1 })).rejects.toThrow(/order_item_price_check/);
    }));

  it('rejects a quantity of zero', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await expect(insertOrderItem(db, { orderId, price: 1, quantity: 0 })).rejects.toThrow(/order_item_quantity_check/);
    }));

  it('rejects an unknown status', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      await expect(insertOrder(db, { customerId, status: 'lost' })).rejects.toThrow(/order_status_fkey/);
    }));

  it('a Cliente with Pedidos cannot be deleted', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      await insertOrder(db, { customerId });
      await expect(db.query('DELETE FROM customer WHERE id = $1', [customerId])).rejects.toThrow(/order_customer_id_fkey/);
    }));

  it('a Viaje with Pedidos cannot be deleted', () =>
    withRollback(async (db) => {
      const tripId = await insertTrip(db);
      await insertOrder(db, { customerId: await insertCustomer(db), tripId });
      await expect(db.query('DELETE FROM trip WHERE id = $1', [tripId])).rejects.toThrow(/order_trip_id_fkey/);
    }));
});
