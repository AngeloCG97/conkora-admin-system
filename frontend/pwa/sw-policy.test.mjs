import { describe, expect, it } from 'vitest';
import { isImmutableAsset, routeRequest } from './sw-policy.mjs';

const ORIGIN = 'https://angelocg97.github.io';
const BASE = '/conkora-admin-system';

const route = (url, { method = 'GET', headers = {}, basePath = BASE, origin = ORIGIN } = {}) =>
  routeRequest({ url, method, headers: new Headers(headers), origin, basePath });

describe('routeRequest', () => {
  it.each([
    `${ORIGIN}${BASE}/`,
    `${ORIGIN}${BASE}/viajes/`,
    `${ORIGIN}${BASE}/viajes/detalle/?id=abc`,
    `${ORIGIN}${BASE}/_next/static/chunks/app.js`,
    `${ORIGIN}${BASE}/_next/static/media/nunito.woff2`,
    `${ORIGIN}${BASE}/icons/icon-192.png`,
    `${ORIGIN}${BASE}/manifest.webmanifest`,
  ])('caches same-origin static file %s', (url) => {
    expect(route(url)).toBe('cache');
  });

  it.each([
    'https://conkora.hasura.app/v1/graphql',
    'https://conkora-api.onrender.com/auth/login',
    'https://conkora-api.onrender.com/health',
    'https://res.cloudinary.com/demo/image/upload/v1/foto.jpg',
    'https://api.cloudinary.com/v1_1/demo/image/upload',
    'http://localhost:8080/v1/graphql',
  ])('never caches cross-origin %s', (url) => {
    expect(route(url)).toBe('network-only');
  });

  it('never caches a request that carries an Authorization header, even for a static path', () => {
    expect(route(`${ORIGIN}${BASE}/_next/static/chunks/a.js`, { headers: { Authorization: 'Bearer x' } })).toBe(
      'network-only',
    );
  });

  it('never caches non-GET requests', () => {
    expect(route(`${ORIGIN}${BASE}/viajes/`, { method: 'POST' })).toBe('network-only');
  });

  it('ignores same-origin API-looking paths and other sites on the same origin', () => {
    expect(route(`${ORIGIN}${BASE}/v1/graphql`)).toBe('network-only');
    expect(route(`${ORIGIN}${BASE}/auth/login`)).toBe('network-only');
    expect(route(`${ORIGIN}/otro-proyecto/`)).toBe('network-only');
    expect(route(`${ORIGIN}${BASE}-otro/`)).toBe('network-only');
  });

  it('does not cache the service worker itself and rejects invalid URLs', () => {
    expect(route(`${ORIGIN}${BASE}/sw.js`)).toBe('network-only');
    expect(route('not a url')).toBe('network-only');
  });

  it('works without basePath (local)', () => {
    const origin = 'http://localhost:3000';
    expect(route(`${origin}/viajes/`, { basePath: '', origin })).toBe('cache');
    expect(route(`${origin}/v1/graphql`, { basePath: '', origin })).toBe('network-only');
    expect(route('http://localhost:8080/v1/graphql', { basePath: '', origin })).toBe('network-only');
  });
});

describe('isImmutableAsset', () => {
  it('is true only for hashed build assets under the basePath', () => {
    expect(isImmutableAsset(`${BASE}/_next/static/chunks/a.js`, BASE)).toBe(true);
    expect(isImmutableAsset(`${BASE}/viajes/`, BASE)).toBe(false);
    expect(isImmutableAsset('/_next/static/a.js', BASE)).toBe(false);
  });
});
