import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import { insertCustomer } from '../helpers/fixtures.ts';

describe('customer integrity', () => {
  it('stores a Cliente with only a name', () =>
    withRollback(async (db) => {
      const id = await insertCustomer(db, { name: 'Ana' });
      const { rows } = await db.query('SELECT name, phone, email, notes FROM customer WHERE id = $1', [id]);
      expect(rows[0]).toEqual({ name: 'Ana', phone: null, email: null, notes: null });
    }));

  it('rejects a blank name', () =>
    withRollback(async (db) => {
      await expect(db.query(`INSERT INTO customer (name) VALUES ('   ')`)).rejects.toThrow(/customer_name_check/);
    }));
});
