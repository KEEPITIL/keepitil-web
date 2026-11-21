// Theme (stub): the bright designed theme is the default; dark is an OPTION the visitor picks with the "Dark mode" toggle.
// The ONLY thing read on load is the visitor's own saved choice (localStorage "fmw-theme" = "light" | "dark"); the OS
// setting is never consulted, so the page never auto-switches. Long term the choice is made at account creation and
// changed in Settings; this file is the cheap version of that. Storage can be blocked: every access is in try/catch and
// the page then simply stays on the default theme. Loaded in <head> right after the stylesheet so a saved dark choice
// applies before first paint.
(function (doc) {
  var KEY = 'fmw-theme', root = doc.documentElement;
  function saved() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(t) { try { window.localStorage.setItem(KEY, t); } catch (e) { /* blocked storage: the choice lasts this page only */ } }
  function apply(t) { if (t === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme'); }
  function isDark() { return root.getAttribute('data-theme') === 'dark'; }
  apply(saved());
  function wire() {
    var b = doc.getElementById('theme-toggle'); if (!b) return;
    var sync = function () { b.setAttribute('aria-pressed', isDark() ? 'true' : 'false'); };
    sync();
    b.addEventListener('click', function () { var t = isDark() ? 'light' : 'dark'; apply(t); store(t); sync(); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', wire); else wire();
})(document);
