// Kai Tarako offline cache. Same-origin GETs only; no data is ever sent anywhere.
// The build (vite.config.ts, swPrecache) replaces CACHE with a fingerprint of the build and PRECACHE with every
// file in it, so each deploy installs a new worker that downloads the complete new app before it takes over.
const CACHE = 'kai-tarako-426837e6f54f';
const PRECACHE = ["./","./apple-touch-icon.png","./assets/all-done-CbEd4dlj.svg","./assets/baby-BZEqj2_4.svg","./assets/banana-CJFoy1Kl.svg","./assets/basket-BdCQqSXO.svg","./assets/bell-D6gnnIaq.svg","./assets/bird-BbkU0XPB.svg","./assets/book-BvmXaR8-.svg","./assets/bread-CfRTIaDj.svg","./assets/carrot-Dri8tHm_.svg","./assets/cow-77bETzcL.svg","./assets/drum-lPn6tmx2.svg","./assets/duck--BYZUYHK.svg","./assets/eat-Oxkl07Kd.svg","./assets/index-C_BVOLPt.js","./assets/index-ar0K0geI.css","./assets/milk-DutZHE5x.svg","./assets/more-BHy06evs.svg","./assets/paw-Bp9lqqw5.svg","./assets/sheep-CNGYMp3d.svg","./assets/shoe-CmbYCaYM.svg","./brand/logo.png","./frame-guard.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest","./mascot/kai-hero.svg","./mascot/placeholder.svg","./privacy.html"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // Cache storage is shared by every app on keepitil.com: only ever remove OUR old caches.
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('kai-tarako-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only GET requests inside this app's own path (the worker's scope, e.g. /app/kaitarako/): never other KEEPITIL apps.
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  // ignoreVary: hosts often send "Vary: Origin". A module script is requested WITH an Origin header, but the
  // precached copy was stored without one, so a strict match misses and the app can't start offline. Same URL,
  // same build, our own cache: the Vary check adds nothing here (found by the Q1 offline reload test).
  const fromCache = () => caches.open(CACHE).then((c) => c.match(req, { ignoreVary: true }));
  // Only a page navigation may fall back to index.html; a missing script, style or image must never get HTML.
  const offlinePage = () => (req.mode === 'navigate' ? caches.open(CACHE).then((c) => c.match('./index.html', { ignoreVary: true })) : undefined);
  // Network first so updates land. Fall back to OUR cache when offline, and also when the server answers with an
  // error (e.g. a page cached before a deploy asking for a file the deploy replaced), instead of passing a 404 on.
  const network = fetch(req);
  // Take the cache copy first (before the page reads the body), and register the write's lifetime synchronously,
  // inside the fetch event. The write runs in the background and its errors are ignored; the response is not delayed.
  const copy = network.then((res) => (res.ok ? res.clone() : null), () => null);
  e.waitUntil(copy.then((c) => c && caches.open(CACHE).then((cache) => cache.put(req, c))).catch(() => {}));
  e.respondWith(
    network
      .then((res) => (res.ok ? res : fromCache().then((r) => r || res)))
      .catch(() => fromCache().then((r) => r || offlinePage() || Response.error())),
  );
});
