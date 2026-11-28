/* KEEPITIL App service worker v3 — scope "/".
   v3 FIX (Atlas-diagnosed, 2026-07-16): v2 served shared JS cache-first with ignoreSearch,
   so deployed shell updates never reached returning users ("fixes don't stick").
   NEW RULES — code is NEVER served stale:
   - ALL JavaScript and CSS: NETWORK-FIRST. Cache is a fallback for offline only.
   - Page HTML: network-first (unchanged). Supabase: never intercepted (unchanged).
   - Only images/fonts/icons keep stale-while-revalidate (stale pixels can't break logic).
   - VERSION bump evicts every v1/v2 cache on activate + clients.claim().
   To retire this SW: bump VERSION and ship, or restore the self-destruct worker. */
/* CACHE VERSIONS BUMPED 2026-08-26 for the launch closeout. The previous set dated from
   2026-08-22 — before the /v3/ purge, the asset migration and the AI/Radio consolidation — so
   an installed device could still hold entries for files that no longer exist (/keepitil-ai.js,
   /keepitil-radio.js, /v3/*). Navigations and JS/CSS are network-first so the shell itself was
   never stale, but MEDIA is stale-while-revalidate, and bumping evicts those on activate via
   the KEEP list rather than leaving them to age out.
   Previous: kil-pwa-v101-20260910d
   BUMPED AGAIN 2026-08-31 for the route cleanup. Articles moved from /article-<slug>.html to
   /article/<slug>/, and /spotlight plus thirteen *-staging.html pages were deleted. Page HTML is
   network-first so no installed device would have served a stale shell, but MEDIA is
   stale-while-revalidate and the PAGES cache holds up to 40 visited pages — renaming every cache
   makes `activate` evict them rather than letting a retired URL age out of a phone.
   Previous: kil-pwa-v59-20260829f */
/* Earlier note, 2026-08-22 (Founder: "update the mobile version. its showing the old
   version"). The strategy was already network-first for HTML and JS/CSS, so this is not a fix to
   the rules — it is an eviction. Renaming every cache makes `activate` delete the old ones and
   clients.claim() take over immediately, which clears anything a phone or an installed PWA was
   still holding from before. Bump these four names whenever a release must reach returning
   users regardless of what they have cached. */
/* BUMPED 2026-11-20 for the Joe hotfix (5 nav tabs / no Shop, Black Friday popup removed, Earn
   radio + playlist sections removed): renaming PAGES and CODE makes `activate` evict cached page
   HTML and shell JS so an installed phone cannot keep showing the SHOP tab or the popup.
   Previous: kil-pwa-v105-20260912b / kil-pages-v42 / kil-code-v85 */
/* BUMPED AGAIN 2026-11-20 for #200 (install UI opens only on the footer link, no auto banner):
   the shell changed after #198 shipped, so PAGES and CODE are renamed again to evict the #198
   shell from installed phones. Previous: kil-pwa-v106-20261120a / kil-pages-v43 / kil-code-v86 */
/* BUMPED AGAIN 2026-11-20 for the radio fix (seekTo null-guard + SoundCloud frame only when the
   radio is visible; keepitil-radio.js?v=20261124c): every page that loads the radio changed its
   tag, so PAGES and CODE are renamed to evict the old page HTML and radio build from installed
   phones. Previous: kil-pwa-v107-20261120b / kil-pages-v44 / kil-code-v87 */
/* BUMPED 2026-11-21 for the Find My Weed web 1.0 launch drop-in (app/findmyweed/ replaced; the
   root worker already skips /app/findmyweed/, so this only evicts any page HTML or shell code a
   phone cached around the old pre-launch build). Previous: kil-pwa-v108-20261120c / kil-pages-v45 / kil-code-v88 */
/* BUMPED AGAIN 2026-11-21 for the Kai Tarako web rebuild (app/kaitarako/ from kai-tarako main ddcdab47:
   US spelling, solid colors, corrected privacy text), on top of #205's FMW bump. All three names are new and
   never shipped, so installed phones drop cached page HTML and shell code once more. Kai Tarako keeps its own
   worker and kai-tarako-* caches (scope app/kaitarako/).
   Previous on main: kil-pwa-v110-20261121a / kil-pages-v47 / kil-assets-v41 / kil-code-v90 (bumped 2026-11-25 with the removal of the Google font rules: evicts the cached gstatic fonts and the old HTML that linked them) */
