import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../helpers/env.ts';
import { asAdmin, asManager, graphql, rootFieldNames, signTestJwt, typeNames } from '../helpers/hasura.ts';

/**
 * Public page of a shared Venta (issue #35): `order_share` permissions in Hasura and Hapi's
 * GET /public/orders/{token}. Each test uses its own X-Forwarded-For address (the stack trusts one proxy
 * hop, like Render) so the per-IP rate limit of one test never affects another.
 */

const NAME = 'Cliente de prueba enlace público';
const TRIP = 'Viaje de prueba enlace público';
const PHONE = '8765-4321';
const EMAIL = 'cliente.publico@example.com';
const CUSTOMER_NOTES = 'nota-privada-del-cliente';
const ORDER_NOTES = 'nota-interna-del-pedido';
const PAYMENT_NOTES = 'nota-interna-del-abono';
const NOT_FOUND = { statusCode: 404, error: 'Not Found', message: 'Not Found' };

/** Exact keys allowed at each level of the DTO; anything else is a leak. */
const ALLOWED = {
  root: ['currency', 'customerName', 'date', 'items', 'payments', 'status', 'statusLabel', 'totals', 'tripName'],
  currency: ['code', 'symbol'],
  item: ['lineTotal', 'lineTotalCrc', 'lineTotalUsd', 'name', 'photoUrl', 'price', 'quantity', 'size'],
  payment: ['amount', 'amountCrc', 'amountUsd', 'currency', 'date', 'orderAmount'],
  totals: ['balance', 'balanceCrc', 'balanceUsd', 'paid', 'paidCrc', 'paidUsd', 'total', 'totalCrc', 'totalUsd'],
};

// Random per run (documentation IPv6 prefix): the API keeps its buckets between runs on the same stack.
const RUN = Math.floor(Math.random() * 0xffff).toString(16);
let ipCounter = 0;
const nextIp = () => `2001:db8:${RUN}::${(++ipCounter).toString(16)}`;

function getPublic(token: string, ip = nextIp(), headers: Record<string, string> = {}) {
  return fetch(`${env.apiUrl}/public/orders/${token}`, { headers: { 'x-forwarded-for': ip, ...headers } });
}

function errorCode(result: { errors?: { extensions?: { code?: string } }[] }) {
  return result.errors?.[0]?.extensions?.code;
}

async function createOrder(status = 'pending'): Promise<{ orderId: string; ids: string[] }> {
  const res = await asAdmin<{
    insert_order_one: { id: string; customer_id: string; trip_id: string; items: { id: string }[]; payments: { id: string }[] };
  }>(
    `mutation ($status: order_status_enum!) { insert_order_one(object: {
      customer: { data: { name: "${NAME}", phone: "${PHONE}", email: "${EMAIL}", notes: "${CUSTOMER_NOTES}" } },
      trip: { data: { name: "${TRIP}", destination: "Miami", start_date: "2026-03-01", end_date: "2026-03-10", notes: "x" } },
      currency_code: "USD", date: "2026-03-05", status: $status, notes: "${ORDER_NOTES}",
      items: { data: [
        { name: "Camisa", price: 25, quantity: 2, size: "M", photo_url: "https://res.cloudinary.com/demo/image/upload/camisa.jpg" },
        { name: "Gorra", price: 10 }
      ] },
      payments: { data: [{ amount: 20, currency_code: "USD", date: "2026-03-06", notes: "${PAYMENT_NOTES}" }] }
    }) { id customer_id trip_id items { id } payments { id } } }`,
    { status },
  );
  if (res.errors) throw new Error(JSON.stringify(res.errors));
  const o = res.data!.insert_order_one;
  return { orderId: o.id, ids: [o.id, o.customer_id, o.trip_id, ...o.items.map((i) => i.id), ...o.payments.map((p) => p.id)] };
}

