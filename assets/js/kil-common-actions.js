/* KEEPITIL common delegated actions: the few one-line behaviours that several pages used as inline on*= handlers. Load AFTER kil-actions.js.
   kilToggleMobileMenu()   toggles .open on #mm (the mobile menu)          kilReload()    reloads the page
   kilNoSubmit(e)          prevents a form submit (the old  onsubmit="return false")
   kilVsGo(kind)           calls window.vsGo(kind) when the Create app has defined it     kilVsGoJoin()   calls window.__vsGoJoin() when defined */
function kilToggleMobileMenu() { var m = document.getElementById('mm'); if (m) m.classList.toggle('open'); }
function kilReload() { location.reload(); }
function kilNoSubmit(e) { if (e && e.preventDefault) e.preventDefault(); }
function kilVsGo(kind) { if (typeof window.vsGo === 'function') window.vsGo(kind); }
function kilVsGoJoin() { if (typeof window.__vsGoJoin === 'function') window.__vsGoJoin(); }
if (window.KilActions) window.KilActions.allow(['kilToggleMobileMenu', 'kilReload', 'kilNoSubmit', 'kilVsGo', 'kilVsGoJoin']);
