// Find My Weed core: search, distance and open-now logic. Pure functions, no DOM, so node tests run them as is.
(function (root) {
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var DAY_NAMES = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  var WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  // The SAME rule as the proposed public read in docs/proposed/fmw_real_listings.PROPOSED.sql, for every row (fixture or
  // real): shown only when published === true, it has a license number, its state status is Active or About to Expire,
  // and it has a valid expiry date that has not passed. Anything missing counts as NOT shown.
  // "About to Expire" counts as ACTIVE (owner decision 2026-11-17 03:38 PT; DCC: it "remains Active").
  var SHOWN_STATUS = ['Active', 'About to Expire'];
  // Every listing is in California: dates and times are LA's, whatever the viewer's own time zone (#15).
  var DEFAULT_TZ = 'America/Los_Angeles';
  // Today's date IN LA (YYYY-MM-DD): a license that expires today is judged on LA's day, not the viewer's.
  // PERF (root cause of the phone TBT and the heavy-test memory, found 2026-11-24): this used to build a NEW Intl.DateTimeFormat on every call, and
  // licensed() calls it once per listing and runs ~17 times per page view (~21,000 formatter constructions per render: ICU objects that pile up
  // until a collection). One formatter is built once and reused; the output is identical.
  var TODAY_FMT = null;
  function today(now) { if (!TODAY_FMT) TODAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }); return TODAY_FMT.format(now || new Date()); }
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
  function licenseLive(l, now, todayStr) {
    if (!l || typeof l.license !== 'string' || l.license.trim() === '') return false;
    return SHOWN_STATUS.indexOf(l.licenseStatus) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(l.licenseExpires || '') && l.licenseExpires >= (todayStr || today(now));
  }
  function licensed(list, now) {
    var day = null;   // LA's date, computed once per call (and only if a row needs it), not once per listing
    return (list || []).filter(function (l) {
      if (!l || l.published !== true || isHeld(l)) return false;
      if (day === null) day = today(now);
      return licenseLive(l, now, day);
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
  var LOCAL_FMT = {};
  function localTime(now, tz) {
    var zone = tz || DEFAULT_TZ, fmt = LOCAL_FMT[zone];   // one formatter per time zone, reused (see today())
    if (!fmt) { fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); LOCAL_FMT[zone] = fmt; }
    var parts = fmt.formatToParts(now);
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

  // Is the "Open now" filter offered at all? Only when at least one SHOWN (licensed(), so held, expired and unpublished
  // rows never count) listing has usable hours (hoursKnown). Today no row in data/listings.json has hours, so every
  // shop reads "Hours not listed", is never open, and the filter could only ever empty the results: the pages hide it
  // and search() ignores ?open=1 until real hours exist. Nothing here invents hours.
  function openNowOffered(data, now) {
    return licensed((data && data.listings) || [], now).some(hoursKnown);
  }

  // Is the "Delivery" filter offered at all? Same rule as openNowOffered (and #68): only when at least one SHOWN listing
  // has delivery === true. Today every row is delivery:false, so the pages hide the chip and search() IGNORES ?delivery=1
  // (the same results as without it, never an empty state). Nothing here invents a delivery flag.
  function deliveryOffered(data, now) {
    return licensed((data && data.listings) || [], now).some(function (l) { return l.delivery === true; });
  }

  // Storefronts in the menu: a link once any SHOWN listing is a storefront (1,270 of 1,270 today).
  function storefrontOffered(data, now) {
    return licensed((data && data.listings) || [], now).some(function (l) { return !!l.storefront; });
  }

  // A listing name that is ONLY a bracketed placeholder (e.g. "[Equity Retailer]": no trade name in the state data). It is
  // shown as is (never replaced by an invented name) but sorted after every named listing. "Name [Equity Retailer]" has a
  // real trade name and is NOT a placeholder.
  function placeholderName(name) {
    var s = String(name == null ? '' : name).trim();
    return !s || /^\[[^\]]*\]$/.test(s);
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
  // county (optional, discovery home): only the cities of that county's shown listings.
  function cities(data, now, county) {
    var seen = {}, out = [], ck = countyKey(county);
    licensed((data && data.listings) || [], now).forEach(function (l) {
      if (ck && countyKey(l.address && l.address.county) !== ck) return;
      var c = String((l.address && l.address.city) || '').trim();
      if (c && !seen[norm(c)]) { seen[norm(c)] = 1; out.push(c); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }

  // Counties (same rule as #69 feat/fmw-county-filter, re-done here off main): the counties of the listings actually shown
  // (licensed() + published), from listings[].address.county. countyKey() ignores case, spacing and a trailing " County".
  function countyKey(s) { return norm(s).replace(/ county$/, ''); }
  function counties(data, now) {
    var seen = {}, out = [];
    licensed((data && data.listings) || [], now).forEach(function (l) {
      var c = String((l.address && l.address.county) || '').trim();
      if (c && !seen[countyKey(c)]) { seen[countyKey(c)] = 1; out.push(c); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }
  // Discovery home default area: the county with the most SHOWN (licensed) listings, computed from the data (Los Angeles
  // today, 361 rows), never hard-coded. Ties go alphabetically. No county data at all = '' (the home then shows every row).
  function topCounty(data, now) {
    var n = {}, name = {};
    licensed((data && data.listings) || [], now).forEach(function (l) {
      var c = String((l.address && l.address.county) || '').trim(), k = countyKey(c);
      if (k) { n[k] = (n[k] || 0) + 1; if (!name[k]) name[k] = c; }
    });
    return Object.keys(n).sort(function (a, b) { return (n[b] - n[a]) || a.localeCompare(b); }).map(function (k) { return name[k]; })[0] || '';
  }
  // Which filters have real data behind them (#68 rule, plus Open now): a filter that could only ever return nothing is
  // hidden. Today every row is delivery:false and no row has hours, so both are false. Nothing here invents a flag.
  function filtersOffered(data, now) {
    return { delivery: deliveryOffered(data, now), openNow: openNowOffered(data, now) };
  }
  // The discovery rails for a set of search results ({ listing, open, known, ... } from search()). A rail exists ONLY when
  // its own real field has data in these rows; there is no rail for deals, ratings, reviews, categories or "new" (no data).
  //   nearby    every result (licensed storefronts in the area, nearest first, else by name)
  //   delivery  rows with delivery === true            (0 rows today: not returned)
  //   open      rows with known hours that are open now (0 rows today: not returned)
  var RAILS = ['nearby', 'delivery', 'open'];
  function rails(results) {
    var rows = results || [], out = [];
    var pick = {
      nearby: function () { return true; },
      delivery: function (r) { return !!r.listing && r.listing.delivery === true; },
      open: function (r) { return r.known !== false && !!r.listing && hoursKnown(r.listing) && r.open === true; }
    };
    RAILS.forEach(function (k) { var got = rows.filter(pick[k]); if (got.length) out.push({ key: k, rows: got }); });
    return out;
  }

  // opts: { q, city, county, delivery, storefront, openNow }. Delivery + Storefront both ticked (or neither) means either kind.
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
    // county: one of counties() (?county=); a county no shown listing has is notFound with reason 'county' (#69)
    var county = cleanQuery(opts.county);
    if (county && !counties(data, now).some(function (x) { return countyKey(x) === countyKey(county); })) {
      return { place: null, notFound: true, reason: 'county', results: [] };
    }
    // delivery counts only while deliveryOffered() (same rule as open now): an old ?delivery=1 link is then IGNORED, never empty
    var wantDelivery = !!opts.delivery && deliveryOffered(data, now);
    var kindFilter = wantDelivery !== !!opts.storefront;
    // open now counts only while openNowOffered(): an old ?open=1 link then shows the same results as without it.
    var wantOpen = !!opts.openNow && openNowOffered(data, now);
    // distance origin (approved home 2026-11-21: "sorted by nearest to the chosen location"): the searched place; else a
    // chosen city's own place centre (data.places); else a chosen county's centre, the MEDIAN of its own shown listings'
    // real coordinates (owner walk 19:22 PT: line 2 shows the distance on the default view too). The whole state: none.
    var origin = place && hasPoint(place) ? place : city ? cityPlace(data, city) : county ? countyCentre(data, county, now) : null;
    var rows = licensed(data.listings, now).filter(function (l) {
      if (place && !inPlace(l, place)) return false;
      if (county && countyKey(l.address && l.address.county) !== countyKey(county)) return false;
      if (city && norm(l.address && l.address.city) !== norm(city)) return false;
      if (kindFilter && wantDelivery && !l.delivery) return false;
      if (kindFilter && opts.storefront && !l.storefront) return false;
      return true;
    }).map(function (l) {
      var s = openState(l, now);
      // a delivery-only service has NO coordinates in the public data (its premises are private): no distance, never NaN
      return { listing: l, miles: origin && hasPoint(l) ? miles(origin, l) : null, open: s.open, until: s.until, known: s.known };
    }).filter(function (r) { return !wantOpen || r.open; });
    // placeholder-only names (e.g. "[Equity Retailer]") after every named listing; then nearest first; rows with no
    // distance (delivery-only services) after them; then by name
    rows.sort(function (a, b) { return (placeholderName(a.listing.name) - placeholderName(b.listing.name)) || ((a.miles == null) - (b.miles == null)) || ((a.miles || 0) - (b.miles || 0)) || a.listing.name.localeCompare(b.listing.name); });
    var filtered = !!(wantOpen || kindFilter || city);   // a county is the area, not a filter
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
  // ---- Weight 1.0, Phase 2: the HOME loads a small state index plus only the chosen county's file, not all of listings.json. ----
  // data/listings-index.json: one slim row per listing (license, status, expiry, published, storefront, delivery, county, city) + places;
  // data/counties/<countyFileKey>.json: the full listings of one county. assembleHome() rebuilds a data object of the full shape: the loaded
  // counties' rows are the FULL rows, every other row is a light row (enough for counties(), cities(), topCounty(), the menu flags and licensed()).
  // tests/home-split.test.js proves F.search / counties / cities / mapDots on it equal the full file's, for every county and every city.
  function countyFileKey(county) { return countyKey(county).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function lightListing(r) {
    var lic = String((r && r.license) || '');
    return { id: lic.toLowerCase(), name: '', license: lic, licenseStatus: r.licenseStatus, licenseExpires: r.licenseExpires, published: r.published,
      storefront: r.storefront, delivery: r.delivery, address: { county: r.county, city: r.city } };
  }
  function assembleHome(index, files) {
    var full = {}, loaded = {};
    Object.keys(files || {}).forEach(function (k) { loaded[k] = true; ((files[k] && files[k].listings) || []).forEach(function (l) { full[l.license] = l; }); });
    var data = { places: index.places, listings: index.listings.map(function (r) { return (loaded[countyFileKey(r.county)] && full[r.license]) || lightListing(r); }) };
    Object.defineProperty(data, 'light', { value: true, enumerable: false });   // not part of the data shape; pages ask it before using rows beyond the area
    return data;
  }
  // which county files an area needs, from the index's own rows: a city may sit in more than one county. [] for the whole state
  function areaCountyKeys(data, p) {
    var have = {}, keys = {};
    data.listings.forEach(function (l) { have[countyFileKey(l.address && l.address.county)] = true; });
    if (p.city) data.listings.forEach(function (l) { if (norm(l.address && l.address.city) === norm(p.city)) keys[countyFileKey(l.address && l.address.county)] = true; });
    else if (p.county) { var k = countyFileKey(p.county); if (have[k]) keys[k] = true; }
    return Object.keys(keys).sort();
  }
  function fetchOf(w) { return w.fetch.bind(w); }   // the page's own fetch, bound; the pages never name it twice
  function loadPart(fetchFn, url, ok) { return fetchJson(fetchFn, url).then(function (d) { if (!ok(d)) throw new Error('bad data'); return d; }); }
  function fetchJson(fetchFn, url) {
    var fail = function (kind, msg) { var e = new Error(msg); e.kind = kind; return e; };
    return Promise.resolve().then(function () { return fetchFn(url, { cache: 'no-store' }); })
      .catch(function (e) { throw fail('offline', String(e && e.message || e)); })
      .then(function (r) {
        if (!r || !r.ok) throw fail('http', 'status ' + (r && r.status));
        return r.json().catch(function () { throw fail('data', 'not JSON'); });
      });
  }
  function loadData(fetchFn, url) {
    return fetchJson(fetchFn, url).then(function (d) {
      if (!d || !Array.isArray(d.listings) || !Array.isArray(d.places)) { var e = new Error('missing listings or places'); e.kind = 'data'; throw e; }
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
  // A listing's name as the map shows it: bracketed tags removed; '' when nothing that is a name is left ("[Equity
  // Retailer]", "TBD [Equity Retailer]", "N/A").
  var NO_NAME = /^(n\/?a|none|tbd|unknown|-+|\.+|_+)$/i;
  function mapName(name) {
    var s = String(name == null ? '' : name).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    return !s || NO_NAME.test(s) || !/[A-Za-z0-9\u00C0-\uFFFF]/.test(s) ? '' : s;
  }
  // The map ruling (owner 2026-11-21 19:11 PT, routed by Muse 19:13 PT). Each dot is a PIN whose SHAPE says its
  // customer-facing category: one shape for RETAIL (storefront + delivery), one for EVENTS, one for SERVICES. The
  // CUSTOMER map is consumer-facing only: a row whose state license type is a business-to-business one (cultivation,
  // manufacturing, distribution, testing labs, microbusiness) gets NO pin there; those appear only on a business map
  // (opts.mode === 'business'), which exists only behind business accounts (none yet).
  // pinCategory: 'events' (a real data.events entry points at it, or a real 'events' tag), 'services' (a real
  // 'services' tag), 'retail' (a retail license type, or a storefront / delivery row with no other type), else '' (B2B).
  var B2B_TYPE = /cultivat|nursery|processor|manufactur|distribut|testing|microbusiness/i;
  function pinCategory(l, eventIds) {
    var cats = Array.isArray(l.categories) ? l.categories : [];
    if ((eventIds && eventIds[l.id]) || cats.indexOf('events') >= 0) return 'events';
    if (cats.indexOf('services') >= 0) return 'services';
    var t = typeof l.licenseType === 'string' ? l.licenseType : '';
    if (LICENSE_CAT.retail.test(t)) return 'retail';
    if (t && B2B_TYPE.test(t)) return '';
    return 'retail';
  }
  // A BRANDED pin carries the business's own icon inside it, ONLY when a real icon file is on record for that row
  // (l.brandIcon, a same-site image under img/brands/; the CSP's img-src 'self'). No icon on file: the generic pin.
  // Never a drawn or guessed logo for a real business.
  var BRAND_RE = /^img\/brands\/[a-z0-9][a-z0-9_-]*\.(png|jpe?g|webp|svg)$/i;
  function brandIcon(l) { return l && typeof l.brandIcon === 'string' && BRAND_RE.test(l.brandIcon) ? l.brandIcon : ''; }
  // The dots for a set of listings (normally a search's results). Only listings the site shows (licensed) get a dot.
  // Returns { w, h, dots: [{ id, name, city, kind, cat, brand, x, y }], dropped: [{ id, why: 'outside' | 'no-location' }] }.
  function mapDots(data, listings, now, opts) {
    var shown = licensed((data && data.listings) || [], now), ids = {}, business = !!(opts && opts.mode === 'business'), eventIds = {};
    shown.forEach(function (l) { ids[l.id] = 1; });
    ((data && Array.isArray(data.events)) ? data.events : []).forEach(function (e) { if (e && typeof e.listingId === 'string') eventIds[e.listingId] = 1; });
    var dots = [], dropped = [];
    (listings || []).forEach(function (l) {
      if (!l || !ids[l.id]) return;
      var cat = pinCategory(l, eventIds);
      if (!cat && !business) return;   // customer map: consumer-facing pins only
      // joe-0045: the map never shows a bracketed program tag ("[Equity Retailer]") and never a nameless dot: the name is
      // drawn without its tags, and a row with no real name left gets no dot at all.
      var name = mapName(l.name); if (!name) return;
      var kind = l.storefront ? 'storefront' : 'delivery';
      var pt = l.storefront ? (hasPoint(l) ? { lat: l.lat, lng: l.lng } : null) : deliveryPoint(l, shown, data && data.places);
      if (!pt) { dropped.push({ id: l.id, why: 'no-location' }); return; }
      var xy = project(pt.lat, pt.lng);
      if (!xy) { dropped.push({ id: l.id, why: 'outside' }); return; }
      dots.push({ id: l.id, name: name, city: cityOf(l), kind: kind, cat: cat || 'business', brand: brandIcon(l), x: xy.x, y: xy.y });
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

  // The menu page (approved home, owner 2026-11-21 17:53 PT): which items of the ONE config list (js/copy.js NAV_MENU) are
  // drawn and how. EVERY item with a label is drawn, in list order (the spec lists them all); an item is a LINK only when it
  // has real data behind it and a real destination, otherwise it is drawn DISABLED with "coming soon" (soon: true), never a
  // dead link and never a page that does not exist:
  //   - needsData: a link only while opts.offered[needsData] === true;
  //   - account items (Sign in / Sign up / Favorites): disabled unless opts.accounts is true AND they have a page;
  //   - destinations: page (a relative page of this site: name.html + an optional simple query; under basePath when
  //     opts.absolute, for 404.html at any depth) | biz (<basePath>/for-business/) | host (a root-relative page of the host
  //     site, a link only while basePath is set: a build on its own domain has no host site). Anything else (javascript:,
  //     //host, an absolute URL) is never a destination.
  var PAGE_RE = /^[a-z0-9][a-z0-9_-]*\.html(\?[a-z0-9_=&%.-]*)?$/i, HOST_RE = /^\/[a-z0-9][a-z0-9\/-]*$/;
  function menuItems(list, opts) {
    opts = opts || {};
    var base = opts.basePath || '', offered = opts.offered || {}, out = [];
    (list || []).forEach(function (it) {
      if (!it || !it.key || typeof it.label !== 'string' || !it.label) return;
      var href = it.biz ? base + '/for-business/'
        : (typeof it.page === 'string' && PAGE_RE.test(it.page)) ? (opts.absolute ? base + '/' + it.page : it.page)
        : (base && typeof it.host === 'string' && HOST_RE.test(it.host)) ? it.host : null;
      var r = { key: it.key, label: it.label, group: it.group || 0, icon: it.icon || '', pill: it.pill || '', account: !!it.account };
      var live = it.account ? (opts.accounts === true && !!href) : (!!href && (!it.needsData || offered[it.needsData] === true));
      if (live) r.href = href; else { r.disabled = true; r.soon = true; }
      out.push(r);
    });
    return out;
  }

  // ---- The approved home (owner 2026-11-21 17:53 PT) ----
  // The location dropdown inside the search bar: State / County / City in ONE select. Values are "" (the whole state),
  // "county:<name>" or "city:<name>", built only from the shown listings (counties() / cities()). parseArea never trusts
  // the value: an unknown kind is the whole state.
  function areaValue(kind, name) { return kind === 'county' || kind === 'city' ? kind + ':' + String(name == null ? '' : name) : ''; }
  function parseArea(v) {
    var m = /^(county|city):(.+)$/.exec(cleanQuery(v));
    return m ? { kind: m[1], name: m[2].trim() } : { kind: 'state', name: '' };
  }
  // Is a saved / linked area one the data still has? (a remembered county that lost its last licensed listing is dropped)
  function areaKnown(data, v, now) {
    var a = parseArea(v);
    if (a.kind === 'state') return v === '' || v === 'state:CA';
    var list = a.kind === 'county' ? counties(data, now) : cities(data, now), key = a.kind === 'county' ? countyKey : norm;
    return list.some(function (x) { return key(x) === key(a.name); });
  }
  // A chosen city's centre point, from the place list (the same place key as search), or null.
  function cityPlace(data, city) {
    var k = placeKey(city);
    return ((data && data.places) || []).find(function (p) { return placeKey(p.name) === k && hasPoint(p); }) || null;
  }

  // A county's centre: the median latitude and the median longitude of that county's SHOWN listings that have real
  // coordinates (licensed(), so a held or expired row never moves it). No such row: null (no distance is invented).
  function countyCentre(data, county, now) {
    var ck = countyKey(county); if (!ck) return null;
    var pts = licensed((data && data.listings) || [], now).filter(function (l) { return countyKey(l.address && l.address.county) === ck && hasPoint(l); });
    if (!pts.length) return null;
    var med = function (xs) { xs.sort(function (a, b) { return a - b; }); var m = xs.length >> 1; return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2; };
    return { lat: med(pts.map(function (l) { return l.lat; })), lng: med(pts.map(function (l) { return l.lng; })) };
  }

  // The filter carousel (owner 19:10 PT + Muse walk 19:22 PT: "ship the full selection set"). ONE fixed list, always drawn,
  // "Home" (no filter) first and selected by default. The set is the approved filter bar (homepage spec 15:27 PT, 12:01 PT):
  // delivery / storefront, open now, deals, and the nine categories (Retail, Delivery, Brands, Cultivation, Manufacturing,
  // Distribution, Testing Labs, Microbusiness, Services; Delivery is one chip). County / city is the location dropdown in
  // the search bar. Each chip filters the area's rows IN PLACE (filterRows) by a REAL field only; a chip with nothing behind
  // it yet (no hours, no deals, no brands) honestly shows none, it never shows invented rows.
  // Owner 2026-11-22 (joe-0045): Cultivation, Manufacturing, Distribution, Testing Labs and Microbusiness are for BUSINESS
  // accounts only. There is no business-account mode yet, so they are OFF the customer filter bar (FILTERS) but their code
  // path stays (businessOnly: true; filterRows still honours them, filtersFor('business') lists them).
  var FILTER_DEFS = [
    { key: 'home' }, { key: 'storefront' }, { key: 'delivery' }, { key: 'open' }, { key: 'deals' }, { key: 'retail' }, { key: 'brands' },
    { key: 'cultivation', businessOnly: true }, { key: 'manufacturing', businessOnly: true }, { key: 'distribution', businessOnly: true },
    { key: 'testing', businessOnly: true }, { key: 'microbusiness', businessOnly: true },
    { key: 'services' },
    // Owner 2026-11-22 (A3): "Events shows events". A row counts only when a REAL event entry (data.events[].listingId)
    // points at it, or the row carries a real 'events' category tag. No event data exists yet, so the chip says so.
    { key: 'events' }
  ];
  function filtersFor(mode) { return FILTER_DEFS.filter(function (d) { return mode === 'business' || !d.businessOnly; }).map(function (d) { return d.key; }); }
  var FILTERS = filtersFor('customer');        // the customer filter bar
  var ALL_FILTERS = filtersFor('business');    // every key filterRows understands (the business set included)
  var BUSINESS_FILTERS = FILTER_DEFS.filter(function (d) { return d.businessOnly; }).map(function (d) { return d.key; });
  // license-type words (the state's own licenseType text) for the license categories
  var LICENSE_CAT = { retail: /retail/i, cultivation: /cultivat|nursery|processor/i, manufacturing: /manufactur/i, distribution: /distribut/i, testing: /testing/i, microbusiness: /microbusiness/i };
  function filterMatch(key, r, dealIds, eventIds) {
    var l = r && r.listing; if (!l) return false;
    var cats = Array.isArray(l.categories) ? l.categories : [];
    if (cats.indexOf(key) >= 0) return true;   // a real category tag on the row (none today)
    switch (key) {
      case 'storefront': return !!l.storefront;
      case 'delivery': return l.delivery === true;
      case 'open': return r.known !== false && hoursKnown(l) && r.open === true;
      case 'deals': return !!dealIds[l.id];
      case 'events': return !!eventIds[l.id];
      default: return !!LICENSE_CAT[key] && typeof l.licenseType === 'string' && LICENSE_CAT[key].test(l.licenseType);
    }
  }
  // The rows a chip keeps (results = search() rows). "home" or an unknown key = every row. Deals / Events: only listings a
  // REAL deal / event entry (data.deals[].listingId, data.events[].listingId) points at.
  function filterRows(data, results, key) {
    var rows = results || [];
    if (key === 'home' || ALL_FILTERS.indexOf(key) < 0) return rows.slice();
    var ids = function (k) {
      var o = {};
      ((data && Array.isArray(data[k])) ? data[k] : []).forEach(function (d) { if (d && typeof d.listingId === 'string') o[d.listingId] = 1; });
      return o;
    };
    var dealIds = ids('deals'), eventIds = ids('events');
    return rows.filter(function (r) { return filterMatch(key, r, dealIds, eventIds); });
  }
  // the chip a ?f= value selects on the CUSTOMER bar; a business-only key (or anything unknown) is Home
  function filterKey(k) { return FILTERS.indexOf(k) >= 0 ? k : 'home'; }

  // The home rows that need content FMW does not have yet: ads (16:9), deals, categories (1:1 tiles) and featured
  // (brands / businesses / events). Each row is drawn ONLY from real entries in the data file (data.ads, data.deals,
  // data.categories, data.featured); today none exist, so every one of these rows stays hidden. An entry counts only with a
  // label and a same-site image (img/..., the CSP's img-src 'self'); a link must be a page of this site or https.
  // Nothing here invents a deal, a brand, a price or a photo. No ranking-by-rating row and no paid-placement slot exist.
  var PROMO_ROWS = ['ads', 'deals', 'categories', 'featured'];
  // SB 378 (B&P 22943): a placement (an Ads or Featured entry) must carry the seller's state license number. Without a
  // well-formed number the entry is dropped, so a row can never turn on with an unlicensed or number-less placement.
  var PLACEMENT_ROWS = ['ads', 'featured'];
  var PLACEMENT_LIC_RE = /^C\d{1,2}-\d{7}-LIC$/;
  var IMG_RE = /^img\/[a-z0-9][a-z0-9_\/-]*\.(png|jpe?g|webp|svg)$/i;
  function promoRows(data) {
    var out = {};
    PROMO_ROWS.forEach(function (k) {
      var raw = data && Array.isArray(data[k]) ? data[k] : [], placement = PLACEMENT_ROWS.indexOf(k) >= 0;
      out[k] = raw.filter(function (e) {
        return !!e && (!placement || (typeof e.license === 'string' && PLACEMENT_LIC_RE.test(e.license.trim()))) && typeof e.label === 'string' && e.label.trim() !== '' && typeof e.image === 'string' && IMG_RE.test(e.image) &&
          (e.href == null || (typeof e.href === 'string' && (PAGE_RE.test(e.href) || /^https:\/\/[a-z0-9.-]+(\/[^\s]*)?$/i.test(e.href))));
      }).map(function (e) { var o = { label: e.label.trim(), image: e.image, href: e.href || null }; if (placement) o.license = e.license.trim(); return o; });
    });
    return out;
  }

  // The Categories row (owner 17:25 PT: a 1:1 single-row carousel; 17:44 PT row 6) drawn from REAL listing data: one
  // tile per CUSTOMER category that has at least one shown row in the current area (filterRows, the same rule as the
  // chip it opens). No row behind a category = no tile; no tile at all = the row stays hidden. No counts, no images
  // that do not exist: each tile is the category's own colour + pattern + icon, drawn in the page.
  var CATEGORY_TILES = [
    { key: 'storefront', icon: 'store' }, { key: 'delivery', icon: 'truck' }, { key: 'brands', icon: 'star' },
    { key: 'services', icon: 'wrench' }, { key: 'events', icon: 'calendar' }
  ];
  function categoryTiles(data, results) {
    return CATEGORY_TILES.filter(function (t) { return filterRows(data, results, t.key).length > 0; }).map(function (t) { return { key: t.key, icon: t.icon }; });
  }

  // The six lines of a listing card, in order, unnumbered and unlabelled (approved spec item 8). Plain strings (shown with
  // textContent). r = one search() row; C = js/copy.js.
  //   1 name | 2 rating + distance (rating only when the row has a real 0-5 number; distance only when a location is
  //   known; '' when neither) | 3 hours | 4 address (delivery-only: the city only, the Privacy page's rule) |
  //   5 "Storefront" / "Delivery" + county | 6 the license number (the page draws a green check mark before it).
  // No trust-badge word is ever produced here: line 6 is the plain license number.
  function cardLines(r, C) {
    var l = r.listing, a = (l.address && typeof l.address === 'object') ? l.address : {};
    var two = [];
    if (typeof l.rating === 'number' && isFinite(l.rating) && l.rating >= 0 && l.rating <= 5) two.push(C.rating(l.rating));
    if (typeof r.miles === 'number' && isFinite(r.miles)) two.push(C.miles(r.miles));
    var hours = r.known === false || !hoursKnown(l) ? C.hoursNotListed : r.open ? C.openUntil(fmtTime(r.until)) : C.closed;
    var al = addressLines(l), addr = al.lines.length ? (l.storefront && al.lines.length === 2 ? al.lines[0] + ', ' + cityOf(l) : al.lines[0]) : C.addressNone;
    var kind = l.storefront && l.delivery === true ? C.kindBoth : l.storefront ? C.kindStorefront : C.kindDelivery;
    var county = typeof a.county === 'string' && a.county.trim() ? C.countyName(a.county.trim().replace(/\s+county$/i, '')) : '';
    return [String(l.name == null ? '' : l.name), two.join(' · '), hours, addr, kind + (county ? ' · ' + county : ''), String(l.license || '')];
  }

  // ---- SEO (1.0 cut, KODE/Grok 2026-11-24): what the search engines read. Pure functions; pages.js writes the result into the head. ----
  // Listing: title, description, canonical URL and JSON-LD LocalBusiness (name, address as the page shows it: delivery-only = city only,
  // the license number as an identifier, the official state record as sameAs, geo for storefronts only, hours only when usable). Nothing
  // that the page does not already show publicly. base = the page's origin + basePath.
  var SCHEMA_CONTEXT = 'https:' + '//schema.org';   // a JSON-LD vocabulary identifier, never fetched (the host-scan guard allows only this one)
  function seoListing(l, base) {
    var al = addressLines(l), a = (l && l.address) || {}, rec = dccRecordUrl(l && l.license);
    var where = cityOf(l), name = String((l && l.name) || '').trim();
    var kindWord = l.storefront && l.delivery ? 'storefront and delivery' : l.delivery ? 'delivery' : 'storefront';
    var d = {
      '@context': SCHEMA_CONTEXT, '@type': 'LocalBusiness', name: name, url: base + '/listing.html?id=' + encodeURIComponent(l.id),
      identifier: { '@type': 'PropertyValue', name: 'California cannabis license number', value: String(l.license || '') }
    };
    if (al.lines.length) {
      d.address = { '@type': 'PostalAddress', addressLocality: where, addressRegion: String(a.state || 'CA') };
      if (l.storefront && al.note === null) { d.address.streetAddress = al.lines[0]; if (a.zip) d.address.postalCode = String(a.zip); }
    }
    if (l.storefront && typeof l.lat === 'number' && typeof l.lng === 'number' && isFinite(l.lat) && isFinite(l.lng)) d.geo = { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng };
    if (rec) d.sameAs = [rec];
    if (hoursKnown(l)) {
      var spec = [];
      WEEK.forEach(function (k) { (l.hours[k] || []).forEach(function (r) { spec.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_FULL[k], opens: r[0], closes: r[1] }); }); });
      if (spec.length) d.openingHoursSpecification = spec;
    }
    return {
      title: name + (where ? ' · ' + where : '') + ' · Find My Weed',
      description: name + ' is a state-licensed cannabis ' + kindWord + (where ? ' in ' + where + ', California' : ' in California') + '. License ' + (l.license || '') + ', with a link to the official state record. Cannabis is for adults 21+.',
      canonical: base + '/listing.html?id=' + encodeURIComponent(l.id), jsonLd: d
    };
  }
  var DAY_FULL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  // City landing view (index.html?area=city:<name>): unique title, heading and intro from the data; count = shown listings in that city.
  function seoCity(name, count, base) {
    var n = String(name || '').trim();
    return {
      title: 'Licensed cannabis businesses in ' + n + ', CA · Find My Weed',
      description: count + ' state-licensed cannabis ' + (count === 1 ? 'business' : 'businesses') + ' in ' + n + ', California, each with its license number and a link to the official state record. Cannabis is for adults 21+.',
      heading: 'Licensed cannabis businesses in ' + n,
      intro: count + ' state-licensed ' + (count === 1 ? 'business is' : 'businesses are') + ' listed in ' + n + ', California. Every listing shows its license number and links to the official state record.',
      canonical: base + '/index.html?area=' + encodeURIComponent('city:' + n)
    };
  }
  // The URLs for sitemap.xml beyond the static pages: every shown listing and every city view (tools/build-site.js writes them).
  function sitemapPaths(data, now) {
    var out = [];
    licensed((data && data.listings) || [], now).forEach(function (l) { out.push('listing.html?id=' + encodeURIComponent(l.id)); });
    cities(data, now).forEach(function (c) { out.push('index.html?area=' + encodeURIComponent('city:' + c)); });
    return out;
  }

  var api = { seoListing: seoListing, seoCity: seoCity, sitemapPaths: sitemapPaths, DEFAULT_TZ: DEFAULT_TZ, hasPoint: hasPoint, CA_BOX: CA_BOX, MAP_W: MAP_W, MAP_H: MAP_H, project: project, deliveryPoint: deliveryPoint, mapDots: mapDots, pinCategory: pinCategory, brandIcon: brandIcon, PIN_CATS: ['retail', 'events', 'services'], categoryTiles: categoryTiles, CATEGORY_TILES: CATEGORY_TILES.slice(), mapView: mapView, hoursKnown: hoursKnown, openNowOffered: openNowOffered, deliveryOffered: deliveryOffered, storefrontOffered: storefrontOffered, menuItems: menuItems, areaValue: areaValue, parseArea: parseArea, areaKnown: areaKnown, cityPlace: cityPlace, countyCentre: countyCentre, FILTERS: FILTERS.slice(), BUSINESS_FILTERS: BUSINESS_FILTERS.slice(), filtersFor: filtersFor, mapName: mapName, filterRows: filterRows, filterKey: filterKey, promoRows: promoRows, PROMO_ROWS: PROMO_ROWS.slice(), PLACEMENT_ROWS: PLACEMENT_ROWS.slice(), cardLines: cardLines, placeholderName: placeholderName, cities: cities, counties: counties, countyKey: countyKey, topCounty: topCounty, filtersOffered: filtersOffered, rails: rails, RAILS: RAILS.slice(), today: today, classify: classify, loadData: loadData, countyFileKey: countyFileKey, lightListing: lightListing, assembleHome: assembleHome, areaCountyKeys: areaCountyKeys, loadPart: loadPart, fetchOf: fetchOf, licensed: licensed, licenseLive: licenseLive, isHeld: isHeld, HELD_LICENSES: HELD_LICENSES.slice(), findPlace: findPlace, miles: miles, localTime: localTime, openState: openState, fmtTime: fmtTime, weekHours: weekHours, search: search, byId: byId, safeUrl: safeUrl, addressLines: addressLines, cityOf: cityOf, placeKey: placeKey, queryKey: queryKey, PREFIX_MIN: PREFIX_MIN, inPlace: inPlace, cleanQuery: cleanQuery, MAX_QUERY: MAX_QUERY, SHOWN_STATUS: SHOWN_STATUS.slice(),
    dccRecordUrl: dccRecordUrl, licenseCheck: licenseCheck, DCC_SEARCH: DCC_SEARCH, STALE_DAYS: STALE_DAYS,
    reportCheck: reportCheck, REPORT_REASONS: REPORT_REASONS.slice(), REPORT_MAX: REPORT_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW = api;
})(typeof window !== 'undefined' ? window : globalThis);
