import { afterAll, describe, expect, it } from 'vitest';
import { asAdmin, graphql, rootFieldNames, signTestJwt, typeNames } from '../helpers/hasura.ts';

/**
 * Hasura permissions for the `manager` role (PRD, "Capa GraphQL de Hasura").
 * Each slice that adds tables or views extends this file with its own cases.
 */

function errorCode(result: { errors?: { extensions?: { code?: string } }[] }) {
  return result.errors?.[0]?.extensions?.code;
}

describe('authentication', () => {
  it('rejects requests without a JWT', async () => {
    const result = await graphql('{ __typename }', { auth: { none: true } });
    expect(result.data).toBeUndefined();
    expect(errorCode(result)).toBe('invalid-headers');
  });

  it('rejects an expired JWT', async () => {
    const token = await signTestJwt({ expiresInSeconds: -30 });
    const result = await graphql('{ __typename }', { auth: { token } });
    expect(result.data).toBeUndefined();
    expect(errorCode(result)).toBe('invalid-jwt');
  });

  it('rejects a JWT signed with another secret', async () => {
    const token = await signTestJwt({ secret: 'some-other-secret-that-is-32-chars-long!!' });
    const result = await graphql('{ __typename }', { auth: { token } });
    expect(result.data).toBeUndefined();
    expect(errorCode(result)).toBe('invalid-jwt');
  });

  it('accepts a valid manager JWT', async () => {
    const result = await graphql('{ __typename }', { auth: { token: await signTestJwt() } });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ __typename: 'query_root' });
  });
});

describe('admin_user', () => {
  it('is not part of the manager schema', async () => {
    const token = await signTestJwt();
    expect(await rootFieldNames(token, 'queryType')).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/admin_user/)]),
    );
    expect(await rootFieldNames(token, 'mutationType')).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/admin_user/)]),
    );
    expect(await typeNames(token)).not.toEqual(expect.arrayContaining([expect.stringMatching(/admin_user/)]));
  });

  it('cannot be queried by a manager', async () => {
    const result = await graphql('{ admin_user { id username password_hash } }', {
      auth: { token: await signTestJwt() },
    });
    expect(result.data).toBeUndefined();
    expect(errorCode(result)).toBe('validation-failed');
  });
});

