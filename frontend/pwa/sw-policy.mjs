/**
 * Which requests the service worker may cache. Pure on purpose: it is unit-tested
 * (pwa/sw-policy.test.mjs) and inlined verbatim into the generated sw.js by scripts/build-pwa.mjs
 * (the `export` keywords are stripped there), so the tested code is the shipped code.
 *
 * Policy (financial data is private, so the default is "do not cache"):
 *  - 'cache'        GET, same origin, under the app's basePath, without an Authorization header.
 *  - 'network-only' everything else: Hasura, Hapi, Cloudinary (other origins), POSTs,
 *                   anything carrying the JWT, and API-looking paths.
 */

const API_PATH = /^\/(v1\/graphql|v1\/query|auth\/|uploads\/)/;

/**
 * @param {{ url: string, method: string, headers?: { has(name: string): boolean },
 *           origin: string, basePath: string }} request
 * @returns {'cache' | 'network-only'}
 */
export function routeRequest({ url, method, headers, origin, basePath }) {
  if (method !== 'GET') return 'network-only';
  if (headers && headers.has('authorization')) return 'network-only';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'network-only';
  }
  if (parsed.origin !== origin) return 'network-only';
  const { pathname } = parsed;
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return 'network-only';
  if (API_PATH.test(pathname.slice(basePath.length))) return 'network-only';
  if (pathname === `${basePath}/sw.js`) return 'network-only';
  return 'cache';
}

/** Hashed build assets never change for a given URL, so they can be served cache-first. */
export function isImmutableAsset(pathname, basePath) {
  return pathname.startsWith(`${basePath}/_next/static/`);
}
