// FMW session for the whole site (READ-ONLY). Sets window.FMW_SESSION before pages.js draws the header and the menu, so they can show Account / Sign out
// instead of Sign in / Sign up (a HINT about what to draw: every real call is still checked by the server). Inert unless FMW_CONFIG.accounts is true.
// It only READS: no network, no writes (js/session-store.js, loaded on account.html and signup.html only, saves, refreshes and clears).
//
// STAY SIGNED IN (Joe, 2026-11-24): the session is kept in persistent browser storage under "fmw_session" as { a: access token, r: refresh token,
// e: access expiry (seconds) }, so closing the tab does not sign anyone out. A session from before this (per-tab "fmw_token", access token only)
// still reads as signed in until its tab closes. Signed in = a live access token, or a refresh token that can make one (account.html refreshes).
// TIME BOX (Grok 2026-11-24): a session ends 30 days after the sign-in link was used, however often it was refreshed ("t" = that moment, kept through refreshes).
// The menu's Sign out opens account.html?signout=1; signOutRequested() is how the account page knows. No secret in this file.
(function (root) {
  var KEY = 'fmw_token', PKEY = 'fmw_session', MAX_AGE = 30 * 86400;   // seconds
  function claims(token) {
    try {
      var part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var json = typeof atob === 'function' ? atob(part + '==='.slice((part.length + 3) % 4)) : Buffer.from(part, 'base64').toString();
      var c = JSON.parse(json);
      return c && typeof c === 'object' ? c : null;
    } catch (e) { return null; }
  }
  function live(token, nowSec) {
    var c = claims(token);
    return !!c && !(typeof c.exp === 'number' && c.exp <= nowSec);
  }
  function create(win) {
    var CFG = win.FMW_CONFIG || {}, on = CFG.accounts === true;
    function store(kind) { try { return win[kind] || null; } catch (e) { return null; } }
    function read() {   // { a, r, e } or null; the persistent session first, then the old per-tab token
      if (!on) return null;
      var p = store('localStorage');
      try {
        var raw = p && p.getItem(PKEY);
        if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object' && typeof o.a === 'string') { if (typeof o.t === 'number' && Math.floor(Date.now() / 1000) - o.t > MAX_AGE) return null; return { a: o.a, r: typeof o.r === 'string' && o.r ? o.r : null, e: typeof o.e === 'number' ? o.e : null, t: typeof o.t === 'number' ? o.t : null }; } }
      } catch (e) { /* unreadable: fall through to the old token */ }
      var s = store('sessionStorage'), t = null;
      try { t = s && s.getItem(KEY); } catch (e) { t = null; }
      return t ? { a: String(t), r: null, e: null } : null;
    }
    var now = function () { return Math.floor(Date.now() / 1000); };
    var s0 = read();
    return {
      signedIn: !!s0 && (live(s0.a, now()) || !!s0.r),
      // the live access token, or null (expired / none)
      token: function () { var s = read(); return s && live(s.a, now()) ? s.a : null; },
      canRefresh: function () { var s = read(); return !!(s && s.r); },
      // the stored refresh token, for js/session-store.js only
      refreshToken: function () { var s = read(); return s && s.r ? s.r : null; },
      // the account page asks this: was it opened by the menu's Sign out (?signout=1)? It then runs its own full sign-out, server revoke included
      signOutRequested: function () { try { return /(?:^|[?&])signout=1(?:&|$)/.test((win.location && win.location.search) || ''); } catch (e) { return false; } }
    };
  }
  var out = { KEY: KEY, PKEY: PKEY, MAX_AGE: MAX_AGE, live: live, claims: claims, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = out; else if (root.document) root.FMW_SESSION = create(root);
})(this);
