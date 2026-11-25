import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import {
  insertCustomer, insertExpense, insertOrder, insertOrderItem, insertPayment, insertTrip, setGlobalRate,
} from '../helpers/fixtures.ts';

type Db = Parameters<Parameters<typeof withRollback>[0]>[0];

/** Montos en colones (issue #30): *_crc next to every *_usd, with the effective rates of each record's Viaje. */

const expense = async (db: Db, id: string) =>
  (await db.query('SELECT amount_usd, amount_crc FROM expense_summary WHERE expense_id = $1', [id])).rows[0];

const TRIP_CRC = [
  'income_crc', 'collected_crc', 'pending_crc', 'expenses_crc', 'profit_crc', 'personal_expenses_crc', 'business_expenses_crc',
] as const;
const tripCrc = async (db: Db, tripId: string) =>
  (await db.query(`SELECT ${TRIP_CRC.join(', ')} FROM trip_summary WHERE trip_id = $1`, [tripId])).rows[0];
const noTripCrc = async (db: Db) => (await db.query(`SELECT ${TRIP_CRC.join(', ')} FROM no_trip_summary`)).rows[0];

const ZEROS = Object.fromEntries(TRIP_CRC.map((c) => [c, 0]));

/** Empties every Viaje, Pedido and Gasto inside the rolled-back transaction. */
async function clearAll(db: Db) {
  await db.query('DELETE FROM expense');
  await db.query('DELETE FROM "order"');
  await db.query('DELETE FROM trip_rate');
  await db.query('DELETE FROM trip');
}

describe('Gastos: amount_crc', () => {
  it('Gasto en USD dentro de un Viaje con tasa CRC propia → ₡ con la tasa del Viaje', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 500);
    const tripId = await insertTrip(db, { rates: { CRC: 520 } });
    const id = await insertExpense(db, { tripId, amount: 100 });
    expect(await expense(db, id)).toEqual({ amount_usd: 100, amount_crc: 52000 });
  }));

  it('Gasto General en CRC → $ con la tasa global y ₡ = el monto registrado', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 500);
    const id = await insertExpense(db, { amount: 25000, currency: 'CRC' });
    expect(await expense(db, id)).toEqual({ amount_usd: 50, amount_crc: 25000 });
  }));

  it('Gasto en CRC de un Viaje: ₡ queda exacto aunque la tasa tenga decimales', () => withRollback(async (db) => {
    const tripId = await insertTrip(db, { rates: { CRC: 512.345678 } });
    const id = await insertExpense(db, { tripId, amount: 1000.01, currency: 'CRC' });
    expect(await expense(db, id)).toEqual({ amount_usd: 1.95, amount_crc: 1000.01 });
  }));

  it('Viaje sin tasa CRC → usa la global', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 500);
    await setGlobalRate(db, 'EUR', 0.8);
    const tripId = await insertTrip(db, { rates: { EUR: 0.9 } });
    const id = await insertExpense(db, { tripId, amount: 10 });
    expect(await expense(db, id)).toEqual({ amount_usd: 10, amount_crc: 5000 });
  }));

  it('un monto en EUR → $ y ₡ (General con tasas globales; Viaje con las suyas)', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 500);
    await setGlobalRate(db, 'EUR', 0.8);
    const general = await insertExpense(db, { amount: 80, currency: 'EUR' });
    expect(await expense(db, general)).toEqual({ amount_usd: 100, amount_crc: 50000 });
    const tripId = await insertTrip(db, { rates: { CRC: 520, EUR: 0.9 } });
    const inTrip = await insertExpense(db, { tripId, amount: 45, currency: 'EUR' });
    expect(await expense(db, inTrip)).toEqual({ amount_usd: 50, amount_crc: 26000 });
  }));
});

