// FMW FAVORITES (docs/FMW_FAVORITES_SPEC_DRAFT.md), BEHIND FMW_CONFIG.favorites === true (nothing sets it: off today).
// A listing page has a plain "Save" link to the account page (?save=<id>); a signed-in CUSTOMER confirms there and sees their saved listings. Private to the account.
// All data goes through an injected source, window.FMW_FAVORITES_SOURCE:
//   isCustomer() -> boolean   (false for signed-out visitors and business accounts: then NOTHING is drawn)
//   load() -> Promise of listing ids     add(id) -> Promise     remove(id) -> Promise
// This file has no network, no storage and no account code of its own; the server (RLS, cap of 200) is the authority. No payments.
(function (root) {
  var T = { save: 'Save', saved: 'Saved', saveLinkLabel: 'Save this listing to your favorites (opens your account)', failed: 'Could not update your favorites. Try again.',
    title: 'Saved listings', none: 'No saved listings yet.', loading: 'Loading…', view: 'View', confirm: 'Save this listing to your favorites?', confirmBtn: 'Save', confirmDone: 'Saved.', viewListing: 'View the listing' };
  // a listing id from a ?save= link: only the slug shape is accepted (the server checks that the listing exists); anything else is ignored
  var SAVE_RE = /^[a-z0-9-]{3,80}$/;
  function open(opts) {
    var win = (opts && opts.win) || root, CFG = win.FMW_CONFIG || {}, src = win.FMW_FAVORITES_SOURCE || null;
    if (CFG.favorites !== true || !src || typeof src.isCustomer !== 'function' || typeof src.load !== 'function') return null;
    try { if (src.isCustomer() !== true) return null; } catch (e) { return null; }
    return src;
  }
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // The "Save" link on a listing page (Grok 2026-11-24, option 3): a plain link to account.html?save=<id>. It is a NAVIGATION, so the public listing page
  // makes no auth call and needs no CSP change; the account page validates the id, shows a visible confirm and only then saves. Behind the flag.
  function mountSaveLink(doc, id, into, opts) {
    var win = (opts && opts.win) || root, CFG = win.FMW_CONFIG || {};
    if (CFG.favorites !== true || !into || typeof id !== 'string' || !SAVE_RE.test(id)) return null;
    var a = el(doc, 'a', 'btn ghost small fav', T.save); a.href = 'account.html?save=' + encodeURIComponent(id); a.setAttribute('data-act', 'favorite'); a.setAttribute('aria-label', T.saveLinkLabel);
    into.appendChild(a);
    return { state: 'link' };
  }
  // the ?save=<id> of the page's own address, or '' (a navigation from a listing page's Save link; validated by SAVE_RE before it is used)
  function readSave(win) { try { return new URLSearchParams(win.location.search).get('save') || ''; } catch (e) { return ''; } }
  // the "Saved listings" list on the account page
  function mountList(doc, into, opts) {
    var src = open(opts); if (!src || !into) return null;
    var win = (opts && opts.win) || root;
    var sec = el(doc, 'section', 'card favorites'); sec.setAttribute('data-state', 'favorites'); sec.appendChild(el(doc, 'h2', null, T.title));
    var msg = el(doc, 'p', 'muted', T.loading); msg.setAttribute('role', 'status'); var list = el(doc, 'div'); sec.appendChild(msg); sec.appendChild(list); into.appendChild(sec);
    var names = (opts && opts.names) || null;   // optional id -> display name, so the list reads as names
    var raw = opts && 'save' in opts ? opts.save : readSave(win);
    var saveId = typeof raw === 'string' && SAVE_RE.test(raw) ? raw : '';
    function addRow(id) {
      var row = el(doc, 'p'), a = el(doc, 'a', null, (names && names[id]) || T.view); a.href = 'listing.html?id=' + encodeURIComponent(id); row.appendChild(a); list.appendChild(row);
    }
    Promise.resolve().then(function () { return src.load(); }).then(function (ids) {
      var rows = (Array.isArray(ids) ? ids : []).filter(function (x) { return typeof x === 'string' && x; });
      msg.textContent = rows.length ? '' : T.none;
      rows.forEach(addRow);
      // a "Save" link from a listing page (?save=<id>): NEVER saved on arrival; a visible confirm button is the only way it is added
      if (saveId && rows.indexOf(saveId) < 0) {
        var box = el(doc, 'div', 'save-confirm'); box.setAttribute('data-state', 'confirm'); box.setAttribute('role', 'group');
        box.appendChild(el(doc, 'p', null, T.confirm));
        var lk = el(doc, 'a', null, T.viewListing); lk.href = 'listing.html?id=' + encodeURIComponent(saveId); box.appendChild(lk);
        var ok = el(doc, 'button', 'btn small', T.confirmBtn); ok.type = 'button'; ok.setAttribute('data-act', 'confirm-save');
        var note = el(doc, 'p', 'muted'); note.setAttribute('role', 'status');
        ok.addEventListener('click', function () {
          ok.disabled = true; note.textContent = '';
          Promise.resolve().then(function () { return src.add(saveId); }).then(function () { addRow(saveId); msg.textContent = ''; box.setAttribute('data-state', 'done'); while (box.firstChild) box.removeChild(box.firstChild); box.appendChild(el(doc, 'p', null, T.confirmDone)); }, function () { ok.disabled = false; note.textContent = T.failed; });
        });
        box.appendChild(ok); box.appendChild(note); sec.insertBefore ? sec.insertBefore(box, list) : sec.appendChild(box);
      }
    }, function () { msg.textContent = T.failed; });
    return { state: 'open' };
  }
  var api = { T: T, SAVE_RE: SAVE_RE, mountSaveLink: mountSaveLink, mountList: mountList };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_FAVORITES = api;
})(this);
