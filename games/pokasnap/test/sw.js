/* Retired PokaSnap test path: purge old caches, unregister, send every page to the one current build. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('pokasnap-') && k !== 'pokasnap-ddbcf6905967').map(k => caches.delete(k)))).then(() => self.registration.unregister()).then(() => self.clients.matchAll()).then(cs => cs.forEach(c => c.navigate('../play/')))));
