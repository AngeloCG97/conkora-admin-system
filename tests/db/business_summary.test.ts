import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import {
  insertCustomer, insertExpense, insertOrder, insertOrderItem, insertPayment, insertTrip, setGlobalRate,
} from '../helpers/fixtures.ts';

type Db = Parameters<Parameters<typeof withRollback>[0]>[0];
const business = async (db: Db) => (await db.query('SELECT * FROM business_summary')).rows;

const COLUMNS = [
  'order_count', 'income_usd', 'collected_usd', 'pending_usd',
  'expenses_usd', 'personal_expenses_usd', 'business_expenses_usd', 'profit_usd',
] as const;

/** Σ trip_summary + no_trip_summary, column by column. */
async function sumOfReports(db: Db) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS.join(', ')} FROM trip_summary UNION ALL SELECT ${COLUMNS.join(', ')} FROM no_trip_summary`,
  );
  return Object.fromEntries(
    COLUMNS.map((c) => [c, Math.round(rows.reduce((acc, r) => acc + Number(r[c]), 0) * 100) / 100]),
  );
}

/** Empties every Viaje, Pedido and Gasto inside the rolled-back transaction. */
async function clearAll(db: Db) {
  await db.query('DELETE FROM expense');
  await db.query('DELETE FROM "order"');
  await db.query('DELETE FROM trip_rate');
  await db.query('DELETE FROM trip');
}

describe('business_summary (Utilidad global)', () => {
  it('always returns exactly one row of zeros when there is no data', () => withRollback(async (db) => {
    await clearAll(db);
    expect(await business(db)).toEqual([
      {
        order_count: 0, income_usd: 0, collected_usd: 0, pending_usd: 0,
        expenses_usd: 0, personal_expenses_usd: 0, business_expenses_usd: 0, profit_usd: 0,
      },
    ]);
  }));

  it('equals trip_summary + no_trip_summary: every Viaje plus General, Gastos personales included, Cancelados excluded', () =>
    withRollback(async (db) => {
      await clearAll(db);
      await setGlobalRate(db, 'CRC', 500);
      const t1 = await insertTrip(db, { rates: { CRC: 400 } });
      const t2 = await insertTrip(db, { name: 'Viaje 2' });
      const customerId = await insertCustomer(db);

      // Viaje 1: $100 + 40000 CRC @400 = $100 → Ingreso $200, Abono $50
      const a = await insertOrder(db, { customerId, tripId: t1 });
      await insertOrderItem(db, { orderId: a, price: 100 });
      await insertPayment(db, { orderId: a, amount: 50 });
      const b = await insertOrder(db, { customerId, tripId: t1, currency: 'CRC' });
      await insertOrderItem(db, { orderId: b, price: 40000 });
      await insertExpense(db, { tripId: t1, amount: 60, category: 'merchandise' });
      await insertExpense(db, { tripId: t1, amount: 8000, currency: 'CRC', category: 'food', isPersonal: true }); // $20
      // Viaje 2: Ingreso $50, Gastos $80 (Utilidad negativa)
      const c = await insertOrder(db, { customerId, tripId: t2 });
      await insertOrderItem(db, { orderId: c, price: 50 });
      await insertExpense(db, { tripId: t2, amount: 80, category: 'fuel', isPersonal: true });
      // General: Ingreso 15000 CRC @500 = $30, Abono $30, Gasto $10
      const d = await insertOrder(db, { customerId, currency: 'CRC' });
      await insertOrderItem(db, { orderId: d, price: 15000 });
      await insertPayment(db, { orderId: d, amount: 30 });
      await insertExpense(db, { amount: 10 });
      // Cancelados (Viaje and General) do not count
      const x = await insertOrder(db, { customerId, tripId: t1, status: 'cancelled' });
      await insertOrderItem(db, { orderId: x, price: 999 });
      await insertPayment(db, { orderId: x, amount: 99 });
      const y = await insertOrder(db, { customerId, status: 'cancelled' });
      await insertOrderItem(db, { orderId: y, price: 888 });

      const [row] = await business(db);
      expect(row).toEqual({
        order_count: 4, income_usd: 280, collected_usd: 80, pending_usd: 200,
        expenses_usd: 170, personal_expenses_usd: 100, business_expenses_usd: 70, profit_usd: 110,
      });
      expect(row).toEqual(await sumOfReports(db));
    }));

  it('matches the sum of the reports with the existing data too', () => withRollback(async (db) => {
    const customerId = await insertCustomer(db);
    const o = await insertOrder(db, { customerId });
    await insertOrderItem(db, { orderId: o, price: 12.34 });
    await insertExpense(db, { amount: 1.11, isPersonal: true });
    const [row] = await business(db);
    expect(row).toEqual(await sumOfReports(db));
  }));
});
