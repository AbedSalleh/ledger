// Ledger — service worker
// Strategy: stale-while-revalidate for same-origin assets — serve from cache
// instantly (offline-capable), but always re-fetch in the background so the
// NEXT load picks up deployed updates without manual cache-version bumps.
const CACHE = 'jambu-shell-v3';
const ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'js/auth.js',
  'js/sheets.js',
  'js/share.js',
  'js/offline.js',
  'js/dashboard.js',
  'js/inventory.js',
  'js/statement.js',
  'js/test.js',
  'js/app.js',
  'manifest.json',
  'icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never intercept Google APIs / auth — only same-origin shell assets.
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const refresh = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit); // offline: fall back to cache
      return hit || refresh;
    })
  );
});
