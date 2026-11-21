// Find My Weed core: search, distance and open-now logic. Pure functions, no DOM, so node tests run them as is.
(function (root) {
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var DAY_NAMES = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  var WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  // The SAME rule as the proposed public read in docs/proposed/fmw_real_listings.PROPOSED.sql, for every row (fixture or
  // real): shown only when published === true, it has a license number, its state status is Active or About to Expire,
  // and it has a valid expiry date that has not passed. Anything missing counts as NOT shown.
  // "About to Expire" counts as ACTIVE (decided by Joe, 2026-11-17 03:38 PT; DCC: it "remains Active").
  var SHOWN_STATUS = ['Active', 'About to Expire'];
  // Every listing is in California: dates and times are LA's, whatever the viewer's own time zone (#15).
  var DEFAULT_TZ = 'America/Los_Angeles';
  // Today's date IN LA (YYYY-MM-DD): a license that expires today is judged on LA's day, not the viewer's.
  function today(now) { return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now || new Date()); }
  // Held licenses: never shown publicly, even if published:true. C10-0001471-LIC
  // Fails closed. A held license is NEVER shown, whatever the data says: licensed() (and so
  // search, byId, cities and the map, which all go through it) drops it even if a row slips through with published: true.
  // Two more layers: the converter (tools/export-to-listings.js) writes held rows with published: false, and the release
  // check (tools/check-listings.js, run by npm run lint and CI) refuses a listings file that publishes one.
  // This list is the ONE source for all three.
  var HELD_LICENSES = ['C10-0001471-LIC'];
  // Matched on the license number OR the id (the id is the number in lower case), trimmed, any case.
  function isHeld(l) {
    if (!l) return false;
    var k = function (v) { return typeof v === 'string' ? v.trim().toUpperCase() : ''; };
    return HELD_LICENSES.indexOf(k(l.license)) >= 0 || HELD_LICENSES.indexOf(k(l.id)) >= 0;
  }
  // The state-license half of the rule (number, status, expiry), without published / held: the converter uses it to decide
  // which rows to keep; the pages always use licensed().
  function licenseLive(l, now) {
    if (!l || typeof l.license !== 'string' || l.license.trim() === '') return false;
    return SHOWN_STATUS.indexOf(l.licenseStatus) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(l.licenseExpires || '') && l.licenseExpires >= today(now);
  }
  function licensed(list, now) {
    return (list || []).filter(function (l) {
      if (!l || l.published !== true || isHeld(l)) return false;
      return licenseLive(l, now);
    });
  }

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }

  // Place names, compared the way people type them (search ranking on the real data): accents and full stops ignored,
  // and a leading W / N / S / E / St / Mt / Ft is the full word, on BOTH sides, so "W Hollywood" (as the state spells
  // some rows) and "West Hollywood" are one place. Control characters are NOT touched here (search cleans them first).
  var ABBR = { w: 'west', n: 'north', s: 'south', e: 'east', st: 'saint', mt: 'mount', ft: 'fort' };
  var ALIAS = { la: 'los angeles', sf: 'san francisco' };   // whole-query nicknames only
  var PREFIX_MIN = 3;
  function placeKey(s) {
    var t = norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').replace(/ +/g, ' ').trim();
    return t.split(' ').map(function (w, i) { return i === 0 && ABBR[w] ? ABBR[w] : w; }).join(' ');
  }
  // what the visitor typed, as a place key: "Oakland, CA", "Oakland CA 94612" and "oakland california" are all "oakland"
  function queryKey(q) {
    var t = placeKey(String(q == null ? '' : q).replace(/,.*$/, '')).replace(/ \d{5}(-\d{4})?$/, '').replace(/ (ca|california)$/, '').trim();
    return ALIAS[t] || t;
  }
  // A 5-digit ZIP matches a place's ZIP list. Anything else matches a place name (above): exact first, then a prefix of
  // PREFIX_MIN+ letters. When several places fit, the one with the most listed businesses wins (weight), then A-Z, so
  // "san" is San Francisco, not whichever "San …" the data lists first. A city that isn't found but ends in a ZIP
  // ("Nowhere CA 94612") falls back to that ZIP. weight(place) is optional (search passes the listing counts).
  function findPlace(q, places, weight) {
    var raw = norm(q).replace(/,.*$/, '');
    if (!raw) return null;
    places = places || [];
    var byZip = function (z) { return places.find(function (p) { return (p.zips || []).indexOf(z) >= 0; }) || null; };
    if (/^\d{5}$/.test(raw)) return byZip(raw);
    var w = typeof weight === 'function' ? weight : function () { return 0; };
    // most businesses first; then the spelled-out name ("North Hollywood" over "N Hollywood", same place); then A-Z
    var full = function (p) { return placeKey(p.name) === norm(p.name).replace(/\./g, '') ? 0 : 1; };
    var best = function (list) { return list.slice().sort(function (a, b) { return (w(b) - w(a)) || (full(a) - full(b)) || String(a.name).localeCompare(String(b.name)); })[0] || null; };
    var t = queryKey(q), tail = /(\d{5})(-\d{4})?$/.exec(norm(q));
    if (t) {
      var exact = places.filter(function (p) { return placeKey(p.name) === t; });
      if (exact.length) return best(exact);
      if (t.length >= PREFIX_MIN) { var pre = places.filter(function (p) { return placeKey(p.name).indexOf(t) === 0; }); if (pre.length) return best(pre); }
    }
    return tail ? byZip(tail[1]) : null;
  }

  function hasPoint(o) { return !!o && typeof o.lat === 'number' && typeof o.lng === 'number' && isFinite(o.lat) && isFinite(o.lng); }
  function miles(a, b) {
    var R = 3958.8, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // The listing's local weekday and minute of day at `now`, in the listing's own time zone.
  function localTime(now, tz) {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || DEFAULT_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    var get = function (k) { var p = parts.find(function (x) { return x.type === k; }); return p ? p.value : ''; };
    var day = get('weekday').slice(0, 3).toLowerCase();
    return { day: day, min: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
  }

  function toMin(hhmm) { var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }

  // Are this listing's hours usable? An object of weekday -> list of ["HH:MM", "HH:MM"] ranges, only known weekdays,
  // every time valid, and at least one range somewhere. Missing, malformed or all-empty hours are NOT usable: the
  // listing then reads "Hours not listed" and is never "open" (#15). A day with [] (or absent) is a closed day.
  function hoursKnown(listing) {
    var h = listing && listing.hours;
    if (!h || typeof h !== 'object' || Array.isArray(h)) return false;
    var any = false;
    for (var k in h) {
      if (DAYS.indexOf(k) < 0 || !Array.isArray(h[k])) return false;
      for (var i = 0; i < h[k].length; i++) {
        var r = h[k][i];
        if (!Array.isArray(r) || r.length !== 2) return false;
        var o = toMin(r[0]), c = toMin(r[1]);
        if (!isFinite(o) || !isFinite(c) || o > 1439 || c > 1440 || o === c) return false;
        any = true;
      }
    }
    return any;
  }

  // Open now? Ranges that close at or before they open run past midnight (e.g. 16:00-02:00).
  // Returns { open, until }, plus known: false ONLY when the hours are not usable (open is then always false; the
  // shape for usable hours is unchanged). `now` is injectable (tests); the listing's tz, else LA.
  function openState(listing, now) {
    if (!hoursKnown(listing)) return { open: false, until: null, known: false };
    var t = localTime(now || new Date(), listing.tz), hours = listing.hours;
    var today = hours[t.day] || [], prev = hours[DAYS[(DAYS.indexOf(t.day) + 6) % 7]] || [];
    for (var i = 0; i < today.length; i++) {
      var o = toMin(today[i][0]), c = toMin(today[i][1]);
      if (!isFinite(o) || !isFinite(c)) continue;
      if (c > o ? (t.min >= o && t.min < c) : t.min >= o) return { open: true, until: today[i][1] };
    }
    for (var j = 0; j < prev.length; j++) {
      var po = toMin(prev[j][0]), pc = toMin(prev[j][1]);
      if (isFinite(po) && isFinite(pc) && pc <= po && t.min < pc) return { open: true, until: prev[j][1] };
    }
    return { open: false, until: null };
  }

  // 24 h "HH:MM" to "9 AM" / "9:30 PM"; "00:00" closing reads as "midnight".
  function fmtTime(hhmm) {
    var m = toMin(hhmm); if (!isFinite(m)) return '';
    var h = Math.floor(m / 60) % 24, mm = m % 60;
    if (h === 0 && mm === 0) return 'midnight';
    var ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12;
    return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '') + ' ' + ap;
  }

  // One line per weekday, Monday first: [{ day: 'Mon', text: '9 AM - 9 PM' | 'Closed' }]
  function weekHours(listing) {
    var hours = listing.hours || {};
    return WEEK.map(function (d) {
      var r = hours[d] || [];
      return { key: d, day: DAY_NAMES[d], text: r.length ? r.map(function (x) { return fmtTime(x[0]) + ' - ' + fmtTime(x[1]); }).join(', ') : 'Closed' };
    });
  }

  // What the visitor typed: 'empty', 'zip' (5 digits, or ZIP+4 like 12345-6789), 'badzip' (only digits/dashes/spaces
  // but not a ZIP, e.g. "123" or "123456"), or 'city' (anything else).
  // Search input hygiene: control characters dropped, whitespace collapsed and trimmed, at most MAX_QUERY characters.
  // Matching is case-insensitive (findPlace normalises). The query is only ever shown with textContent.
  var MAX_QUERY = 80;
  function cleanQuery(q) {
    return String(q == null ? '' : q).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY).trim();
  }

  function classify(q) {
    var t = cleanQuery(q);
    if (!t) return { kind: 'empty', value: '' };
    if (/^\d{5}(-\d{4})?$/.test(t)) return { kind: 'zip', value: t.slice(0, 5) };
    if (/^[\d\s-]+$/.test(t)) return { kind: 'badzip', value: t };
    return { kind: 'city', value: t };
  }

  // A searched place lists only businesses whose own address is in it: the city name matches, or the ZIP is one of the
  // place's ZIPs. A business in another city or ZIP is left out, however close it is.
  function inPlace(l, place) {
    var a = (l && l.address) || {};
    return (!!a.city && placeKey(a.city) === placeKey(place.name)) || (place.zips || []).indexOf(String(a.zip || '').slice(0, 5)) >= 0;
  }

  // The cities a visitor can choose from: those of the listings actually shown (licensed + published), sorted.
  function cities(data, now) {
    var seen = {}, out = [];
    licensed((data && data.listings) || [], now).forEach(function (l) {
      var c = String((l.address && l.address.city) || '').trim();
      if (c && !seen[norm(c)]) { seen[norm(c)] = 1; out.push(c); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }

  // opts: { q, city, delivery, storefront, openNow }. Delivery + Storefront both ticked (or neither) means either kind.
  // city: one of cities() (from the ?city= URL param, so a search is shareable); a city that is not listed is notFound.
  // Returns { place, notFound, reason, results: [{ listing, miles, open, until }] } sorted by distance, then name.
  // When nothing matches the place: notFound = true and reason = 'badzip' | 'zip' (valid ZIP we don't cover) | 'city'.
  // When the place is found but the filters leave nothing: results = [] and filtered = true (clearing filters helps).
  function search(data, opts, now) {
    opts = opts || {}; now = now || new Date();
    var c = classify(opts.q), q = c.value;
    if (c.kind === 'badzip') return { place: null, notFound: true, reason: 'badzip', results: [] };
    // ambiguous names go to the place with the most listed businesses (counted on the licensed rows, by place key)
    var count = {}; licensed(data.listings, now).forEach(function (l) { var k = placeKey(l.address && l.address.city); if (k) count[k] = (count[k] || 0) + 1; });
    var place = q ? findPlace(q, data.places, function (p) { return count[placeKey(p.name)] || 0; }) : null;
    if (q && !place) return { place: null, notFound: true, reason: c.kind, results: [] };
    var city = cleanQuery(opts.city);
    if (city && !cities(data, now).some(function (x) { return norm(x) === norm(city); })) {
      return { place: null, notFound: true, reason: 'city', results: [] };
    }
    var kindFilter = !!opts.delivery !== !!opts.storefront;
    var rows = licensed(data.listings, now).filter(function (l) {
      if (place && !inPlace(l, place)) return false;
      if (city && norm(l.address && l.address.city) !== norm(city)) return false;
      if (kindFilter && opts.delivery && !l.delivery) return false;
      if (kindFilter && opts.storefront && !l.storefront) return false;
      return true;
    }).map(function (l) {
      var s = openState(l, now);
      // a delivery-only service has NO coordinates in the public data (its premises are private): no distance, never NaN
      return { listing: l, miles: place && hasPoint(place) && hasPoint(l) ? miles(place, l) : null, open: s.open, until: s.until, known: s.known };
    }).filter(function (r) { return !opts.openNow || r.open; });
    // nearest first; rows with no distance (delivery-only services) after them; then by name
    rows.sort(function (a, b) { return ((a.miles == null) - (b.miles == null)) || ((a.miles || 0) - (b.miles || 0)) || a.listing.name.localeCompare(b.listing.name); });
    var filtered = !!(opts.openNow || kindFilter || city);
    return { place: place, notFound: false, reason: null, filtered: filtered, results: rows };
  }

  // What the shop page may show as the address (the Privacy page's promise):
  //   storefront     street, then "City, ST ZIP"; no street on file → the city line + 'street'
  //   delivery-only  "City, ST" ONLY: never the street or the ZIP, even when the data has them
  //   no city at all → no lines, note 'none' ("Address not listed"); never a crash on a missing address
  // Returns { lines: [text…], note: 'delivery' | 'street' | 'none' | null }. Plain strings (shown with textContent).
  function addressLines(l) {
    var a = (l && l.address && typeof l.address === 'object') ? l.address : {};
    var s = function (v) { return typeof v === 'string' ? v.trim() : ''; };
    var city = s(a.city), st = s(a.state), zip = s(a.zip), line1 = s(a.line1);
    if (!city) return { lines: [], note: 'none' };
    var cityState = city + (st ? ', ' + st : '');
    if (!(l && l.storefront)) return { lines: [cityState], note: 'delivery' };
    var cityLine = cityState + (zip ? ' ' + zip : '');
    return line1 ? { lines: [line1, cityLine], note: null } : { lines: [cityLine], note: 'street' };
  }
  function cityOf(l) { return (l && l.address && typeof l.address.city === 'string') ? l.address.city.trim() : ''; }

  function byId(data, id, now) { return licensed(data.listings, now).find(function (l) { return l.id === id; }) || null; }

  // Only http(s) links leave the site; anything else (javascript:, data:) is dropped.
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }

  // ---- License check line + link to the official state record (docs/DATA_PLAN.md §1) ----
  // The link is BUILT here from the license number on ONE allow-listed base. No URL, host or other field from the
  // listing ever goes into it. The base is the DCC license search's own results URL (pattern seen on
  // search.cannabis.ca.gov, 2026-11-17; not called by this site). Only real state-format numbers get a link:
  // C9- (delivery), C10- (storefront), C12- (microbusiness), 7 digits, -LIC. The SAMPLE fixture numbers get none.
  var DCC_SEARCH = 'https://search.cannabis.ca.gov/results?searchQuery=';
  var DCC_LICENSE = /^C(9|10|12)-\d{7}-LIC$/;
  var STALE_DAYS = 7;   // DATA_PLAN §3: staff are alerted when the last good sync is older than 7 days
  function dccRecordUrl(license) {
    var n = String(license == null ? '' : license).trim();
    return DCC_LICENSE.test(n) ? DCC_SEARCH + encodeURIComponent(n) : '';
  }

  // { show:false } when there is no valid check date (or it is in the future). Otherwise the date as text, how
  // many whole days ago it was, and stale = more than STALE_DAYS days ago. Dates are calendar days (YYYY-MM-DD).
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function licenseCheck(listing, now) {
    var d = listing && listing.licenseCheckedOn, m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
    if (!m) return { show: false };
    var y = +m[1], mo = +m[2], da = +m[3], checked = Date.UTC(y, mo - 1, da);
    var cd = new Date(checked);
    if (cd.getUTCFullYear() !== y || cd.getUTCMonth() !== mo - 1 || cd.getUTCDate() !== da) return { show: false };   // e.g. 2026-02-30
    var t = now || new Date(), today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    var days = Math.round((today - checked) / 864e5);
    if (days < 0) return { show: false };
    return { show: true, text: MONTHS[mo - 1] + ' ' + da + ', ' + y, days: days, stale: days > STALE_DAYS };
  }

  // "Report a problem with this listing": the JS twin of fmw.submit_report's input rules (W3r DRAFT SQL). The same cases
  // run through both in tests/listing-reports.pglite.test.mjs. Nothing is sent anywhere from here.
  var REPORT_REASONS = ['closed', 'wrong_hours', 'wrong_address', 'wrong_license', 'not_licensed', 'other'], REPORT_MAX = 500;
  var REPORT_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/, REPORT_LICENSE = /[A-Za-z][0-9]{1,2}-[0-9]{7}-[A-Za-z]{3}/g, REPORT_PHONE = /([0-9][\s().+-]*){7,}/;
  function reportCheck(reason, details) {
    var d = String(details == null ? '' : details).trim();
    if (REPORT_REASONS.indexOf(reason) < 0) return { ok: false, error: 'reason' };
    if (reason === 'other' && !d) return { ok: false, error: 'details-required' };
    if (d.length > REPORT_MAX) return { ok: false, error: 'too-long' };
    if (REPORT_EMAIL.test(d) || REPORT_PHONE.test(d.replace(REPORT_LICENSE, ''))) return { ok: false, error: 'contact' };
    return { ok: true, reason: reason, details: d || null };
  }

  // Loads the listings file. Rejects with an Error whose .kind is 'offline' (no connection), 'http' (bad status) or
  // 'data' (not valid listings JSON), so the page can say the right thing and offer a retry.
  function loadData(fetchFn, url) {
    var fail = function (kind, msg) { var e = new Error(msg); e.kind = kind; return e; };
    return Promise.resolve().then(function () { return fetchFn(url, { cache: 'no-store' }); })
      .catch(function (e) { throw fail('offline', String(e && e.message || e)); })
      .then(function (r) {
        if (!r || !r.ok) throw fail('http', 'status ' + (r && r.status));
        return r.json().catch(function () { throw fail('data', 'not JSON'); });
      })
      .then(function (d) {
        if (!d || !Array.isArray(d.listings) || !Array.isArray(d.places)) throw fail('data', 'missing listings or places');
        return d;
      });
  }

  // ---- Map (Phase 1): a self-hosted SVG, no tiles, no other host. Plain equirectangular projection into a fixed
  // California box. A point outside the box (or without numbers) is DROPPED, never clamped onto the edge: a clamped dot
  // would sit somewhere the shop is not. Width is scaled by cos(mid-latitude) so the state is not stretched sideways.
  var CA_BOX = { south: 32.5, north: 42.05, west: -124.45, east: -114.1 };
  var MAP_H = 1000, MAP_W = Math.round(MAP_H * (CA_BOX.east - CA_BOX.west) * Math.cos((CA_BOX.south + CA_BOX.north) / 2 * Math.PI / 180) / (CA_BOX.north - CA_BOX.south));
  function project(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return null;
    if (lat < CA_BOX.south || lat > CA_BOX.north || lng < CA_BOX.west || lng > CA_BOX.east) return null;
    return { x: +((lng - CA_BOX.west) / (CA_BOX.east - CA_BOX.west) * MAP_W).toFixed(1), y: +((CA_BOX.north - lat) / (CA_BOX.north - CA_BOX.south) * MAP_H).toFixed(1) };
  }
  var NEAR = 0.005;   // ~500 m: a delivery dot this close to its own premises is not drawn at all
  // Where a delivery-only service's dot goes: NEVER its premises (the Privacy page: city only). The centre of the
  // STOREFRONTS listed in the same city; with none, the city's place centre rounded to 0.1° (~10 km). If that still lands
  // within NEAR of the service's own premises, no dot: null. (Public data has NO point for delivery-only rows since
  // #19's privacy fix; this guard is the second line of defence if a row ever carries one.)
  function deliveryPoint(l, shown, places) {
    var c = placeKey(cityOf(l)); if (!c) return null;   // the search's own place key: "W Hollywood" = "West Hollywood"
    var fronts = shown.filter(function (o) { return o.storefront && placeKey(cityOf(o)) === c && hasPoint(o); });
    var pt = null;
    if (fronts.length) {
      pt = { lat: fronts.reduce(function (s, o) { return s + o.lat; }, 0) / fronts.length, lng: fronts.reduce(function (s, o) { return s + o.lng; }, 0) / fronts.length };
    } else {
      var p = (places || []).find(function (x) { return placeKey(x.name) === c && typeof x.lat === 'number' && typeof x.lng === 'number'; });
      if (p) pt = { lat: Math.round(p.lat * 10) / 10, lng: Math.round(p.lng * 10) / 10 };
    }
    if (!pt) return null;
    if (hasPoint(l) && Math.abs(pt.lat - l.lat) < NEAR && Math.abs(pt.lng - l.lng) < NEAR) return null;
    return pt;
  }
  // The dots for a set of listings (normally a search's results). Only listings the site shows (licensed) get a dot.
  // Returns { w, h, dots: [{ id, name, city, kind, x, y }], dropped: [{ id, why: 'outside' | 'no-location' }] }.
  function mapDots(data, listings, now) {
    var shown = licensed((data && data.listings) || [], now), ids = {};
    shown.forEach(function (l) { ids[l.id] = 1; });
    var dots = [], dropped = [];
    (listings || []).forEach(function (l) {
      if (!l || !ids[l.id]) return;
      var kind = l.storefront ? 'storefront' : 'delivery';
      var pt = l.storefront ? (hasPoint(l) ? { lat: l.lat, lng: l.lng } : null) : deliveryPoint(l, shown, data && data.places);
      if (!pt) { dropped.push({ id: l.id, why: 'no-location' }); return; }
      var xy = project(pt.lat, pt.lng);
      if (!xy) { dropped.push({ id: l.id, why: 'outside' }); return; }
      dots.push({ id: l.id, name: l.name, city: cityOf(l), kind: kind, x: xy.x, y: xy.y });
    });
    return { w: MAP_W, h: MAP_H, dots: dots, dropped: dropped };
  }

  // The part of the fixed map to show: the dots' extent plus a margin, at least MIN_SPAN wide, 4:3, inside the map. Only
  // the viewBox changes, never a dot's position, so the state outline (when it exists) always lines up.
  var MIN_SPAN = 24;   // ~27 km across at the tightest: a city's shops are told apart
  function mapView(m) {
    if (!m || !m.dots.length) return { x: 0, y: 0, w: m ? m.w : MAP_W, h: m ? m.h : MAP_H };
    var xs = m.dots.map(function (d) { return d.x; }), ys = m.dots.map(function (d) { return d.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var w = Math.max(MIN_SPAN, (x1 - x0) * 1.3, (y1 - y0) * 1.3 * 4 / 3), h = w * 3 / 4;
    w = Math.min(w, m.w); h = Math.min(h, m.h);
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var x = Math.max(0, Math.min(m.w - w, cx - w / 2)), y = Math.max(0, Math.min(m.h - h, cy - h / 2));
    return { x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) };
  }

  var api = { DEFAULT_TZ: DEFAULT_TZ, hasPoint: hasPoint, CA_BOX: CA_BOX, MAP_W: MAP_W, MAP_H: MAP_H, project: project, deliveryPoint: deliveryPoint, mapDots: mapDots, mapView: mapView, hoursKnown: hoursKnown, cities: cities, today: today, classify: classify, loadData: loadData, licensed: licensed, licenseLive: licenseLive, isHeld: isHeld, HELD_LICENSES: HELD_LICENSES.slice(), findPlace: findPlace, miles: miles, localTime: localTime, openState: openState, fmtTime: fmtTime, weekHours: weekHours, search: search, byId: byId, safeUrl: safeUrl, addressLines: addressLines, cityOf: cityOf, placeKey: placeKey, queryKey: queryKey, PREFIX_MIN: PREFIX_MIN, inPlace: inPlace, cleanQuery: cleanQuery, MAX_QUERY: MAX_QUERY, SHOWN_STATUS: SHOWN_STATUS.slice(),
    dccRecordUrl: dccRecordUrl, licenseCheck: licenseCheck, DCC_SEARCH: DCC_SEARCH, STALE_DAYS: STALE_DAYS,
    reportCheck: reportCheck, REPORT_REASONS: REPORT_REASONS.slice(), REPORT_MAX: REPORT_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW = api;
})(typeof window !== 'undefined' ? window : globalThis);
