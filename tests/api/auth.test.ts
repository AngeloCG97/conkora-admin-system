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