async function share(orderId: string): Promise<string> {
  const res = await asManager<{ insert_order_share_one: { token: string } }>(
    `mutation ($id: uuid!) { insert_order_share_one(object: { order_id: $id }) { token } }`,
    { id: orderId },
  );
  if (res.errors) throw new Error(JSON.stringify(res.errors));
  return res.data!.insert_order_share_one.token;
}

afterAll(async () => {
  await asAdmin(`mutation {
    delete_order(where: { customer: { name: { _eq: "${NAME}" } } }) { affected_rows }
    delete_customer(where: { name: { _eq: "${NAME}" } }) { affected_rows }
    delete_trip(where: { name: { _eq: "${TRIP}" } }) { affected_rows }
  }`);
});

describe('order_share in Hasura', () => {
  let orderId: string;
  beforeAll(async () => {
    ({ orderId } = await createOrder());
  });

  it('manager creates a link with a server-generated 192-bit token and cannot choose or update it', async () => {
    const token = await share(orderId);
    expect(token).toMatch(/^[0-9a-f]{48}$/);

    const chosen = await asManager(`mutation ($id: uuid!) { insert_order_share_one(object: { order_id: $id, token: "${'0'.repeat(48)}" }) { token } }`, { id: orderId });
    expect(errorCode(chosen)).toBe('validation-failed');
    const mutations = await rootFieldNames(await signTestJwt(), 'mutationType');
    expect(mutations.filter((m) => m.includes('order_share'))).toEqual(
      expect.arrayContaining(['insert_order_share_one', 'delete_order_share_by_pk']),
    );
    expect(mutations.filter((m) => /^update_order_share/.test(m))).toEqual([]);

    const again = await asManager(`mutation ($id: uuid!) { insert_order_share_one(object: { order_id: $id }) { token } }`, { id: orderId });
    expect(errorCode(again)).toBe('constraint-violation');

    const read = await asManager<{ order_share_by_pk: { token: string } }>(
      `query ($id: uuid!) { order_share_by_pk(order_id: $id) { token } }`, { id: orderId },
    );
    expect(read.data!.order_share_by_pk.token).toBe(token);
  });

  it('cannot be read, created or deleted without a JWT, and Hasura still has no anonymous role', async () => {
    for (const query of [
      '{ order_share { token } }',
      `mutation { insert_order_share_one(object: { order_id: "${orderId}" }) { token } }`,
      `mutation { delete_order_share_by_pk(order_id: "${orderId}") { order_id } }`,
      '{ order { id customer { phone } } }',
      '{ __typename }',
    ]) {
      const result = await graphql(query, { auth: { none: true } });
      expect(result.data).toBeUndefined();
      expect(errorCode(result)).toBe('invalid-headers');
    }
    const anonymous = await graphql('{ order_share { token } }', { auth: { token: await signTestJwt({ role: 'anonymous' }) } });
    expect(anonymous.data).toBeUndefined();
    expect(await typeNames(await signTestJwt())).toContain('order_share');
  });
});

