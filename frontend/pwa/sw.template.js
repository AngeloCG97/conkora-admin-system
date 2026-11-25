/* ConKora service worker. Generated into out/sw.js by scripts/build-pwa.mjs, which replaces the
 * placeholders and inlines pwa/sw-policy.mjs. Only static, same-origin files of the app shell are
 * cached; see sw-policy.mjs for what is never cached (Hasura, Hapi, Cloudinary, Authorization). */
const BASE_PATH = '__BASE_PATH__';
const CACHE = 'conkora-__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `${BASE_PATH}/`;

/*__POLICY__*/

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page asks for it when the user accepts the update.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('conkora-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** Navigations are cached without their query string (?id=...): all share one HTML file. */
function cacheKey(request) {
  const url = new URL(request.url);
  url.search = '';
  return url.href;
}

async function store(key, response) {
  if (response.ok && response.type === 'basic' && !response.redirected) {
    const cache = await caches.open(CACHE);
    await cache.put(key, response.clone());
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await store(request, response);
  return response;
}

async function networkFirst(request) {
  const key = request.mode === 'navigate' ? cacheKey(request) : request;
  try {
    const response = await fetch(request);
    await store(key, response);
    return response;
  } catch (error) {
    const cached = (await caches.match(key)) || (request.mode === 'navigate' ? await caches.match(SHELL) : undefined);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const decision = routeRequest({
    url: request.url,
    method: request.method,
    headers: request.headers,
    origin: self.location.origin,
    basePath: BASE_PATH,
  });
  if (decision !== 'cache') return; // network-only: the browser handles it, nothing is stored
  const { pathname } = new URL(request.url);
  event.respondWith(isImmutableAsset(pathname, BASE_PATH) ? cacheFirst(request) : networkFirst(request));
});