/* BUMPED 2026-11-25 for the shell offset (#392: keepitil-shell.js?v=20261128a on every page + the main min-height rule): PAGES and CODE are renamed so `activate` evicts cached page
   HTML that still names the old ?v=, and the old shell. The worker's install only precaches the icons, offline page and manifest (cache.add of fixed URLs, no shell or page HTML), so there
   is no install-time fetch of the shell that the HTTP cache could serve stale; pages and code are fetched at request time, network-first (code) and stale-while-revalidate (pages).
   Previous: kil-pages-v48 / kil-code-v91 */
/* BUMPED 2026-11-27 for the CSP migration: /offline.html now loads kil-actions.js + kil-common-actions.js (its Try again button used an inline handler, which a strict
   script-src would block). They are precached by exact URL below so the page still works with the network off, and PRECACHE entries are now fetched with cache:'reload'
   so an install can never store a copy the HTTP cache (or the CDN) was still holding stale. Previous: kil-pwa-v111-20261125a */
/* BUMPED 2026-11-27 for self-serve /create-event (keepitil-shell.js?v=20261128a): PAGES and CODE renamed so installed phones drop HTML that still pointed Event at /submit-event. Previous: kil-pwa-v112-20261127a / kil-pages-v49 / kil-code-v92 */
/* BUMPED 2026-11-28 so phones drop page HTML that still named the previous shell stamp after the scrollbar fix. Previous: kil-pwa-v113-20261127b / kil-pages-v50 / kil-code-v93 */
var VERSION = 'kil-pwa-v114-20261128a';
var PAGES = 'kil-pages-v51';
var ASSETS = 'kil-assets-v42';
var CODE = 'kil-code-v94';
var KEEP = [VERSION, PAGES, ASSETS, CODE];
var PAGE_LIMIT = 40;
var PRECACHE = [
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/assets/js/kil-actions.js',
  '/assets/js/kil-common-actions.js'
];
var CODE_EXT = /\.(js|css)(\?|$)/i;
var MEDIA_EXT = /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/i;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.allSettled(PRECACHE.map(function (u) { return cache.add(new Request(u, { cache: 'reload' })); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      /* CacheStorage is shared by the entire origin. Only evict our own
         kil-* caches; TUITEA, KWARS, Kai Tarako, KMOB and future apps
         must be allowed to manage their independent cache namespaces. */
      return Promise.all(names.filter(function (n) {
          return n.indexOf('kil-') === 0 && KEEP.indexOf(n) === -1;
        })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // NEVER touch Supabase — user data stays live.
  if (url.hostname.endsWith('.supabase.co')) return;

  // SELF-CONTAINED APPS OWN THEIR OWN ASSETS.
  // Do not let the root worker cache or shadow child-app resources.
  // The apps under /games/*, /kode/, /app/tuitea/, /app/kaitarako/ and /app/findmyweed/
  // own their cache namespaces and scoped workers; leave their requests alone.
  if (url.origin === self.location.origin &&
      /^\/(games\/[^/]+|kode|app\/(?:tuitea|kaitarako|findmyweed))\//.test(url.pathname)) return;

  // Navigations: network-first; cached copy ONLY when the network fails.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          e.waitUntil(caches.open(PAGES).then(function (c) { return c.put(req, copy); }));
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match('/offline.html'); });
      })
    );
    return;
  }

  // CODE (all JS/CSS): NETWORK-FIRST.
  // Full URL (incl. ?v=) is the cache key. Never stale while online.
  if (CODE_EXT.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          e.waitUntil(caches.open(CODE).then(function (c) { return c.put(req, copy); }));
        }
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // Media/fonts/icons (same-origin only; fonts are self-hosted since #359): stale-while-revalidate (visual assets only — can't break logic).
  if (url.origin === self.location.origin && MEDIA_EXT.test(url.pathname)) {
    e.respondWith(
      caches.open(ASSETS).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var refresh = fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || refresh;
        });
      })
    );
  }
  // Everything else: default network behavior.
});

/* ── Web Push (KEEPITIL App notifications) ── */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  var title = d.title || 'KEEPITIL';
  var opts = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/', category: d.category || '' },
    tag: d.tag || undefined
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(url) !== -1 && 'focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
