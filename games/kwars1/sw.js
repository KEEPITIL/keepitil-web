/* LEGACY SERVICE WORKER KILL-SWITCH — /games/kwars1/sw.js
   The old worker checks this URL for an update on navigation. Replacing it with
   this file is what actually retires it: the browser installs this, which then
   deletes the retired caches, unregisters itself and moves every client it
   controls to the canonical route.
   It caches nothing and it never touches localStorage or IndexedDB. */
self.addEventListener('install', function(){ self.skipWaiting(); });

self.addEventListener('activate', function(e){
  e.waitUntil((async function(){
    const keys = await caches.keys();
    // ONLY the retired namespace. Saves, auth and the other KWARS games are
    // not in the Cache API at all, and nothing else here is touched.
    await Promise.all(keys.filter(k => k.indexOf('kwars1-') === 0).map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({type:'window'});
    for (const c of clients){
      try{
        const rest = new URL(c.url).pathname.replace(/^\/games\/kwars1\/?/, '').replace(/^index\.html$/i,'');
        await c.navigate('/games/kwars/' + rest);
      }catch(err){ /* navigate() is not available everywhere; the page's own script also redirects */ }
    }
  })());
});

/* Serve nothing from cache. A retired worker that still answers fetches is
   exactly how a player gets handed the old shell after the migration. */
self.addEventListener('fetch', function(e){
  e.respondWith(fetch(e.request).catch(function(){
    return new Response('', {status:503, statusText:'Kingdom Wars has moved to /games/kwars/'});
  }));
});
