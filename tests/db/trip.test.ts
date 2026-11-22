import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';

describe('trip / trip_rate integrity', () => {
  it('deleting a Viaje deletes its rates (CASCADE)', () =>
    withRollback(async (db) => {
      const { rows: [t] } = await db.query(
        `INSERT INTO trip (name, destination, start_date, end_date) VALUES ('T', 'Miami', '2026-01-01', '2026-01-02') RETURNING id`,
      );
      await db.query(`INSERT INTO trip_rate (trip_id, currency_code, rate) VALUES ($1, 'CRC', 510)`, [t.id]);
      await db.query('DELETE FROM trip WHERE id = $1', [t.id]);
      const { rows } = await db.query('SELECT 1 FROM trip_rate WHERE trip_id = $1', [t.id]);
      expect(rows).toHaveLength(0);
    }));

  it('one rate per currency per Viaje', () =>
    withRollback(async (db) => {
      const { rows: [t] } = await db.query(
        `INSERT INTO trip (name, destination, start_date, end_date) VALUES ('T', 'Miami', '2026-01-01', '2026-01-02') RETURNING id`,
      );
      await db.query(`INSERT INTO trip_rate (trip_id, currency_code, rate) VALUES ($1, 'CRC', 510)`, [t.id]);
      await expect(
        db.query(`INSERT INTO trip_rate (trip_id, currency_code, rate) VALUES ($1, 'CRC', 520)`, [t.id]),
      ).rejects.toThrow(/trip_rate_pkey/);
    }));
});
