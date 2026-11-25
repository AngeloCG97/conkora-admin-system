import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import {
  insertCustomer, insertExpense, insertOrder, insertOrderItem, insertPayment, insertTrip, setGlobalRate,
} from '../helpers/fixtures.ts';

type Db = Parameters<Parameters<typeof withRollback>[0]>[0];
const summary = async (db: Db) => (await db.query('SELECT order_count, income_usd, collected_usd, pending_usd, expenses_usd, profit_usd, personal_expenses_usd, business_expenses_usd FROM no_trip_summary')).rows;

describe('no_trip_summary', () => {
  it('always returns exactly one row with numbers, never null', () => withRollback(async (db) => {
    await db.query(`DELETE FROM expense WHERE trip_id IS NULL`);
    await db.query(`DELETE FROM "order" WHERE trip_id IS NULL`);
    expect(await summary(db)).toEqual([
      { order_count: 0, income_usd: 0, collected_usd: 0, pending_usd: 0, expenses_usd: 0, profit_usd: 0,
        personal_expenses_usd: 0, business_expenses_usd: 0 },
    ]);
  }));

  it('sums General Pedidos and Gastos (no Viaje) in USD, excluding Cancelados and Viaje data', () => withRollback(async (db) => {
    await db.query(`DELETE FROM expense WHERE trip_id IS NULL`);
    await db.query(`DELETE FROM "order" WHERE trip_id IS NULL`);
    await setGlobalRate(db, 'CRC', 500);
    const tripId = await insertTrip(db, { rates: { CRC: 400 } });
    const customerId = await insertCustomer(db);

    const a = await insertOrder(db, { customerId });
    await insertOrderItem(db, { orderId: a, price: 100 });
    await insertPayment(db, { orderId: a, amount: 30 });
    // CRC with the global rate (500): 50000 = $100, Abono 10000 = $20
    const b = await insertOrder(db, { customerId, currency: 'CRC' });
    await insertOrderItem(db, { orderId: b, price: 25000, quantity: 2 });
    await insertPayment(db, { orderId: b, amount: 10000, currency: 'CRC' });
    const x = await insertOrder(db, { customerId, status: 'cancelled' });
    await insertOrderItem(db, { orderId: x, price: 999 });
    // Pedido with a Viaje does not count
    const t = await insertOrder(db, { customerId, tripId });
    await insertOrderItem(db, { orderId: t, price: 777 });

    await insertExpense(db, { amount: 40, isPersonal: true });
    await insertExpense(db, { amount: 10000, currency: 'CRC' }); // $20
    await insertExpense(db, { tripId, amount: 1000 }); // Viaje: does not count

    expect(await summary(db)).toEqual([
      { order_count: 2, income_usd: 200, collected_usd: 50, pending_usd: 150, expenses_usd: 60, profit_usd: 140,
        personal_expenses_usd: 40, business_expenses_usd: 20 },
    ]);
  }));

  it('Utilidad can be negative when Gastos exceed Ingreso', () => withRollback(async (db) => {
    await db.query(`DELETE FROM expense WHERE trip_id IS NULL`);
    await db.query(`DELETE FROM "order" WHERE trip_id IS NULL`);
    await insertExpense(db, { amount: 25 });
    expect(await summary(db)).toEqual([
      { order_count: 0, income_usd: 0, collected_usd: 0, pending_usd: 0, expenses_usd: 25, profit_usd: -25,
        personal_expenses_usd: 0, business_expenses_usd: 25 },
    ]);
  }));
});
