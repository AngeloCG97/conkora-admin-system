import { describe, expect, it } from 'vitest';
import { isSessionValid, tokenExpiry } from './session';

function fakeJwt(payload: object): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`;
}

describe('tokenExpiry', () => {
  it('reads exp from the JWT payload', () => {
    expect(tokenExpiry(fakeJwt({ exp: 1_800_000_000 }))).toEqual(new Date(1_800_000_000_000));
  });

  it('returns null for malformed tokens or tokens without exp', () => {
    expect(tokenExpiry('not-a-jwt')).toBeNull();
    expect(tokenExpiry(fakeJwt({ sub: 'x' }))).toBeNull();
  });
});

describe('isSessionValid', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const at = (iso: string) => ({ token: fakeJwt({ exp: Date.parse(iso) / 1000 }), expiresAt: iso });

  it('accepts a token that has not expired', () => {
    expect(isSessionValid(at('2026-01-01T01:00:00Z'), now)).toBe(true);
  });

  it('rejects expired, malformed or missing sessions', () => {
    expect(isSessionValid(at('2025-12-31T23:00:00Z'), now)).toBe(false);
    expect(isSessionValid({ token: 'garbage', expiresAt: '' }, now)).toBe(false);
    expect(isSessionValid(null, now)).toBe(false);
  });
});
