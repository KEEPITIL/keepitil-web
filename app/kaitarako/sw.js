// Kai Tarako offline cache. Same-origin GETs only; no data is ever sent anywhere.
const CACHE = 'kai-tarako-v4';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon-192.png', './brand/logo.webp', './mascot/wave.webp', './mascot/badge-happy.webp', './mascot/badge-wave.webp', './mascot/badge-cheer.webp', './mascot/badge-nudge.webp', './mascot/lets-trace.webp', './mascot/you-did-it.webp', './mascot/great-job.webp'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Network first so updates land; fall back to cache when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
  );
});
