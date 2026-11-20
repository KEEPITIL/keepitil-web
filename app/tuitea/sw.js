// TUITEA web "updating" kill switch (C193-2 option 3). DRAFT, not published.
// The previous worker (release 90.49569cf) served the whole app shell CACHE-ONLY from
// "tuitea-release-90.49569cf", so a returning installed user would keep seeing the old app
// until a new worker activated. This replacement takes over at once (skipWaiting + claim),
// deletes ONLY TUITEA's own caches (tuitea-*), and reloads open TUITEA pages so they fetch
// the static "updating" page from the network. It has no fetch handler, so every request
// goes straight to the network. It sends nothing anywhere.
// It deliberately does NOT unregister: pwa.js on /app/tuitea/ and /app/tuitea/app.html
// re-registers /app/tuitea/sw.js on load, so unregistering + navigating would loop.
// Rollback: restore the previous sw.js and app/index.html from
// git (main at 50ffb88): git checkout 50ffb88 -- app/tuitea/sw.js app/tuitea/app/index.html
// Do not just delete this file: a 404 leaves the old worker and its cache in place.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k.startsWith('tuitea-')).map((k) => caches.delete(k)));
    await self.clients.claim();
    const cs = await self.clients.matchAll({ type: 'window' });
    for (const c of cs) { try { await c.navigate(c.url); } catch (err) {} }
  })());
});
