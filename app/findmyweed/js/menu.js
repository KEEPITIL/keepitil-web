// FMW MENU logic (slice 3 of docs/FMW_ORDERING_PLAN_DRAFT.md): clean, group, filter and sort a business's menu rows. Pure functions, NOT wired
// into any page yet (the menu table is a DRAFT migration). Prices are shown to the customer; Find My Weed takes no payments. No network.
(function (root) {
  var CATS = ['flower', 'pre-roll', 'vape', 'concentrate', 'edible', 'beverage', 'topical', 'tincture', 'capsule', 'accessory', 'other'];
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  // one row from the data source -> a safe item, or null (never trust stored data)
  function item(r) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name.trim()) return null;
    var p = Math.floor(num(r.priceCents)); if (!(p >= 0) || p > 1000000) return null;
    var cat = typeof r.category === 'string' && CATS.indexOf(r.category.toLowerCase()) >= 0 ? r.category.toLowerCase() : 'other';
    var thc = num(r.thcPct), cbd = num(r.cbdPct);
    return { id: r.id.slice(0, 64), name: r.name.trim().slice(0, 120), category: cat, brand: typeof r.brand === 'string' ? r.brand.slice(0, 80) : '', size: typeof r.size === 'string' ? r.size.slice(0, 40) : '',
      priceCents: p, thcPct: thc !== null && thc >= 0 && thc <= 100 ? thc : null, cbdPct: cbd !== null && cbd >= 0 && cbd <= 100 ? cbd : null, inStock: r.inStock !== false, sort: Math.floor(num(r.sort)) || 0 };
  }
  function clean(rows) { return (Array.isArray(rows) ? rows : []).slice(0, 2000).map(item).filter(Boolean); }
  // q: text (name or brand), category, maxCents, inStockOnly (default true), sortBy: 'menu' | 'price-asc' | 'price-desc' | 'thc-desc' | 'name'
  function filter(items, o) {
    o = o || {}; var q = String(o.q || '').trim().toLowerCase();
    var out = items.filter(function (i) {
      if (o.inStockOnly !== false && !i.inStock) return false;
      if (o.category && i.category !== o.category) return false;
      if (typeof o.maxCents === 'number' && i.priceCents > o.maxCents) return false;
      if (q && (i.name + ' ' + i.brand).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = o.sortBy || 'menu';
    var cmp = { 'menu': function (a, b) { return a.sort - b.sort || a.name.localeCompare(b.name); }, 'price-asc': function (a, b) { return a.priceCents - b.priceCents; },
      'price-desc': function (a, b) { return b.priceCents - a.priceCents; }, 'thc-desc': function (a, b) { return (b.thcPct || 0) - (a.thcPct || 0); }, 'name': function (a, b) { return a.name.localeCompare(b.name); } }[by] || null;
    return cmp ? out.slice().sort(cmp) : out;
  }
  function group(items) {   // categories in the fixed order above; empty ones left out
    return CATS.map(function (c) { return { category: c, items: items.filter(function (i) { return i.category === c; }) }; }).filter(function (g) { return g.items.length; });
  }
  var api = { CATS: CATS, item: item, clean: clean, filter: filter, group: group };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_MENU = api;
})(this);
