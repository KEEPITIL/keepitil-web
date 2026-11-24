// FMW account home (account.html). FRONT END ONLY: it reads the signed-in session the sign-up page kept in sessionStorage (the access token
// from the emailed link; kept per tab only, never in a URL or persistent storage, so it ends with the tab). It shows who is signed in and signs out.
// No profile read or write yet (the fmw schema has no client path; see docs/FMW_ACCOUNTS_ACTIVE_SPEC_DRAFT.md). Session length is the
// Supabase default. No secret in this file; the anon key is the public one from site.json via FMW_CONFIG.
(function (root) {
  var KEY = 'fmw_token';
  var T = {
    title: 'Your account', signedOutTitle: 'You are signed out', signedOutBody: 'Sign in with an emailed link to see your account.',
    signIn: 'Sign in', search: 'Back to search', signOut: 'Sign out', signingOut: 'Signing out…', done: 'You are signed out on this device.',
    email: 'Email', kind: 'Account type', customer: 'Customer', business: 'Business', expires: 'This session ends when you close the tab.',
    soon: 'Favorites, order history and your business listing are coming here.'
  };
  // the claims of a JWT, or null (never throws). Not a verification: the server verifies every call; this only decides what to draw.
  function claims(token) {
    try {
      var part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var json = typeof atob === 'function' ? atob(part + '==='.slice((part.length + 3) % 4)) : Buffer.from(part, 'base64').toString();
      var c = JSON.parse(json);
      return c && typeof c === 'object' ? c : null;
    } catch (e) { return null; }
  }
  function live(c, nowSec) { return !!c && !(typeof c.exp === 'number' && c.exp <= nowSec); }
  function signOutRequest(cfg, token, fetchFn) {
    if (!cfg || !cfg.url || !cfg.anonKey || !fetchFn) return Promise.resolve({ ok: false });
    return fetchFn(cfg.url + '/auth/v1/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token } })
      .then(function (r) { return { ok: !!(r && r.ok) }; }, function () { return { ok: false }; });
  }
  function app(doc, win) {
    var box = doc.getElementById('account'), title = doc.getElementById('account-title');
    if (!box || !title) return null;
    var store = null; try { store = win.sessionStorage || null; } catch (e) { store = null; }
    var token = null; try { token = store && store.getItem(KEY); } catch (e) { token = null; }
    var c = token ? claims(token) : null;
    var nowSec = Math.floor(Date.now() / 1000);
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function link(text, href, cls) { var a = el('a', cls || 'btn', text); a.href = href; return a; }
    function clear() { while (box.firstChild) box.removeChild(box.firstChild); }
    function forget() { try { store && store.removeItem(KEY); } catch (e) { /* nothing to clear */ } }
    function signedOut(msg) {
      forget(); clear(); title.textContent = T.signedOutTitle; box.setAttribute('data-state', 'signed-out');
      var s = el('div', 'state info'); s.setAttribute('role', 'status');
      s.appendChild(el('p', null, msg || T.signedOutBody));
      var row = el('div', 'actions'); row.appendChild(link(T.signIn, 'signup.html?mode=signin')); row.appendChild(link(T.search, 'index.html', 'btn ghost'));
      s.appendChild(row); box.appendChild(s);
    }
    if (!token || !live(c, nowSec)) { signedOut(); return { state: 'signed-out' }; }
    title.textContent = T.title; box.setAttribute('data-state', 'signed-in');
    var card = el('div', 'card');
    var dl = el('dl', 'account-facts');
    var kind = c.user_metadata && c.user_metadata.kind === 'business' ? T.business : T.customer;
    [[T.email, typeof c.email === 'string' ? c.email : ''], [T.kind, kind]].forEach(function (x) { dl.appendChild(el('dt', null, x[0])); dl.appendChild(el('dd', null, x[1])); });
    card.appendChild(dl); card.appendChild(el('p', 'muted', T.expires)); card.appendChild(el('p', 'muted', T.soon));
    var out = el('button', 'btn', T.signOut); out.type = 'button'; out.setAttribute('data-act', 'signout');
    out.addEventListener('click', function () {
      out.disabled = true; out.textContent = T.signingOut;
      var cfg = win.FMW_CONFIG && win.FMW_CONFIG.authProject;
      // the local session ends whatever the server says; the request only revokes the token server-side
      signOutRequest(cfg, token, win.fetch && win.fetch.bind(win)).then(function () { signedOut(T.done); });
    });
    var row = el('div', 'actions'); row.appendChild(out); row.appendChild(link(T.search, 'index.html', 'btn ghost'));
    card.appendChild(row); box.appendChild(card);
    // a business account also gets the order inbox (behind FMW_CONFIG.ordering, off today)
    if (kind === T.business && win.FMW_INBOX && win.FMW_INBOX.mount) win.FMW_INBOX.mount(doc, box, { win: win });
    return { state: 'signed-in' };
  }
  var api = { KEY: KEY, claims: claims, live: live, signOutRequest: signOutRequest, app: app };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document) app(root.document, root);
})(this);
