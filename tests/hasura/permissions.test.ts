import { afterAll, describe, expect, it } from 'vitest';
import { asAdmin, asManager, graphql, rootFieldNames, signTestJwt, typeNames } from '../helpers/hasura.ts';

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
      `{ expense_summary(where: { expense_id: { _eq: "${id}" } }) { amount_usd rate is_personal expense { description } } }`,
      { auth },
    );
    expect(sel.data!.expense_summary).toEqual([
      { amount_usd: 99, rate: 1, is_personal: false, expense: { description: DESCRIPTION } },
    ]);

    const del = await graphql(`mutation { delete_expense_by_pk(id: "${id}") { id } }`, { auth });
    expect(del.errors).toBeUndefined();
  });

  it('manager marks a Gasto as personal on insert and update (fuel category available)', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql<{ insert_expense_one: { id: string; is_personal: boolean } }>(
      `mutation { insert_expense_one(object: { category: fuel, description: "${DESCRIPTION}", amount: 30, currency_code: "USD", date: "2026-01-11", is_personal: true }) { id is_personal category } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    expect(ins.data!.insert_expense_one).toMatchObject({ is_personal: true, category: 'fuel' });
    const { id } = ins.data!.insert_expense_one;

    const upd = await graphql(
      `mutation { update_expense_by_pk(pk_columns: { id: "${id}" }, _set: { is_personal: false }) { is_personal } }`,
      { auth },
    );
    expect(upd.data).toEqual({ update_expense_by_pk: { is_personal: false } });

    const filtered = await graphql<{ expense: { id: string }[] }>(
      `{ expense(where: { description: { _eq: "${DESCRIPTION}" }, is_personal: { _eq: true } }) { id } }`,
      { auth },
    );
    expect(filtered.data!.expense).toEqual([]);
  });

  it('manager reads the categories and cannot write them or the view', async () => {
    const token = await signTestJwt();
    const cats = await graphql<{ expense_category: { value: string }[] }>('{ expense_category { value comment } }', {
      auth: { token },
    });
    expect(cats.data!.expense_category.map((c) => c.value)).toEqual(expect.arrayContaining(['merchandise', 'fuel']));
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

describe('order, order_item, order_status and order_summary', () => {
  const NAME = 'Cliente de prueba pedidos';

  afterAll(async () => {
    await asAdmin(`mutation {
      delete_order(where: { customer: { name: { _eq: "${NAME}" } } }) { affected_rows }
      delete_customer(where: { name: { _eq: "${NAME}" } }) { affected_rows }
      delete_trip(where: { name: { _eq: "Viaje con Pedidos" } }) { affected_rows }
    }`);
  });

  it('manager does CRUD on Pedidos and Artículos and reads the Total through summary', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql<{ insert_order_one: { id: string; items: { id: string }[] } }>(
      `mutation { insert_order_one(object: {
        customer: { data: { name: "${NAME}" } }, currency_code: "CRC", date: "2026-01-12", status: pending,
        items: { data: [{ name: "Camisa", price: 12500, quantity: 2, size: "M" }, { name: "Gorra", price: 5000 }] }
      }) { id items { id } } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const { id, items } = ins.data!.insert_order_one;
    expect(items).toHaveLength(2);

    const sel = await graphql<{ order_by_pk: { status: string; summary: { total: number; total_usd: number } } }>(
      `{ order_by_pk(id: "${id}") { status summary { total total_usd } } }`,
      { auth },
    );
    expect(sel.data!.order_by_pk.status).toBe('pending');
    expect(sel.data!.order_by_pk.summary.total).toBe(30000);
    expect(sel.data!.order_by_pk.summary.total_usd).toBeGreaterThan(0);

    const upd = await graphql(
      `mutation { update_order_by_pk(pk_columns: { id: "${id}" }, _set: { status: delivered }) { status }
        update_order_item_by_pk(pk_columns: { id: "${items[1].id}" }, _set: { quantity: 3 }) { quantity } }`,
      { auth },
    );
    expect(upd.data).toEqual({ update_order_by_pk: { status: 'delivered' }, update_order_item_by_pk: { quantity: 3 } });

    const del = await graphql(`mutation { delete_order_item_by_pk(id: "${items[0].id}") { id } }`, { auth });
    expect(del.errors).toBeUndefined();
    const total = await graphql<{ order_summary: { total: number }[] }>(
      `{ order_summary(where: { order_id: { _eq: "${id}" } }) { total } }`,
      { auth },
    );
    expect(total.data!.order_summary).toEqual([{ total: 15000 }]);

    const delOrder = await graphql(`mutation { delete_order_by_pk(id: "${id}") { id } }`, { auth });
    expect(delOrder.errors).toBeUndefined();
    const left = await asAdmin<{ order_item: { id: string }[] }>(`{ order_item(where: { order_id: { _eq: "${id}" } }) { id } }`);
    expect(left.data!.order_item).toEqual([]);
  });

  it('order_status is a read-only enum and order_summary has no mutations', async () => {
    const auth = { token: await signTestJwt() };
    const statuses = await graphql<{ order_status: { value: string }[] }>('{ order_status { value comment } }', { auth });
    expect(statuses.data!.order_status.map((s) => s.value)).toEqual(['pending', 'delivered', 'cancelled']);
    const mutations = await rootFieldNames(auth.token, 'mutationType');
    expect(mutations.filter((m) => /order_status|order_summary/.test(m))).toEqual([]);
  });

  it('rejects a negative price and a quantity of zero', async () => {
    const auth = { token: await signTestJwt() };
    const base = `customer: { data: { name: "${NAME}" } }, currency_code: "USD", date: "2026-01-12"`;
    const price = await graphql(
      `mutation { insert_order_one(object: { ${base}, items: { data: [{ name: "x", price: -1 }] } }) { id } }`,
      { auth },
    );
    expect(price.errors?.[0]?.message).toMatch(/order_item_price_check/);
    const qty = await graphql(
      `mutation { insert_order_one(object: { ${base}, items: { data: [{ name: "x", price: 1, quantity: 0 }] } }) { id } }`,
      { auth },
    );
    expect(qty.errors?.[0]?.message).toMatch(/order_item_quantity_check/);
  });

  it('a Cliente or a Viaje with Pedidos cannot be deleted', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql<{ insert_order_one: { id: string; customer_id: string; trip_id: string } }>(
      `mutation { insert_order_one(object: {
        customer: { data: { name: "${NAME}" } },
        trip: { data: { name: "Viaje con Pedidos", destination: "X", start_date: "2026-02-01", end_date: "2026-02-02" } },
        currency_code: "USD", date: "2026-02-01"
      }) { id customer_id trip_id } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const { customer_id, trip_id } = ins.data!.insert_order_one;
    const delCustomer = await graphql(`mutation { delete_customer_by_pk(id: "${customer_id}") { id } }`, { auth });
    expect(errorCode(delCustomer)).toBe('constraint-violation');
    const delTrip = await graphql(`mutation { delete_trip_by_pk(id: "${trip_id}") { id } }`, { auth });
    expect(errorCode(delTrip)).toBe('constraint-violation');
  });
});

describe('payment and order_summary Abono/Saldo', () => {
  const NAME = 'Cliente de prueba abonos';

  afterAll(async () => {
    await asAdmin(`mutation {
      delete_order(where: { customer: { name: { _eq: "${NAME}" } } }) { affected_rows }
      delete_customer(where: { name: { _eq: "${NAME}" } }) { affected_rows }
    }`);
  });

  async function insertOrder(token: string) {
    const ins = await graphql<{ insert_order_one: { id: string } }>(
      `mutation { insert_order_one(object: {
        customer: { data: { name: "${NAME}" } }, currency_code: "USD", date: "2026-03-01",
        items: { data: [{ name: "Bolso", price: 100 }] }
      }) { id } }`,
      { auth: { token } },
    );
    expect(ins.errors).toBeUndefined();
    return ins.data!.insert_order_one.id;
  }

  it('manager does CRUD on Abonos and reads Abono and Saldo through summary', async () => {
    const token = await signTestJwt();
    const auth = { token };
    const orderId = await insertOrder(token);
    const ins = await graphql<{ insert_payment_one: { id: string } }>(
      `mutation { insert_payment_one(object: { order_id: "${orderId}", amount: 40, currency_code: "USD", date: "2026-03-02", notes: "Sinpe" }) { id } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const paymentId = ins.data!.insert_payment_one.id;

    type Sel = { order_by_pk: { payments: { amount: number; notes: string }[]; summary: Record<string, number | boolean> } };
    const read = () =>
      graphql<Sel>(
        `{ order_by_pk(id: "${orderId}") { payments { amount notes } summary { total paid balance total_usd paid_usd balance_usd is_paid } } }`,
        { auth },
      );
    let sel = await read();
    expect(sel.data!.order_by_pk.payments).toEqual([{ amount: 40, notes: 'Sinpe' }]);
    expect(sel.data!.order_by_pk.summary).toEqual({
      total: 100, paid: 40, balance: 60, total_usd: 100, paid_usd: 40, balance_usd: 60, is_paid: false,
    });

    const upd = await graphql(
      `mutation { update_payment_by_pk(pk_columns: { id: "${paymentId}" }, _set: { amount: 100 }) { amount } }`,
      { auth },
    );
    expect(upd.data).toEqual({ update_payment_by_pk: { amount: 100 } });
    sel = await read();
    expect(sel.data!.order_by_pk.summary).toMatchObject({ balance: 0, is_paid: true });

    const del = await graphql(`mutation { delete_payment_by_pk(id: "${paymentId}") { id } }`, { auth });
    expect(del.errors).toBeUndefined();
    sel = await read();
    expect(sel.data!.order_by_pk.summary).toMatchObject({ paid: 0, balance: 100 });
  });

  it('rejects an Abono of zero or negative amount', async () => {
    const token = await signTestJwt();
    const orderId = await insertOrder(token);
    for (const amount of [0, -10]) {
      const r = await graphql(
        `mutation { insert_payment_one(object: { order_id: "${orderId}", amount: ${amount}, currency_code: "USD", date: "2026-03-02" }) { id } }`,
        { auth: { token } },
      );
      expect(r.errors?.[0]?.message).toMatch(/payment_amount_check|Check constraint/i);
    }
  });

  it('deleting a Pedido deletes its Abonos', async () => {
    const token = await signTestJwt();
    const orderId = await insertOrder(token);
    const ins = await graphql(
      `mutation { insert_payment_one(object: { order_id: "${orderId}", amount: 5, currency_code: "USD", date: "2026-03-02" }) { id } }`,
      { auth: { token } },
    );
    expect(ins.errors).toBeUndefined();
    const del = await graphql(`mutation { delete_order_by_pk(id: "${orderId}") { id } }`, { auth: { token } });
    expect(del.errors).toBeUndefined();
    const left = await asAdmin<{ payment: { id: string }[] }>(`{ payment(where: { order_id: { _eq: "${orderId}" } }) { id } }`);
    expect(left.data!.payment).toEqual([]);
  });
});

