/* KEEPITIL door scanner: OFFLINE queue (draft). When the door phone has no connection, a scanned code CANNOT be
 * verified, so it is NEVER shown as admitted: it is kept IN MEMORY only (no localStorage / IndexedDB: ticket codes
 * are admission secrets, and a lost phone must not carry them), and checked against the server the moment the
 * connection is back, in scan order, one at a time. Each queued code then gets its real server result. The queue
 * dies with the page. Text only; no server text is shown (the adapter owns the wording).
 */
(function (root) {
  var MAX = 200;
  function createOfflineQueue(o) {
    var rpc = o.rpc, adapter = o.adapter, localParse = o.localParse, onChange = o.onChange || function () {};
    var items = [], seq = 0, now = o.now || Date.now;   /* { n, at, token, request, state: 'queued' | 'checking' | 'done', result } */
    var flushing = false;
    function changed() { onChange(items.map(function (x) { return { n: x.n, at: x.at, state: x.state, code: x.result ? x.result.code : null, title: x.result ? x.result.ui.title : null }; })); }
    return {
      /* -> { queued: true } | { queued: false, reason } */
      add: function (raw) {
        var p = localParse(raw, adapter);
        if (p.kind !== 'ok') return { queued: false, reason: p.kind };
        if (items.some(function (x) { return x.token === p.token && x.state !== 'done'; })) return { queued: false, reason: 'already-queued' };
        if (items.filter(function (x) { return x.state !== 'done'; }).length >= MAX) return { queued: false, reason: 'full' };
        items.push({ n: ++seq, at: now(), token: p.token, request: p.request, state: 'queued', result: null });   /* #n + time: staff match the result to the waiting guest */
        changed();
        return { queued: true, n: seq };
      },
      pending: function () { return items.filter(function (x) { return x.state !== 'done'; }).length; },
      /* check every queued code, in order. A transport failure puts it back to 'queued' and stops (still offline). */
      flush: function () {
        if (flushing) return Promise.resolve({ skipped: 'busy' });
        flushing = true;
        var next = function () {
          var it = items.find(function (x) { return x.state === 'queued'; });
          if (!it) { flushing = false; return Promise.resolve({ done: true }); }
          it.state = 'checking'; changed();
          return Promise.resolve().then(function () { return rpc(it.request.args); })
            .catch(function () { return { data: null, error: { message: 'network' } }; })
            .then(function (resp) {
              var r = adapter.adaptScanResponse(resp);
              if (r.code === 'error' || r.code === 'unauth') { it.state = 'queued'; flushing = false; changed(); return { done: false, stopped: r.code === 'unauth' ? 'signin' : 'network' }; }   /* L1: a lost session keeps the code */
              it.state = 'done'; it.result = r; it.token = null;   /* forget the code once it has its answer */
              changed();
              return next();
            });
        };
        return next();
      },
      dispose: function () { items = []; }
    };
  }
  var api = { createOfflineQueue: createOfflineQueue, MAX: MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilDoorQueue = api;
})(typeof window !== 'undefined' ? window : globalThis);
