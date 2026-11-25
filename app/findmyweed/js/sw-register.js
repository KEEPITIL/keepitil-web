// Registers the Find My Weed service worker (sw.js in this folder) unless the kill switch (sw-flag.json) says no. Scope = this folder only.
// If the switch is off (or the flag file says the worker is too old), any worker here is unregistered and its fmw-* caches are deleted. Nothing else: no tracking, no data.
(function (root) {
  var nav = root.navigator;
  if (!nav || !nav.serviceWorker || !root.fetch) return;
  var CFG = root.FMW_CONFIG || {}, base = typeof CFG.basePath === 'string' ? CFG.basePath : '';
  var SW_VERSION = 1;   // keep equal to sw.js
  var scopePrefix = root.location.origin + base + '/';
  function off() {
    return nav.serviceWorker.getRegistrations().then(function (rs) {
      return Promise.all(rs.filter(function (r) { return r.scope.indexOf(scopePrefix) === 0; }).map(function (r) { return r.unregister(); }));
    }).then(function () { return root.caches ? root.caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('fmw-') === 0; }).map(function (k) { return root.caches.delete(k); })); }) : null; });
  }
  root.fetch(base + '/sw-flag.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (flag) {
    if (flag && (flag.enabled === false || (typeof flag.minVersion === 'number' && flag.minVersion > SW_VERSION))) return off();
    if (!flag) return null;   // flag unreadable (offline): leave whatever is registered alone
    return nav.serviceWorker.register(base + '/sw.js', { scope: base + '/' });
  }).catch(function () { /* a failed registration just means no offline support */ });
})(typeof window !== 'undefined' ? window : globalThis);
