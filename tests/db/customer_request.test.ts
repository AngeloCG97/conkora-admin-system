import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import { env } from '../helpers/env.ts';
import {
  insertCustomer,
  insertOrder,
  insertRequest,
  insertRequestItem,
  insertTrip,
} from '../helpers/fixtures.ts';

/** Moves a Pedido Artículo and returns the target Venta's id (the function returns SETOF "order"). */
async function move(db: pg.ClientBase, itemId: string, price: number, today: string | null = '2026-03-01') {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM move_request_item_to_order($1, $2, $3)', [itemId, price, today]);
  expect(rows).toHaveLength(1);
  return rows[0].id;
}

async function itemsOf(db: pg.ClientBase, orderId: string) {
  const { rows } = await db.query(
    'SELECT name, price, quantity, size, description, photo_url FROM order_item WHERE order_id = $1 ORDER BY name',
    [orderId],
  );
  return rows;
}

async function requestItemExists(db: pg.ClientBase, itemId: string) {
  const { rows } = await db.query('SELECT 1 FROM customer_request_item WHERE id = $1', [itemId]);
  return rows.length === 1;
}

describe('customer_request and customer_request_item (Pedidos)', () => {
  it('deleting a Pedido deletes its Artículos', () =>
    withRollback(async (db) => {
      const requestId = await insertRequest(db, { customerId: await insertCustomer(db) });
      const itemId = await insertRequestItem(db, { requestId });
      await db.query('DELETE FROM customer_request WHERE id = $1', [requestId]);
      expect(await requestItemExists(db, itemId)).toBe(false);
    }));

  it('a Cliente with Pedidos cannot be deleted', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      await insertRequest(db, { customerId });
      await expect(db.query('DELETE FROM customer WHERE id = $1', [customerId])).rejects.toThrow(/customer_request_customer_id_fkey/);
    }));

  it('a Viaje with Pedidos cannot be deleted', () =>
    withRollback(async (db) => {
      const tripId = await insertTrip(db);
      await insertRequest(db, { customerId: await insertCustomer(db), tripId });
      await expect(db.query('DELETE FROM trip WHERE id = $1', [tripId])).rejects.toThrow(/customer_request_trip_id_fkey/);
    }));

  it('rejects a blank Artículo name', () =>
    withRollback(async (db) => {
      const requestId = await insertRequest(db, { customerId: await insertCustomer(db) });
      await expect(insertRequestItem(db, { requestId, name: '   ' })).rejects.toThrow(/customer_request_item_name_check/);
    }));
});

describe('move_request_item_to_order (Mover a Venta)', () => {
  it('adds the Artículo to the most recent Pendiente Venta of the same Cliente and Viaje, then deletes it from the Pedido', () =>
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

      const requestId = await insertRequest(db, { customerId, tripId });
      const itemId = await insertRequestItem(db, {
        requestId,
        name: 'Tenis Nike',
        size: '42',
        description: 'Blancos, suela gruesa',
        photoUrl: 'https://res.cloudinary.com/demo/image/upload/tenis.jpg',
      });
      const keep = await insertRequestItem(db, { requestId, name: 'Otro' });

      expect(await move(db, itemId, 85.5)).toBe(target);
      expect(await itemsOf(db, target)).toEqual([
        {
          name: 'Tenis Nike',
          price: 85.5,
          quantity: 1,
          size: '42',
          description: 'Blancos, suela gruesa',
          photo_url: 'https://res.cloudinary.com/demo/image/upload/tenis.jpg',
        },
      ]);
      expect(await itemsOf(db, older)).toEqual([]);
      expect(await requestItemExists(db, itemId)).toBe(false);
      // The Pedido and its other Artículos stay.
      expect(await requestItemExists(db, keep)).toBe(true);
    }));

  it('a General Pedido goes to the General Pendiente Venta, never to one of a Viaje', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      const tripId = await insertTrip(db);
      await insertOrder(db, { customerId, tripId, date: '2026-02-01' });
      const general = await insertOrder(db, { customerId, currency: 'CRC', date: '2026-01-01' });
      const itemId = await insertRequestItem(db, { requestId: await insertRequest(db, { customerId }) });
      expect(await move(db, itemId, 15000)).toBe(general);
      expect((await itemsOf(db, general))[0]).toMatchObject({ price: 15000, quantity: 1 });
    }));

  it('without a Pendiente Venta it creates one in CRC for the Cliente and Viaje, dated `today`', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      const tripId = await insertTrip(db);
      const delivered = await insertOrder(db, { customerId, tripId, status: 'delivered' });
      const itemId = await insertRequestItem(db, { requestId: await insertRequest(db, { customerId, tripId }), name: 'Bolso' });

      const created = await move(db, itemId, 0, '2026-03-15');
      expect(created).not.toBe(delivered);
      const { rows } = await db.query(
        `SELECT customer_id, trip_id, currency_code, status, to_char(date, 'YYYY-MM-DD') AS date FROM "order" WHERE id = $1`,
        [created],
      );
      expect(rows[0]).toEqual({ customer_id: customerId, trip_id: tripId, currency_code: 'CRC', status: 'pending', date: '2026-03-15' });
      expect(await itemsOf(db, created)).toEqual([
        { name: 'Bolso', price: 0, quantity: 1, size: null, description: null, photo_url: null },
      ]);
    }));

  it('a second move to the same Cliente and Viaje reuses the Venta it created; a null `today` uses the server date', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      const requestId = await insertRequest(db, { customerId });
      const first = await move(db, await insertRequestItem(db, { requestId, name: 'A' }), 1000, null);
      const second = await move(db, await insertRequestItem(db, { requestId, name: 'B' }), 2000, null);
      expect(second).toBe(first);
      expect((await itemsOf(db, first)).map((i) => i.name)).toEqual(['A', 'B']);
      const { rows } = await db.query('SELECT date = CURRENT_DATE AS today, trip_id FROM "order" WHERE id = $1', [first]);
      expect(rows[0]).toEqual({ today: true, trip_id: null });
    }));

  it('fails with a clear message for an unknown (or already moved) Artículo', () =>
    withRollback(async (db) => {
      await expect(move(db, '00000000-0000-0000-0000-000000000000', 10)).rejects.toThrow(
        'El Artículo del Pedido no existe o ya se movió a una Venta',
      );
    }));

  it('rejects a negative price without touching anything', () =>
    withRollback(async (db) => {
      const customerId = await insertCustomer(db);
      const itemId = await insertRequestItem(db, { requestId: await insertRequest(db, { customerId }) });
      await expect(move(db, itemId, -1)).rejects.toThrow('El precio debe ser mayor o igual a 0');
    }));
});

