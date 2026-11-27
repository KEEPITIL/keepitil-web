// FMW account home (account.html). FRONT END ONLY: it reads the signed-in session js/session.js keeps (persistent browser storage, so it survives closing the tab; an
// access token plus a rotating refresh token, never in a URL; a session from before that, per-tab only, still works until its tab closes). It shows who is signed in and signs out.
// No profile read or write yet (the fmw schema has no client path; see docs/FMW_ACCOUNTS_ACTIVE_SPEC_DRAFT.md). Session length is the
// Supabase default. No secret in this file; the anon key is the public one from site.json via FMW_CONFIG.
(function (root) {
  var KEY = 'fmw_token';
  var T = {
    title: 'Your account', signedOutTitle: 'You are signed out', signedOutBody: 'Sign in with an emailed link to see your account.',
    signIn: 'Sign in', search: 'Back to search', signOut: 'Sign out', confirmSignOut: 'Sign out of Find My Weed on this device?', cancel: 'Cancel', signingOut: 'Signing out…', done: 'You are signed out on this device.',
    email: 'Email', kind: 'Account type', customer: 'Customer', business: 'Business', expires: 'This session ends when you close the tab.', staySignedIn: 'You stay signed in on this device until you sign out.', refreshing: 'Signing you in…',
    soon: 'Favorites and your business listing are coming here.'
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
    return fetchFn(cfg.url + '/auth/v1/logout?scope=local', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token } })
      .then(function (r) { return { ok: !!(r && r.ok) }; }, function () { return { ok: false }; });
  }
  function app(doc, win) {
    var box = doc.getElementById('account'), title = doc.getElementById('account-title');
    if (!box || !title) return null;
    var SS = win.FMW_SESSION && win.FMW_SESSION.token ? win.FMW_SESSION : null;   // the persistent session, read (js/session.js); absent: the old per-tab token only
    var ST = win.FMW_SESSION_STORE || null;   // saves / refreshes / clears it (js/session-store.js, loaded on this page)
    var store = null; try { store = win.sessionStorage || null; } catch (e) { store = null; }
    var token = null; try { token = SS ? SS.token() : (store && store.getItem(KEY)); } catch (e) { token = null; }
    var c = token ? claims(token) : null;
    var nowSec = Math.floor(Date.now() / 1000);
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function link(text, href, cls) { var a = el('a', cls || 'btn', text); a.href = href; return a; }
    function clear() { while (box.firstChild) box.removeChild(box.firstChild); }
    function forget() { try { ST && ST.clear && ST.clear(); } catch (e) { /* nothing to clear */ } try { store && store.removeItem(KEY); } catch (e) { /* nothing to clear */ } }
    function signedOut(msg) {
      forget(); clear(); title.textContent = T.signedOutTitle; box.setAttribute('data-state', 'signed-out');
      var s = el('div', 'state info'); s.setAttribute('role', 'status');
      s.appendChild(el('p', null, msg || T.signedOutBody));
      var row = el('div', 'actions'); var sv = win.FMW_FAVORITES && win.FMW_FAVORITES.saveParam ? win.FMW_FAVORITES.saveParam(win) : ''; row.appendChild(link(T.signIn, 'signup.html?mode=signin' + (sv ? '&save=' + encodeURIComponent(sv) : ''))); row.appendChild(link(T.search, 'index.html', 'btn ghost'));
      s.appendChild(row); box.appendChild(s);
    }
    function showIn(token, c) {
      title.textContent = T.title; box.setAttribute('data-state', 'signed-in');
      var card = el('div', 'card');
      var dl = el('dl', 'account-facts');
      var kind = c.user_metadata && c.user_metadata.kind === 'business' ? T.business : T.customer;
      var kindDd = null;
      [[T.email, typeof c.email === 'string' ? c.email : ''], [T.kind, kind]].forEach(function (x) { dl.appendChild(el('dt', null, x[0])); var d = el('dd', null, x[1]); dl.appendChild(d); if (x[0] === T.kind) kindDd = d; });
      card.appendChild(dl); card.appendChild(el('p', 'muted', SS ? T.staySignedIn : T.expires)); card.appendChild(el('p', 'muted', T.soon));
      var out = el('button', 'btn', T.signOut); out.type = 'button'; out.setAttribute('data-act', 'signout');
      out.addEventListener('click', function () {
        out.disabled = true; out.textContent = T.signingOut;
        var cfg = win.FMW_CONFIG && win.FMW_CONFIG.authProject;
        // the local session ends whatever the server says; the request only revokes the token server-side
        signOutRequest(cfg, token, win.fetch && win.fetch.bind(win)).then(function () { signedOut(T.done); });
      });
      var row = el('div', 'actions'); row.appendChild(out); row.appendChild(link(T.search, 'index.html', 'btn ghost'));
      card.appendChild(row); box.appendChild(card);
      // The menu's Sign out opens this page with ?signout=1. A bare link must not end a session by itself, so the page asks first (a same-page confirm button);
      // only that click runs the same sign-out as the button above.
      if (win.FMW_SESSION && win.FMW_SESSION.signOutRequested && win.FMW_SESSION.signOutRequested()) {
        var ask = el('div', 'state info'); ask.setAttribute('role', 'group'); ask.setAttribute('data-state', 'confirm-signout'); ask.appendChild(el('p', null, T.confirmSignOut));
        var yes = el('button', 'btn', T.signOut); yes.type = 'button'; yes.setAttribute('data-act', 'confirm-signout'); yes.addEventListener('click', function () { out.click(); });
        var arow = el('div', 'actions'); arow.appendChild(yes); arow.appendChild(link(T.cancel, 'account.html', 'btn ghost')); ask.appendChild(arow);
        box.insertBefore ? box.insertBefore(ask, card) : box.appendChild(ask);
      }
      // the cards below the email (js/account-cards.js): business details + license status, or saved listings; Download / Delete for both
      var cardsDone = win.FMW_ACCOUNT_CARDS && win.FMW_ACCOUNT_CARDS.mount ? win.FMW_ACCOUNT_CARDS.mount(doc, box, { win: win, token: token, claims: c, onKind: function (label) { if (kindDd) kindDd.textContent = label; }, onDeleted: function (m) { signedOut(m); } }) : null;
      // the order inbox (behind FMW_CONFIG.ordering, off today) is business-only content: only when the SERVER says this account is a business
      // what the server said, kept as the menu's "My business" hint (approved only; anything else, including no answer, removes it)
      if (cardsDone && cardsDone.then) cardsDone.then(function (r) { if (ST && ST.businessHint) ST.businessHint(c && c.sub, !!(r && r.kind === 'business')); });
      if (cardsDone && cardsDone.then) cardsDone.then(function (r) { if (r && r.kind === 'business' && win.FMW_INBOX && win.FMW_INBOX.mount) win.FMW_INBOX.mount(doc, box, { win: win }); });
      else if (kind === T.business && win.FMW_INBOX && win.FMW_INBOX.mount) win.FMW_INBOX.mount(doc, box, { win: win });   // no cards module: the old behaviour
      // a customer account also gets its saved listings (behind FMW_CONFIG.favorites, off today)
      if (kind === T.customer && !win.FMW_ACCOUNT_CARDS && win.FMW_FAVORITES && win.FMW_FAVORITES.mountList) win.FMW_FAVORITES.mountList(doc, box, { win: win });

    }
    if (token && live(c, nowSec)) { showIn(token, c); return { state: 'signed-in' }; }
    // an expired access token with a refresh token behind it: swap it for a new pair first (only this page and signup.html may reach the auth project)
    if (SS && ST && SS.canRefresh && SS.canRefresh()) {
      clear(); title.textContent = T.title; box.setAttribute('data-state', 'refreshing');
      var w = el('div', 'state info'); w.setAttribute('role', 'status'); w.appendChild(el('p', null, T.refreshing)); box.appendChild(w);
      ST.refresh(win.FMW_CONFIG && win.FMW_CONFIG.authProject, win.fetch && win.fetch.bind(win)).then(function (t) {
        var c2 = t ? claims(t) : null;
        if (t && live(c2, Math.floor(Date.now() / 1000))) { clear(); showIn(t, c2); } else signedOut();
      });
      return { state: 'refreshing' };
    }
    signedOut(); return { state: 'signed-out' };
  }
  var api = { KEY: KEY, claims: claims, live: live, signOutRequest: signOutRequest, app: app };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document) app(root.document, root);
})(this);
