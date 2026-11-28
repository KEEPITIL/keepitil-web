// Paid placements (PRIME / FEATURED), read from the server. DORMANT until site.json "placements" is true (FMW_CONFIG.placements): off, this file makes no request and changes nothing.
// On, a category / dispensaries page asks ONE public RPC (public.fmw_public_placements, P4_business_placements.DRAFT.sql) which county + category slots are live right now; the server already
// hides lapsed, held, revoked and ended ones. A slot marks a row that is ALREADY in the page's data by licence number (listing.placement = { paid: true, rank }); a slot whose licence is not in the
// rows is ignored (no invented card). PRIME sorts first (rank 0), then FEATURED by rank (1-5). Every failure leaves the rows exactly as they were. No secret: the anon key is the public one.
(function (root) {
  var LIC = /^[A-Z]{1,4}\d{0,2}-\d{7}-LIC$/;
  function load(win, county, category) {
    var CFG = win && win.FMW_CONFIG, cfg = CFG && CFG.authProject, f = win && win.fetch;
    if (!CFG || CFG.placements !== true || !cfg || !cfg.url || !cfg.anonKey || typeof f !== 'function' || !county) return Promise.resolve([]);
    return f.call(win, cfg.url + '/rest/v1/rpc/fmw_public_placements', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
      body: JSON.stringify({ p_county: String(county), p_category: category || null }) })
      .then(function (r) { return r && r.ok ? r.json() : []; }, function () { return []; })
      .then(function (list) { return Array.isArray(list) ? list : []; }, function () { return []; });
  }
  // rows: [{ listing: { license, ... } }]; returns the same array (mutated: only listing.placement on matching rows)
  function apply(rows, slots) {
    var by = {};
    (slots || []).forEach(function (s) {
      var lic = s && typeof s.license === 'string' ? s.license.trim().toUpperCase() : '';
      if (!LIC.test(lic) || (s.kind !== 'prime' && s.kind !== 'featured')) return;
      var rank = s.kind === 'prime' ? 0 : Number(s.rank);
      if (!(rank >= 0 && rank <= 5)) return;
      if (by[lic] === undefined || rank < by[lic]) by[lic] = rank;
    });
    (rows || []).forEach(function (r) {
      var l = r && r.listing, lic = l && typeof l.license === 'string' ? l.license.trim().toUpperCase() : '';
      if (lic && by[lic] !== undefined) l.placement = { paid: true, rank: by[lic] };
    });
    return rows;
  }
  var api = { load: load, apply: apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_PLACEMENTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
