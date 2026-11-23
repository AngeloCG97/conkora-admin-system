import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import {
  insertCustomer, insertExpense, insertOrder, insertOrderItem, insertPayment, insertTrip, setGlobalRate,
} from '../helpers/fixtures.ts';

const summary = async (db: Parameters<Parameters<typeof withRollback>[0]>[0], tripId: string) =>
  (await db.query('SELECT * FROM trip_summary WHERE trip_id = $1', [tripId])).rows[0];

describe('trip_summary and trip_expense_category_summary', () => {
  it('Viaje sin Pedidos ni Gastos da todo en 0', () => withRollback(async (db) => {
    const tripId = await insertTrip(db);
    expect(await summary(db, tripId)).toEqual({
      trip_id: tripId, order_count: 0, income_usd: 0, collected_usd: 0, pending_usd: 0, expenses_usd: 0, profit_usd: 0,
      personal_expenses_usd: 0, business_expenses_usd: 0,
    });
    const cats = await db.query('SELECT * FROM trip_expense_category_summary WHERE trip_id = $1', [tripId]);
    expect(cats.rows).toEqual([]);
  }));

  it('Utilidad = Ingreso - Gastos con Gastos en varias monedas y categorías; los Cancelados no cuentan', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 500);
    const tripId = await insertTrip(db, { rates: { CRC: 400 } });
    const customerId = await insertCustomer(db);

    const a = await insertOrder(db, { customerId, tripId });
    await insertOrderItem(db, { orderId: a, price: 100 });
    await insertPayment(db, { orderId: a, amount: 30 });
    // CRC con tipo del Viaje (400): 40000 = $100, abono 20000 = $50
    const b = await insertOrder(db, { customerId, tripId, currency: 'CRC' });
    await insertOrderItem(db, { orderId: b, price: 20000, quantity: 2 });
    await insertPayment(db, { orderId: b, amount: 20000, currency: 'CRC' });
    const x = await insertOrder(db, { customerId, tripId, status: 'cancelled' });
    await insertOrderItem(db, { orderId: x, price: 999 });
    await insertPayment(db, { orderId: x, amount: 500 });
    // Pedido General: no entra al Viaje
    const p = await insertOrder(db, { customerId });
    await insertOrderItem(db, { orderId: p, price: 777 });

    await insertExpense(db, { tripId, amount: 40, category: 'merchandise' });
    await insertExpense(db, { tripId, amount: 20000, currency: 'CRC', category: 'merchandise' }); // $50
    await insertExpense(db, { tripId, amount: 8000, currency: 'CRC', category: 'food' }); // $20
    await insertExpense(db, { amount: 1000 }); // General: no cuenta

    expect(await summary(db, tripId)).toEqual({
      trip_id: tripId, order_count: 2, income_usd: 200, collected_usd: 80, pending_usd: 120,
      expenses_usd: 110, profit_usd: 90, personal_expenses_usd: 0, business_expenses_usd: 110,
    });
    const { rows } = await db.query(
      'SELECT category, expense_count, total_usd FROM trip_expense_category_summary WHERE trip_id = $1 ORDER BY category',
      [tripId],
    );
    expect(rows).toEqual([
      { category: 'food', expense_count: 1, total_usd: 20 },
      { category: 'merchandise', expense_count: 2, total_usd: 90 },
    ]);
  }));

  it('la Utilidad puede ser negativa y cambiar el tipo de cambio del Viaje cambia el reporte', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 500);
    const tripId = await insertTrip(db);
    await insertExpense(db, { tripId, amount: 50000, currency: 'CRC' }); // $100 al tipo global
    expect((await summary(db, tripId)).expenses_usd).toBe(100);
    expect((await summary(db, tripId)).profit_usd).toBe(-100);
    await db.query(`INSERT INTO trip_rate (trip_id, currency_code, rate) VALUES ($1, 'CRC', 250)`, [tripId]);
    expect((await summary(db, tripId)).expenses_usd).toBe(200);
  }));

  it('los Gastos personales restan en la Utilidad y tienen su propio subtotal', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 500);
    const tripId = await insertTrip(db, { rates: { CRC: 400 } });
    const customerId = await insertCustomer(db);
    const o = await insertOrder(db, { customerId, tripId });
    await insertOrderItem(db, { orderId: o, price: 300 });

    await insertExpense(db, { tripId, amount: 100, category: 'merchandise' });
    await insertExpense(db, { tripId, amount: 12000, currency: 'CRC', category: 'food', isPersonal: true }); // $30
    await insertExpense(db, { tripId, amount: 20, category: 'fuel', isPersonal: true });
    await insertExpense(db, { amount: 500, isPersonal: true }); // General: no cuenta

    expect(await summary(db, tripId)).toMatchObject({
      income_usd: 300, expenses_usd: 150, personal_expenses_usd: 50, business_expenses_usd: 100, profit_usd: 150,
    });
    const { rows } = await db.query(
      'SELECT category, total_usd FROM trip_expense_category_summary WHERE trip_id = $1 ORDER BY category',
      [tripId],
    );
    expect(rows).toEqual([
      { category: 'food', total_usd: 30 },
      { category: 'fuel', total_usd: 20 },
      { category: 'merchandise', total_usd: 100 },
    ]);
  }));
});