describe('Pedidos, Artículos y Abonos: *_crc', () => {
  it('order_summary, order_item_summary y payment_summary dan ₡ y $ con las tasas del Viaje del Pedido', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      await setGlobalRate(db, 'EUR', 0.8);
      const tripId = await insertTrip(db, { rates: { CRC: 520 } });
      const customerId = await insertCustomer(db);
      const orderId = await insertOrder(db, { customerId, tripId, currency: 'EUR' });
      const itemId = await insertOrderItem(db, { orderId, price: 20, quantity: 2 }); // 40 EUR = $50 = ₡26000
      await insertOrderItem(db, { orderId, price: 8 }); // 8 EUR = $10 = ₡5200
      const usdPayment = await insertPayment(db, { orderId, amount: 10 }); // $10 = 8 EUR = ₡5200
      const crcPayment = await insertPayment(db, { orderId, amount: 10400, currency: 'CRC' }); // $20 = 16 EUR

      const { rows: [order] } = await db.query(
        `SELECT total, total_usd, total_crc, paid, paid_usd, paid_crc, balance, balance_usd, balance_crc
         FROM order_summary WHERE order_id = $1`,
        [orderId],
      );
      expect(order).toEqual({
        total: 48, total_usd: 60, total_crc: 31200,
        paid: 24, paid_usd: 30, paid_crc: 15600,
        balance: 24, balance_usd: 30, balance_crc: 15600,
      });

      const { rows: [item] } = await db.query(
        'SELECT order_id, currency_code, line_total, line_total_usd, line_total_crc FROM order_item_summary WHERE order_item_id = $1',
        [itemId],
      );
      expect(item).toEqual({ order_id: orderId, currency_code: 'EUR', line_total: 40, line_total_usd: 50, line_total_crc: 26000 });

      const { rows: payments } = await db.query(
        `SELECT payment_id, trip_id, currency_code, rate, order_currency_code, order_amount, amount_usd, amount_crc
         FROM payment_summary WHERE order_id = $1 ORDER BY amount_usd`,
        [orderId],
      );
      expect(payments).toEqual([
        { payment_id: usdPayment, trip_id: tripId, currency_code: 'USD', rate: 1, order_currency_code: 'EUR', order_amount: 8, amount_usd: 10, amount_crc: 5200 },
        { payment_id: crcPayment, trip_id: tripId, currency_code: 'CRC', rate: 520, order_currency_code: 'EUR', order_amount: 16, amount_usd: 20, amount_crc: 10400 },
      ]);
    }));

  it('Pedido en CRC: total_crc es su Total exacto; Pedido sin Artículos da ceros', () => withRollback(async (db) => {
    const tripId = await insertTrip(db, { rates: { CRC: 512.345678 } });
    const customerId = await insertCustomer(db);
    const crcOrder = await insertOrder(db, { customerId, tripId, currency: 'CRC' });
    await insertOrderItem(db, { orderId: crcOrder, price: 12345.67, quantity: 3 });
    const empty = await insertOrder(db, { customerId });
    const { rows } = await db.query(
      'SELECT order_id, total, total_crc, paid_crc, balance_crc FROM order_summary WHERE order_id = ANY($1) ORDER BY total DESC',
      [[crcOrder, empty]],
    );
    expect(rows).toEqual([
      { order_id: crcOrder, total: 37037.01, total_crc: 37037.01, paid_crc: 0, balance_crc: 37037.01 },
      { order_id: empty, total: 0, total_crc: 0, paid_crc: 0, balance_crc: 0 },
    ]);
  }));
});

