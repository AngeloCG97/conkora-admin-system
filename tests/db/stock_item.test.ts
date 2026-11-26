import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import { env } from '../helpers/env.ts';
import {
  insertCustomer,
  insertExpense,
  insertOrder,
  insertOrderItem,
  insertRequest,
  insertRequestItem,
  insertStockItem,
  insertTrip,
  setGlobalRate,
} from '../helpers/fixtures.ts';

type Db = pg.ClientBase;

/** Sells from stock and returns the target Venta's id (the function returns SETOF "order"). */
async function sell(
  db: Db,
  { itemId, customerId, quantity = 1, price = 10000, today = '2026-03-01' as string | null }:
    { itemId: string; customerId: string; quantity?: number; price?: number; today?: string | null },
) {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM sell_stock_item($1, $2, $3, $4, $5)', [
    itemId, customerId, quantity, price, today,
  ]);
  expect(rows).toHaveLength(1);
  return rows[0].id;
}

async function stockOf(db: Db, itemId: string) {
  const { rows } = await db.query<{ quantity: number }>('SELECT quantity FROM stock_item WHERE id = $1', [itemId]);
  return rows[0]?.quantity;
}

async function itemsOf(db: Db, orderId: string) {
  const { rows } = await db.query(
    'SELECT name, price, quantity, size, description, photo_url FROM order_item WHERE order_id = $1 ORDER BY created_at, name',
    [orderId],
  );
  return rows;
}

async function stockSummary(db: Db) {
  return (await db.query('SELECT item_count, unit_count, stock_value_usd, stock_value_crc FROM stock_summary')).rows;
}

/** Empties Viajes, Ventas, Gastos and inventario inside the rolled-back transaction. */
async function clearAll(db: Db) {
  await db.query('DELETE FROM stock_item');
  await db.query('DELETE FROM expense');
  await db.query('DELETE FROM "order"');
  await db.query('DELETE FROM customer_request');
  await db.query('DELETE FROM trip_rate');
  await db.query('DELETE FROM trip');
}

