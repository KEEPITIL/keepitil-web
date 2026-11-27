// Device settings: the theme and the last-known location. Loaded in <head> right after the stylesheet so a saved theme
// applies before first paint. Storage can be blocked: every access is in try/catch and the page then uses the defaults.
// Only TWO keys are ever stored, both on this device only (the Privacy page says so):
//   fmw-theme  "system" | "light" | "dark"   The 3-way theme pill in the menu (System / Bright / Dark). Nothing saved = the
//              bright designed theme (the default). The OS setting is consulted ONLY when the visitor picked "system".
//   fmw-area   the location dropdown's last value ("county:<name>" / "city:<name>" / "" for the whole state), so the home
//              opens there next time. The page script checks it against the data before using it.
(function (doc) {
  var KEY = 'fmw-theme', AREA = 'fmw-area', root = doc.documentElement, THEMES = ['system', 'light', 'dark'];
  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* blocked storage: lasts this page only */ } }
  var mq = null;
  function osDark() {
    try { if (!mq && window.matchMedia) mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { mq = null; }
    return !!(mq && mq.matches);
  }
  var choice = THEMES.indexOf(get(KEY)) >= 0 ? get(KEY) : 'light';
  function apply() {
    var dark = choice === 'dark' || (choice === 'system' && osDark());
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
  }
  // "system" follows a later OS change too (only while the visitor's choice is system); one listener at most
  var watched = false;
  function watch() { if (choice === 'system' && !watched && mq && mq.addEventListener) { watched = true; mq.addEventListener('change', function () { if (choice === 'system') apply(); }); } }
  apply(); watch();
  window.FMW_THEME = {
    choices: THEMES.slice(),
    get: function () { return choice; },
    // the sign-up page's last step (js/signup.js) reads the shown theme and sets it with set('light' | 'dark')
    current: function () { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; },
    set: function (t) {
      if (THEMES.indexOf(t) < 0) return;
      choice = t; put(KEY, t); apply(); watch();
    }
  };
  window.FMW_AREA = {
    get: function () { var v = get(AREA); return typeof v === 'string' && v.length <= 120 ? v : null; },
    set: function (v) { if (typeof v === 'string' && v.length <= 120) put(AREA, v); }
  };
})(document);
