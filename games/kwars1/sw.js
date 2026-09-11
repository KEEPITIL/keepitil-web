const CACHE = 'kwars1-v55';
const ASSETS = [
  './', './index.html', './src/platform/platform.js', './src/platform/platform.css', './src/core/civilizations.js', './src/core/balance.js', './src/core/soldier-state.js', './src/core/ai.js', './src/core/core-runtime.js', './src/core/progression-system.js', './src/systems/build-info.js', './src/systems/platform-service.js', './src/systems/analytics-service.js', './src/systems/save-manager.js', './src/systems/commerce.js', './src/systems/stripe-links.config.js', './src/systems/stripe-commerce.js', './src/systems/purchase-bridge.js', './src/systems/equipment-system.js', './src/systems/folklore-system.js', './src/systems/final-siege-system.js', './src/render/soldier-visual-system.js', './src/render/greek-defender.js', './src/render/soldier-rig.js', './src/render/skeletal-adapter.js', './src/render/monster-rig.js', './src/render/art-system.js', './src/render/audio-system.js', './src/systems/war-council.js', './src/systems/campaign-system.js', './src/systems/experience.js', './src/systems/shell.js', './src/styles/shell.css', './manifest.webmanifest', './icon.svg',
  './app-icon-192.png', './app-icon-512.png', './app-icon-maskable.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  // addAll() reads through the browser HTTP cache. When a deploy lands inside
  // the CDN's max-age window, a freshly named cache installs itself full of the
  // PREVIOUS build and then keeps re-validating into that same stale entry --
  // the client stays pinned to the old build even though the cache name changed.
  // Fetching with cache:'reload' forces every install to come from the origin.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(u =>
    fetch(new Request(u, {cache: 'reload'}))
      .then(res => res && res.ok ? c.put(u, res) : null)
      .catch(() => null)
  ))).then(() => self.skipWaiting()));
});

// Cache scope: `caches` is ORIGIN-wide, so a naive `k !== CACHE` sweep would
// delete the OTHER KWARS games' live caches and break their offline mode.
// Only this game's own namespace and its own retired ancestors are purged.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ((k.indexOf('kwars1-')===0 && k !== CACHE) || k.indexOf('skw-')===0 || k.indexOf('kingdom-wars')===0 || k.indexOf('ageofwars')===0)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(res=>{if(res&&res.ok)caches.open(CACHE).then(c=>c.put(e.request,res.clone()));return res;}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => {
      // no-cache: always revalidate against the origin, so a stale HTTP-cache
      // entry can never keep re-seeding the SW cache with the old build.
      const fetched = fetch(new Request(e.request, {cache: 'no-cache'}))
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetched;
    })
  );
});