describe('stock_item (Artículos de inventario)', () => {
  it('defaults to CRC and quantity 1; rejects negative price/quantity, blank name and unknown género', () =>
    withRollback(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO stock_item (name, price, gender) VALUES ('Camisa', 5000, 'women') RETURNING currency_code, quantity, trip_id`,
      );
      expect(rows[0]).toEqual({ currency_code: 'CRC', quantity: 1, trip_id: null });
      await db.query('SAVEPOINT s');
      for (const [sql, constraint] of [
        [`INSERT INTO stock_item (name, price, gender) VALUES ('X', -1, 'men')`, /stock_item_price_check/],
        [`INSERT INTO stock_item (name, price, gender, quantity) VALUES ('X', 1, 'men', -1)`, /stock_item_quantity_check/],
        [`INSERT INTO stock_item (name, price, gender) VALUES ('  ', 1, 'men')`, /stock_item_name_check/],
        [`INSERT INTO stock_item (name, price, gender) VALUES ('X', 1, 'kids')`, /stock_item_gender_fkey/],
      ] as const) {
        await expect(db.query(sql)).rejects.toThrow(constraint);
        await db.query('ROLLBACK TO SAVEPOINT s');
      }
    }));

  it('a Viaje with inventario cannot be deleted', () =>
    withRollback(async (db) => {
      const tripId = await insertTrip(db);
      await insertStockItem(db, { tripId });
      await expect(db.query('DELETE FROM trip WHERE id = $1', [tripId])).rejects.toThrow(/stock_item_trip_id_fkey/);
    }));
});

describe('stock_item_summary and stock_summary (Inventario disponible)', () => {
  it('converts each Artículo de inventario with its Viaje rate, or the global rate when General', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      await setGlobalRate(db, 'EUR', 0.8);
      const tripId = await insertTrip(db, { rates: { CRC: 400 } });
      const inTrip = await insertStockItem(db, { tripId, price: 10, currency: 'USD', quantity: 2 });
      const general = await insertStockItem(db, { price: 10, currency: 'USD', quantity: 1 });
      // EUR is not fixed by the Viaje: global EUR rate, Viaje CRC rate.
      const eur = await insertStockItem(db, { tripId, price: 8, currency: 'EUR', quantity: 3 });
      const { rows } = await db.query(
        `SELECT stock_item_id, price_usd, price_crc, stock_value, stock_value_usd, stock_value_crc
         FROM stock_item_summary WHERE stock_item_id = ANY($1) ORDER BY stock_value_crc`,
        [[inTrip, general, eur]],
      );
      expect(rows).toEqual([
        { stock_item_id: general, price_usd: 10, price_crc: 5000, stock_value: 10, stock_value_usd: 10, stock_value_crc: 5000 },
        { stock_item_id: inTrip, price_usd: 10, price_crc: 4000, stock_value: 20, stock_value_usd: 20, stock_value_crc: 8000 },
        { stock_item_id: eur, price_usd: 10, price_crc: 4000, stock_value: 24, stock_value_usd: 30, stock_value_crc: 12000 },
      ]);
    }));

  it('is one row of zeros when there is no inventario', () =>
    withRollback(async (db) => {
      await clearAll(db);
      expect(await stockSummary(db)).toEqual([{ item_count: 0, unit_count: 0, stock_value_usd: 0, stock_value_crc: 0 }]);
    }));

  it('sums only Artículos with cantidad > 0 (Agotados excluded), rounded per Artículo', () =>
    withRollback(async (db) => {
      await clearAll(db);
      await setGlobalRate(db, 'CRC', 3000);
      // ₡1000 / 3000 = $0.3333… → $0.33 each: the total is $0.99 (sum of rounded rows), not $1.00.
      for (const name of ['A', 'B', 'C']) await insertStockItem(db, { name, price: 1000, currency: 'CRC', quantity: 1 });
      await insertStockItem(db, { name: 'Agotado', price: 999999, currency: 'CRC', quantity: 0 });
      expect(await stockSummary(db)).toEqual([{ item_count: 3, unit_count: 3, stock_value_usd: 0.99, stock_value_crc: 3000 }]);
    }));
});

describe('projected_profit_summary (Utilidad proyectada)', () => {
  it('= Utilidad global (business_summary) + Inventario disponible, in USD and CRC', () =>
    withRollback(async (db) => {
      await clearAll(db);
      await setGlobalRate(db, 'CRC', 500);
      const tripId = await insertTrip(db, { rates: { CRC: 400 } });
      const customerId = await insertCustomer(db);
      await insertOrderItem(db, { orderId: await insertOrder(db, { customerId, currency: 'USD' }), price: 100 });
      await insertExpense(db, { amount: 30, currency: 'USD' });
      await insertStockItem(db, { price: 10, currency: 'USD', quantity: 2 }); // $20, ₡10 000 (global)
      await insertStockItem(db, { tripId, price: 10, currency: 'USD', quantity: 1 }); // $10, ₡4 000 (Viaje)
      await insertStockItem(db, { price: 50, currency: 'USD', quantity: 0 }); // Agotado: excluded

      const { rows: [business] } = await db.query('SELECT profit_usd, profit_crc FROM business_summary');
      expect(business).toEqual({ profit_usd: 70, profit_crc: 35000 });
      const { rows } = await db.query('SELECT * FROM projected_profit_summary');
      expect(rows).toEqual([
        {
          profit_usd: 70,
          stock_value_usd: 30,
          projected_profit_usd: 100,
          profit_crc: 35000,
          stock_value_crc: 14000,
          projected_profit_crc: 49000,
        },
      ]);
    }));

  it('is one row of zeros when there is nothing', () =>
    withRollback(async (db) => {
      await clearAll(db);
      const { rows } = await db.query('SELECT * FROM projected_profit_summary');
      expect(rows).toEqual([
        { profit_usd: 0, stock_value_usd: 0, projected_profit_usd: 0, profit_crc: 0, stock_value_crc: 0, projected_profit_crc: 0 },
      ]);
    }));

  it('a negative Utilidad global plus inventario can still be negative', () =>
    withRollback(async (db) => {
      await clearAll(db);
      await setGlobalRate(db, 'CRC', 500);
      await insertExpense(db, { amount: 100, currency: 'USD' });
      await insertStockItem(db, { price: 10000, currency: 'CRC', quantity: 1 }); // $20
      const { rows } = await db.query('SELECT projected_profit_usd, projected_profit_crc FROM projected_profit_summary');
      expect(rows[0]).toEqual({ projected_profit_usd: -80, projected_profit_crc: -40000 });
    }));
});

describe('sell_stock_item (Vender desde inventario)', () => {
  it('adds the units to the most recent Pendiente Venta of the Cliente in the same Viaje and decrements the stock', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      const otherCustomer = await insertCustomer(db, { name: 'Otro' });
      const tripId = await insertTrip(db);
      const otherTrip = await insertTrip(db, { name: 'Otro Viaje' });
      const older = await insertOrder(db, { customerId, tripId, date: '2026-01-10' });
      const target = await insertOrder(db, { customerId, tripId, currency: 'USD', date: '2026-01-20' });
      // Newer, but not eligible: delivered, cancelled, General, another Viaje, another Cliente.
      await insertOrder(db, { customerId, tripId, status: 'delivered', date: '2026-02-01' });
      await insertOrder(db, { customerId, tripId, status: 'cancelled', date: '2026-02-02' });
      await insertOrder(db, { customerId, date: '2026-02-03' });
      await insertOrder(db, { customerId, tripId: otherTrip, date: '2026-02-04' });
      await insertOrder(db, { customerId: otherCustomer, tripId, date: '2026-02-05' });

      const itemId = await insertStockItem(db, {
        tripId,
        name: 'Tenis Nike',
        size: '42',
        description: 'Blancos',
        photoUrl: 'https://res.cloudinary.com/demo/image/upload/tenis.jpg',
        price: 90,
        currency: 'USD',
        quantity: 5,
      });

      expect(await sell(db, { itemId, customerId, quantity: 2, price: 85.5 })).toBe(target);
      expect(await itemsOf(db, target)).toEqual([
        {
          name: 'Tenis Nike',
          price: 85.5,
          quantity: 2,
          size: '42',
          description: 'Blancos',
          photo_url: 'https://res.cloudinary.com/demo/image/upload/tenis.jpg',
        },
      ]);
      expect(await itemsOf(db, older)).toEqual([]);
      expect(await stockOf(db, itemId)).toBe(3);
    }));

  it('a General Artículo de inventario goes to the General Pendiente Venta, never to one of a Viaje', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      const tripId = await insertTrip(db);
      await insertOrder(db, { customerId, tripId, date: '2026-02-01' });
      const general = await insertOrder(db, { customerId, currency: 'CRC', date: '2026-01-01' });
      const itemId = await insertStockItem(db, { quantity: 1 });
      expect(await sell(db, { itemId, customerId, price: 15000 })).toBe(general);
      expect((await itemsOf(db, general))[0]).toMatchObject({ price: 15000, quantity: 1 });
      // Selling the last unit leaves it Agotado (kept as history), not deleted.
      expect(await stockOf(db, itemId)).toBe(0);
    }));

  it('without a Pendiente Venta it creates one in CRC for the Cliente and Viaje, dated `today`', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      const tripId = await insertTrip(db);
      const delivered = await insertOrder(db, { customerId, tripId, status: 'delivered' });
      await insertOrder(db, { customerId, tripId, status: 'cancelled' });
      const itemId = await insertStockItem(db, { tripId, name: 'Bolso', price: 20, currency: 'USD', quantity: 4 });

      const created = await sell(db, { itemId, customerId, quantity: 3, price: 0, today: '2026-03-15' });
      expect(created).not.toBe(delivered);
      const { rows } = await db.query(
        `SELECT customer_id, trip_id, currency_code, status, to_char(date, 'YYYY-MM-DD') AS date FROM "order" WHERE id = $1`,
        [created],
      );
      expect(rows[0]).toEqual({ customer_id: customerId, trip_id: tripId, currency_code: 'CRC', status: 'pending', date: '2026-03-15' });
      expect(await itemsOf(db, created)).toEqual([
        { name: 'Bolso', price: 0, quantity: 3, size: null, description: null, photo_url: null },
      ]);
      expect(await stockOf(db, itemId)).toBe(1);
    }));

  it('a second sale reuses the Venta it created (also with Mover a Venta); a null `today` uses the server date', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      const itemId = await insertStockItem(db, { quantity: 5 });
      const first = await sell(db, { itemId, customerId, today: null });
      const second = await sell(db, { itemId, customerId, quantity: 2, today: null });
      expect(second).toBe(first);
      const { rows: [moved] } = await db.query<{ id: string }>('SELECT id FROM move_request_item_to_order($1, 1, NULL)', [
        await insertRequestItem(db, { requestId: await insertRequest(db, { customerId }) }),
      ]);
      expect(moved.id).toBe(first);
      expect((await itemsOf(db, first)).map((i) => i.quantity)).toEqual([1, 2, 1]);
      const { rows } = await db.query('SELECT date = CURRENT_DATE AS today, trip_id FROM "order" WHERE id = $1', [first]);
      expect(rows[0]).toEqual({ today: true, trip_id: null });
      expect(await stockOf(db, itemId)).toBe(2);
    }));

  it('rejects a quantity greater than the stock', () =>
    withRollback(async (db) => {
      const itemId = await insertStockItem(db, { quantity: 2 });
      await expect(sell(db, { itemId, customerId: await insertCustomer(db), quantity: 3 })).rejects.toThrow(
        'Solo quedan 2 en inventario',
      );
    }));

  it('rejects selling an Agotado Artículo', () =>
    withRollback(async (db) => {
      const itemId = await insertStockItem(db, { quantity: 0 });
      await expect(sell(db, { itemId, customerId: await insertCustomer(db) })).rejects.toThrow(
        'El Artículo de inventario está agotado',
      );
    }));

  it('rejects a quantity of 0', () =>
    withRollback(async (db) => {
      const itemId = await insertStockItem(db, { quantity: 2 });
      await expect(sell(db, { itemId, customerId: await insertCustomer(db), quantity: 0 })).rejects.toThrow(
        'La cantidad debe ser un número entero mayor que 0',
      );
    }));

  it('rejects a negative quantity', () =>
    withRollback(async (db) => {
      const itemId = await insertStockItem(db, { quantity: 2 });
      await expect(sell(db, { itemId, customerId: await insertCustomer(db), quantity: -1 })).rejects.toThrow(
        'La cantidad debe ser un número entero mayor que 0',
      );
    }));

  it('rejects a negative price', () =>
    withRollback(async (db) => {
      const itemId = await insertStockItem(db, { quantity: 2 });
      await expect(sell(db, { itemId, customerId: await insertCustomer(db), price: -1 })).rejects.toThrow(
        'El precio debe ser mayor o igual a 0',
      );
    }));

  it('fails with a clear message for an unknown Artículo de inventario', () =>
    withRollback(async (db) => {
      await expect(
        sell(db, { itemId: '00000000-0000-0000-0000-000000000000', customerId: await insertCustomer(db) }),
      ).rejects.toThrow('El Artículo de inventario no existe');
    }));

  it('fails with a clear message for an unknown Cliente', () =>
    withRollback(async (db) => {
      const itemId = await insertStockItem(db, { quantity: 2 });
      await expect(sell(db, { itemId, customerId: '00000000-0000-0000-0000-000000000000' })).rejects.toThrow(
        'El Cliente no existe',
      );
    }));
});

describe('sell_stock_item under concurrency (committed data)', () => {
  // Two real sessions selling the same Artículo at the same time must never oversell, and must not create two
  // Ventas. These rows are committed, so they are cleaned up explicitly.
  const NAME = 'Cliente de prueba inventario concurrente';
  const ITEM = 'Artículo de prueba inventario concurrente';
  const a = new pg.Client({ connectionString: env.databaseUrl });
  const b = new pg.Client({ connectionString: env.databaseUrl });

  afterAll(async () => {
    await a.query(`DELETE FROM "order" WHERE customer_id IN (SELECT id FROM customer WHERE name = $1)`, [NAME]);
    await a.query('DELETE FROM stock_item WHERE name = $1', [ITEM]);
    await a.query('DELETE FROM customer WHERE name = $1', [NAME]);
    await Promise.all([a.end(), b.end()]);
  });

  it('serializes simultaneous sales: the second sees the decremented stock', async () => {
    await Promise.all([a.connect(), b.connect()]);
    const { rows: [customer] } = await a.query<{ id: string }>('INSERT INTO customer (name) VALUES ($1) RETURNING id', [NAME]);
    const { rows: [item] } = await a.query<{ id: string }>(
      `INSERT INTO stock_item (name, price, gender, quantity) VALUES ($1, 1000, 'unisex', 3) RETURNING id`,
      [ITEM],
    );
    const args = (quantity: number) => ({ itemId: item.id, customerId: customer.id, quantity });

    // A holds its transaction open after selling 2, so B (wanting 2) waits for the row lock, then sees only 1 left.
    await a.query('BEGIN');
    const fromA = await sell(a, args(2));
    const pendingB = sell(b, args(2));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await a.query('COMMIT');
    await expect(pendingB).rejects.toThrow('Solo queda 1 en inventario');

    // Two sales of the last unit at once: exactly one wins.
    const results = await Promise.allSettled([sell(a, args(1)), sell(b, args(1))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/agotado/);
    expect((results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<string>).value).toBe(fromA);

    const { rows: [left] } = await a.query('SELECT quantity FROM stock_item WHERE id = $1', [item.id]);
    expect(left.quantity).toBe(0);
    const { rows } = await a.query<{ count: number; units: number }>(
      `SELECT count(DISTINCT o.id)::int AS count, sum(i.quantity)::int AS units
       FROM "order" o JOIN order_item i ON i.order_id = o.id WHERE o.customer_id = $1`,
      [customer.id],
    );
    expect(rows[0]).toEqual({ count: 1, units: 3 });
  });
});
