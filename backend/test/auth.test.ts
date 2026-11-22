import { decodeJwt, jwtVerify } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdminUser, AdminUserStore } from '../src/auth/admin-users.ts';
import { ensureInitialAdmin } from '../src/auth/initial-admin.ts';
import { hashPassword, verifyPassword } from '../src/auth/passwords.ts';
import { HASURA_CLAIMS_NAMESPACE } from '../src/auth/tokens.ts';
import { INVALID_CREDENTIALS_MESSAGE } from '../src/routes/auth.ts';
import { createServer } from '../src/server.ts';

const JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

function memoryStore(users: AdminUser[] = []): AdminUserStore & { users: AdminUser[] } {
  return {
    users,
    async findByUsername(username) {
      return users.find((u) => u.username === username) ?? null;
    },
    async count() {
      return users.length;
    },
    async create(username, passwordHash) {
      users.push({ id: `id-${users.length + 1}`, username, passwordHash });
    },
  };
}

function buildServer(store: AdminUserStore) {
  return createServer({
    config: {
      port: 0,
      host: 'localhost',
      corsOrigins: ['http://localhost:3000'],
      jwt: { secret: JWT_SECRET, expiresInSeconds: 3600 },
    },
    adminUsers: store,
  });
}

describe('POST /auth/login', () => {
  let store: ReturnType<typeof memoryStore>;

  beforeAll(async () => {
    store = memoryStore([
      { id: '00000000-0000-0000-0000-000000000001', username: 'ana', passwordHash: await hashPassword('s3creta') },
    ]);
  });

  it('returns a manager JWT with an expiration for valid credentials', async () => {
    const res = await buildServer(store).inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'ana', password: 's3creta' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.result as { token: string; expiresAt: string };
    const { payload } = await jwtVerify(body.token, new TextEncoder().encode(JWT_SECRET));
    expect(payload[HASURA_CLAIMS_NAMESPACE]).toEqual({
      'x-hasura-default-role': 'manager',
      'x-hasura-allowed-roles': ['manager'],
      'x-hasura-user-id': '00000000-0000-0000-0000-000000000001',
    });
    expect(payload.exp).toBe(payload.iat! + 3600);
    expect(new Date(body.expiresAt).getTime()).toBe(decodeJwt(body.token).exp! * 1000);
  });

  it.each([
    ['wrong password', { username: 'ana', password: 'nope' }],
    ['unknown user', { username: 'otra', password: 's3creta' }],
  ])('returns 401 with a generic message for %s', async (_case, payload) => {
    const res = await buildServer(store).inject({ method: 'POST', url: '/auth/login', payload });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.payload).message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await buildServer(store).inject({ method: 'POST', url: '/auth/login', payload: { username: 'ana' } });
    expect(res.statusCode).toBe(400);
  });

  it('only allows the configured CORS origin', async () => {
    const server = buildServer(store);
    const allowed = await server.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const denied = await server.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('GET /health', () => {
  it('responds ok', async () => {
    const res = await buildServer(memoryStore()).inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.result).toEqual({ status: 'ok' });
  });
});

describe('ensureInitialAdmin', () => {
  it('creates the admin with a bcrypt hash when there are no admins', async () => {
    const store = memoryStore();
    expect(await ensureInitialAdmin(store, { username: 'admin', password: 'pw' })).toBe(true);
    expect(store.users).toHaveLength(1);
    expect(store.users[0]!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword('pw', store.users[0]!.passwordHash)).toBe(true);
  });

  it('does nothing when an admin already exists', async () => {
    const store = memoryStore([{ id: 'x', username: 'ana', passwordHash: 'h' }]);
    expect(await ensureInitialAdmin(store, { username: 'admin', password: 'pw' })).toBe(false);
    expect(store.users).toHaveLength(1);
  });
});