describe('customer_summary and customer_trip_summary', () => {
  const NAME = 'Cliente de prueba cuenta';

  afterAll(async () => {
    await asAdmin(`mutation {
      delete_order(where: { customer: { name: { _eq: "${NAME}" } } }) { affected_rows }
      delete_customer(where: { name: { _eq: "${NAME}" } }) { affected_rows }
    }`);
  });

  it('manager reads the Cliente account through customer.summary and customer.trip_summaries', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql(
      `mutation { insert_order_one(object: {
        customer: { data: { name: "${NAME}" } }, currency_code: "USD", date: "2026-03-01",
        items: { data: [{ name: "Bolso", price: 100 }] }, payments: { data: [{ amount: 25, currency_code: "USD", date: "2026-03-02" }] }
      }) { id } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const read = await graphql(
      `{ customer(where: { name: { _eq: "${NAME}" } }) {
        summary { order_count total_usd paid_usd balance_usd }
        trip_summaries { trip_id trip { name } order_count total_usd paid_usd balance_usd }
      } }`,
      { auth },
    );
    expect(read.errors).toBeUndefined();
    expect(read.data).toEqual({
      customer: [{
        summary: { order_count: 1, total_usd: 100, paid_usd: 25, balance_usd: 75 },
        trip_summaries: [{ trip_id: null, trip: null, order_count: 1, total_usd: 100, paid_usd: 25, balance_usd: 75 }],
      }],
    });
    const sorted = await graphql(
      '{ customer(order_by: { summary: { balance_usd: desc } }, limit: 1) { id } }',
      { auth },
    );
    expect(sorted.errors).toBeUndefined();
  });

  it('are read-only views', async () => {
    const mutations = await rootFieldNames(await signTestJwt(), 'mutationType');
    expect(mutations.filter((m) => /customer_summary|customer_trip_summary/.test(m))).toEqual([]);
  });
});

describe('trip_summary and trip_expense_category_summary', () => {
  const NAME = 'Viaje de prueba reporte';

  afterAll(async () => {
    await asAdmin(`mutation {
      delete_expense(where: { trip: { name: { _eq: "${NAME}" } } }) { affected_rows }
      delete_trip(where: { name: { _eq: "${NAME}" } }) { affected_rows }
    }`);
  });

  it('manager reads the Viaje report through trip.summary and trip.expense_categories', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql(
      `mutation { insert_trip_one(object: {
        name: "${NAME}", destination: "Panamá", start_date: "2026-03-01", end_date: "2026-03-05",
      }) { id } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const read = await graphql(
      `{ trip(where: { name: { _eq: "${NAME}" } }) {
        summary { order_count income_usd collected_usd pending_usd expenses_usd profit_usd personal_expenses_usd business_expenses_usd }
        expense_categories { category total_usd }
      } }`,
      { auth },
    );
    expect(read.errors).toBeUndefined();
    expect(read.data).toEqual({
      trip: [{
        summary: {
          order_count: 0, income_usd: 0, collected_usd: 0, pending_usd: 0, expenses_usd: 0, profit_usd: 0,
          personal_expenses_usd: 0, business_expenses_usd: 0,
        },
        expense_categories: [],
      }],
    });
  });

  it('are read-only views', async () => {
    const mutations = await rootFieldNames(await signTestJwt(), 'mutationType');
    expect(mutations.filter((m) => /trip_summary|trip_expense_category_summary/.test(m))).toEqual([]);
  });
});

describe('no_trip_summary', () => {
  it('manager reads the single summary row of General (no Viaje)', async () => {
    const read = await graphql(
      `{ no_trip_summary { order_count income_usd collected_usd pending_usd expenses_usd profit_usd personal_expenses_usd business_expenses_usd } }`,
      { auth: { token: await signTestJwt() } },
    );
    expect(read.errors).toBeUndefined();
    expect(read.data?.no_trip_summary).toHaveLength(1);
  });

  it('is a read-only view', async () => {
    const mutations = await rootFieldNames(await signTestJwt(), 'mutationType');
    expect(mutations.filter((m) => /no_trip_summary/.test(m))).toEqual([]);
  });
});

describe('business_summary', () => {
  it('manager reads the single Utilidad global row', async () => {
    const read = await graphql<{ business_summary: unknown[] }>(
      `{ business_summary { order_count income_usd collected_usd pending_usd expenses_usd personal_expenses_usd business_expenses_usd profit_usd } }`,
      { auth: { token: await signTestJwt() } },
    );
    expect(read.errors).toBeUndefined();
    expect(read.data?.business_summary).toHaveLength(1);
  });

  it('is a read-only view', async () => {
    const mutations = await rootFieldNames(await signTestJwt(), 'mutationType');
    expect(mutations.filter((m) => /business_summary/.test(m))).toEqual([]);
  });
});

describe('CRC equivalents (*_crc), order_item_summary and payment_summary', () => {
  const NAME = 'Cliente de prueba colones';

  afterAll(async () => {
    await asAdmin(`mutation {
      delete_order(where: { customer: { name: { _eq: "${NAME}" } } }) { affected_rows }
      delete_customer(where: { name: { _eq: "${NAME}" } }) { affected_rows }
    }`);
  });

  it('manager reads ₡ and $ of Pedidos, Artículos, Abonos and the Cliente account', async () => {
    const auth = { token: await signTestJwt() };
    const ins = await graphql(
      `mutation { insert_order_one(object: {
        customer: { data: { name: "${NAME}" } }, currency_code: "CRC", date: "2026-03-01",
        items: { data: [{ name: "Bolso", price: 5000, quantity: 2 }] },
        payments: { data: [{ amount: 2500, currency_code: "CRC", date: "2026-03-02" }] }
      }) { id } }`,
      { auth },
    );
    expect(ins.errors).toBeUndefined();
    const read = await graphql<{ customer: Record<string, unknown>[] }>(
      `{ customer(where: { name: { _eq: "${NAME}" } }) {
        summary { total_crc paid_crc balance_crc }
        trip_summaries { total_crc paid_crc balance_crc }
        orders {
          summary { total_crc paid_crc balance_crc }
          items { summary { currency_code line_total line_total_crc line_total_usd order_item { name } } }
          payments { summary { currency_code order_currency_code order_amount amount_crc amount_usd payment { amount } } }
        }
      } }`,
      { auth },
    );
    expect(read.errors).toBeUndefined();
    const [customer] = read.data!.customer as {
      summary: unknown; trip_summaries: unknown[];
      orders: { summary: unknown; items: { summary: Record<string, unknown> }[]; payments: { summary: Record<string, unknown> }[] }[];
    }[];
    expect(customer.summary).toEqual({ total_crc: 10000, paid_crc: 2500, balance_crc: 7500 });
    expect(customer.trip_summaries).toEqual([{ total_crc: 10000, paid_crc: 2500, balance_crc: 7500 }]);
    const [order] = customer.orders;
    expect(order.summary).toEqual({ total_crc: 10000, paid_crc: 2500, balance_crc: 7500 });
    expect(order.items[0].summary).toMatchObject({ currency_code: 'CRC', line_total: 10000, line_total_crc: 10000, order_item: { name: 'Bolso' } });
    expect(order.items[0].summary.line_total_usd).toBeGreaterThan(0);
    expect(order.payments[0].summary).toMatchObject({
      currency_code: 'CRC', order_currency_code: 'CRC', order_amount: 2500, amount_crc: 2500, payment: { amount: 2500 },
    });
    expect(order.payments[0].summary.amount_usd).toBeGreaterThan(0);
  });

  it('manager reads the ₡ columns of every report view', async () => {
    const read = await graphql(
      `{
        expense_summary(limit: 1) { amount_crc }
        trip_summary(limit: 1) { income_crc collected_crc pending_crc expenses_crc profit_crc personal_expenses_crc business_expenses_crc }
        trip_expense_category_summary(limit: 1) { total_crc }
        no_trip_summary { income_crc collected_crc pending_crc expenses_crc profit_crc personal_expenses_crc business_expenses_crc }
        business_summary { income_crc collected_crc pending_crc expenses_crc profit_crc personal_expenses_crc business_expenses_crc }
        customer_summary_aggregate { aggregate { sum { balance_crc } } }
      }`,
      { auth: { token: await signTestJwt() } },
    );
    expect(read.errors).toBeUndefined();
  });

  it('the new views and columns are read-only', async () => {
    const token = await signTestJwt();
    const mutations = await rootFieldNames(token, 'mutationType');
    expect(mutations.filter((m) => /order_item_summary|payment_summary/.test(m))).toEqual([]);
    const upd = await graphql(
      `mutation { update_order_summary(where: {}, _set: { total_crc: 1 }) { affected_rows } }`,
      { auth: { token } },
    );
    expect(upd.errors?.[0]?.extensions?.code).toBe('validation-failed');
    const updExpense = await graphql(
      `mutation { update_expense(where: { id: { _is_null: true } }, _set: { amount_crc: 1 }) { affected_rows } }`,
      { auth: { token } },
    );
    expect(updExpense.errors?.[0]?.extensions?.code).toBe('validation-failed');
  });
});

describe('similar_customers', () => {
  const QUERY = `query ($name: String!) { similar_customers(args: { search_name: $name }) { id name phone } }`;
  let id: string | undefined;

  afterAll(async () => {
    if (id) await asAdmin(`mutation { delete_customer_by_pk(id: "${id}") { id } }`);
  });

  it('manager finds a similar Cliente', async () => {
    const created = await asAdmin<{ insert_customer_one: { id: string } }>(
      `mutation { insert_customer_one(object: { name: "Zulema Quirós Pruebas", phone: "8888" }) { id } }`,
    );
    id = created.data!.insert_customer_one.id;
    const result = await asManager<{ similar_customers: { id: string; phone: string }[] }>(QUERY, {
      name: 'zulema quiros  pruebas',
    });
    expect(result.errors).toBeUndefined();
    expect(result.data!.similar_customers.map((c) => c.id)).toContain(id);
  });

  it('rejects a request without a JWT', async () => {
    const result = await graphql(QUERY, { auth: { none: true }, variables: { name: 'x' } });
    expect(result.data).toBeUndefined();
    expect(errorCode(result)).toBe('invalid-headers');
  });
});