describe('currency', () => {
  const CODE = 'ZZZ';

  afterAll(async () => {
    await asAdmin(`mutation { delete_currency(where: { code: { _eq: "${CODE}" } }) { affected_rows } }`);
  });

  it('manager lists the seeded USD and CRC', async () => {
    const result = await graphql<{ currency: { code: string; global_rate: number }[] }>(
      '{ currency(order_by: { code: asc }) { code name symbol global_rate } }',
      { auth: { token: await signTestJwt() } },
    );
    expect(result.errors).toBeUndefined();
    const usd = result.data!.currency.find((c) => c.code === 'USD');
    expect(usd?.global_rate).toBe(1);
    expect(result.data!.currency.map((c) => c.code)).toContain('CRC');
  });

  it('manager inserts, updates a currency and cannot delete', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql(
      `mutation { insert_currency_one(object: { code: "${CODE}", name: "Prueba", symbol: "Z", global_rate: 2 }) { code } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const upd = await graphql(
      `mutation { update_currency_by_pk(pk_columns: { code: "${CODE}" }, _set: { global_rate: 3.5 }) { global_rate } }`,
      { auth },
    );
    expect(upd.errors).toBeUndefined();
    expect(upd.data).toEqual({ update_currency_by_pk: { global_rate: 3.5 } });
    expect(await rootFieldNames(auth.token, 'mutationType')).not.toContain('delete_currency');
  });

  it('rejects invalid codes, non-positive rates and a USD rate other than 1', async () => {
    const auth = { token: await signTestJwt() };
    for (const object of [
      '{ code: "AB", name: "x", symbol: "x", global_rate: 1 }',
      '{ code: "abc", name: "x", symbol: "x", global_rate: 1 }',
      `{ code: "${CODE}", name: "x", symbol: "x", global_rate: 0 }`,
      `{ code: "${CODE}", name: "x", symbol: "x", global_rate: -5 }`,
    ]) {
      const r = await graphql(`mutation { insert_currency_one(object: ${object}) { code } }`, { auth });
      expect(r.errors?.[0]?.message, object).toMatch(/violates check constraint/);
    }
    const usd = await graphql(
      'mutation { update_currency_by_pk(pk_columns: { code: "USD" }, _set: { global_rate: 2 }) { code } }',
      { auth },
    );
    expect(usd.errors?.[0]?.message).toMatch(/currency_usd_rate_is_one/);
  });
});

describe('trip and trip_rate', () => {
  const NAME = 'Viaje de prueba permisos';

  afterAll(async () => {
    await asAdmin(`mutation { delete_trip(where: { name: { _eq: "${NAME}" } }) { affected_rows } }`);
  });

  it('manager does full CRUD on trips and their rates', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql<{ insert_trip_one: { id: string } }>(
      `mutation { insert_trip_one(object: { name: "${NAME}", destination: "Miami", start_date: "2026-01-10", end_date: "2026-01-15" }) { id } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const id = ins.data!.insert_trip_one.id;

    const rate = await graphql(
      `mutation { insert_trip_rate_one(object: { trip_id: "${id}", currency_code: "CRC", rate: 520 }) { rate } }`,
      { auth },
    );
    expect(rate.errors).toBeUndefined();
    const upd = await graphql(
      `mutation { update_trip_rate_by_pk(pk_columns: { trip_id: "${id}", currency_code: "CRC" }, _set: { rate: 530.5 }) { rate } }`,
      { auth },
    );
    expect(upd.data).toEqual({ update_trip_rate_by_pk: { rate: 530.5 } });

    const sel = await graphql<{ trip_by_pk: { rates: { currency_code: string }[] } }>(
      `{ trip_by_pk(id: "${id}") { rates { currency_code rate } } }`,
      { auth },
    );
    expect(sel.data!.trip_by_pk.rates).toEqual([{ currency_code: 'CRC', rate: 530.5 }]);

    const updTrip = await graphql(
      `mutation { update_trip_by_pk(pk_columns: { id: "${id}" }, _set: { destination: "Orlando" }) { destination } }`,
      { auth },
    );
    expect(updTrip.data).toEqual({ update_trip_by_pk: { destination: 'Orlando' } });

    const delRate = await graphql(
      `mutation { delete_trip_rate_by_pk(trip_id: "${id}", currency_code: "CRC") { rate } }`,
      { auth },
    );
    expect(delRate.errors).toBeUndefined();
    const del = await graphql(`mutation { delete_trip_by_pk(id: "${id}") { id } }`, { auth });
    expect(del.errors).toBeUndefined();
  });

  it('rejects an end date before the start date', async () => {
    const r = await graphql(
      `mutation { insert_trip_one(object: { name: "${NAME}", destination: "X", start_date: "2026-02-10", end_date: "2026-02-01" }) { id } }`,
      { auth: { token: await signTestJwt() } },
    );
    expect(r.errors?.[0]?.message).toMatch(/trip_dates_ordered/);
  });

  it('rejects non-positive rates, USD rates and unknown currencies', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql<{ insert_trip_one: { id: string } }>(
      `mutation { insert_trip_one(object: { name: "${NAME}", destination: "X", start_date: "2026-02-01", end_date: "2026-02-01" }) { id } }`,
      { auth },
    );
    const id = ins.data!.insert_trip_one.id;
    const cases: [string, RegExp][] = [
      ['currency_code: "CRC", rate: 0', /trip_rate/],
      ['currency_code: "CRC", rate: -1', /trip_rate/],
      ['currency_code: "USD", rate: 1', /trip_rate_not_usd/],
      ['currency_code: "QQQ", rate: 1', /foreign key|trip_rate_currency_code_fkey/i],
    ];
    for (const [fields, pattern] of cases) {
      const r = await graphql(`mutation { insert_trip_rate_one(object: { trip_id: "${id}", ${fields} }) { rate } }`, { auth });
      expect(r.errors?.[0]?.message, fields).toMatch(pattern);
    }
  });
});

