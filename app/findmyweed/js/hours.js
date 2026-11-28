// FMW OWNER HOURS (Joe/Grok 2026-11-25): an APPROVED business adds its own opening hours; the listing page then feeds them into the existing open-now logic (the badge and the Hours card), so "Open now"
// lights up from REAL, owner-supplied hours only. Behind FMW_CONFIG.hours === true (site.json "hours"; false today, and docs/proposed/migrations/W10_business_hours.DRAFT.sql is NOT applied). While off
// this file installs no source and makes no request. The SERVER validates and decides who may write and what is public (fmw.set_my_hours / fmw.my_hours, and the public wrapper public.fmw_listing_hours);
// this file checks the same rules so the owner gets the answer before a round trip and so nothing malformed can ever reach the page's open-now logic.
//   window.FMW_HOURS = { mine(token), save(token, week, note), forLicense(license) }   window.FMW_HOURS_UTIL = { DAYS, cleanTime, cleanWeek, cleanNote, usable }
(function (root) {
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  function cleanTime(s) { return typeof s === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s) ? s : null; }
  // WEEK: an object of weekday -> up to 3 ["HH:MM","HH:MM"] ranges (open and close differ; a close before the open runs past midnight). Returns the normalised week (all seven days, [] = closed),
  // null for nothing set (every day empty, or null/undefined), or false for anything malformed.
  function cleanWeek(w) {
    if (w == null) return null;
    if (typeof w !== 'object' || Array.isArray(w)) return false;
    var k, out = {}, any = false;
    for (k in w) if (Object.prototype.hasOwnProperty.call(w, k) && DAYS.indexOf(k) < 0) return false;
    for (var i = 0; i < DAYS.length; i++) {
      var d = DAYS[i], r = w[d] == null ? [] : w[d];
      if (!Array.isArray(r) || r.length > 3) return false;
      out[d] = [];
      for (var j = 0; j < r.length; j++) {
        var x = r[j], o = Array.isArray(x) && x.length === 2 ? cleanTime(x[0]) : null, c = Array.isArray(x) && x.length === 2 ? cleanTime(x[1]) : null;
        if (!o || !c || o === c) return false;
        out[d].push([o, c]); any = true;
      }
    }
    return any ? out : null;
  }
  // NOTE: at most 140 characters, no control characters; '' for empty, null for invalid
  function cleanNote(s) {
    if (s == null) return '';
    var t = String(s).trim();
    if (!t) return '';
    return t.length > 140 || /[\u0000-\u001f\u007f-\u009f]/.test(t) ? null : t;
  }
  // what the listing page may use from a server answer: { hours (a clean week, at least one range) | null, note }; anything else is { hours: null, note: '' }
  function usable(c) {
    var wk = c && typeof c === 'object' ? cleanWeek(c.hours) : null, nt = c && typeof c === 'object' ? cleanNote(c.note) : '';
    return wk ? { hours: wk, note: nt || '' } : { hours: null, note: '' };
  }
  function create(win) {
    var cfg = (win.FMW_CONFIG && win.FMW_CONFIG.authProject) || null;
    function rpc(name, body, token, profile) {
      if (!cfg || !cfg.url || !cfg.anonKey || typeof win.fetch !== 'function') return Promise.resolve({ ok: false });
      var h = { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + (token || cfg.anonKey) };
      if (profile !== 'public') h['Content-Profile'] = 'fmw';   // the owner's calls are in the fmw profile; the public read is the thin wrapper in the public schema
      return win.fetch(cfg.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: h, body: JSON.stringify(body || {}) })
        .then(function (r) { return r && r.ok ? r.json().then(function (j) { return { ok: true, data: j }; }, function () { return { ok: false }; }) : { ok: false, status: r && r.status }; }, function () { return { ok: false }; });
    }
    return {
      mine: function (token) { return token ? rpc('my_hours', {}, token) : Promise.resolve({ ok: false }); },
      save: function (token, week, note) {
        var wk = cleanWeek(week), nt = cleanNote(note);
        if (!token || wk === false || nt === null) return Promise.resolve({ ok: false, invalid: true });   // never sent: the same rules the server applies
        return rpc('set_my_hours', { p_hours: wk, p_note: nt || null }, token);
      },
      forLicense: function (license) { var t = String(license || '').trim().toUpperCase(); return (/^[A-Z]{1,4}\d{0,2}-\d{7}-LIC$/.test(t) || /^CCL\d{2}-\d{7}$/.test(t) || /^DCC-\d{8}$/.test(t)) ? rpc('fmw_listing_hours', { p_license: t }, null, 'public') : Promise.resolve({ ok: false }); }
    };
  }
  var api = { DAYS: DAYS, cleanTime: cleanTime, cleanWeek: cleanWeek, cleanNote: cleanNote, usable: usable, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document && root.FMW_CONFIG && root.FMW_CONFIG.hours === true) { root.FMW_HOURS = create(root); root.FMW_HOURS_UTIL = api; }
})(this);