describe('reportes: *_crc', () => {
  it('Viaje, General y Utilidad global vacíos dan ceros en ₡, nunca null', () => withRollback(async (db) => {
    await clearAll(db);
    const tripId = await insertTrip(db);
    const customerId = await insertCustomer(db);
    expect(await tripCrc(db, tripId)).toEqual(ZEROS);
    expect(await noTripCrc(db)).toEqual(ZEROS);
    const { rows: [business] } = await db.query(`SELECT ${TRIP_CRC.join(', ')} FROM business_summary`);
    expect(business).toEqual(ZEROS);
    const { rows: [customer] } = await db.query(
      'SELECT total_crc, paid_crc, balance_crc FROM customer_summary WHERE customer_id = $1',
      [customerId],
    );
    expect(customer).toEqual({ total_crc: 0, paid_crc: 0, balance_crc: 0 });
  }));

  it('el ₡ del reporte del Viaje es la suma de los ₡ de sus registros (Cancelados y General fuera)', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      await setGlobalRate(db, 'EUR', 0.8);
      const tripId = await insertTrip(db, { rates: { CRC: 512.345678 } });
      const customerId = await insertCustomer(db);

      const a = await insertOrder(db, { customerId, tripId, currency: 'CRC' });
      await insertOrderItem(db, { orderId: a, price: 10400, quantity: 2 });
      await insertPayment(db, { orderId: a, amount: 1.11 });
      await insertPayment(db, { orderId: a, amount: 7.77, currency: 'EUR' });
      const b = await insertOrder(db, { customerId, tripId });
      await insertOrderItem(db, { orderId: b, price: 33.33 });
      await insertPayment(db, { orderId: b, amount: 2.22 });
      const x = await insertOrder(db, { customerId, tripId, status: 'cancelled' });
      await insertOrderItem(db, { orderId: x, price: 999 });
      const general = await insertOrder(db, { customerId });
      await insertOrderItem(db, { orderId: general, price: 777 });

      await insertExpense(db, { tripId, amount: 1.11, category: 'merchandise' });
      await insertExpense(db, { tripId, amount: 2.22, category: 'merchandise' });
      await insertExpense(db, { tripId, amount: 45.67, currency: 'EUR', category: 'food', isPersonal: true });
      await insertExpense(db, { tripId, amount: 1000, currency: 'CRC', category: 'fuel', isPersonal: true });
      await insertExpense(db, { amount: 1000 }); // General: no cuenta

      const { rows: [orders] } = await db.query(
        `SELECT sum(total_crc) AS income, sum(paid_crc) AS collected, sum(balance_crc) AS pending
         FROM order_summary WHERE trip_id = $1 AND status <> 'cancelled'`,
        [tripId],
      );
      const { rows: [expenses] } = await db.query(
        `SELECT sum(amount_crc) AS total, sum(amount_crc) FILTER (WHERE is_personal) AS personal,
                sum(amount_crc) FILTER (WHERE NOT is_personal) AS business
         FROM expense_summary WHERE trip_id = $1`,
        [tripId],
      );
      const report = await tripCrc(db, tripId);
      expect(report).toEqual({
        income_crc: orders.income,
        collected_crc: orders.collected,
        pending_crc: orders.pending,
        expenses_crc: expenses.total,
        profit_crc: Math.round((orders.income - expenses.total) * 100) / 100,
        personal_expenses_crc: expenses.personal,
        business_expenses_crc: expenses.business,
      });
      // Concrete numbers: ₡ 1.11 → 568.70, 2.22 → 1137.41 (each rounded), 33.33 → 17076.48
      expect(report.income_crc).toBeCloseTo(37876.48, 2);
      expect(report.business_expenses_crc).toBeCloseTo(1706.11, 2);

      const { rows: cats } = await db.query(
        'SELECT category, total_usd, total_crc FROM trip_expense_category_summary WHERE trip_id = $1 ORDER BY category',
        [tripId],
      );
      const { rows: perCategory } = await db.query(
        `SELECT category, sum(amount_usd) AS total_usd, sum(amount_crc) AS total_crc
         FROM expense_summary WHERE trip_id = $1 GROUP BY category ORDER BY category`,
        [tripId],
      );
      expect(cats).toEqual(perCategory);
    }));

  it('Cuenta del Cliente y Utilidad global suman los ₡ de cada Pedido / reporte', () => withRollback(async (db) => {
    await clearAll(db);
    await setGlobalRate(db, 'CRC', 500);
    const t1 = await insertTrip(db, { rates: { CRC: 520 } });
    const t2 = await insertTrip(db, { name: 'Viaje 2' });
    const customerId = await insertCustomer(db);
    const a = await insertOrder(db, { customerId, tripId: t1 });
    await insertOrderItem(db, { orderId: a, price: 100 }); // ₡52000
    await insertPayment(db, { orderId: a, amount: 25 }); // ₡13000
    const b = await insertOrder(db, { customerId, tripId: t2, currency: 'CRC' });
    await insertOrderItem(db, { orderId: b, price: 30000 }); // ₡30000
    const c = await insertOrder(db, { customerId });
    await insertOrderItem(db, { orderId: c, price: 10 }); // General ₡5000
    await insertPayment(db, { orderId: c, amount: 2500, currency: 'CRC' });
    const x = await insertOrder(db, { customerId, tripId: t1, status: 'cancelled' });
    await insertOrderItem(db, { orderId: x, price: 999 });
    await insertExpense(db, { tripId: t1, amount: 40 }); // ₡20800
    await insertExpense(db, { tripId: t2, amount: 10, isPersonal: true }); // ₡5000
    await insertExpense(db, { amount: 1000, currency: 'CRC' }); // General

    const { rows: [account] } = await db.query(
      'SELECT order_count, total_crc, paid_crc, balance_crc FROM customer_summary WHERE customer_id = $1',
      [customerId],
    );
    expect(account).toEqual({ order_count: 3, total_crc: 87000, paid_crc: 15500, balance_crc: 71500 });
    const { rows: byTrip } = await db.query(
      'SELECT trip_id, total_crc, paid_crc, balance_crc FROM customer_trip_summary WHERE customer_id = $1',
      [customerId],
    );
    expect(byTrip.find((r) => r.trip_id === t1)).toEqual({ trip_id: t1, total_crc: 52000, paid_crc: 13000, balance_crc: 39000 });
    expect(byTrip.find((r) => r.trip_id === null)).toEqual({ trip_id: null, total_crc: 5000, paid_crc: 2500, balance_crc: 2500 });

    const { rows: [business] } = await db.query(`SELECT ${TRIP_CRC.join(', ')} FROM business_summary`);
    expect(business).toEqual({
      income_crc: 87000, collected_crc: 15500, pending_crc: 71500, expenses_crc: 26800, profit_crc: 60200,
      personal_expenses_crc: 5000, business_expenses_crc: 21800,
    });
    const { rows: reports } = await db.query(
      `SELECT ${TRIP_CRC.join(', ')} FROM trip_summary UNION ALL SELECT ${TRIP_CRC.join(', ')} FROM no_trip_summary`,
    );
    expect(business).toEqual(
      Object.fromEntries(TRIP_CRC.map((col) => [col, Math.round(reports.reduce((acc, r) => acc + r[col], 0) * 100) / 100])),
    );
  }));

  it('cambiar la tasa CRC del Viaje cambia su ₡ y no lo General', () => withRollback(async (db) => {
    await setGlobalRate(db, 'CRC', 500);
    const tripId = await insertTrip(db, { rates: { CRC: 520 } });
    const customerId = await insertCustomer(db);
    const inTrip = await insertExpense(db, { tripId, amount: 100 });
    const order = await insertOrder(db, { customerId, tripId });
    await insertOrderItem(db, { orderId: order, price: 10 });
    const general = await insertExpense(db, { amount: 100 });
    const before = await noTripCrc(db);

    await db.query(`UPDATE trip_rate SET rate = 600 WHERE trip_id = $1 AND currency_code = 'CRC'`, [tripId]);

    expect(await expense(db, inTrip)).toEqual({ amount_usd: 100, amount_crc: 60000 });
    expect(await tripCrc(db, tripId)).toMatchObject({ income_crc: 6000, expenses_crc: 60000, profit_crc: -54000 });
    expect(await expense(db, general)).toEqual({ amount_usd: 100, amount_crc: 50000 });
    expect(await noTripCrc(db)).toEqual(before);
  }));

  it('sin la moneda CRC las vistas no fallan y dan ₡ 0', () => withRollback(async (db) => {
    await clearAll(db);
    await db.query(`DELETE FROM payment WHERE currency_code = 'CRC'`);
    await db.query(`DELETE FROM currency WHERE code = 'CRC'`);
    const tripId = await insertTrip(db);
    const customerId = await insertCustomer(db);
    const orderId = await insertOrder(db, { customerId, tripId });
    await insertOrderItem(db, { orderId, price: 10 });
    await insertPayment(db, { orderId, amount: 5 });
    const id = await insertExpense(db, { tripId, amount: 10 });
    expect(await expense(db, id)).toEqual({ amount_usd: 10, amount_crc: 0 });
    expect(await tripCrc(db, tripId)).toEqual(ZEROS);
    const { rows: [order] } = await db.query('SELECT total_usd, total_crc, paid_crc, balance_crc FROM order_summary WHERE order_id = $1', [orderId]);
    expect(order).toEqual({ total_usd: 10, total_crc: 0, paid_crc: 0, balance_crc: 0 });
    const { rows: [payment] } = await db.query('SELECT amount_usd, amount_crc FROM payment_summary WHERE order_id = $1', [orderId]);
    expect(payment).toEqual({ amount_usd: 5, amount_crc: 0 });
  }));
});
