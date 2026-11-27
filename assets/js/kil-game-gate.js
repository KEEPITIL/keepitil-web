/* KEEPITIL game gate: the coming-soon pages retire their own service worker and caches, then go to /games/#coming-soon (CSP: replaces an inline block copied onto six pages).
   <script src="/assets/js/kil-game-gate.js" data-scope="/games/13/" data-prefixes="thirteen-,13-"></script>
   Only registrations whose scope contains data-scope and caches that start with one of data-prefixes are removed (the Cache API is origin-wide; other games keep theirs; saves are untouched).
   Without both parameters nothing is removed and the visitor is simply sent on. */
(function () {
  var s = document.currentScript; if (!s) return;
  var scope = s.getAttribute('data-scope') || '', prefixes = (s.getAttribute('data-prefixes') || '').split(',').filter(Boolean);
  var go = function () { location.replace("/games/#coming-soon"); };
  if (!scope || !prefixes.length || !('serviceWorker' in navigator)) return go();
  navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.filter(function (r) { return r.scope.indexOf(scope) !== -1; }).map(function (r) { return r.unregister(); })); })
    .then(function () { return window.caches ? caches.keys() : []; })
    .then(function (ks) { return Promise.all(ks.filter(function (k) { return prefixes.some(function (p) { return k.indexOf(p) === 0; }); }).map(function (k) { return caches.delete(k); })); })
    .then(go, go);
})();