describe('GET /public/orders/{token}', () => {
  let orderId: string;
  let ids: string[];
  let token: string;

  beforeAll(async () => {
    ({ orderId, ids } = await createOrder());
    token = await share(orderId);
  });

  it('returns only the allowlisted DTO, with no-store', async () => {
    const response = await getPublic(token);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    type Obj = Record<string, unknown>;
    const dto = (await response.json()) as Obj & { currency: Obj; totals: Obj; items: Obj[]; payments: (Obj & { currency: Obj })[] };

    expect(Object.keys(dto).sort()).toEqual(ALLOWED.root);
    expect(Object.keys(dto.currency).sort()).toEqual(ALLOWED.currency);
    expect(Object.keys(dto.totals).sort()).toEqual(ALLOWED.totals);
    for (const item of dto.items) expect(Object.keys(item).sort()).toEqual(ALLOWED.item);
    for (const payment of dto.payments) {
      expect(Object.keys(payment).sort()).toEqual(ALLOWED.payment);
      expect(Object.keys(payment.currency).sort()).toEqual(ALLOWED.currency);
    }

    expect(dto).toMatchObject({
      customerName: NAME, date: '2026-03-05', status: 'pending', statusLabel: 'Pendiente', tripName: TRIP,
      currency: { code: 'USD', symbol: '$' },
      totals: { total: 60, paid: 20, balance: 40, totalUsd: 60 },
      items: [
        { name: 'Camisa', size: 'M', quantity: 2, price: 25, lineTotal: 50, photoUrl: 'https://res.cloudinary.com/demo/image/upload/camisa.jpg' },
        { name: 'Gorra', size: null, quantity: 1, price: 10, lineTotal: 10, photoUrl: null },
      ],
      payments: [{ date: '2026-03-06', amount: 20, orderAmount: 20, amountUsd: 20, currency: { code: 'USD', symbol: '$' } }],
    });

    const json = JSON.stringify(dto);
    for (const forbidden of [PHONE, EMAIL, CUSTOMER_NOTES, ORDER_NOTES, PAYMENT_NOTES, token, ...ids, 'notes', 'rate', '"id"']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('answers CORS only to the configured frontend origin', async () => {
    const allowed = await getPublic(token, nextIp(), { origin: 'http://localhost:3000' });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    const other = await getPublic(token, nextIp(), { origin: 'https://evil.example' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers an identical 404 for malformed, unknown, revoked, cancelled and deleted', async () => {
    const bodies: string[] = [];
    const expect404 = async (t: string) => {
      const response = await getPublic(t);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      bodies.push(await response.text());
    };

    await expect404('not-a-token');
    await expect404(orderId);
    await expect404(token.toUpperCase());
    await expect404('f'.repeat(48));

    const revoked = await createOrder();
    const revokedToken = await share(revoked.orderId);
    expect((await getPublic(revokedToken)).status).toBe(200);
    const del = await asManager(`mutation ($id: uuid!) { delete_order_share_by_pk(order_id: $id) { order_id } }`, { id: revoked.orderId });
    expect(del.errors).toBeUndefined();
    await expect404(revokedToken);

    const cancelled = await createOrder('cancelled');
    await expect404(await share(cancelled.orderId));

    const deleted = await createOrder();
    const deletedToken = await share(deleted.orderId);
    await asManager(`mutation ($id: uuid!) { delete_order_by_pk(id: $id) { id } }`, { id: deleted.orderId });
    await expect404(deletedToken);

    expect(new Set(bodies)).toEqual(new Set([JSON.stringify(NOT_FOUND)]));
  });

  it('regenerating invalidates the old token', async () => {
    const regen = await createOrder();
    const oldToken = await share(regen.orderId);
    const res = await asManager<{ insert_order_share_one: { token: string } }>(
      `mutation ($id: uuid!) {
        delete_order_share_by_pk(order_id: $id) { order_id }
        insert_order_share_one(object: { order_id: $id }) { token }
      }`,
      { id: regen.orderId },
    );
    expect(res.errors).toBeUndefined();
    const newToken = res.data!.insert_order_share_one.token;
    expect(newToken).not.toBe(oldToken);
    expect((await getPublic(oldToken)).status).toBe(404);
    expect((await getPublic(newToken)).status).toBe(200);
  });

  it('rate limits each client IP (30 per minute), independently of other IPs', async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await getPublic('x', ip)).status);
    expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true);
    expect(statuses[30]).toBe(429);

    const limited = await getPublic(token, ip);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('cache-control')).toBe('no-store');
    // A forged left-most X-Forwarded-For entry does not escape the limit (only our proxy's hop counts).
    expect((await getPublic(token, `2001:db8:ffff::1, ${ip}`)).status).toBe(429);
    expect((await getPublic(token, nextIp())).status).toBe(200);
  });
});