describe('expense, expense_category and expense_summary', () => {
  const DESCRIPTION = 'Gasto de prueba permisos';

  afterAll(async () => {
    await asAdmin(`mutation { delete_expense(where: { description: { _eq: "${DESCRIPTION}" } }) { affected_rows } }`);
  });

  it('manager does full CRUD on Gastos and reads their USD equivalent', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql<{ insert_expense_one: { id: string; summary: { amount_usd: number } } }>(
      `mutation { insert_expense_one(object: { category: merchandise, description: "${DESCRIPTION}", amount: 120.5, currency_code: "USD", date: "2026-01-11" }) { id summary { amount_usd } } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const { id, summary } = ins.data!.insert_expense_one;
    expect(summary.amount_usd).toBe(120.5);

    const upd = await graphql(
      `mutation { update_expense_by_pk(pk_columns: { id: "${id}" }, _set: { amount: 99, category: food }) { amount category } }`,
      { auth },
    );
    expect(upd.data).toEqual({ update_expense_by_pk: { amount: 99, category: 'food' } });

    const sel = await graphql<{ expense_summary: { amount_usd: number }[] }>(
      `{ expense_summary(where: { expense_id: { _eq: "${id}" } }) { amount_usd rate expense { description } } }`,
      { auth },
    );
    expect(sel.data!.expense_summary).toEqual([{ amount_usd: 99, rate: 1, expense: { description: DESCRIPTION } }]);

    const del = await graphql(`mutation { delete_expense_by_pk(id: "${id}") { id } }`, { auth });
    expect(del.errors).toBeUndefined();
  });

  it('manager reads the categories and cannot write them or the view', async () => {
    const token = await signTestJwt();
    const cats = await graphql<{ expense_category: { value: string }[] }>('{ expense_category { value comment } }', {
      auth: { token },
    });
    expect(cats.data!.expense_category.map((c) => c.value)).toContain('merchandise');
    const mutations = await rootFieldNames(token, 'mutationType');
    expect(mutations.filter((m) => /expense_category|expense_summary/.test(m))).toEqual([]);
  });

  it('rejects negative amounts', async () => {
    const r = await graphql(
      `mutation { insert_expense_one(object: { category: other, description: "${DESCRIPTION}", amount: -1, currency_code: "USD", date: "2026-01-11" }) { id } }`,
      { auth: { token: await signTestJwt() } },
    );
    expect(r.errors?.[0]?.message).toMatch(/expense_amount_check/);
  });

  it('a Viaje with Gastos cannot be deleted', async () => {
    const auth = { token: await signTestJwt() };
    const trip = await graphql<{ insert_trip_one: { id: string } }>(
      `mutation { insert_trip_one(object: { name: "Viaje con Gastos", destination: "X", start_date: "2026-02-01", end_date: "2026-02-02", expenses: { data: [{ category: flights, description: "${DESCRIPTION}", amount: 300, currency_code: "USD", date: "2026-02-01" }] } }) { id } }`,
      { auth },
    );
    expect(trip.errors).toBeUndefined();
    const id = trip.data!.insert_trip_one.id;
    const del = await graphql(`mutation { delete_trip_by_pk(id: "${id}") { id } }`, { auth });
    expect(errorCode(del)).toBe('constraint-violation');
    await asAdmin(`mutation { delete_expense(where: { trip_id: { _eq: "${id}" } }) { affected_rows } delete_trip_by_pk(id: "${id}") { id } }`);
  });
});

describe('customer', () => {
  const NAME = 'Cliente de prueba permisos';

  afterAll(async () => {
    await asAdmin(`mutation { delete_customer(where: { name: { _like: "${NAME}%" } }) { affected_rows } }`);
  });

  it('manager does full CRUD and can search by name or phone', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql<{ insert_customer_one: { id: string } }>(
      `mutation { insert_customer_one(object: { name: "${NAME}", phone: "8888-1234", email: "a@b.cr", notes: "n" }) { id } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const id = ins.data!.insert_customer_one.id;

    const search = await graphql<{ customer: { id: string }[] }>(
      `{ customer(where: { _or: [{ name: { _ilike: "%PRUEBA PERM%" } }, { phone: { _ilike: "%zzz%" } }] }) { id } }`,
      { auth },
    );
    expect(search.data!.customer.map((c) => c.id)).toEqual([id]);
    const byPhone = await graphql<{ customer: { id: string }[] }>(
      `{ customer(where: { phone: { _ilike: "%1234%" }, name: { _like: "${NAME}%" } }) { id } }`,
      { auth },
    );
    expect(byPhone.data!.customer).toEqual([{ id }]);

    const upd = await graphql(
      `mutation { update_customer_by_pk(pk_columns: { id: "${id}" }, _set: { phone: "7777" }) { phone } }`,
      { auth },
    );
    expect(upd.data).toEqual({ update_customer_by_pk: { phone: '7777' } });
    const del = await graphql(`mutation { delete_customer_by_pk(id: "${id}") { id } }`, { auth });
    expect(del.errors).toBeUndefined();
  });

  it('rejects a blank name', async () => {
    const r = await graphql(`mutation { insert_customer_one(object: { name: "  " }) { id } }`, {
      auth: { token: await signTestJwt() },
    });
    expect(r.errors?.[0]?.message).toMatch(/customer_name_check|Check constraint/i);
  });
});
