import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';

/** Schema-level checks run straight against Postgres inside a rolled-back transaction. */
describe('admin_user table', () => {
  it('stores the initial admin password as a bcrypt hash', async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query<{ password_hash: string }>('SELECT password_hash FROM admin_user');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });
  });

  it('rejects duplicate usernames', async () => {
    await withRollback(async (db) => {
      await db.query(`INSERT INTO admin_user (username, password_hash) VALUES ('dup', 'x')`);
      await expect(db.query(`INSERT INTO admin_user (username, password_hash) VALUES ('dup', 'y')`)).rejects.toThrow(
        /admin_user_username_key/,
      );
    });
  });
});
