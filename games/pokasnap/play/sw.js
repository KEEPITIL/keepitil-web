/* PokaSnap offline shell. Cache name carries the build: bump it on every ship.
   Only pokasnap-* caches are ever deleted -- `caches` is origin-wide and the
   rest of keepitil.com lives on the same origin. */
const CACHE = 'pokasnap-v1-b4';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/ui.js', 'js/config.js',
  'js/data/pets.js', 'js/data/poses.js', 'js/data/items.js', 'js/data/missions.js', 'js/data/personality.js',
  'js/data/skills.js', 'js/data/care.js', 'js/data/achievements.js', 'js/data/store.js', 'js/data/economy.js', 'js/data/ads.js',
  'js/render/pet.js', 'js/render/items.js',
  'js/game/state.js', 'js/game/score.js', 'js/game/progress.js', 'js/game/album.js', 'js/game/companion.js',
  'js/game/ledger.js', 'js/game/entitlements.js', 'js/game/events.js', 'js/game/activity.js', 'js/game/walk.js', 'js/game/adventure.js',
  'js/platform/native.js', 'js/platform/analytics.js', 'js/platform/sound.js', 'js/platform/auth.js', 'js/platform/purchases.js',
  'js/platform/health.js', 'js/platform/ads.js', 'js/platform/notify.js', 'js/platform/cloud.js',
  'js/screens/flow.js', 'js/screens/home.js', 'js/screens/camera.js', 'js/screens/result.js', 'js/screens/lists.js',
  'js/screens/care.js', 'js/screens/train.js',
  'js/screens/adventures.js', 'js/screens/walk.js', 'js/screens/recap.js', 'js/screens/shop.js',
  'img/icon-192.png', 'img/icon-512.png', 'img/icon-180.png'];
self.addEventListener('install', e => {
  // cache:'reload' bypasses the HTTP cache, or an install reads the OLD build
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok && c.put(u, r))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('pokasnap-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;       // never touch Supabase/API calls
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { caches.open(CACHE).then(c => c.put('index.html', r.clone())); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })));
});
