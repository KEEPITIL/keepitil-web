// FMW DEALS on the listing page (slice 3 of docs/FMW_DEALS_STRAIN_SPEC_DRAFT.md), BEHIND FMW_CONFIG.deals === true (nothing sets it: off today).
// Deals are advertising, so they sit behind a one-tap "I am 21 or older" confirmation kept ON THIS DEVICE only (no account, one small flag).
// Deals come from an injected source (window.FMW_DEALS_SOURCE.loadDeals(license) -> Promise of rows); every row is re-checked with
// js/ad-rules.js before it is drawn, so a bad row is dropped, never shown. Each card shows the license number and the terms. No payments.
(function (root) {
  var KEY = 'fmw_21';
  var T = { title: 'Deals', gate: 'Deals are for adults 21 and older.', confirm: 'I am 21 or older', none: 'No deals right now.', closed: 'Deals are not open yet.', ends: 'Ends', license: 'License', terms: 'Terms' };
  function mount(doc, license, into, opts) {
    var win = (opts && opts.win) || root, CFG = win.FMW_CONFIG || {};
    if (CFG.deals !== true || !into) return null;
    var R = (opts && opts.R) || root.FMW_AD_RULES, src = win.FMW_DEALS_SOURCE || null;
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    var sec = el('section', 'card deals'); sec.setAttribute('data-state', 'deals'); sec.appendChild(el('h2', null, T.title)); into.appendChild(sec);
    if (!src || typeof src.loadDeals !== 'function' || !R) { sec.appendChild(el('p', 'muted', T.closed)); sec.setAttribute('data-state', 'closed'); return { state: 'closed' }; }
    function confirmed() { try { return !!(win.localStorage && win.localStorage.getItem(KEY) === '1'); } catch (e) { return false; } }
    function remember() { try { if (win.localStorage) win.localStorage.setItem(KEY, '1'); } catch (e) { /* no storage: asked again next visit */ } }
    var body = el('div'); sec.appendChild(body);
    function clear() { while (body.firstChild) body.removeChild(body.firstChild); }
    function gate() {
      clear(); sec.setAttribute('data-state', 'gate'); body.appendChild(el('p', null, T.gate));
      var b = el('button', 'btn', T.confirm); b.type = 'button'; b.setAttribute('data-act', 'confirm-21'); b.addEventListener('click', function () { remember(); load(); }); body.appendChild(b);
    }
    function draw(rows) {
      clear(); sec.setAttribute('data-state', 'open');
      var ok = (Array.isArray(rows) ? rows : []).filter(function (d) { return d && d.license === license && d.status === 'published' && R.validateDeal(d).ok; });
      if (!ok.length) { body.appendChild(el('p', 'muted', T.none)); return; }
      ok.forEach(function (d) {
        var c = el('div', 'deal-card'); c.appendChild(el('h3', null, String(d.title).trim())); c.appendChild(el('p', 'deal-line', R.discountLine(d)));
        if (d.description) c.appendChild(el('p', null, String(d.description).trim()));
        c.appendChild(el('p', 'muted', T.terms + ': ' + String(d.termsText).trim())); c.appendChild(el('p', 'muted', T.ends + ' ' + String(d.endsAt).slice(0, 10)));
        c.appendChild(el('p', 'mono', T.license + ' ' + d.license)); body.appendChild(c);
      });
    }
    function load() { Promise.resolve().then(function () { return src.loadDeals(license); }).then(draw, function () { clear(); body.appendChild(el('p', 'muted', T.none)); }); }
    if (confirmed()) load(); else gate();
    return { state: 'open' };
  }
  var api = { KEY: KEY, T: T, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_DEALS = api;
})(this);
