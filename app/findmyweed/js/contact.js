// FMW BUSINESS CONTACT (Grok decision 2026-11-25, option c: the claim flow). An APPROVED business may add an optional phone number and an optional website to its own listing; the listing page
// then shows a "Call" button (tel:) and a "Website" link ONLY when the field is set, and nothing otherwise. Owner-supplied, never imported: the converter's allow-list and the shipped data stay strict.
// Behind FMW_CONFIG.contact === true (site.json "contact"; false today, and the SQL is a DRAFT that is NOT applied: docs/proposed/migrations/W9_business_contact.DRAFT.sql). While it is off this file
// installs no source and makes no request. The SERVER validates and decides who may write and what is public (fmw.set_my_contact / fmw.my_contact, and the public wrapper public.fmw_listing_contact -> fmw.listing_contact); this file validates
// the same rules so a visitor gets the answer before a round trip, and so nothing but a clean tel: or https: link can ever be drawn.
//   window.FMW_CONTACT = { mine(token), save(token, phone, website), forLicense(license) }  (each resolves; a failure is { ok: false })
(function (root) {
  var MAX_URL = 300;
  // PHONE: a US number (10 digits, or 1 + 10; area code and exchange start 2-9) or an international +E.164 number. Spaces, dots, dashes and brackets are allowed in what is typed. Returns the
  // normalised "+1XXXXXXXXXX" / "+CCNNNN…", '' for an empty value (= clear it), or null for anything else (letters, extensions, too short or too long).
  function cleanPhone(raw) {
    if (raw == null) return '';
    var s = String(raw).trim();
    if (!s) return '';
    if (!/^\+?[0-9 ().-]+$/.test(s)) return null;
    var plus = s.charAt(0) === '+', d = s.replace(/[^0-9]/g, '');
    if (plus) return /^[1-9][0-9]{7,14}$/.test(d) ? (d.length === 11 && d.charAt(0) === '1' && !/^1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(d) ? null : '+' + d) : null;
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return /^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(d) ? '+1' + d : null;
  }
  // WEBSITE: https only. Returns the clean https URL, '' for an empty value (= clear it), or null (http, other schemes, no dot in the host, a user:password@ part, spaces, too long).
  function cleanWebsite(raw) {
    if (raw == null) return '';
    var s = String(raw).trim();
    if (!s) return '';
    if (s.length > MAX_URL || /[\s<>"'`\\]/.test(s) || !/^https:\/\//i.test(s)) return null;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(u.hostname) || u.href.length > MAX_URL) return null;
    return u.href;
  }
  // the links a listing may draw, from whatever the server answered: only a value that passes the same checks again, nothing otherwise
  function links(c) {
    var p = c && typeof c === 'object' ? cleanPhone(c.phone) : '', w = c && typeof c === 'object' ? cleanWebsite(c.website) : '';
    return { tel: p ? 'tel:' + p : '', website: w || '' };
  }
  function create(win) {
    var cfg = (win.FMW_CONFIG && win.FMW_CONFIG.authProject) || null;
    function rpc(name, body, token, profile) {
      if (!cfg || !cfg.url || !cfg.anonKey || typeof win.fetch !== 'function') return Promise.resolve({ ok: false });
      var h = { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + (token || cfg.anonKey) };
      if (profile !== 'public') h['Content-Profile'] = 'fmw';   // the owner's calls are in the fmw profile; the public read is the thin wrapper in the public schema (no usage on fmw for anon)
      return win.fetch(cfg.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: h, body: JSON.stringify(body || {}) })
        .then(function (r) { return r && r.ok ? r.json().then(function (j) { return { ok: true, data: j }; }, function () { return { ok: false }; }) : { ok: false, status: r && r.status }; }, function () { return { ok: false }; });
    }
    return {
      mine: function (token) { return token ? rpc('my_contact', {}, token) : Promise.resolve({ ok: false }); },
      save: function (token, phone, website) {
        var p = cleanPhone(phone), w = cleanWebsite(website);
        if (!token || p === null || w === null) return Promise.resolve({ ok: false, invalid: true });   // never sent: the same rules the server applies
        return rpc('set_my_contact', { p_phone: p || null, p_website: w || null }, token);
      },
      forLicense: function (license) { return /^C(9|10|12)-\d{7}-LIC$/.test(String(license || '')) ? rpc('fmw_listing_contact', { p_license: String(license) }, null, 'public') : Promise.resolve({ ok: false }); }
    };
  }
  var api = { cleanPhone: cleanPhone, cleanWebsite: cleanWebsite, links: links, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document && root.FMW_CONFIG && root.FMW_CONFIG.contact === true) { root.FMW_CONTACT = create(root); root.FMW_CONTACT_UTIL = api; }
})(this);
