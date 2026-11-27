/* KEEPITIL article pages: inline script moved verbatim to an external file (CSP: no executable inline script). Shared by every article page whose inline block is byte-identical. */
(function(){ var go = function(){ location.replace("/games/#keepitil-apps"); };
  if (!('serviceWorker' in navigator)) return go();
  // Retire this route's own worker and caches only (the Cache API is origin-wide; other games keep theirs). Saves are untouched.
  navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.filter(function(r){ return r.scope.indexOf("/article/kform-lead-capture/") !== -1; }).map(function(r){ return r.unregister(); })); })
    .then(function(){ return window.caches ? caches.keys() : []; })
    .then(function(ks){ return Promise.all(ks.filter(function(k){ return [].some(function(p){ return k.indexOf(p) === 0; }); }).map(function(k){ return caches.delete(k); })); })
    .then(go, go);
})();
