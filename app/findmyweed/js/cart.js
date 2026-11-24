// FMW order-ahead CART logic (slice 4 of docs/FMW_ORDERING_PLAN_DRAFT.md). Pure functions + a tiny per-tab store; NOT wired into any page yet
// (no menu data exists until the menu slices land). One business per cart. Totals are DISPLAY ONLY: Find My Weed takes no payments
// (pay the business at pickup or delivery). No network, no payment code, nothing but the item name, price and quantity is kept.
(function (root) {
  var MAX_QTY = 20, MAX_LINES = 40, KEY = 'fmw_cart';
  var LIC = /^[A-Z]{1,4}[0-9]{1,2}-[0-9]{7}-LIC$/;
  function empty() { return { license: null, lines: [] }; }
  function clean(c) {   // never trust stored data: rebuild a valid cart or an empty one
    try {
      if (!c || typeof c !== 'object' || !LIC.test(String(c.license || '')) || !Array.isArray(c.lines)) return empty();
      var lines = [];
      c.lines.slice(0, MAX_LINES).forEach(function (l) {
        var q = Math.floor(Number(l && l.qty)), p = Math.floor(Number(l && l.priceCents));
        if (l && typeof l.id === 'string' && l.id && typeof l.name === 'string' && l.name && q >= 1 && p >= 0 && p <= 1000000) lines.push({ id: l.id.slice(0, 64), name: l.name.slice(0, 120), priceCents: p, qty: Math.min(q, MAX_QTY) });
      });
      return lines.length ? { license: c.license, lines: lines } : empty();
    } catch (e) { return empty(); }
  }
  // add one unit of an item; a DIFFERENT business than the cart's is refused (returns {ok:false, reason:'other-business'}) so the page can ask first
  function add(cart, license, item) {
    var c = clean(cart);
    if (!LIC.test(String(license || ''))) return { ok: false, reason: 'bad-license', cart: c };
    if (c.license && c.license !== license) return { ok: false, reason: 'other-business', cart: c };
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !(Number(item.priceCents) >= 0)) return { ok: false, reason: 'bad-item', cart: c };
    c.license = license;
    var line = c.lines.filter(function (l) { return l.id === item.id; })[0];
    if (line) { if (line.qty >= MAX_QTY) return { ok: false, reason: 'max-qty', cart: c }; line.qty += 1; }
    else { if (c.lines.length >= MAX_LINES) return { ok: false, reason: 'too-many', cart: c }; c.lines.push({ id: item.id.slice(0, 64), name: item.name.slice(0, 120), priceCents: Math.floor(Number(item.priceCents)), qty: 1 }); }
    return { ok: true, cart: clean(c) };
  }
  function setQty(cart, id, qty) {
    var c = clean(cart), q = Math.floor(Number(qty));
    c.lines = c.lines.map(function (l) { return l.id === id ? { id: l.id, name: l.name, priceCents: l.priceCents, qty: Math.min(q, MAX_QTY) } : l; }).filter(function (l) { return l.qty >= 1; });
    return clean(c.lines.length ? c : empty());
  }
  function totals(cart) {
    var c = clean(cart), n = 0, cents = 0;
    c.lines.forEach(function (l) { n += l.qty; cents += l.qty * l.priceCents; });
    return { items: n, displayCents: cents };   // display only: nothing is charged
  }
  function money(cents) { return '$' + (Math.floor(cents / 100)) + '.' + ('0' + (cents % 100)).slice(-2); }
  // the per-tab store (sessionStorage, ends with the tab); every read goes through clean()
  function store(win) {
    function s() { try { return win.sessionStorage || null; } catch (e) { return null; } }
    return {
      load: function () { try { var st = s(); return clean(st && JSON.parse(st.getItem(KEY) || 'null')); } catch (e) { return empty(); } },
      save: function (c) { try { var st = s(); if (st) st.setItem(KEY, JSON.stringify(clean(c))); } catch (e) { /* no storage: the cart lives for this page only */ } },
      clear: function () { try { var st = s(); if (st) st.removeItem(KEY); } catch (e) { /* nothing */ } }
    };
  }
  var api = { MAX_QTY: MAX_QTY, MAX_LINES: MAX_LINES, KEY: KEY, empty: empty, clean: clean, add: add, setQty: setQty, totals: totals, money: money, store: store };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_CART = api;
})(this);
