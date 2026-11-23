import pg from 'pg';
import { afterAll } from 'vitest';
import { env } from './env.ts';

const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 2 });
afterAll(() => pool.end());

// Return NUMERIC as JS numbers (money columns) so assertions read naturally.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

/**
 * Runs `fn` inside a transaction that is always rolled back, so tests can
 * insert fixtures and query views directly in Postgres without leaving data
 * behind. Use this for SQL view tests (financial calculations).
 */
export async function withRollback<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
