// Renders the 3 basics (search, results, listing) from data/listings.json. Text goes in with textContent only.
(function () {
  var C = window.FMW_COPY, F = window.FMW, doc = document, page = doc.body.getAttribute('data-page');
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function params() {
    var p = new URLSearchParams(location.search);
    return { q: F.cleanQuery(p.get('q')), delivery: p.get('delivery') === '1', storefront: p.get('storefront') === '1', openNow: p.get('open') === '1', city: F.cleanQuery(p.get('city')), id: p.get('id') || '' };
  }
  function kind(l) { return l.storefront && l.delivery ? C.storefrontAndDelivery : l.delivery ? C.deliveryOnly : C.storefrontOnly; }
  // known === false: the hours are missing or malformed -> "Hours not listed", never "open" (#15)
  function badge(s) {
    if (s.known === false) return el('span', 'badge unknown', C.hoursNotListed);
    return el('span', 'badge ' + (s.open ? 'open' : 'closed'), s.open ? C.openUntil(F.fmtTime(s.until)) : C.closed);
  }
  // The city choice: "All cities" + the cities that have listings (text set with textContent only).
  // The listed city a typed or linked ?city= means: same name, ignoring case and spacing (as search() matches it).
  function matchCity(list, c) {
    var key = function (s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); }, t = key(c);
    if (!t) return '';
    for (var i = 0; i < list.length; i++) if (key(list[i]) === t) return list[i];
    return '';
  }
  function fillCities(form, data, p) {
    var sel = form && form.city; if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    var list = F.cities(data, new Date());
    list.forEach(function (c) { var o = doc.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    // ?city=demo%20city selects "Demo City" (the results already are Demo City's)
    sel.value = matchCity(list, p.city);
  }

  // Shared chrome: every [data-copy] element gets its text from copy.js; the draft banner goes once the copy is final.
  doc.querySelectorAll('[data-copy]').forEach(function (n) { var v = C[n.getAttribute('data-copy')]; if (typeof v === 'string') n.textContent = v; });
  doc.querySelectorAll('[data-copy-ph]').forEach(function (n) { var v = C[n.getAttribute('data-copy-ph')]; if (typeof v === 'string') n.setAttribute('placeholder', v); });
  if (!C.PLACEHOLDER) doc.querySelectorAll('.draft').forEach(function (n) { n.remove(); });

  function load() { return F.loadData(window.fetch.bind(window), 'data/listings.json'); }
  function fill(form, p) { form.q.value = p.q; form.delivery.checked = p.delivery; form.storefront.checked = p.storefront; form.open.checked = p.openNow; }

  // An empty or error state under the page heading: a short explanation and, where it helps, one action.
  // Errors use role="alert" so screen readers hear them; the heading itself is aria-live on the results page.
  function showState(box, opts) {
    var st = el('div', 'state ' + (opts.error ? 'error' : 'info'));
    if (opts.error) st.setAttribute('role', 'alert');
    st.setAttribute('data-state', opts.name);
    st.appendChild(el('p', null, opts.body));
    (opts.actions || []).forEach(function (act) {
      var n;
      if (act.href) { n = el('a', 'btn ghost', act.text); n.href = act.href; }
      else { n = el('button', 'btn', act.text); n.type = 'button'; n.addEventListener('click', act.onClick); }
      st.appendChild(n);
    });
    box.appendChild(st);
    return st;
  }
  function loadFailed(e, head, box, retry) {
    head.textContent = C.loadErrorTitle;
    var offline = (e && e.kind === 'offline') || (typeof navigator !== 'undefined' && navigator.onLine === false);
    showState(box, { name: offline ? 'offline' : 'load-error', error: true, body: offline ? C.loadErrorOffline : C.loadErrorOther,
      actions: [{ text: C.retry, onClick: retry }] });
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // About / Privacy / 404: plain-text sections from copy.js (C.info[page]); textContent only.
  if (page === 'about' || page === 'privacy' || page === 'notfound') {
    var info = C.info[page], box = doc.getElementById('info');
    box.appendChild(el('h1', 'name', info.title));
    info.sections.forEach(function (sec) {
      var s = el('section', 'card prose');
      if (sec.h) s.appendChild(el('h2', null, sec.h));
      sec.p.forEach(function (t) { s.appendChild(el('p', null, t)); });
      box.appendChild(s);
    });
    if (info.back) { var b = el('a', 'btn', info.back); b.href = ((window.FMW_CONFIG && window.FMW_CONFIG.basePath) || '') + '/index.html'; box.appendChild(b); }   // 404 can be at any depth: absolute, under basePath
    return;
  }

  if (page === 'search') {
    var sp = params(), sf = doc.getElementById('search');
    fill(sf, sp);
    load().then(function (data) { fillCities(sf, data, sp); }, function () { /* the city list is optional; text search still works */ });
    return;
  }

  // The map (Phase 1): one SVG drawn here from the same results as the list, self-hosted, no tiles, no other request.
  // Each dot is an SVG link to the same detail page as its card, focusable and labelled (C.mapDot). The state / county
  // outline is a SLOT: js/map-outline.js sets window.FMW_OUTLINE (null until a boundary file exists), and the map works
  // the same without it. Text goes in with textContent only.
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) { var e = doc.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, String(attrs[k])); }); return e; }
  function detailHref(id) { return 'listing.html?id=' + encodeURIComponent(id) + (location.search ? '&from=' + encodeURIComponent(location.search) : ''); }
  function renderMap(box, data, results) {
    clear(box); box.hidden = true;
    var m = F.mapDots(data, results.map(function (r) { return r.listing; }), new Date());
    if (!m.dots.length) return;
    var v = F.mapView(m), r = +(v.w / 45).toFixed(2);
    box.appendChild(el('h2', null, C.mapTitle));
    var s = svg('svg', { viewBox: [v.x, v.y, v.w, v.h].join(' '), 'class': 'map-svg', role: 'group', 'aria-label': C.mapLabel(m.dots.length) });
    var outline = svg('g', { 'class': 'map-outline', 'data-slot': 'outline', 'aria-hidden': 'true' }), O = window.FMW_OUTLINE;
    if (O && Array.isArray(O.paths)) O.paths.forEach(function (d) { if (typeof d === 'string') outline.appendChild(svg('path', { d: d })); });
    s.appendChild(outline);
    var g = svg('g', { 'class': 'map-dots' });
    // delivery rings first and 1.6× larger: a ring at its city's centre stays visible around a storefront dot on the same spot
    m.dots.slice().sort(function (x, y) { return (x.kind === 'delivery' ? 0 : 1) - (y.kind === 'delivery' ? 0 : 1); }).forEach(function (d) {
      var label = C.mapDot(d.name, d.kind, d.city), a = svg('a', { href: detailHref(d.id), 'class': 'dot ' + d.kind, 'data-id': d.id, 'aria-label': label, tabindex: 0 });
      var t = svg('title'); t.textContent = label; a.appendChild(t);
      a.appendChild(svg('circle', { cx: d.x, cy: d.y, r: d.kind === 'delivery' ? +(r * 1.6).toFixed(2) : r }));
      g.appendChild(a);
    });
    s.appendChild(g); box.appendChild(s);
    if (m.dots.some(function (d) { return d.kind === 'delivery'; })) box.appendChild(el('p', 'muted map-note', C.mapDeliveryNote));
    if (m.dropped.length) box.appendChild(el('p', 'muted map-note', C.mapNotShown(m.dropped.length)));
    box.hidden = false;
  }

  if (page === 'results') {
    var p = params(), out = doc.getElementById('results'), head = doc.getElementById('resultsTitle'), stateBox = doc.getElementById('state'), mapEl = doc.getElementById('map');
    fill(doc.getElementById('search'), p);
    var run = function () {
      clear(out); clear(stateBox); head.textContent = ''; if (mapEl) { clear(mapEl); mapEl.hidden = true; }
      load().then(function (data) {
        fillCities(doc.getElementById('search'), data, p);
        var res = F.search(data, p, new Date());
        if (res.notFound) {
          var c = F.classify(p.q);
          if (res.reason === 'badzip') { head.textContent = C.badZipTitle; showState(stateBox, { name: 'bad-zip', body: C.badZipBody(c.value), actions: [{ text: C.clearSearch, href: 'index.html' }] }); }
          else {
            // when only ?city= was given, the city is what was not found: name it (it read "No licensed shops match “”")
            head.textContent = res.reason === 'zip' ? C.unknownZipTitle(c.value) : C.unknownCityTitle(c.value || p.city);
            showState(stateBox, { name: 'unknown-place', body: C.unknownBody, actions: [{ text: C.clearSearch, href: 'index.html' }] });
          }
          return;
        }
        var placeName = res.place && res.place.name, cityName = matchCity(F.cities(data, new Date()), p.city);
        if (!res.results.length) {
          head.textContent = C.emptyTitle(placeName || cityName);
          showState(stateBox, { name: 'no-results', body: C.emptyBody,
            actions: res.filtered ? [{ text: C.clearFilters, href: 'results.html?q=' + encodeURIComponent(p.q) }] : [] });
          return;
        }
        head.textContent = C.resultsTitle(res.results.length, placeName, cityName);
        if (mapEl) renderMap(mapEl, data, res.results);
        res.results.forEach(function (r) {
          var l = r.listing, li = el('li'), a = el('a', 'listing'), top = el('div', 'row');
          li.appendChild(a);
          a.href = detailHref(l.id);
          top.appendChild(el('h3', null, l.name));
          if (r.miles != null) top.appendChild(el('span', 'dist', C.miles(r.miles)));
          a.appendChild(top);
          var meta = el('div', 'row meta');
          meta.appendChild(badge(r));
          meta.appendChild(el('span', 'muted', kind(l) + (F.cityOf(l) ? ' \u00b7 ' + F.cityOf(l) : '')));   // a missing address never breaks a card
          a.appendChild(meta);
          var lc = el('div', 'license', C.license + ' ' + l.license + ' · ');
          lc.appendChild(el('span', 'status', C.cardStatus(l.licenseStatus)));   // the state status on every card
          a.appendChild(lc);
          out.appendChild(li);
        });
      }, function (e) { loadFailed(e, head, stateBox, run); });
    };
    run();
    return;
  }

  if (page === 'listing') {
    var lp = params(), box = doc.getElementById('listing'), back = doc.getElementById('back');
    var from = new URLSearchParams(location.search).get('from');
    back.href = 'results.html' + (from && from.charAt(0) === '?' ? from : '');
    var runListing = function () {
    clear(box);
    load().then(function (data) {
      var l = lp.id ? F.byId(data, lp.id) : null;
      if (!l) {
        doc.title = C.listingMissingDocTitle;   // a deep link to an unknown id is a styled not-found page, never blank
        box.appendChild(el('h1', 'name', C.listingMissingTitle));
        showState(box, { name: 'listing-missing', body: C.listingMissingBody, actions: [{ text: C.backToSearch, href: 'index.html' }] });
        return;
      }
      doc.title = l.name + ' · ' + C.name;
      var s = F.openState(l, new Date());
      box.appendChild(el('h1', 'name', l.name));
      var meta = el('div', 'row meta'); meta.appendChild(badge(s)); meta.appendChild(el('span', 'muted', kind(l))); box.appendChild(meta);

      var lic = el('section', 'card'); lic.appendChild(el('h2', null, C.license));
      lic.appendChild(el('p', 'mono', l.license));
      if (l.licenseType) lic.appendChild(el('p', 'muted', l.licenseType));
      lic.appendChild(el('p', 'status', C.licenseStatus(l.licenseStatus)));
      // "License checked on {date}": only with a valid check date; older than F.STALE_DAYS reads as possibly out of date.
      var chk = F.licenseCheck(l, new Date());
      if (chk.show) {
        var cp = el('p', 'checked' + (chk.stale ? ' stale' : ''), C.licenseChecked(chk.text));
        cp.setAttribute('data-check', chk.stale ? 'stale' : 'fresh');
        if (chk.stale) { cp.appendChild(doc.createTextNode(' ')); cp.appendChild(el('strong', null, C.licenseStale)); }
        lic.appendChild(cp);
      }
      // Official record: built ONLY from the license number on the allow-listed DCC base (never a listing field).
      var rec = F.dccRecordUrl(l.license);
      if (rec) {
        var ra = el('a', 'record', C.licenseRecord);
        ra.href = rec; ra.target = '_blank'; ra.rel = 'noopener noreferrer';
        lic.appendChild(ra);
      }
      box.appendChild(lic);

      // Address per the Privacy page: storefronts in full; delivery-only = city only; missing = said so (F.addressLines)
      var ad = el('section', 'card address'), AL = F.addressLines(l); ad.appendChild(el('h2', null, C.address));
      AL.lines.forEach(function (t) { ad.appendChild(el('p', null, t)); });
      if (AL.note) ad.appendChild(el('p', 'muted addr-note', AL.note === 'delivery' ? C.addressDeliveryNote : AL.note === 'street' ? C.addressNoStreet : C.addressNone));
      box.appendChild(ad);

      var hr = el('section', 'card'), t = el('table', 'hours'), today = F.localTime(new Date(), l.tz).day;
      hr.appendChild(el('h2', null, C.hours));
      t.appendChild(el('caption', 'sr', C.hours));
      if (!F.hoursKnown(l)) {
        // missing or malformed hours: say so, never a week of "Closed" (#15)
        hr.appendChild(el('p', 'muted hours-unknown', C.hoursNotListed)); box.appendChild(hr);
      } else {
      F.weekHours(l).forEach(function (h) {
        var tr = el('tr', h.key === today ? 'today' : null), th = el('th', null, h.day);
        th.scope = 'row';
        if (h.key === today) tr.setAttribute('aria-current', 'date');
        tr.appendChild(th); tr.appendChild(el('td', null, h.text)); t.appendChild(tr);
      });
      hr.appendChild(t); box.appendChild(hr);
      }

      var mn = el('section', 'card'), url = F.safeUrl(l.menuUrl); mn.appendChild(el('h2', null, C.menu));
      if (url) {
        var m = el('a', 'btn ghost', C.menuLink); m.href = url; m.target = '_blank'; m.rel = 'noopener noreferrer nofollow';
        // the hand-off to a business that may take orders: say who checks ID, and the age rule (Sentinel B/D)
        var mnote = el('p', 'muted', C.menuNote); mnote.id = 'menu-note'; m.setAttribute('aria-describedby', 'menu-note');
        mn.appendChild(m); mn.appendChild(mnote);
      }
      else mn.appendChild(el('p', 'muted', C.noMenu));
      box.appendChild(mn);

      // Not a real `disabled` button: that would drop it from the Tab order, so keyboard and screen-reader users would never
      // hear "coming soon". aria-disabled keeps it reachable, announced as unavailable, and it does nothing.
      var cl = el('section', 'card claim'), b = el('button', 'btn', C.claim), note = el('p', 'muted', C.claimSoon);
      note.id = 'claim-note';
      b.type = 'button'; b.setAttribute('aria-disabled', 'true'); b.setAttribute('aria-describedby', 'claim-note');
      b.addEventListener('click', function (e) { e.preventDefault(); });
      cl.appendChild(b); cl.appendChild(note); box.appendChild(cl);

      // Report a problem (W3r). The rules are FMW.reportCheck, the twin of the DRAFT fmw.submit_report. There is NO send
      // path yet: no fetch, no endpoint, no email. A valid report only says that nothing was sent (reports open at launch).
      // HIDDEN unless site.json "reportForm" is true (W5.3; the generated js/site-config.js). Missing config = hidden.
      if (!(window.FMW_CONFIG && window.FMW_CONFIG.reportForm === true)) return;
      var rp = el('section', 'card report'), fm = el('form'), fs = el('fieldset'), msg = el('p', 'report-msg');
      rp.appendChild(el('h2', null, C.report)); rp.appendChild(el('p', 'muted', C.reportIntro));
      fm.noValidate = true; fm.setAttribute('aria-label', C.report);
      fs.appendChild(el('legend', null, C.reportReasonLegend));
      F.REPORT_REASONS.forEach(function (r) {
        var lb = el('label', 'check'), ip = el('input'); ip.type = 'radio'; ip.name = 'reason'; ip.value = r;
        lb.appendChild(ip); lb.appendChild(doc.createTextNode(C.reportReasons[r])); fs.appendChild(lb);   // spacing is CSS (.report label.check input), not a leading ' ' in the name
      });
      fm.appendChild(fs);
      var dl = el('label', 'report-details', C.reportDetails), ta = el('textarea'), hint = el('p', 'muted', C.reportDetailsHint);
      ta.name = 'details'; ta.id = 'report-details'; ta.rows = 3; ta.maxLength = F.REPORT_MAX; dl.htmlFor = ta.id;
      hint.id = 'report-hint'; ta.setAttribute('aria-describedby', 'report-hint');
      fm.appendChild(dl); fm.appendChild(ta); fm.appendChild(hint);
      var sb = el('button', 'btn ghost', C.reportSend); sb.type = 'submit'; fm.appendChild(sb);
      msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite'); fm.appendChild(msg);
      fm.addEventListener('submit', function (e) {
        e.preventDefault();
        var pick = fm.querySelector('input[name="reason"]:checked'), r = F.reportCheck(pick ? pick.value : null, ta.value);
        msg.textContent = r.ok ? C.reportNotOpen : C.reportErrors[r.error];
        msg.setAttribute('data-report', r.ok ? 'not-sent' : r.error);
        msg.className = 'report-msg' + (r.ok ? '' : ' error');
      });
      rp.appendChild(fm); box.appendChild(rp);
    }, function (e) { var h = el('h1', 'name'); box.appendChild(h); loadFailed(e, h, box, runListing); });
    };
    runListing();
  }
})();
