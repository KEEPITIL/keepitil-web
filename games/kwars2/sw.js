// KWARS2 — Kingdom Wars II · offline service worker
// The game is a single self-contained index.html, so the cache is small.
// Bump CACHE (date/time) whenever the build is redeployed to force an update.
const CACHE = 'kwars2-v4';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './src/styles/shell.css',
  './src/systems/build-info.js', './src/data/civilizations.js', './src/core/roles.js',
  './src/core/save.js', './src/core/profile.js', './src/render/depth.js',
  './src/render/soldier25d.js', './src/render/poses.js', './src/render/battlefield.js',
  './src/core/battle.js', './src/systems/shell.js', './src/systems/game.js',
  './app-icon-192.png', './app-icon-512.png', './app-icon-maskable.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  // addAll() reads through the browser HTTP cache. When a deploy lands inside
  // the CDN's max-age window, a freshly named cache installs itself full of the
  // PREVIOUS build and then keeps re-validating into that same stale entry, so
  // the client stays pinned to the old build even though the cache name changed.
  // This is the exact bug that shipped on KWARS1 and was fixed in its build 54.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(u =>
    fetch(new Request(u, {cache: 'reload'}))
      .then(res => res && res.ok ? c.put(u, res) : null)
      .catch(() => null)
  ))).then(() => self.skipWaiting()));
});

// Cache scope: `caches` is ORIGIN-wide, so a naive `k !== CACHE` sweep would
// delete the OTHER KWARS games' live caches and break their offline mode.
// Only this game's own namespace and its own retired ancestors are purged.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ((k.indexOf('kwars2-')===0 && k !== CACHE) || k.indexOf('aow2-v')===0 || k.indexOf('ravewars')===0 || k.indexOf('rave-wars')===0)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Navigations: try network first (fresh gameplay), fall back to cached shell offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => { if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Everything else: cache-first with background refresh.
  e.respondWith(
    caches.match(e.request).then(hit => {
      // no-cache: always revalidate against the origin, so a stale HTTP-cache
      // entry can never keep re-seeding the SW cache with the old build.
      const fetched = fetch(new Request(e.request, {cache: 'no-cache'}))
        .then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
        .catch(() => hit);
      return hit || fetched;
    })
  );
});