describe('move_request_item_to_order under concurrency (committed data)', () => {
  // Two real sessions moving at the same time must not create two Ventas, and a double click on the same
  // Artículo moves it once. These rows are committed, so they are cleaned up explicitly.
  const NAME = 'Cliente de prueba mover concurrente';
  const a = new pg.Client({ connectionString: env.databaseUrl });
  const b = new pg.Client({ connectionString: env.databaseUrl });

  afterAll(async () => {
    await a.query(
      `DELETE FROM "order" WHERE customer_id IN (SELECT id FROM customer WHERE name = $1)`,
      [NAME],
    );
    await a.query(
      'DELETE FROM customer_request WHERE customer_id IN (SELECT id FROM customer WHERE name = $1)',
      [NAME],
    );
    await a.query('DELETE FROM customer WHERE name = $1', [NAME]);
    await Promise.all([a.end(), b.end()]);
  });

  it('serializes simultaneous moves for the same Cliente and Viaje', async () => {
    await Promise.all([a.connect(), b.connect()]);
    const { rows: [customer] } = await a.query<{ id: string }>('INSERT INTO customer (name) VALUES ($1) RETURNING id', [NAME]);
    const newRequest = async () =>
      (await a.query<{ id: string }>(
        `INSERT INTO customer_request (customer_id, date) VALUES ($1, '2026-01-12') RETURNING id`,
        [customer.id],
      )).rows[0].id;
    const newItem = async (requestId: string) =>
      (await a.query<{ id: string }>(
        `INSERT INTO customer_request_item (request_id, name) VALUES ($1, 'x') RETURNING id`,
        [requestId],
      )).rows[0].id;
    // Two Artículos in two different Pedidos of the same Cliente (General), plus one clicked twice.
    const item1 = await newItem(await newRequest());
    const item2 = await newItem(await newRequest());
    const twice = await newItem(await newRequest());

    // Session A holds its transaction open after moving, so B must wait for the lock and then see A's Venta.
    await a.query('BEGIN');
    const fromA = await move(a, item1, 10);
    const pendingB = move(b, item2, 20);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await a.query('COMMIT');
    expect(await pendingB).toBe(fromA);

    const results = await Promise.allSettled([move(a, twice, 5), move(b, twice, 5)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/ya se movió/);

    const { rows } = await a.query<{ count: number; items: number }>(
      `SELECT count(*)::int AS count, sum((SELECT count(*) FROM order_item i WHERE i.order_id = o.id))::int AS items
       FROM "order" o WHERE customer_id = $1`,
      [customer.id],
    );
    expect(rows[0]).toEqual({ count: 1, items: 3 });
  });
});
