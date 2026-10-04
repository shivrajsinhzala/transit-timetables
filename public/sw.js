/*
 * Stopwatch offline support. Timetables are static, so a page a rider has opened once keeps
 * working with no signal (a ferry, a mountain road, a basement exchange):
 * - pages: network first, falling back to the last copy, then to /offline;
 * - fingerprinted assets (/_astro/*), icons and map data: cache first;
 * - everything else (ads, map tiles): left to the browser, never cached here.
 */
const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const MAX_PAGES = 80;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(['/', '/offline'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![PAGES, ASSETS].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        if (res.ok) { cache.put(req, res.clone()); trim(cache); }
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('/offline')) || Response.error();
      }
    })());
    return;
  }

  if (/^\/(_astro|geo|og)\/|\.(png|svg|woff2|webmanifest)$/.test(url.pathname) || url.pathname === '/search.json') {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      if (hit && url.pathname !== '/search.json') return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
  }
});
