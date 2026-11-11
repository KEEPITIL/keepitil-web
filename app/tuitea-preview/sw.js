// TUITEA PREVIEW worker: no cache at all. Every request goes to the network, so the preview is
// always the build that was published. It exists only to outrank the site-wide /sw.js here.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
