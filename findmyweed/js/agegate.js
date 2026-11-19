// 21+ age gate on every page. Content stays hidden until the visitor confirms they are 21 or older.
// The yes is remembered on this device for 30 days. "Under 21" leaves the site and is not remembered.
(function (root) {
  var KEY = 'fmw_age_ok_until', DAYS = 30;
  function isConfirmed(store, now) { try { var u = Number(store.getItem(KEY)); return Number.isFinite(u) && u > now; } catch (e) { return false; } }
  function confirm(store, now) { try { store.setItem(KEY, String(now + DAYS * 864e5)); } catch (e) { /* storage blocked: ask again next visit */ } }
  var api = { KEY: KEY, DAYS: DAYS, isConfirmed: isConfirmed, confirm: confirm };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  var doc = root.document, store;
  try { store = root.localStorage; } catch (e) { store = null; }
  if (store && isConfirmed(store, Date.now())) return;
  var C = root.FMW_COPY;
  doc.documentElement.classList.add('fmw-gated');
  function show() {
    var gate = doc.createElement('div');
    gate.className = 'agegate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'agegate-title');
    gate.setAttribute('aria-describedby', 'agegate-ask');
    // Built with createElement + textContent only (no innerHTML): copy is plain text, so an edit to copy.js can never
    // inject markup into the gate.
    var el = function (tag, attrs, text) {
      var n = doc.createElement(tag);
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text != null) n.textContent = text;
      return n;
    };
    var box = el('div', { 'class': 'agegate-box' });
    box.appendChild(el('h1', { id: 'agegate-title', 'class': 'logo' }, C.gateTitle));
    // The question, with C.gateAskStrong (e.g. "21 or older") in a <strong>, as text nodes.
    var ask = el('p', { id: 'agegate-ask' }), at = C.gateAskStrong ? C.gateAsk.indexOf(C.gateAskStrong) : -1;
    if (at < 0) ask.textContent = C.gateAsk;
    else {
      ask.appendChild(doc.createTextNode(C.gateAsk.slice(0, at)));
      ask.appendChild(el('strong', null, C.gateAskStrong));
      ask.appendChild(doc.createTextNode(C.gateAsk.slice(at + C.gateAskStrong.length)));
    }
    box.appendChild(ask);
    box.appendChild(el('p', { 'class': 'muted', 'data-g': 'note' }, C.gateNote));
    var actions = el('div', { 'class': 'agegate-actions' });
    actions.appendChild(el('button', { type: 'button', 'class': 'btn', 'data-age': 'yes' }, C.gateYes));
    actions.appendChild(el('a', { 'class': 'btn ghost', 'data-age': 'no', href: 'https://www.google.com/' }, C.gateNo));
    box.appendChild(actions);
    gate.appendChild(box);
    // The page behind the gate is hidden (visibility) and inert, so keyboard and screen-reader users stay in the dialog.
    var behind = Array.prototype.slice.call(doc.body.children);
    behind.forEach(function (n) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); });
    doc.body.appendChild(gate);
    var yes = gate.querySelector('[data-age="yes"]'), no = gate.querySelector('[data-age="no"]');
    // Tab and Shift+Tab cycle between the two answers.
    gate.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var first = yes, last = no;
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    yes.addEventListener('click', function () {
      if (store) confirm(store, Date.now());
      doc.documentElement.classList.remove('fmw-gated');
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
