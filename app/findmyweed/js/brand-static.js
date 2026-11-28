// A STATIC brand page: listing.html?id=brand-<slug> for a real, existing brand in data/brands.json, drawn on the shared account template (js/account-page.js), unclaimed.
// Only the entry's public facts reach the page: name, category, website and phone (each re-checked by the template; a phone is blank unless the brand's own site lists it) and the source label.
(function (root) {
  var RE = /^brand-([a-z0-9][a-z0-9-]{1,39})$/;
  function matches(id) { return RE.test(String(id || '').toLowerCase()); }
  function find(data, slug) { return data && Array.isArray(data.brands) ? data.brands.filter(function (x) { return x && x.slug === slug && typeof x.name === 'string' && x.name; })[0] || null : null; }
  function mount(win, doc, box, id, o) {
    var m = RE.exec(String(id || '').toLowerCase()); if (!m) return;
    var clear = function () { while (box.firstChild) box.removeChild(box.firstChild); };
    win.fetch('data/brands.json', { cache: 'no-store' }).then(function (r) { return r && r.ok ? r.json() : null; }, function () { return null; }).then(function (d) {
      clear(); var b = find(d, m[1]);
      if (!b) { doc.title = o.copy.listingMissingDocTitle; if (o.missing) o.missing(box); return; }
      doc.title = String(b.name) + ' \u00b7 Find My Weed';
      var art = win.FMW_ACCOUNT && win.FMW_ACCOUNT.build(doc, { name: b.name, category: b.category, phone: b.phone, website: b.website, claimed: false, source: b.source && b.source.label }, { copy: o.copy, claimHref: o.claimHref });
      if (art) box.appendChild(art);
      // "Request a collab" for a signed-in event organizer (only while site.json "bizCollab" is on; js/collab.js is loaded on demand)
      if (art && win.FMW_CONFIG && win.FMW_CONFIG.bizCollab === true) {
        var go = function () { if (win.FMW_COLLAB) win.FMW_COLLAB.mountBrandForm(win, doc, box, b.slug, b.name, { signinHref: o.signinHref }); };
        if (win.FMW_COLLAB) go(); else { var sc = doc.createElement('script'); sc.src = 'js/collab.js'; sc.onload = go; doc.head.appendChild(sc); }
      }
    });
  }
  var api = { matches: matches, find: find, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_BRAND_STATIC = api;
})(typeof window !== 'undefined' ? window : globalThis);
