// FMW session hint for the whole site: is a visitor signed in on THIS tab? Sets window.FMW_SESSION = { signedIn, end() } before pages.js draws the
// header and the menu, so they can show Account / Sign out instead of Sign in / Sign up. Only a hint about what to draw: every real call is still
// checked by the server. Reads the tab's sessionStorage token (where sign-in put it) and nothing else; never sends it anywhere; inert unless
// FMW_CONFIG.accounts is true. The menu's Sign out opens account.html?signout=1; the account page (the only page whose CSP may reach the auth
// project) then runs its own Sign out, server-side revoke included; signOutRequested() is how it knows.
(function (root) {
  var KEY = 'fmw_token';
  function live(token, nowSec) {
    try {
      var part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var json = typeof atob === 'function' ? atob(part + '==='.slice((part.length + 3) % 4)) : Buffer.from(part, 'base64').toString();
      var c = JSON.parse(json);
      return !!c && typeof c === 'object' && !(typeof c.exp === 'number' && c.exp <= nowSec);
    } catch (e) { return false; }
  }
  function create(win) {
    var CFG = win.FMW_CONFIG || {}, store = null;
    try { store = win.sessionStorage || null; } catch (e) { store = null; }
    var token = null; try { token = CFG.accounts === true && store ? store.getItem(KEY) : null; } catch (e) { token = null; }
    return {
      signedIn: !!token && live(token, Math.floor(Date.now() / 1000)),
      // the account page asks this: was it opened by the menu's Sign out (?signout=1)? It then runs its own full sign-out, server revoke included
      signOutRequested: function () { try { return /(?:^|[?&])signout=1(?:&|$)/.test((win.location && win.location.search) || ''); } catch (e) { return false; } }
    };
  }
  var api = { KEY: KEY, live: live, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root.document) root.FMW_SESSION = create(root);
})(this);
