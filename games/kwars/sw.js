// COMING SOON kill switch (Joe, 2026-11-11). The game's worker is kept as sw.play.js (not deployed). This worker removes this
// game's own caches only (the Cache API is origin-wide), unregisters itself and claims and reloads open pages so they reach the gate page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()   // take over already-open tabs, so navigate() below reaches them and they gate now
  .then(() => caches.keys())
  .then(ks => Promise.all(ks.filter(k => ["kwars-"].some(p => k.indexOf(p) === 0)).map(k => caches.delete(k))))
  .then(() => self.registration.unregister())
  .then(() => self.clients.matchAll({ type: 'window' }))
  .then(cs => cs.forEach(c => c.navigate(c.url)))));
