import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { withRollback } from '../helpers/db.ts';
import { insertCustomer } from '../helpers/fixtures.ts';

async function similar(db: pg.PoolClient, name: string, excludeId: string | null = null) {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM similar_customers($1, $2)', [name, excludeId]);
  return rows.map((r) => r.id);
}

describe('similar_customers', () => {
  it('matches ignoring accents and case', () =>
    withRollback(async (db) => {
      const id = await insertCustomer(db, { name: 'María Rodríguez' });
      expect(await similar(db, 'maria rodriguez')).toContain(id);
      expect(await similar(db, 'MARIA RODRIGUEZ')).toContain(id);
    }));

  it('matches ignoring extra spaces', () =>
    withRollback(async (db) => {
      const id = await insertCustomer(db, { name: 'Ana Soto' });
      expect(await similar(db, '  ana    soto  ')).toContain(id);
    }));

  it('tolerates a one-letter typo', () =>
    withRollback(async (db) => {
      const id = await insertCustomer(db, { name: 'Ana Soto' });
      expect(await similar(db, 'Ana  Sotto')).toContain(id);
      const maria = await insertCustomer(db, { name: 'María Rodríguez' });
      expect(await similar(db, 'Maria Rodrigez')).toContain(maria);
    }));

  it('does not match clearly different names', () =>
    withRollback(async (db) => {
      const ana = await insertCustomer(db, { name: 'Ana Soto' });
      const maria = await insertCustomer(db, { name: 'María Rodríguez' });
      const found = await similar(db, 'Carlos Jiménez');
      expect(found).not.toContain(ana);
      expect(found).not.toContain(maria);
      expect(await similar(db, 'Ana Rodríguez')).not.toContain(ana);
    }));

  it('excludes the given Cliente', () =>
    withRollback(async (db) => {
      const id = await insertCustomer(db, { name: 'Ana Soto' });
      expect(await similar(db, 'Ana Soto', id)).not.toContain(id);
    }));

  it('orders by similarity and returns nothing for a blank name', () =>
    withRollback(async (db) => {
      const close = await insertCustomer(db, { name: 'Ana Sotto' });
      const exact = await insertCustomer(db, { name: 'Ana Soto' });
      const found = await similar(db, 'Ana Soto');
      expect(found.indexOf(exact)).toBeLessThan(found.indexOf(close));
      expect(await similar(db, '   ')).toEqual([]);
    }));
});
