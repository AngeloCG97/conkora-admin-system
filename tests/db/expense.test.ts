import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { withRollback } from '../helpers/db.ts';
import { insertExpense, insertTrip, setGlobalRate } from '../helpers/fixtures.ts';

/** USD equivalent of a Gasto from the `expense_summary` view. */
async function amountUsd(db: pg.PoolClient, expenseId: string) {
  const { rows } = await db.query('SELECT rate, amount_usd FROM expense_summary WHERE expense_id = $1', [expenseId]);
  return rows[0] as { rate: number; amount_usd: number };
}

describe('effective_rate(trip, currency)', () => {
  it('uses the Viaje rate when it has one, otherwise the global rate; USD is always 1', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 505);
      await setGlobalRate(db, 'EUR', 0.9);
      const tripId = await insertTrip(db, { rates: { CRC: 510 } });
      const rate = async (trip: string | null, code: string) =>
        (await db.query('SELECT effective_rate($1, $2) AS r', [trip, code])).rows[0].r;

      expect(await rate(tripId, 'CRC')).toBe(510);
      expect(await rate(tripId, 'EUR')).toBe(0.9);
      expect(await rate(null, 'CRC')).toBe(505);
      expect(await rate(tripId, 'USD')).toBe(1);
      expect(await rate(null, 'USD')).toBe(1);
    }));
});

describe('expense_summary (USD equivalent of each Gasto)', () => {
  it('Gasto en CRC de un Viaje con tipo propio usa el tipo del Viaje', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 505);
      const tripId = await insertTrip(db, { rates: { CRC: 500 } });
      const id = await insertExpense(db, { tripId, amount: 50000, currency: 'CRC' });
      expect(await amountUsd(db, id)).toEqual({ rate: 500, amount_usd: 100 });
    }));

  it('Viaje sin tipo para CRC usa el global', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      await setGlobalRate(db, 'EUR', 0.8);
      const tripId = await insertTrip(db, { rates: { EUR: 0.9 } });
      const id = await insertExpense(db, { tripId, amount: 25000, currency: 'CRC' });
      expect(await amountUsd(db, id)).toEqual({ rate: 500, amount_usd: 50 });
    }));

  it('Gasto sin Viaje (General) usa el global aunque otro Viaje tenga tipo propio', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      await insertTrip(db, { rates: { CRC: 400 } });
      const id = await insertExpense(db, { amount: 1000, currency: 'CRC' });
      expect(await amountUsd(db, id)).toEqual({ rate: 500, amount_usd: 2 });
    }));

  it('Gasto en USD vale lo mismo en USD', () =>
    withRollback(async (db) => {
      const tripId = await insertTrip(db, { rates: { CRC: 510 } });
      const id = await insertExpense(db, { tripId, amount: 123.45 });
      expect((await amountUsd(db, id)).amount_usd).toBe(123.45);
    }));

  it('redondea el equivalente en USD a 2 decimales', () =>
    withRollback(async (db) => {
      const tripId = await insertTrip(db, { rates: { CRC: 510 } });
      // 10000 / 510 = 19.6078… → 19.61
      const a = await insertExpense(db, { tripId, amount: 10000, currency: 'CRC' });
      expect((await amountUsd(db, a)).amount_usd).toBe(19.61);
      // 2.01 / 2 = 1.005 → 1.01 (half away from zero)
      await setGlobalRate(db, 'EUR', 2);
      const b = await insertExpense(db, { amount: 2.01, currency: 'EUR' });
      expect((await amountUsd(db, b)).amount_usd).toBe(1.01);
      // 0 stays 0, not null
      const c = await insertExpense(db, { amount: 0, currency: 'CRC' });
      expect((await amountUsd(db, c)).amount_usd).toBe(0);
    }));

  it('cambiar el tipo del Viaje recalcula sus Gastos; los Generales no cambian', () =>
    withRollback(async (db) => {
      await setGlobalRate(db, 'CRC', 500);
      const tripId = await insertTrip(db, { rates: { CRC: 500 } });
      const tripExpense = await insertExpense(db, { tripId, amount: 5000, currency: 'CRC' });
      const personal = await insertExpense(db, { amount: 5000, currency: 'CRC' });
      await db.query(`UPDATE trip_rate SET rate = 250 WHERE trip_id = $1 AND currency_code = 'CRC'`, [tripId]);
      expect((await amountUsd(db, tripExpense)).amount_usd).toBe(20);
      expect((await amountUsd(db, personal)).amount_usd).toBe(10);
    }));
});

describe('expense integrity', () => {
  it('rejects negative amounts and accepts 0', () =>
    withRollback(async (db) => {
      await insertExpense(db, { amount: 0 });
      await expect(insertExpense(db, { amount: -1 })).rejects.toThrow(/expense_amount_check/);
    }));

  it('rejects unknown categories', () =>
    withRollback(async (db) => {
      await expect(insertExpense(db, { amount: 1, category: 'nope' })).rejects.toThrow(/expense_category_fkey/);
    }));

  it('rejects unknown currencies', () =>
    withRollback(async (db) => {
      await expect(insertExpense(db, { amount: 1, currency: 'QQQ' })).rejects.toThrow(/expense_currency_code_fkey/);
    }));

  it('accepts every category, Mercadería and Combustible included', () =>
    withRollback(async (db) => {
      const { rows } = await db.query('SELECT comment FROM expense_category');
      expect(rows.map((r) => r.comment).sort()).toEqual(
        ['Alimentación', 'Alquiler de carro', 'Combustible', 'Gastos generales', 'Hospedaje', 'Mercadería', 'Otro', 'Vuelos'],
      );
      const tripId = await insertTrip(db);
      const id = await insertExpense(db, { tripId, amount: 300, category: 'merchandise' });
      const { rows: [e] } = await db.query('SELECT category FROM expense_summary WHERE expense_id = $1', [id]);
      expect(e.category).toBe('merchandise');
    }));

  it('a Gasto is not personal by default and can be marked personal', () =>
    withRollback(async (db) => {
      const plain = await insertExpense(db, { amount: 1 });
      const personal = await insertExpense(db, { amount: 1, category: 'fuel', isPersonal: true });
      const { rows } = await db.query(
        'SELECT expense_id, is_personal FROM expense_summary WHERE expense_id = ANY($1)', [[plain, personal]],
      );
      expect(Object.fromEntries(rows.map((r) => [r.expense_id, r.is_personal]))).toEqual({ [plain]: false, [personal]: true });
    }));

  it('a Viaje with Gastos cannot be deleted (RESTRICT)', () =>
    withRollback(async (db) => {
      const tripId = await insertTrip(db);
      await insertExpense(db, { tripId, amount: 10 });
      await expect(db.query('DELETE FROM trip WHERE id = $1', [tripId])).rejects.toThrow(/expense_trip_id_fkey/);
    }));
});
