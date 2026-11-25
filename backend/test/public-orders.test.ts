import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import {
  isShareTokenFormat,
  toPublicOrder,
  type PublicOrder,
  type PublicOrderRow,
  type PublicOrderStore,
} from '../src/public/order-dto.ts';
import { clientIp, createRateLimiter } from '../src/public/rate-limit.ts';
import { NOT_FOUND_BODY } from '../src/routes/public-orders.ts';
import { createServer } from '../src/server.ts';

const TOKEN = 'a'.repeat(48);
const LABELS = { pending: 'Pendiente', delivered: 'Entregado', cancelled: 'Cancelado' };

/** A row as Hasura could return it, with extra fields that must never reach the DTO. */
function row(overrides: Partial<PublicOrderRow> = {}): PublicOrderRow {
  const leaky = {
    id: 'order-uuid',
    notes: 'nota interna',
    customer: { name: 'Ana', phone: '8888-8888', email: 'ana@example.com', notes: 'secreto', id: 'cust-uuid' },
    trip: { name: 'Miami', id: 'trip-uuid', notes: 'x' },
    currency: { code: 'USD', symbol: '$', global_rate: 1 },
    summary: {
      total: 100, total_usd: 100, total_crc: 50500, paid: 40, paid_usd: 40, paid_crc: 20200,
      balance: 60, balance_usd: 60, balance_crc: 30300, rate: 1, order_id: 'order-uuid',
    },
    items: [{
      id: 'item-uuid', order_id: 'order-uuid', name: 'Camisa', size: 'M', quantity: 2, price: 50,
      photo_url: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
      summary: { line_total: 100, line_total_usd: 100, line_total_crc: 50500, order_item_id: 'item-uuid' },
    }],
    payments: [{
      id: 'pay-uuid', notes: 'por SINPE', date: '2026-01-02', amount: 20200,
      currency: { code: 'CRC', symbol: '₡', global_rate: 505 },
      summary: { order_amount: 40, amount_usd: 40, amount_crc: 20200, rate: 505, payment_id: 'pay-uuid' },
    }],
  };
  return { status: 'pending', date: '2026-01-01', ...leaky, ...overrides } as unknown as PublicOrderRow;
}

const ALLOWED_KEYS = {
  root: ['currency', 'customerName', 'date', 'items', 'payments', 'status', 'statusLabel', 'totals', 'tripName'],
  currency: ['code', 'symbol'],
  item: ['lineTotal', 'lineTotalCrc', 'lineTotalUsd', 'name', 'photoUrl', 'price', 'quantity', 'size'],
  payment: ['amount', 'amountCrc', 'amountUsd', 'currency', 'date', 'orderAmount'],
  totals: ['balance', 'balanceCrc', 'balanceUsd', 'paid', 'paidCrc', 'paidUsd', 'total', 'totalCrc', 'totalUsd'],
};

const keys = (o: object) => Object.keys(o).sort();

describe('isShareTokenFormat', () => {
  it('accepts exactly 48 lowercase hex characters', () => {
    expect(isShareTokenFormat(TOKEN)).toBe(true);
    expect(isShareTokenFormat('0123456789abcdef'.repeat(3))).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'a'.repeat(47), 'a'.repeat(49), 'A'.repeat(48), `${'a'.repeat(47)}g`,
      '00000000-0000-0000-0000-000000000000', `${'a'.repeat(48)}\n`, ' '.repeat(48), null, undefined, 42]) {
      expect(isShareTokenFormat(bad)).toBe(false);
    }
  });
});

describe('toPublicOrder', () => {
  it('picks only the allowlisted fields, at every level', () => {
    const dto = toPublicOrder(row(), LABELS)!;
    expect(keys(dto)).toEqual(ALLOWED_KEYS.root);
    expect(keys(dto.currency)).toEqual(ALLOWED_KEYS.currency);
    expect(keys(dto.totals)).toEqual(ALLOWED_KEYS.totals);
    dto.items.forEach((i) => expect(keys(i)).toEqual(ALLOWED_KEYS.item));
    dto.payments.forEach((p) => {
      expect(keys(p)).toEqual(ALLOWED_KEYS.payment);
      expect(keys(p.currency)).toEqual(ALLOWED_KEYS.currency);
    });
    const json = JSON.stringify(dto);
    for (const forbidden of ['uuid', '8888', 'ana@example.com', 'secreto', 'nota interna', 'SINPE', 'rate', 'notes', 'phone', 'email', '"id"']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('maps the values', () => {
    expect(toPublicOrder(row(), LABELS)).toEqual<PublicOrder>({
      customerName: 'Ana',
      date: '2026-01-01',
      status: 'pending',
      statusLabel: 'Pendiente',
      tripName: 'Miami',
      currency: { code: 'USD', symbol: '$' },
      items: [{
        name: 'Camisa', size: 'M', quantity: 2, price: 50, lineTotal: 100, lineTotalUsd: 100, lineTotalCrc: 50500,
        photoUrl: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
      }],
      payments: [{ date: '2026-01-02', amount: 20200, currency: { code: 'CRC', symbol: '₡' }, orderAmount: 40, amountUsd: 40, amountCrc: 20200 }],
      totals: { total: 100, totalUsd: 100, totalCrc: 50500, paid: 40, paidUsd: 40, paidCrc: 20200, balance: 60, balanceUsd: 60, balanceCrc: 30300 },
    });
  });

  it('handles General (no Viaje), missing summaries and empty lists', () => {
    const dto = toPublicOrder(row({ trip: null, summary: null, items: [], payments: [] }), LABELS)!;
    expect(dto.tripName).toBeNull();
    expect(dto.totals.balance).toBe(0);
    expect(dto.items).toEqual([]);
  });

  it('returns null for a Cancelado', () => {
    expect(toPublicOrder(row({ status: 'cancelled' }), LABELS)).toBeNull();
  });
});

describe('createRateLimiter', () => {
  it('allows a burst of `capacity`, then refills over the window, per key', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 3, windowMs: 3000, now: () => now });
    expect([1, 2, 3, 4].map(() => limiter.take('a'))).toEqual([true, true, true, false]);
    expect(limiter.take('b')).toBe(true);
    now = 999;
    expect(limiter.take('a')).toBe(false);
    now = 1000;
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
  });
});

