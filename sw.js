const CACHE_VERSION = '1.26268.1';
const CACHE = `stm-${CACHE_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
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
  // Network-first for HTML so deployed updates are picked up without manual cache clearing.
  if (e.request.destination === 'document' || e.request.url.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});
