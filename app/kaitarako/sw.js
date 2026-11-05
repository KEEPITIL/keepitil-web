// Kai Tarako kill switch. The web app is gone (#38); browsers that installed it still run the old worker,
// which served cached photo-style art. This replacement deletes only Kai Tarako's caches, unregisters itself
// and reloads its own open pages. It sends nothing anywhere.
// Rollback: restore the previous sw.js from git (commit 53c678d) and the app files; do not just delete this file,
// because a 404 leaves the old worker and its cache in place.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k.startsWith('kai-tarako-')).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const cs = await self.clients.matchAll({ type: 'window' });
    for (const c of cs) c.navigate(c.url);
  })());
});
