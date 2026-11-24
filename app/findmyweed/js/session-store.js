// FMW session store: SAVES, REFRESHES and CLEARS the persistent session js/session.js reads. Loaded on account.html and signup.html only, the two pages
// whose CSP may reach the auth project (every other page never calls the network). Sets window.FMW_SESSION_STORE.
//   save(access, refresh, expiresIn, keepStart): keep the session ("fmw_session": { a, r, e, t }) and drop the old per-tab token. t = when the sign-in link was
//     used: set to now for a new sign-in, kept (keepStart) through refreshes, so a session ends 30 days after sign-in. false if storage is unavailable.
//   clear(): forget the session on this device (the server-side revoke is the account page's job).
//   refresh(cfg, fetchFn): the standard Supabase refresh grant, POST <auth project>/auth/v1/token?grant_type=refresh_token. The refresh token ROTATES: the
//     new pair is saved every time. Resolves to the new access token, or null: no refresh token; older than 30 days (cleared); the server REFUSED it (4xx: revoked,
//     used twice, expired), which clears the stored session ONLY IF the stored refresh token is still the one that was sent (another tab may have rotated it
//     meanwhile: then that tab's newer access token is used and nothing is cleared); or a network error (the session is kept, try again later).
// No secret in this file; the anon key is the public one (FMW_CONFIG). The tradeoff (a refresh token at rest in the browser) is Grok's call: see the PR.
(function (root) {
  var KEY = 'fmw_token', PKEY = 'fmw_session', MAX_AGE = 30 * 86400;
  function claims(token) {
    try {
      var part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var json = typeof atob === 'function' ? atob(part + '==='.slice((part.length + 3) % 4)) : Buffer.from(part, 'base64').toString();
      var c = JSON.parse(json);
      return c && typeof c === 'object' ? c : null;
    } catch (e) { return null; }
  }
  function make(win) {
    var CFG = win.FMW_CONFIG || {}, on = CFG.accounts === true;
    function store(kind) { try { return win[kind] || null; } catch (e) { return null; } }
    var now = function () { return Math.floor(Date.now() / 1000); };
    function currentRefresh() { return win.FMW_SESSION && win.FMW_SESSION.refreshToken ? win.FMW_SESSION.refreshToken() : null; }
    var api = {
      save: function (access, refresh, expiresIn, keepStart) {
        if (!on || !access) return false;
        var c = claims(access), e = c && typeof c.exp === 'number' ? c.exp : (typeof expiresIn === 'number' ? now() + expiresIn : null);
        var p = store('localStorage'), s = store('sessionStorage'), t = now();
        if (keepStart) { try { var prev = JSON.parse(p && p.getItem(PKEY)); if (prev && typeof prev.t === 'number') t = prev.t; } catch (e0) { /* a new start */ } }
        try { if (p) p.setItem(PKEY, JSON.stringify({ a: String(access), r: refresh ? String(refresh) : null, e: e, t: t })); else return false; } catch (e2) { return false; }
        try { s && s.removeItem(KEY); } catch (e3) { /* the old token is gone or blocked */ }
        return true;
      },
      clear: function () {
        var p = store('localStorage'), s = store('sessionStorage');
        try { p && p.removeItem(PKEY); } catch (e) { /* nothing to clear */ }
        try { s && s.removeItem(KEY); } catch (e) { /* nothing to clear */ }
      },
      refresh: function (cfg, fetchFn) {
        var r = currentRefresh();
        if (!r || !cfg || !cfg.url || !cfg.anonKey || !fetchFn) return Promise.resolve(null);
        return fetchFn(cfg.url + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey }, body: JSON.stringify({ refresh_token: r })
        }).then(function (res) {
          if (!res) return null;
          if (res.ok) return res.json().then(function (j) { return j && typeof j.access_token === 'string' && api.save(j.access_token, j.refresh_token, j.expires_in, true) ? j.access_token : null; });
          if (res.status >= 400 && res.status < 500) {
            // refused. Another tab may have rotated the token while ours was in flight: re-read storage and clear ONLY if it still holds the token we sent
            if (currentRefresh() === r) api.clear();
            else return win.FMW_SESSION && win.FMW_SESSION.token ? win.FMW_SESSION.token() : null;   // the other tab's newer pair
          }
          return null;
        }, function () { return null; });
      }
    };
    return api;
  }
  var out = { KEY: KEY, PKEY: PKEY, make: make };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else if (root.document) root.FMW_SESSION_STORE = make(root);
})(this);
