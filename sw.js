const CACHE_VERSION = '1.26269.3';
const CACHE = `stm-${CACHE_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/app-icon.svg',
  './assets/apple-touch-icon.png',
  './css/styles.css',
  './js/app.js',
  './js/game.js',
  './js/lineup.js',
  './js/persistence.js',
  './js/profile-normalizer.js',
  './js/roster.js',
  './js/state.js',
  './js/summary.js',
  './js/utils.js',
  './js/version.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;

  // Prefer current deployed assets while online, retaining the cache as an
  // offline fallback. This prevents an older worker from pinning stale JS.
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (!response.ok) return response;
        const copy = response.clone();
        return caches.open(CACHE)
          .then(cache => cache.put(e.request, copy))
          .then(() => response);
      })
      .catch(() => caches.match(e.request))
  );
});