describe('clientIp', () => {
  it('ignores X-Forwarded-For without trusted proxies', () => {
    expect(clientIp('1.1.1.1', '10.0.0.1', 0)).toBe('10.0.0.1');
  });

  it('takes the entry appended by our proxy, not the ones the client can forge', () => {
    expect(clientIp('1.1.1.1', '10.0.0.1', 1)).toBe('1.1.1.1');
    expect(clientIp('6.6.6.6, 1.1.1.1', '10.0.0.1', 1)).toBe('1.1.1.1');
    expect(clientIp(['6.6.6.6', '1.1.1.1, 2.2.2.2'], '10.0.0.1', 2)).toBe('1.1.1.1');
  });

  it('falls back to the socket when the chain is shorter than expected', () => {
    expect(clientIp('1.1.1.1', '10.0.0.1', 2)).toBe('10.0.0.1');
    expect(clientIp(undefined, '10.0.0.1', 1)).toBe('10.0.0.1');
    expect(clientIp(' , ', '10.0.0.1', 1)).toBe('10.0.0.1');
  });
});

describe('loadConfig TRUSTED_PROXY_HOPS', () => {
  const base = {
    JWT_SECRET: 'x'.repeat(32), CORS_ORIGIN: 'http://a', HASURA_GRAPHQL_URL: 'http://h', HASURA_ADMIN_SECRET: 's',
    ADMIN_USERNAME: 'u', ADMIN_PASSWORD: 'p',
  };
  it('defaults to 0 and accepts non-negative integers', () => {
    expect(loadConfig(base).trustedProxyHops).toBe(0);
    expect(loadConfig({ ...base, TRUSTED_PROXY_HOPS: '1' }).trustedProxyHops).toBe(1);
    expect(() => loadConfig({ ...base, TRUSTED_PROXY_HOPS: '-1' })).toThrow();
  });
});

describe('GET /public/orders/{token}', () => {
  const ORIGIN = 'http://localhost:3000';
  function buildServer(store: PublicOrderStore, requests = 100) {
    return createServer({
      config: { port: 0, host: 'localhost', corsOrigins: [ORIGIN], jwt: { secret: 'x'.repeat(32), expiresInSeconds: 60 } },
      adminUsers: { findByUsername: async () => null, count: async () => 0, create: async () => {} },
      publicOrders: store,
      publicRateLimit: { requests, windowSeconds: 60 },
    });
  }
  const dto = toPublicOrder(row(), LABELS)!;
  const lookups: string[] = [];
  const store: PublicOrderStore = {
    findByToken: async (token) => {
      lookups.push(token);
      return token === TOKEN ? dto : null;
    },
  };

  it('returns the DTO with no-store and CORS for the frontend origin only', async () => {
    const server = buildServer(store);
    const res = await server.inject({ url: `/public/orders/${TOKEN}`, headers: { origin: ORIGIN } });
    expect(res.statusCode).toBe(200);
    expect(res.result).toEqual(dto);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);

    const other = await server.inject({ url: `/public/orders/${TOKEN}`, headers: { origin: 'https://evil.example' } });
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers the same 404 for a malformed, unknown or missing token, without querying malformed ones', async () => {
    const server = buildServer(store);
    lookups.length = 0;
    const bodies = [];
    for (const path of [`/public/orders/${'b'.repeat(48)}`, '/public/orders/not-a-token', `/public/orders/${TOKEN.toUpperCase()}`,
      '/public/orders/', `/public/orders/${TOKEN}/x`]) {
      const res = await server.inject({ url: path });
      expect(res.statusCode).toBe(404);
      bodies.push(res.payload);
    }
    expect(new Set(bodies)).toEqual(new Set([JSON.stringify(NOT_FOUND_BODY)]));
    expect(lookups).toEqual(['b'.repeat(48)]);
  });

  it('answers 500 without details when the lookup fails', async () => {
    const res = await buildServer({ findByToken: async () => { throw new Error('Hasura error: secret stuff'); } })
      .inject({ url: `/public/orders/${TOKEN}` });
    expect(res.statusCode).toBe(500);
    expect(res.payload).not.toContain('secret');
  });

  it('rate limits per IP (malformed tokens count too)', async () => {
    const server = buildServer(store, 3);
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await server.inject({ url: '/public/orders/x' })).statusCode);
    expect(codes).toEqual([404, 404, 404, 429]);
    const limited = await server.inject({ url: `/public/orders/${TOKEN}` });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.headers['retry-after']).toBe('60');
  });
});
