// Registers the Find My Weed service worker (sw.js in this folder) unless the kill switch (sw-flag.json) says no. Scope = this folder only.
// If the switch is off (or the flag file says the worker is too old), any worker here is unregistered and its fmw-* caches are deleted. Nothing else: no tracking, no data.
(function (root) {
  var nav = root.navigator;
  if (!nav || !nav.serviceWorker || !root.fetch) return;
  var CFG = root.FMW_CONFIG || {}, base = typeof CFG.basePath === 'string' ? CFG.basePath : '';
  var SW_VERSION = 1;   // keep equal to sw.js
  var scopePrefix = root.location.origin + base + '/';
  // ask a live worker to stop, clear its caches and unregister, and wait for its answer (at most 1.5 s), so the page that reads the kill switch finishes with nothing left
  function stopWorker(reg) {
    var w = reg.active || reg.waiting || reg.installing;
    if (!w || typeof root.MessageChannel !== 'function') return Promise.resolve();
    return new Promise(function (resolve) {
      var ch = new root.MessageChannel(), done = false, finish = function () { if (!done) { done = true; try { ch.port1.close(); } catch (e) { /* already closed */ } resolve(); } };
      ch.port1.onmessage = finish; setTimeout(finish, 1500);
      try { w.postMessage({ type: 'fmw-kill' }, [ch.port2]); } catch (e) { finish(); }
    });
  }
  function off() {
    return nav.serviceWorker.getRegistrations().then(function (rs) {
      return Promise.all(rs.filter(function (r) { return r.scope.indexOf(scopePrefix) === 0; }).map(function (r) { return stopWorker(r).then(function () { return r.unregister(); }); }));
    }).then(function () { return root.caches ? root.caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('fmw-') === 0; }).map(function (k) { return root.caches.delete(k); })); }) : null; });
  }
  root.fetch(base + '/sw-flag.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (flag) {
    if (flag && (flag.enabled === false || (typeof flag.minVersion === 'number' && flag.minVersion > SW_VERSION))) return off();
    if (!flag) return null;   // flag unreadable (offline): leave whatever is registered alone
    return nav.serviceWorker.register(base + '/sw.js', { scope: base + '/' });
  }).catch(function () { /* a failed registration just means no offline support */ });
})(typeof window !== 'undefined' ? window : globalThis);
