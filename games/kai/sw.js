// Kai Tarako offline cache. Same-origin GETs only; no data is ever sent anywhere.
// The build (vite.config.ts, swPrecache) replaces CACHE with a fingerprint of the build and PRECACHE with every
// file in it, so each deploy installs a new worker that downloads the complete new app before it takes over.
const CACHE = 'kai-tarako-c80d3d88f333';
// ONE CACHE PER SCOPE (Grok 08:23): the same build can be served from two folders of one origin (/app/kaitarako/ and
// /games/kai/), and both share cache storage. So the cache name carries a tag of THIS worker's own scope, worked out at
// run time (the build is the same file in both folders): kai-tarako-<scope tag>-<build>. Activation removes only older
// caches of the SAME scope, never another folder's Kai Tarako.
const scopeTag = (scope) => { let h = 5381; for (const ch of new URL(scope).pathname) h = (Math.imul(h, 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(16).padStart(8, '0'); };
const PREFIX = 'kai-tarako-' + scopeTag(self.registration.scope) + '-';
const NAME = PREFIX + CACHE.slice('kai-tarako-'.length);
// A cache from before this rule (kai-tarako-<build>, no scope tag) belongs to whichever folder's files it holds.
const LEGACY = /^kai-tarako-[^-]+$/;
const keyUrl = (r) => (typeof r === 'string' ? r : r.url);
const ownsLegacy = (k) => caches.open(k).then((c) => c.keys()).then((rs) => rs.some((r) => new URL(keyUrl(r), self.registration.scope).href.startsWith(self.registration.scope)));
const PRECACHE = ["./","./apple-touch-icon.png","./assets/all-done-CbEd4dlj.svg","./assets/andika-400-latin-H5rGtLJ7.woff2","./assets/andika-700-latin-Ckk9Lxqk.woff2","./assets/baby-BZEqj2_4.svg","./assets/banana-CJFoy1Kl.svg","./assets/basket-BdCQqSXO.svg","./assets/bell-D6gnnIaq.svg","./assets/bird-BbkU0XPB.svg","./assets/book-BvmXaR8-.svg","./assets/bread-CfRTIaDj.svg","./assets/carrot-Dri8tHm_.svg","./assets/cow-77bETzcL.svg","./assets/drum-lPn6tmx2.svg","./assets/duck--BYZUYHK.svg","./assets/eat-Oxkl07Kd.svg","./assets/index-BLknSQJv.css","./assets/index-DfCaxaK-.js","./assets/milk-DutZHE5x.svg","./assets/more-BHy06evs.svg","./assets/paw-Bp9lqqw5.svg","./assets/sheep-CNGYMp3d.svg","./assets/shoe-CmbYCaYM.svg","./brand/logo.png","./frame-guard.js","./icon-192.png","./icon-512.png","./index.html","./licenses.html","./manifest.webmanifest","./mascot/kai-hero.svg","./mascot/placeholder.svg","./privacy.html"];
// Install must succeed even if one precache file is missing (ported from #25): addAll() rejects the whole install on a single
// 404, so the page would never get a worker and could not run offline. Each file is fetched on its own; a missing one is skipped
// (the network-first fetch handler still fills it in later).
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(NAME);
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch {
        /* one missing file must not stop the worker from installing */
      }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  // Cache storage is shared by every app on keepitil.com, and by every folder Kai Tarako is served from: only ever remove
  // OUR OWN SCOPE's old caches (same scope tag, another build), plus an untagged old cache that holds this scope's files.
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.map(async (k) => ((k.startsWith(PREFIX) && k !== NAME) || (LEGACY.test(k) && (await ownsLegacy(k))) ? caches.delete(k) : false))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only GET requests inside this app's own path (the worker's scope, e.g. /app/kaitarako/): never other KEEPITIL apps.
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  // ignoreVary: hosts often send "Vary: Origin". A module script is requested WITH an Origin header, but the
  // precached copy was stored without one, so a strict match misses and the app can't start offline. Same URL,
  // same build, our own cache: the Vary check adds nothing here (found by the Q1 offline reload test).
  const fromCache = () => caches.open(NAME).then((c) => c.match(req, { ignoreVary: true }));
  // Only a page navigation may fall back to index.html; a missing script, style or image must never get HTML.
  const offlinePage = () => (req.mode === 'navigate' ? caches.open(NAME).then((c) => c.match('./index.html', { ignoreVary: true })) : undefined);
  // Network first so updates land. Fall back to OUR cache when offline, and also when the server answers with an
  // error (e.g. a page cached before a deploy asking for a file the deploy replaced), instead of passing a 404 on.
  const network = fetch(req);
  // Take the cache copy first (before the page reads the body), and register the write's lifetime synchronously,
  // inside the fetch event. The write runs in the background and its errors are ignored; the response is not delayed.
  const copy = network.then((res) => (res.ok ? res.clone() : null), () => null);
  e.waitUntil(copy.then((c) => c && caches.open(NAME).then((cache) => cache.put(req, c))).catch(() => {}));
  e.respondWith(
    network
      .then((res) => (res.ok ? res : fromCache().then((r) => r || res)))
      .catch(() => fromCache().then((r) => r || offlinePage() || Response.error())),
  );
});
