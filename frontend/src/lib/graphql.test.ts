import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphQLRequestError, gqlRequest } from './graphql';
import { saveSession } from './session';

function fakeJwt(exp: number): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode({ exp })}.signature`;
}

function respondWith(body: object, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('gqlRequest', () => {
  const assign = vi.fn();

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    vi.stubGlobal('window', { location: { pathname: '/viajes/', assign } });
    assign.mockReset();
    saveSession({ token: fakeJwt(Date.now() / 1000 + 3600), expiresAt: '' });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends the JWT and returns data', async () => {
    const fetchMock = respondWith({ data: { ok: true } });
    await expect(gqlRequest('{ ok }')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]![1].headers.authorization).toMatch(/^Bearer /);
  });

  it('redirects to login when Hasura rejects the JWT', async () => {
    respondWith({ errors: [{ message: 'JWTExpired', extensions: { code: 'invalid-jwt' } }] });
    await expect(gqlRequest('{ ok }')).rejects.toBeInstanceOf(GraphQLRequestError);
    expect(assign).toHaveBeenCalledWith('/login/');
    expect(localStorage.getItem('conkora.session')).toBeNull();
  });

  it('redirects to login without calling Hasura when the session expired', async () => {
    saveSession({ token: fakeJwt(Date.now() / 1000 - 10), expiresAt: '' });
    const fetchMock = respondWith({ data: {} });
    await expect(gqlRequest('{ ok }')).rejects.toBeInstanceOf(GraphQLRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('/login/');
  });

  it('throws other GraphQL errors without logging out', async () => {
    respondWith({ errors: [{ message: 'boom', extensions: { code: 'constraint-violation' } }] });
    const error = (await gqlRequest('{ ok }').catch((e: unknown) => e)) as GraphQLRequestError;
    expect(error.code).toBe('constraint-violation');
    expect(assign).not.toHaveBeenCalled();
  });
});
