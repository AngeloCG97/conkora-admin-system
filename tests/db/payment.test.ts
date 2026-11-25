import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import { insertCustomer, insertOrder, insertOrderItem, insertPayment, insertTrip, setGlobalRate } from '../helpers/fixtures.ts';

interface Balance {
  total: number;
  paid: number;
  balance: number;
  total_usd: number;
  paid_usd: number;
  balance_usd: number;
  is_paid: boolean;
}

async function balance(db: pg.PoolClient, orderId: string): Promise<Balance> {
  const { rows } = await db.query(
    'SELECT total, paid, balance, total_usd, paid_usd, balance_usd, is_paid FROM order_summary WHERE order_id = $1',
    [orderId],
  );
  return rows[0];
}

describe('order_summary (Abono and Saldo of each Venta)', () => {
  it('a Venta without Artículos nor Abonos has Total, Abono and Saldo 0, not null', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db), currency: 'CRC' });
      expect(await balance(db, orderId)).toEqual({
        total: 0, paid: 0, balance: 0, total_usd: 0, paid_usd: 0, balance_usd: 0, is_paid: false,
      });
    }));

  it('a Venta without Abonos has Abono 0 and Saldo = Total', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await insertOrderItem(db, { orderId, price: 40, quantity: 2 });
      expect(await balance(db, orderId)).toEqual({
        total: 80, paid: 0, balance: 80, total_usd: 80, paid_usd: 0, balance_usd: 80, is_paid: false,
      });
    }));

  it('a CRC Abono on a USD Venta of a Viaje converts with the Viaje rate', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 505);
      const tripId = await insertTrip(db, { rates: { CRC: 500 } });
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db), tripId });
      await insertOrderItem(db, { orderId, price: 100 });
      await insertPayment(db, { orderId, amount: 25000, currency: 'CRC' }); // 25000 / 500 × 1 = $50
      await insertPayment(db, { orderId, amount: 10 });
      expect(await balance(db, orderId)).toEqual({
        total: 100, paid: 60, balance: 40, total_usd: 100, paid_usd: 60, balance_usd: 40, is_paid: false,
      });
    }));

  it('a USD Abono on a CRC Venta of a Viaje multiplies by the Viaje rate of the Venta currency', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 505);
      const tripId = await insertTrip(db, { rates: { CRC: 500 } });
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db), tripId, currency: 'CRC' });
      await insertOrderItem(db, { orderId, price: 50000 });
      await insertPayment(db, { orderId, amount: 20 }); // 20 / 1 × 500 = ₡10000
      expect(await balance(db, orderId)).toEqual({
        total: 50000, paid: 10000, balance: 40000, total_usd: 100, paid_usd: 20, balance_usd: 80, is_paid: false,
      });
    }));

  it('converts between two non-USD currencies through USD with the Viaje rates', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'EUR', 0.9);
      const tripId = await insertTrip(db, { rates: { CRC: 500, EUR: 0.8 } });
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db), tripId, currency: 'EUR' });
      await insertOrderItem(db, { orderId, price: 80 });
      await insertPayment(db, { orderId, amount: 25000, currency: 'CRC' }); // 25000 / 500 × 0.8 = €40
      const b = await balance(db, orderId);
      expect([b.paid, b.balance, b.paid_usd, b.balance_usd]).toEqual([40, 40, 50, 50]);
    }));

  it('a General Venta converts its Abonos with the global rate', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 520);
      await insertTrip(db, { rates: { CRC: 500 } }); // a Viaje rate must not leak into General
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await insertOrderItem(db, { orderId, price: 100 });
      await insertPayment(db, { orderId, amount: 26000, currency: 'CRC' }); // 26000 / 520 = $50
      const b = await balance(db, orderId);
      expect([b.paid, b.balance]).toEqual([50, 50]);
    }));

  it('a Viaje without a rate for the Abono currency uses the global rate', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      await setGlobalRate(db, 'EUR', 0.9);
      const tripId = await insertTrip(db, { rates: { EUR: 0.9 } });
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db), tripId });
      await insertOrderItem(db, { orderId, price: 100 });
      await insertPayment(db, { orderId, amount: 25000, currency: 'CRC' });
      expect((await balance(db, orderId)).balance).toBe(50);
    }));

  it('changing the Viaje rate recalculates its Saldo; General Ventas do not change', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      const customerId = await insertCustomer(db);
      const tripId = await insertTrip(db, { rates: { CRC: 500 } });
      const inTrip = await insertOrder(db, { customerId, tripId });
      const personal = await insertOrder(db, { customerId });
      for (const orderId of [inTrip, personal]) {
        await insertOrderItem(db, { orderId, price: 100 });
        await insertPayment(db, { orderId, amount: 25000, currency: 'CRC' });
        expect((await balance(db, orderId)).balance).toBe(50);
      }
      await db.query(`UPDATE trip_rate SET rate = 400 WHERE trip_id = $1 AND currency_code = 'CRC'`, [tripId]);
      expect((await balance(db, inTrip)).balance).toBe(37.5); // 25000 / 400 = 62.50 paid
      expect((await balance(db, personal)).balance).toBe(50);
    }));

  it('changing the global rate recalculates General Saldos', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await insertOrderItem(db, { orderId, price: 100 });
      await insertPayment(db, { orderId, amount: 25000, currency: 'CRC' });
      await setGlobalRate(db, 'CRC', 250);
      expect((await balance(db, orderId)).balance).toBe(0);
    }));

  it('sums the unrounded Abonos, rounds once to 2 decimals and keeps Total − Abono = Saldo exactly', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await insertOrderItem(db, { orderId, price: 10 });
      // 1003 / 500 = 2.006 each: 3 × 2.006 = 6.018 → 6.02 (rounding each row first would give 6.03)
      for (let i = 0; i < 3; i++) await insertPayment(db, { orderId, amount: 1003, currency: 'CRC' });
      expect(await balance(db, orderId)).toMatchObject({ paid: 6.02, balance: 3.98, paid_usd: 6.02, balance_usd: 3.98 });
    }));

  it('rounds the Abono converted to a non-USD Venta currency to 2 decimals', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 505.37);
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db), currency: 'CRC' });
      await insertOrderItem(db, { orderId, price: 10000 });
      await insertPayment(db, { orderId, amount: 3.33 }); // 3.33 × 505.37 = 1682.8821
      expect(await balance(db, orderId)).toMatchObject({ paid: 1682.88, balance: 8317.12 });
    }));

  it('a fully paid Venta is Pagado; overpaying gives a negative Saldo and stays Pagado', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await insertOrderItem(db, { orderId, price: 30 });
      const paymentId = await insertPayment(db, { orderId, amount: 30 });
      expect(await balance(db, orderId)).toMatchObject({ balance: 0, is_paid: true });
      await db.query('UPDATE payment SET amount = 35 WHERE id = $1', [paymentId]);
      expect(await balance(db, orderId)).toMatchObject({ paid: 35, balance: -5, is_paid: true });
      await db.query('DELETE FROM payment WHERE id = $1', [paymentId]);
      expect(await balance(db, orderId)).toMatchObject({ paid: 0, balance: 30, is_paid: false });
    }));
});

describe('payment integrity', () => {
  it('rejects an Abono of zero', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await expect(insertPayment(db, { orderId, amount: 0 })).rejects.toThrow(/payment_amount_check/);
    }));

  it('rejects a negative Abono', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await expect(insertPayment(db, { orderId, amount: -5 })).rejects.toThrow(/payment_amount_check/);
    }));

  it('rejects an unknown currency', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await expect(insertPayment(db, { orderId, amount: 5, currency: 'XXX' })).rejects.toThrow(/payment_currency_code_fkey/);
    }));

  it('deleting a Venta deletes its Abonos', () =>
    withRollback(async (db) => {
      const orderId = await insertOrder(db, { customerId: await insertCustomer(db) });
      await insertPayment(db, { orderId, amount: 5 });
      await insertPayment(db, { orderId, amount: 6, currency: 'CRC' });
      await db.query('DELETE FROM "order" WHERE id = $1', [orderId]);
      const { rows } = await db.query('SELECT count(*)::int AS n FROM payment WHERE order_id = $1', [orderId]);
      expect(rows[0].n).toBe(0);
    }));
});
