// Public brands: the list of approved brands (home carousel, /brands/) and one brand page (listing.html?id=brand-<slug>). DORMANT until site.json "brandsPublic" is true (FMW_CONFIG.brandsPublic):
// off, this file makes no request and every caller gets "nothing". It reads two public RPCs of P6_public_brands.DRAFT.sql (fmw_public_brands, fmw_public_brand), which already limit the answer to an approved,
// live, non-held brand and never return its licence (a brand licence contains the owner's account id) or anything of the owner: the handle is the business id as 32 hex digits.
// The answers are untrusted JSON: only a 32-hex slug, a plain name / tagline and a Storage logo path of this project are kept. Text goes in with textContent only; an image is drawn only from this project's Storage host.
(function (root) {
  var SLUG = /^[0-9a-f]{32}$/, PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/logo\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp|png)$/i;
  function enabled(win) {
    var c = win && win.FMW_CONFIG, p = c && c.authProject;
    return !!(c && c.brandsPublic === true && p && p.url && p.anonKey && typeof win.fetch === 'function');
  }
  function rpc(win, name, body) {
    var p = win.FMW_CONFIG.authProject;
    return Promise.resolve().then(function () { return win.fetch.call(win, p.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: p.anonKey, Authorization: 'Bearer ' + p.anonKey }, body: JSON.stringify(body || {}) }); })
      .then(function (r) { return r && r.ok ? r.json() : null; }).then(function (j) { return j; }, function () { return null; });
  }
  function text(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
  function clean(list) {
    return (Array.isArray(list) ? list : []).filter(function (b) { return b && typeof b.slug === 'string' && SLUG.test(b.slug) && text(b.name, 120); }).slice(0, 100).map(function (b) {
      return { slug: b.slug, name: text(b.name, 120), tagline: text(b.tagline, 160), logo: typeof b.logo === 'string' && PATH.test(b.logo) ? b.logo : '' };
    });
  }
  function list(win, limit) {
    if (!enabled(win)) return Promise.resolve([]);
    var n = Number(limit) > 0 ? Math.min(Math.floor(Number(limit)), 100) : 24;
    return rpc(win, 'fmw_public_brands', { p_limit: n, p_offset: 0 }).then(clean);
  }
  function detail(win, slug) {
    var s = String(slug || '').toLowerCase();
    if (!enabled(win) || !SLUG.test(s)) return Promise.resolve(null);
    return rpc(win, 'fmw_public_brand', { p_slug: s }).then(function (d) { return d && typeof d === 'object' && d.slug === s && d.profile && text(d.profile.display_name, 120) ? d : null; });
  }
  function logoUrl(win, path) {
    var b = win && win.FMW_CONFIG && win.FMW_CONFIG.authProject && String(win.FMW_CONFIG.authProject.url || '').replace(/\/$/, '');
    return b && /^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(b) && PATH.test(String(path)) ? b + '/storage/v1/object/public/fmw-business-media/' + path : '';
  }
  function href(slug) { return 'listing.html?id=brand-' + slug; }
  // one brand as a link tile: the logo when it has one (decorative: the name is next to it), always the name as text
  function tile(doc, win, b, cls, hrefOf) {
    var a = doc.createElement('a'); a.className = cls; a.href = (hrefOf || href)(b.slug);
    var src = b.logo ? logoUrl(win, b.logo) : '';
    if (src) { var im = doc.createElement('img'); im.className = 'brand-logo'; im.src = src; im.alt = ''; im.loading = 'lazy'; a.appendChild(im); }
    var nm = doc.createElement('span'); nm.className = 'brand-here'; nm.textContent = b.name; a.appendChild(nm);
    return a;
  }
  var api = { enabled: enabled, list: list, detail: detail, clean: clean, logoUrl: logoUrl, href: href, tile: tile, SLUG: SLUG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_BRANDS = api;
})(typeof window !== 'undefined' ? window : globalThis);
