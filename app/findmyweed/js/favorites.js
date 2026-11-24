// FMW FAVORITES (docs/FMW_FAVORITES_SPEC_DRAFT.md), BEHIND FMW_CONFIG.favorites === true (nothing sets it: off today).
// A signed-in CUSTOMER can save a listing with a heart and see their saved listings on the account page. Private to the account.
// All data goes through an injected source, window.FMW_FAVORITES_SOURCE:
//   isCustomer() -> boolean   (false for signed-out visitors and business accounts: then NOTHING is drawn)
//   load() -> Promise of listing ids     add(id) -> Promise     remove(id) -> Promise
// This file has no network, no storage and no account code of its own; the server (RLS, cap of 200) is the authority. No payments.
(function (root) {
  var T = { save: 'Save', saved: 'Saved', saveLabel: 'Save this listing to your favorites', savedLabel: 'Remove this listing from your favorites', failed: 'Could not update your favorites. Try again.',
    title: 'Saved listings', none: 'No saved listings yet.', loading: 'Loading…', view: 'View' };
  function open(opts) {
    var win = (opts && opts.win) || root, CFG = win.FMW_CONFIG || {}, src = win.FMW_FAVORITES_SOURCE || null;
    if (CFG.favorites !== true || !src || typeof src.isCustomer !== 'function' || typeof src.load !== 'function') return null;
    try { if (src.isCustomer() !== true) return null; } catch (e) { return null; }
    return src;
  }
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // the heart on a listing page
  function mountHeart(doc, id, into, opts) {
    var src = open(opts); if (!src || !into || !id) return null;
    var on = false, busy = false, msg = el(doc, 'p', 'muted'); msg.setAttribute('role', 'status');
    var b = el(doc, 'button', 'btn ghost small fav'); b.type = 'button'; b.setAttribute('data-act', 'favorite');
    function paint() { b.textContent = on ? T.saved : T.save; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', on ? T.savedLabel : T.saveLabel); }
    paint();
    b.addEventListener('click', function () {
      if (busy) return; busy = true; msg.textContent = '';
      var want = !on;
      Promise.resolve().then(function () { return want ? src.add(id) : src.remove(id); }).then(function () { on = want; busy = false; paint(); }, function () { busy = false; msg.textContent = T.failed; });
    });
    into.appendChild(b); into.appendChild(msg);
    Promise.resolve().then(function () { return src.load(); }).then(function (ids) { on = Array.isArray(ids) && ids.indexOf(id) >= 0; paint(); }, function () { /* unknown: stays unsaved */ });
    return { state: 'open' };
  }
  // the "Saved listings" list on the account page
  function mountList(doc, into, opts) {
    var src = open(opts); if (!src || !into) return null;
    var sec = el(doc, 'section', 'card favorites'); sec.setAttribute('data-state', 'favorites'); sec.appendChild(el(doc, 'h2', null, T.title));
    var msg = el(doc, 'p', 'muted', T.loading); msg.setAttribute('role', 'status'); var list = el(doc, 'div'); sec.appendChild(msg); sec.appendChild(list); into.appendChild(sec);
    var names = (opts && opts.names) || null;   // optional id -> display name, so the list reads as names
    Promise.resolve().then(function () { return src.load(); }).then(function (ids) {
      var rows = (Array.isArray(ids) ? ids : []).filter(function (x) { return typeof x === 'string' && x; });
      msg.textContent = rows.length ? '' : T.none;
      rows.forEach(function (id) {
        var row = el(doc, 'p'), a = el(doc, 'a', null, (names && names[id]) || T.view); a.href = 'listing.html?id=' + encodeURIComponent(id); row.appendChild(a); list.appendChild(row);
      });
    }, function () { msg.textContent = T.failed; });
    return { state: 'open' };
  }
  var api = { T: T, mountHeart: mountHeart, mountList: mountList };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_FAVORITES = api;
})(this);
