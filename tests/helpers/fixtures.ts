import type pg from 'pg';

/**
 * Fixture builders for SQL tests (use inside `withRollback`). Each returns the new row's id.
 * Later slices add builders here so view tests stay short.
 */

/** Inserts a Viaje, optionally with its own exchange rates (`{ CRC: 510 }`, units per 1 USD). */
export async function insertTrip(db: pg.PoolClient, { rates = {} as Record<string, number>, name = 'Viaje' } = {}) {
  const { rows: [trip] } = await db.query<{ id: string }>(
    `INSERT INTO trip (name, destination, start_date, end_date) VALUES ($1, 'Miami', '2026-01-10', '2026-01-15') RETURNING id`,
    [name],
  );
  for (const [code, rate] of Object.entries(rates)) {
    await db.query('INSERT INTO trip_rate (trip_id, currency_code, rate) VALUES ($1, $2, $3)', [trip.id, code, rate]);
  }
  return trip.id;
}

/** Sets a currency's global rate (creating the currency if needed). Rolled back with the test. */
export async function setGlobalRate(db: pg.PoolClient, code: string, rate: number) {
  await db.query(
    `INSERT INTO currency (code, name, symbol, global_rate) VALUES ($1, $1, $1, $2)
     ON CONFLICT (code) DO UPDATE SET global_rate = EXCLUDED.global_rate`,
    [code, rate],
  );
}

/** Inserts a Gasto. `tripId` null/omitted = General; `isPersonal` marks a Gasto personal. */
export async function insertExpense(
  db: pg.PoolClient,
  {
    tripId = null as string | null,
    amount,
    currency = 'USD',
    category = 'other',
    isPersonal = false,
  }: { tripId?: string | null; amount: number; currency?: string; category?: string; isPersonal?: boolean },
) {
  const { rows: [expense] } = await db.query<{ id: string }>(
    `INSERT INTO expense (trip_id, category, description, amount, currency_code, date, is_personal)
     VALUES ($1, $2, 'Gasto', $3, $4, '2026-01-11', $5) RETURNING id`,
    [tripId, category, amount, currency, isPersonal],
  );
  return expense.id;
}

/** Inserts a Cliente. */
export async function insertCustomer(db: pg.PoolClient, { name = 'Cliente', phone = null as string | null } = {}) {
  const { rows: [customer] } = await db.query<{ id: string }>(
    'INSERT INTO customer (name, phone) VALUES ($1, $2) RETURNING id',
    [name, phone],
  );
  return customer.id;
}

/** Inserts a Venta. `tripId` null/omitted = General. Add Artículos with `insertOrderItem`. */
export async function insertOrder(
  db: pg.PoolClient,
  {
    customerId,
    tripId = null as string | null,
    currency = 'USD',
    status = 'pending',
    date = '2026-01-12',
  }: { customerId: string; tripId?: string | null; currency?: string; status?: string; date?: string },
) {
  const { rows: [order] } = await db.query<{ id: string }>(
    `INSERT INTO "order" (customer_id, trip_id, currency_code, status, date)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [customerId, tripId, currency, status, date],
  );
  return order.id;
}

/** Inserts a Artículo of a Venta (price in the Venta's currency). */
export async function insertOrderItem(
  db: pg.PoolClient,
  { orderId, price, quantity = 1, name = 'Artículo' }: { orderId: string; price: number; quantity?: number; name?: string },
) {
  const { rows: [item] } = await db.query<{ id: string }>(
    'INSERT INTO order_item (order_id, name, price, quantity) VALUES ($1, $2, $3, $4) RETURNING id',
    [orderId, name, price, quantity],
  );
  return item.id;
}

/** Inserts an Abono of a Venta, in its own currency (converted to the Venta's currency by `order_summary`). */
export async function insertPayment(
  db: pg.PoolClient,
  { orderId, amount, currency = 'USD' }: { orderId: string; amount: number; currency?: string },
) {
  const { rows: [payment] } = await db.query<{ id: string }>(
    `INSERT INTO payment (order_id, amount, currency_code, date) VALUES ($1, $2, $3, '2026-01-13') RETURNING id`,
    [orderId, amount, currency],
  );
  return payment.id;
}

/** Inserts a Pedido (a Cliente's request). `tripId` null/omitted = General. Add Artículos with `insertRequestItem`. */
export async function insertRequest(
  db: pg.PoolClient,
  { customerId, tripId = null as string | null }: { customerId: string; tripId?: string | null },
) {
  const { rows: [request] } = await db.query<{ id: string }>(
    `INSERT INTO customer_request (customer_id, trip_id, date) VALUES ($1, $2, '2026-01-12') RETURNING id`,
    [customerId, tripId],
  );
  return request.id;
}

/** Inserts an Artículo of a Pedido (no price until it is moved to a Venta). */
export async function insertRequestItem(
  db: pg.PoolClient,
  {
    requestId,
    name = 'Artículo pedido',
    size = null as string | null,
    description = null as string | null,
    photoUrl = null as string | null,
  }: { requestId: string; name?: string; size?: string | null; description?: string | null; photoUrl?: string | null },
) {
  const { rows: [item] } = await db.query<{ id: string }>(
    `INSERT INTO customer_request_item (request_id, name, size, description, photo_url) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [requestId, name, size, description, photoUrl],
  );
  return item.id;
}

/** Inserts an Artículo de inventario (unit sale price in `currency`). `tripId` null/omitted = General. */
export async function insertStockItem(
  db: pg.PoolClient,
  {
    tripId = null as string | null,
    name = 'Artículo de inventario',
    price = 10000,
    currency = 'CRC',
    quantity = 1,
    gender = 'unisex',
    size = null as string | null,
    description = null as string | null,
    photoUrl = null as string | null,
  }: {
    tripId?: string | null;
    name?: string;
    price?: number;
    currency?: string;
    quantity?: number;
    gender?: string;
    size?: string | null;
    description?: string | null;
    photoUrl?: string | null;
  } = {},
) {
  const { rows: [item] } = await db.query<{ id: string }>(
    `INSERT INTO stock_item (trip_id, name, price, currency_code, quantity, gender, size, description, photo_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [tripId, name, price, currency, quantity, gender, size, description, photoUrl],
  );
  return item.id;
}
