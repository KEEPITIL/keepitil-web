// 21+ prompt on every page (Grok's design decision 2026-11-18, for the owner's "fully accessible to the public"): a centred
// dialog over the page, which stays VISIBLE behind it. Until the visitor answers, the page behind is inert (no clicks, no
// keyboard focus, hidden from screen readers), so nothing can be used without an answer.
// Yes is remembered on this device for 30 days (same key as before). No goes to the neutral exit page (under21.html,
// inside Find My Weed) and is not remembered. Escape never accepts: the question stays, focus goes back to it.
(function (root) {
  var KEY = 'fmw_age_ok_until', DAYS = 30;
  // ONE-LINE SWITCH: true = browse BEFORE answering (the prompt stays on screen but the page behind is live and focusable,
  // and the prompt is not modal). false (today) = the page is visible but inert until the visitor answers.
  var BROWSE_FIRST = false;
  var EXIT_PAGE = 'under21.html';
  function isConfirmed(store, now) { try { var u = Number(store.getItem(KEY)); return Number.isFinite(u) && u > now; } catch (e) { return false; } }
  function confirm(store, now) { try { store.setItem(KEY, String(now + DAYS * 864e5)); } catch (e) { /* storage blocked: ask again next visit */ } }
  // The exit page's URL: absolute under basePath, because 404.html can be served at any depth.
  function exitHref(cfg) { return ((cfg && cfg.basePath) || '') + '/' + EXIT_PAGE; }
  var api = { KEY: KEY, DAYS: DAYS, BROWSE_FIRST: BROWSE_FIRST, EXIT_PAGE: EXIT_PAGE, isConfirmed: isConfirmed, confirm: confirm, exitHref: exitHref };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  var doc = root.document, store;
  try { store = root.localStorage; } catch (e) { store = null; }
  if (store && isConfirmed(store, Date.now())) return;
  var C = root.FMW_COPY;
  doc.documentElement.classList.add('fmw-gated');
  if (BROWSE_FIRST) doc.documentElement.classList.add('fmw-gate-browse');
  function show() {
    var gate = doc.createElement('div');
    gate.className = 'agegate';
    var box = doc.createElement('div');
    box.className = 'agegate-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', BROWSE_FIRST ? 'false' : 'true');
    box.setAttribute('aria-labelledby', 'agegate-ask');
    box.setAttribute('aria-describedby', 'agegate-note');
    // Built with createElement + textContent only (no innerHTML): copy is plain text, so an edit to copy.js can never
    // inject markup into the prompt.
    var el = function (tag, attrs, text) {
      var n = doc.createElement(tag);
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text != null) n.textContent = text;
      return n;
    };
    box.appendChild(el('p', { 'class': 'logo small', 'aria-hidden': 'true' }, C.gateTitle));
    // The question is the dialog's name, with C.gateAskStrong (e.g. "21 or older") in a <strong>, as text nodes.
    var ask = el('h2', { id: 'agegate-ask', tabindex: '-1' }), at = C.gateAskStrong ? C.gateAsk.indexOf(C.gateAskStrong) : -1;
    if (at < 0) ask.textContent = C.gateAsk;
    else {
      ask.appendChild(doc.createTextNode(C.gateAsk.slice(0, at)));
      ask.appendChild(el('strong', null, C.gateAskStrong));
      ask.appendChild(doc.createTextNode(C.gateAsk.slice(at + C.gateAskStrong.length)));
    }
    box.appendChild(ask);
    box.appendChild(el('p', { id: 'agegate-note', 'class': 'muted', 'data-g': 'note' }, C.gateNote));
    var actions = el('div', { 'class': 'agegate-actions' });
    // Sentinel A6: the two answers carry EQUAL visual weight (the same style); neither is the highlighted choice.
    actions.appendChild(el('button', { type: 'button', 'class': 'btn ghost', 'data-age': 'yes' }, C.gateYes));
    actions.appendChild(el('a', { 'class': 'btn ghost', 'data-age': 'no', href: exitHref(root.FMW_CONFIG) }, C.gateNo));
    box.appendChild(actions);
    gate.appendChild(box);
    // Modal (today): the page behind stays visible but is inert and hidden from assistive tech until an answer.
    var behind = BROWSE_FIRST ? [] : Array.prototype.slice.call(doc.body.children);
    behind.forEach(function (n) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); });
    doc.body.appendChild(gate);
    var yes = gate.querySelector('[data-age="yes"]'), no = gate.querySelector('[data-age="no"]');
    gate.addEventListener('keydown', function (e) {
      // Escape does NOT accept and does not close: the question stays and is read again.
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); ask.focus(); return; }
      if (BROWSE_FIRST || e.key !== 'Tab') return;
      // Tab and Shift+Tab cycle between the two answers.
      var first = yes, last = no;
      if (e.shiftKey && (doc.activeElement === first || doc.activeElement === ask)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    yes.addEventListener('click', function () {
      if (store) confirm(store, Date.now());
      doc.documentElement.classList.remove('fmw-gated', 'fmw-gate-browse');
      behind.forEach(function (n) { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); });
      gate.remove();
      // Put focus at the start of the page's own content.
      var main = doc.querySelector('main');
      if (main) { main.setAttribute('tabindex', '-1'); main.focus(); }
    });
    yes.focus();
  }
  if (doc.body) show(); else doc.addEventListener('DOMContentLoaded', show);
})(typeof window !== 'undefined' ? window : globalThis);
