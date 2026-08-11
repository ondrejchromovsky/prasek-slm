/* Prášek SLM — service worker
   Cíl: aplikace se spustí i úplně bez internetu, ale když síť je,
   sama si stáhne novou verzi. Data aplikace (IndexedDB) se tohoto
   souboru netýkají — ta zůstávají v zařízení nezávisle na cache. */

const VERSION = 'v3.1.0';
const CACHE = 'prasek-slm-' + VERSION;
const TIMEOUT = 4000;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

/* --- instalace: předcachovat aplikaci --- */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      /* addAll spadne, když chybí jediný soubor — proto po jednom */
      Promise.all(ASSETS.map(u => c.add(u).catch(() => null)))
    )
  );
});

/* --- aktivace: uklidit staré verze cache --- */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('prasek-slm-') && k !== CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* --- ruční přepnutí na novou verzi (z tlačítka Aktualizovat) --- */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* --- strategie --- */
const withTimeout = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout')), ms);
  p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); });
});

/* HTML: nejdřív síť (kvůli aktualizacím), při výpadku cache */
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const net = await withTimeout(fetch(req), TIMEOUT);
    if (net && net.ok) cache.put(req, net.clone());
    return net;
  } catch (err) {
    return (await cache.match(req))
        || (await cache.match('./index.html'))
        || (await cache.match('./'))
        || Response.error();
  }
}

/* ostatní soubory: nejdřív cache (rychlé a offline) */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const net = await fetch(req);
    if (net && net.ok) cache.put(req, net.clone());
    return net;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;

  const isHTML = req.mode === 'navigate'
    || (req.headers.get('accept') || '').includes('text/html');

  e.respondWith(isHTML ? networkFirst(req) : cacheFirst(req));
});
