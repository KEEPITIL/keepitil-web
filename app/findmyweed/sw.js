// Find My Weed service worker. Scope: this folder only (the folder sw.js is served from), registered by js/sw-register.js. It never touches the host site's own worker (scope /): its caches
// are all named "fmw-*" and it only ever deletes "fmw-*" caches. CONSERVATIVE by design (Grok 2026-11-25):
//   - pages (navigations): NETWORK-FIRST; the last good copy is a fallback only when the network fails, then a small built-in offline page (no file, so no extra page to maintain). Account and sign-up pages are NEVER cached.
//   - static files (css, js, images, icons, fonts, same origin): a VERSIONED cache (fmw-static-vN). Files with a ?v= stamp are cache-first (the URL changes with the content);
//     other css/js stay network-first; images and icons are stale-while-revalidate.
//   - data/*.json: a SHORT stale-while-revalidate: a copy younger than DATA_FRESH_MS is served and refreshed behind it; an older one is used only when the network fails.
//   - everything else (non-GET, other origins such as the auth project, requests with credentials/Authorization, /auth paths, sw-flag.json) is left to the browser.
//   - KILL SWITCH: sw-flag.json { "enabled": true, "minVersion": N }. If enabled is false, or minVersion is higher than SW_VERSION, the worker (and the page script) unregisters
//     itself and deletes every fmw-* cache. Ship a new worker or flip the flag; no user action needed.
// No secret, no tracking, no analytics, no push, no background sync.
var SW_VERSION = 1;
var STATIC = 'fmw-static-v' + SW_VERSION;
var PAGES = 'fmw-pages-v' + SW_VERSION;
var DATA = 'fmw-data-v' + SW_VERSION;
var KEEP = [STATIC, PAGES, DATA];
var DATA_FRESH_MS = 5 * 60 * 1000;
var PAGE_LIMIT = 30;
var CHECK_MS = 10 * 60 * 1000;   // the kill-switch flag is re-read on a navigation at most this often (and on every activate)
var dead = false, lastCheck = -Infinity;
var BASE = (function () { var p = self.location.pathname; return p.slice(0, p.lastIndexOf('/') + 1); })();   // e.g. the site folder with a trailing slash
var NEVER_CACHE_PAGES = /(^|\/)(account|signup)\.html$/;
var STATIC_EXT = /\.(css|js|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/i;
var IMAGE_EXT = /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/i;
var PRECACHE = ['css/fmw.css'];

function isOurs(url) { return url.origin === self.location.origin && url.pathname.indexOf(BASE) === 0; }
function rel(url) { return url.pathname.slice(BASE.length); }

function offlinePage() {
  var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\'; img-src \'self\'; base-uri \'none\'; form-action \'none\'; object-src \'none\'">' +
    '<meta name="robots" content="noindex,nofollow"><title>Offline | Find My Weed</title><link rel="stylesheet" href="' + BASE + 'css/fmw.css"></head>' +
    '<body><main id="main"><h1>You are offline</h1><p>Find My Weed needs a connection to search. Reconnect, then try again.</p><p><a href="' + BASE + '">Try again</a></p></main></body></html>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
function killed(flag) { return !flag || flag.enabled === false || (typeof flag.minVersion === 'number' && flag.minVersion > SW_VERSION); }
function readFlag() {
  return fetch(BASE + 'sw-flag.json', { cache: 'no-store' }).then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; });
}
function selfDestruct() {
  dead = true;   // stop handling requests at once; nothing is re-cached while the caches are being removed
  return caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('fmw-') === 0; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.registration.unregister(); });
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(STATIC).then(function (c) { return Promise.allSettled(PRECACHE.map(function (u) { return c.add(BASE + u); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    readFlag().then(function (flag) {
      if (flag && killed(flag)) return selfDestruct();
      return caches.keys().then(function (ks) {
        return Promise.all(ks.filter(function (k) { return k.indexOf('fmw-') === 0 && KEEP.indexOf(k) === -1; }).map(function (k) { return caches.delete(k); }));   // ONLY fmw-* caches, never kil-* or any other app's
      }).then(function () { return self.clients.claim(); });
    })
  );
});

function trim(cache, limit) {
  return cache.keys().then(function (ks) { return ks.length > limit ? cache.delete(ks[0]).then(function () { return trim(cache, limit); }) : null; });
}

function stamped(resp) {   // a copy that remembers when it was stored (for the data freshness window)
  var h = new Headers(resp.headers); h.set('x-fmw-cached-at', String(Date.now()));
  return resp.clone().blob().then(function (b) { return new Response(b, { status: resp.status, statusText: resp.statusText, headers: h }); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (dead || req.method !== 'GET') return;
  var url = new URL(req.url);
  if (!isOurs(url)) return;                                   // other origins (the auth project, anything else) and other folders: untouched
  var r = rel(url);
  if (r === 'sw.js' || r === 'sw-flag.json' || r.indexOf('auth') === 0) return;
  if (req.headers.get('authorization')) return;

  // pages
  if (req.mode === 'navigate') {
    if (Date.now() - lastCheck > CHECK_MS) { lastCheck = Date.now(); e.waitUntil(readFlag().then(function (f) { return f && killed(f) ? selfDestruct() : null; })); }
    if (NEVER_CACHE_PAGES.test(url.pathname)) return;          // sign-in / account: always the network, nothing stored
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok && res.type !== 'opaque' && !res.redirected) { var copy = res.clone(); e.waitUntil(caches.open(PAGES).then(function (c) { return c.put(req, copy).then(function () { return trim(c, PAGE_LIMIT); }); })); }
        return res;
      }).catch(function () {
        return caches.match(req, { cacheName: PAGES }).then(function (hit) { return hit || offlinePage(); });
      })
    );
    return;
  }

  // data: short stale-while-revalidate
  if (/^data\/.+\.json$/.test(r)) {
    e.respondWith(
      caches.open(DATA).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var age = hit ? Date.now() - Number(hit.headers.get('x-fmw-cached-at') || 0) : Infinity;
          var refresh = function () {
            return fetch(req).then(function (res) { if (res && res.ok) { return stamped(res).then(function (s) { return cache.put(req, s).then(function () { return res; }); }); } return res; });
          };
          if (hit && age <= DATA_FRESH_MS) { e.waitUntil(refresh().catch(function () {})); return hit; }
          return refresh().catch(function () { return hit || Response.error(); });   // stale copy only when the network fails
        });
      })
    );
    return;
  }

  // static files
  if (STATIC_EXT.test(url.pathname)) {
    e.respondWith(
      caches.open(STATIC).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var fetchAndStore = function () { return fetch(req).then(function (res) { if (res && res.ok) cache.put(req, res.clone()); return res; }); };
          if (url.search.indexOf('v=') !== -1 && hit) return hit;                       // stamped: the URL IS the version
          if (IMAGE_EXT.test(url.pathname)) { var p = fetchAndStore().catch(function () { return hit; }); return hit || p; }   // images / icons / fonts: stale-while-revalidate
          return fetchAndStore().catch(function () { return hit || Response.error(); });   // unstamped css / js: network-first
        });
      })
    );
  }
});
