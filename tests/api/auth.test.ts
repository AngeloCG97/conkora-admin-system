import { describe, expect, it } from 'vitest';
import { env } from '../helpers/env.ts';
import { graphql } from '../helpers/hasura.ts';

/** End-to-end login through Hapi: the issued token must be accepted by Hasura. */

function login(username: string, password: string) {
  return fetch(`${env.apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

describe('POST /auth/login', () => {
  it('logs in the initial admin and returns a token Hasura accepts', async () => {
    const response = await login(env.adminUsername, env.adminPassword);
    expect(response.status).toBe(200);
    const { token, expiresAt } = (await response.json()) as { token: string; expiresAt: string };
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const result = await graphql('{ __typename }', { auth: { token } });
    expect(result.errors).toBeUndefined();
  });

  it('returns 401 with a generic message for bad credentials', async () => {
    const response = await login(env.adminUsername, 'wrong-password');
    expect(response.status).toBe(401);
    expect(((await response.json()) as { message: string }).message).toBe('Usuario o contraseña incorrectos');
  });
});

describe('GET /health', () => {
  it('responds ok', async () => {
    const response = await fetch(`${env.apiUrl}/health`);
    expect(response.status).toBe(200);
  });
});

describe('POST /uploads/signature', () => {
  const sign = (headers: Record<string, string> = {}) =>
    fetch(`${env.apiUrl}/uploads/signature`, { method: 'POST', headers });

  it('rejects requests without a token or with an invalid one', async () => {
    expect((await sign()).status).toBe(401);
    expect((await sign({ authorization: 'Bearer not-a-jwt' })).status).toBe(401);
  });

  it('answers 503 (not configured) or a signature, never crashes, for a valid token', async () => {
    const login = await fetch(`${env.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: env.adminUsername, password: env.adminPassword }),
    });
    const { token } = (await login.json()) as { token: string };
    const response = await sign({ authorization: `Bearer ${token}` });
    if (process.env.CLOUDINARY_API_SECRET) {
      expect(response.status).toBe(200);
      expect(await response.json()).toHaveProperty('signature');
    } else {
      expect(response.status).toBe(503);
      expect(((await response.json()) as { message: string }).message).toContain('Cloudinary');
    }
  });
});
