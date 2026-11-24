// FMW FAVORITES SOURCE (account.html ONLY: its CSP is the one that lets the page reach the auth project). Behind FMW_CONFIG.favorites === true
// (nothing sets it: off today); until the flag is true this file installs nothing. It gives js/favorites.js its injected source:
//   window.FMW_FAVORITES_SOURCE = { isCustomer(), load(), add(slug), remove(slug) }
// Each call is one RPC on the `fmw` schema with the session token (docs/proposed/migrations/W8_favorites.DRAFT.sql: favorites_list,
// favorite_add, favorite_remove; security definer, customers only, own rows only), the same pattern as fmw.business_pricing. The listing id the
// pages use IS the listing slug. The token is read from the tab's sessionStorage (where sign-in put it), never written, never sent anywhere
// but the configured project. No payments, no other network, nothing stored. The server is the authority: this only decides what to draw.
(function (root) {
  var KEY = 'fmw_token';
  function claims(token) {
    try {
      var part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var json = typeof atob === 'function' ? atob(part + '==='.slice((part.length + 3) % 4)) : Buffer.from(part, 'base64').toString();
      var c = JSON.parse(json); return c && typeof c === 'object' ? c : null;
    } catch (e) { return null; }
  }
  function create(win) {
    var cfg = (win.FMW_CONFIG && win.FMW_CONFIG.authProject) || null;
    function token() {
      var t = null; try { t = win.sessionStorage && win.sessionStorage.getItem(KEY); } catch (e) { t = null; }
      var c = t ? claims(t) : null;
      return c && !(typeof c.exp === 'number' && c.exp <= Math.floor(Date.now() / 1000)) ? { token: t, claims: c } : null;
    }
    function rpc(name, body) {
      var s = token();
      if (!s || !cfg || !cfg.url || !cfg.anonKey || typeof win.fetch !== 'function') return Promise.reject(new Error('not signed in'));
      var headers = { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + s.token, 'Content-Profile': 'fmw' };
      return win.fetch(cfg.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) }).then(function (r) {
        if (!r || !r.ok) throw new Error('status ' + (r && r.status));
        return r.status === 204 ? null : r.json().catch(function () { return null; });
      });
    }
    return {
      isCustomer: function () { var s = token(); return !!s && !(s.claims.user_metadata && s.claims.user_metadata.kind === 'business'); },
      load: function () { return rpc('favorites_list').then(function (a) { return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : []; }); },
      add: function (slug) { return rpc('favorite_add', { p_slug: String(slug) }).then(function () { return true; }); },
      remove: function (slug) { return rpc('favorite_remove', { p_slug: String(slug) }).then(function () { return true; }); }
    };
  }
  var api = { KEY: KEY, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document && root.FMW_CONFIG && root.FMW_CONFIG.favorites === true) root.FMW_FAVORITES_SOURCE = create(root);
})(this);
