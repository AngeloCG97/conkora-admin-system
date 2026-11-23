import type pg from 'pg';

/**
 * Fixture builders for SQL tests (use inside `withRollback`). Each returns the new row's id.
 * Later slices add builders here (customer, order, order_item, payment) so view tests stay short.
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

/** Inserts a Gasto. `tripId` null/omitted = Personal. */
export async function insertExpense(
  db: pg.PoolClient,
  {
    tripId = null as string | null,
    amount,
    currency = 'USD',
    category = 'other',
  }: { tripId?: string | null; amount: number; currency?: string; category?: string },
) {
  const { rows: [expense] } = await db.query<{ id: string }>(
    `INSERT INTO expense (trip_id, category, description, amount, currency_code, date)
     VALUES ($1, $2, 'Gasto', $3, $4, '2026-01-11') RETURNING id`,
    [tripId, category, amount, currency],
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
