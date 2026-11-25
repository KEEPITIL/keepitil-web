// Renders the 3 basics (search, results, listing) from data/listings.json. Text goes in with textContent only.
(function () {
  var C = window.FMW_COPY, F = window.FMW, doc = document, page = doc.body.getAttribute('data-page');
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // SEO (1.0 cut): the head of a listing / city view says what the page is. Googlebot renders this script, so title, description,
  // canonical and JSON-LD are read from the rendered page. Set with attributes / textContent only; JSON-LD has "<" escaped.
  var SEO_BASE = (typeof location !== 'undefined' && location.origin ? location.origin : '') + ((window.FMW_CONFIG && window.FMW_CONFIG.basePath) || '');
  function seoApply(seo) {
    if (!seo || typeof doc.querySelector !== 'function') return;   // no head to write (a page-less test DOM)
    if (seo.title) doc.title = seo.title;
    var head = doc.head || doc.querySelector('head'); if (!head) return;
    var setMeta = function (sel, attr, key, val) { var n = doc.querySelector(sel); if (!n) { n = doc.createElement('meta'); n.setAttribute(attr, key); head.appendChild(n); } n.setAttribute('content', val); };
    if (seo.description) { setMeta('meta[name="description"]', 'name', 'description', seo.description); setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description); }
    if (seo.title) setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title);
    if (seo.canonical) {
      var lk = doc.querySelector('link[rel="canonical"]'); if (!lk) { lk = doc.createElement('link'); lk.setAttribute('rel', 'canonical'); head.appendChild(lk); }
      lk.setAttribute('href', seo.canonical); setMeta('meta[property="og:url"]', 'property', 'og:url', seo.canonical);
    }
    if (seo.jsonLd) {
      var sc = doc.querySelector('script[type="application/ld+json"]'); if (!sc) { sc = doc.createElement('script'); sc.setAttribute('type', 'application/ld+json'); head.appendChild(sc); }
      sc.textContent = JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c');
    }
    if (seo.heading) { var h = doc.querySelector('h1.sr'); if (h) h.textContent = seo.heading; }
  }
  function params() {
    var p = new URLSearchParams(location.search);
    // county: the area (location selector). A typed place (q) wins over it, so "Oakland" from the Los Angeles home finds
    // Oakland. hasCounty: the URL names a county (even "All counties" = ''), so the home's default county does not apply.
    var r = { f: F.filterKey(p.get('f')), q: F.cleanQuery(p.get('q')), delivery: p.get('delivery') === '1', storefront: p.get('storefront') === '1', openNow: p.get('open') === '1', city: F.cleanQuery(p.get('city')), county: F.cleanQuery(p.get('county')), hasCounty: p.has('county'), id: p.get('id') || '' };
    // area (the search bar's location dropdown): "county:<name>" | "city:<name>" | "" (the whole state). It names the area, so
    // the home's remembered / default area does not apply; ?county= and ?city= links keep working as before.
    if (p.has('area')) { var a = F.parseArea(p.get('area')); r.hasCounty = true; r.county = a.kind === 'county' ? a.name : ''; if (a.kind === 'city') r.city = a.name; }
    if (r.q) r.county = '';
    return r;
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

  // Shared chrome: every [data-copy] element gets its text from copy.js; the draft banner goes once the copy is final.
  doc.querySelectorAll('[data-copy]').forEach(function (n) { var v = C[n.getAttribute('data-copy')]; if (typeof v === 'string') n.textContent = v; });
  doc.querySelectorAll('[data-copy-label]').forEach(function (n) { var v = C[n.getAttribute('data-copy-label')]; if (typeof v === 'string') n.setAttribute('aria-label', v); });
  doc.querySelectorAll('[data-copy-ph]').forEach(function (n) { var v = C[n.getAttribute('data-copy-ph')]; if (typeof v === 'string') n.setAttribute('placeholder', v); });
  // "List Your Business": the business pitch at <basePath>/for-business/ (a separate build, not in this export, so it is
  // set here from site.json basePath rather than written into the pages: a page link must resolve inside this folder).
  doc.querySelectorAll('a[data-biz]').forEach(function (n) { n.href = ((window.FMW_CONFIG && window.FMW_CONFIG.basePath) || '') + '/for-business/'; });
  // The sign-up front end (signup.html) is behind site.json "accounts" / "claims", both OFF by default. Off: Sign in stays the
  // placeholder above and List Your Business keeps the for-business link. "accounts" on: Sign in opens signup.html.
  // "claims" on as well: List Your Business opens the business path there. Nothing here signs anyone in.
  var ACCT = window.FMW_CONFIG && window.FMW_CONFIG.accounts === true, CLAIMS = ACCT && window.FMW_CONFIG.claims === true;
  var SESS = window.FMW_SESSION || {}, SIGNED_IN = ACCT && SESS.signedIn === true;   // js/session.js: a hint about what to draw (the server checks every call)
  // The 404 page is served at ANY depth (a/b/c.html under the site folder), so its own links must be absolute under basePath; every other page is flat and keeps relative links.
  var HERE = function (rel) { return page === 'notfound' ? (((window.FMW_CONFIG && window.FMW_CONFIG.basePath) || '') + '/' + rel) : rel; };
  if (ACCT) doc.querySelectorAll('button.signin').forEach(function (b) {
    var a = el('a', b.className, SIGNED_IN ? C.account : b.textContent); a.href = HERE(SIGNED_IN ? 'account.html' : 'signup.html'); b.parentNode.replaceChild(a, b);
    var note = doc.getElementById('signin-note'); if (note && note.parentNode) note.parentNode.removeChild(note);
  });
  if (CLAIMS) doc.querySelectorAll('a[data-biz]').forEach(function (n) { n.href = HERE('signup.html?as=business'); });
  if (!C.PLACEHOLDER) doc.querySelectorAll('.draft').forEach(function (n) { n.remove(); });

  // Icons: inline SVG paths (no image request; CSP img-src stays 'self'), drawn with currentColor.
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) { var e = doc.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, String(attrs[k])); }); return e; }
  var ICON = {
    home: 'M3 11 12 4l9 7v9h-6v-6H9v6H3z', store: 'M4 9h16l-1.5-5h-13zM5 9v11h14V9M9 20v-6h6v6',
    truck: 'M2 6h12v10H2zM14 10h4l3 3v3h-7M6 19.5a1.5 1.5 0 1 0 0-.01M17 19.5a1.5 1.5 0 1 0 0-.01', tag: 'M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01',
    star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z', briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18', building: 'M4 21V5l8-2v18M12 8h8v13M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M2 21h20',
    wrench: 'M14.5 5.5a4 4 0 0 0 4 5.5l-9 9-3-3 9-9a4 4 0 0 1-1-2.5z', calendar: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5', book: 'M12 6c-2-2-5-2-8-1v14c3-1 6-1 8 1 2-2 5-2 8-1V5c-3-1-6-1-8 1zM12 6v14',
    heart: 'M12 20s-8-5-8-11a4 4 0 0 1 8-1.5A4 4 0 0 1 20 9c0 6-8 11-8 11z', help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01', plus: 'M12 5v14M5 12h14',
    check: 'M4.5 12.5l5 5 10-11', pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', close: 'M6 6l12 12M18 6 6 18'
  };
  function icon(k, cls) { var s = svg('svg', { 'class': 'ico' + (cls ? ' ' + cls : ''), viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }); s.appendChild(svg('path', { d: ICON[k] || '' })); return s; }

  // The header's Sign in: aria-disabled ("coming soon" via aria-describedby) while accounts are off. It does nothing.
  var signinBtn = doc.getElementById('signin-btn');
  if (signinBtn && signinBtn.addEventListener) signinBtn.addEventListener('click', function (e) { e.preventDefault(); });

  // The menu page (approved spec item 9, 2026-11-21): a button with aria-expanded / aria-controls; the panel is hidden until a
  // CLICK (never on load). On the home it REPLACES the listing while open (body.menu-open). Open: focus goes to the first
  // item and Tab / Shift+Tab stay inside (button + items); Esc or a click outside closes it and focus returns to the button.
  // Items: F.menuItems(C.NAV_MENU): a link only with real data + a real page, otherwise "coming soon" (never a dead link).
  // Bottom: the 3-way theme pill (System / Bright / Dark; js/theme.js stores it). Text: textContent only.
  var menuData = function () {};   // set by the menu; called with the data a page loads
  function bodyClass(c, on) { var b = doc.body; if (b && b.classList) b.classList[on ? 'add' : 'remove'](c); }
  (function menu() {
    var btn = doc.getElementById('menu-btn'), panel = doc.getElementById('menu-panel');
    if (!btn || !panel || !btn.addEventListener || !F || !F.menuItems || !C.NAV_MENU) return;   // a missing module must never abort the rest of the page script
    var cfg = window.FMW_CONFIG || {}, base = cfg.basePath || '', abs = page === 'notfound', isOpen = false, offered = {};
    panel.setAttribute('aria-label', C.navMenuLabel);
    function soonButton(cls, label, describedBy) {
      // aria-disabled (not disabled): stays reachable and is announced as unavailable, with the "coming soon" words
      var n = el('button', cls); n.type = 'button'; n.setAttribute('aria-disabled', 'true');
      if (describedBy) n.setAttribute('aria-describedby', describedBy);
      n.addEventListener('click', function (e) { e.preventDefault(); });
      if (label != null) n.textContent = label;
      return n;
    }
    function themePill() {
      var T = window.FMW_THEME, now = T ? T.get() : 'light', wrap = el('div', 'theme-pill');
      wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', C.themeLabel); wrap.setAttribute('data-menu', 'theme');
      [['system', C.themeSystem], ['light', C.themeBright], ['dark', C.themeDark]].forEach(function (x) {
        var b = el('button', 'theme-opt', x[1]); b.type = 'button'; b.setAttribute('data-theme-choice', x[0]); b.setAttribute('aria-pressed', now === x[0] ? 'true' : 'false');
        b.addEventListener('click', function () {
          if (T) T.set(x[0]);
          Array.prototype.forEach.call(wrap.children, function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        });
        wrap.appendChild(b);
      });
      return wrap;
    }
    function draw() {
      // a redraw while open (data arriving) keeps focus on the same item
      var a = doc.activeElement, keep = isOpen && a && panel.contains(a) ? (a.getAttribute('data-menu') || (a.parentNode && a.parentNode.getAttribute && a.parentNode.getAttribute('data-menu'))) : null;
      clear(panel);
      var noteId = 'menu-acct-note', acct = el('div', 'menu-acct'), groups = {}, order = [], anySoonAcct = false;
      F.menuItems(C.NAV_MENU, { accounts: cfg.accounts === true, signedIn: SIGNED_IN, business: SIGNED_IN && SESS.isBusiness && SESS.isBusiness() === true, basePath: base, absolute: abs, offered: offered }).forEach(function (it) {
        var n;
        if (!it.group) {   // the two account pills, side by side at the top
          if (it.disabled) { n = soonButton('pill ' + (it.pill || 'outline'), it.label, noteId); anySoonAcct = true; }
          else { n = el('a', 'pill ' + (it.pill || 'outline'), it.label); n.href = it.href; }
          n.setAttribute('data-menu', it.key); acct.appendChild(n); return;
        }
        if (!groups[it.group]) { groups[it.group] = el('ul', 'menu-group'); groups[it.group].setAttribute('data-group', String(it.group)); order.push(it.group); }
        var li = el('li', 'menu-item'); li.setAttribute('data-menu', it.key);
        if (it.disabled) n = soonButton('menu-link soon', null, it.account ? noteId : null);
        else { n = el('a', 'menu-link'); n.href = it.href; }
        if (it.icon) n.appendChild(icon(it.icon));
        n.appendChild(el('span', 'menu-label', it.label));
        if (it.disabled) n.appendChild(el('span', 'soon-tag', C.comingSoon));
        li.appendChild(n); groups[it.group].appendChild(li);
      });
      if (SIGNED_IN) {   // signed in: Account, and Sign out (the account page runs the full server revoke when it is opened with ?signout=1)
        var ac = el('a', 'pill outline', C.account); ac.href = HERE('account.html'); ac.setAttribute('data-menu', 'account'); acct.appendChild(ac);
        var so = el('a', 'pill fill', C.signOut); so.href = HERE('account.html?signout=1'); so.setAttribute('data-menu', 'signout'); acct.appendChild(so);
      }
      panel.appendChild(acct);
      if (anySoonAcct) { var note = el('p', 'menu-note muted', C.signInSoon); note.id = noteId; panel.appendChild(note); }
      order.forEach(function (g) { panel.appendChild(groups[g]); });
      panel.appendChild(themePill());
      if (keep) { var k = panel.querySelector('[data-menu="' + keep + '"]'); if (k && k.tagName !== 'LI' && k.focus) k.focus(); else if (k) { var kk = k.querySelector('a, button'); if (kk) kk.focus(); } }
    }
    function items() { return Array.prototype.slice.call(panel.querySelectorAll('a[href], button')); }
    function setOpen(on, refocus) {
      isOpen = on; panel.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      bodyClass('menu-open', on);
      if (on) { var f = items()[0]; if (f) f.focus(); } else if (refocus) btn.focus();
    }
    btn.addEventListener('click', function () { setOpen(!isOpen, false); if (!isOpen) btn.focus(); });
    doc.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); setOpen(false, true); return; }
      if (e.key !== 'Tab') return;
      var ring = [btn].concat(items()), i = ring.indexOf(doc.activeElement);
      e.preventDefault();
      ring[i < 0 ? 0 : (i + (e.shiftKey ? ring.length - 1 : 1)) % ring.length].focus();
    });
    doc.addEventListener('click', function (e) { if (isOpen && !btn.contains(e.target) && !panel.contains(e.target)) setOpen(false, false); });
    draw();
    // Storefronts / Deliveries need the data. NO extra request: the search / results / listing pages hand the menu the data
    // they already loaded (menuData below); About / Privacy load it once for the menu; the 404 page (any depth) does not.
    menuData = function (data) {
      if (!data) return;
      var now = new Date();
      offered = { storefront: F.storefrontOffered(data, now), delivery: F.deliveryOffered(data, now) };
      draw();
    };
    // About / Privacy / Terms need only two flags, not all 1,249 listings (1.0 baseline: -75 KB gz): data/offered.json, kept in step with
    // listings.json by tests/offered-json.test.js. If it cannot be read the menu simply keeps its disabled items.
    if (page === 'about' || page === 'privacy' || page === 'terms') window.fetch('data/offered.json', { cache: 'no-store' }).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (o) {
      if (o && typeof o.storefront === 'boolean' && typeof o.delivery === 'boolean') { offered = { storefront: o.storefront, delivery: o.delivery }; draw(); }
    }, function () {});
  })();

  // The location dropdown INSIDE the search bar (approved spec item 2): State / County / City in ONE select, built from the
  // shown listings only (F.counties / F.cities, so a held or expired row never adds a place). Values: F.areaValue.
  function matchCounty(list, c) {
    var t = F.countyKey(c);
    if (!t) return '';
    for (var i = 0; i < list.length; i++) if (F.countyKey(list[i]) === t) return list[i];
    return '';
  }
  function fillArea(form, data, p) {
    var sel = form && form.area; if (!sel) return;
    while (sel.children.length > 1) sel.removeChild(sel.children[sel.children.length - 1]);
    var now = new Date(), cl = F.counties(data, now), ci = F.cities(data, now);
    if (sel.children[0]) sel.children[0].textContent = C.fAreaState;
    [[C.areaGroupCounty, cl, 'county', C.countyName], [C.areaGroupCity, ci, 'city', function (x) { return x; }]].forEach(function (g) {
      var og = doc.createElement('optgroup'); og.setAttribute('label', g[0]);
      g[1].forEach(function (name) { var o = doc.createElement('option'); o.value = F.areaValue(g[2], name); o.textContent = g[3](name); og.appendChild(o); });
      sel.appendChild(og);
    });
    // the bar shows the active area: a chosen city, else a chosen county, else the whole state
    var city = matchCity(ci, p.city), county = matchCounty(cl, p.county);
    sel.value = city ? F.areaValue('city', city) : county ? F.areaValue('county', county) : '';
  }

  function load() { return F.loadData(window.fetch.bind(window), 'data/listings.json'); }
  function fill(form, p) { if (form && form.q) form.q.value = p.q; }

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


  // The map (Phase 1): one SVG drawn here from the same results as the list, self-hosted, no tiles, no other request.
  // Each dot is an SVG link to the same detail page as its card, focusable and labelled (C.mapDot). The state / county
  // outline is a SLOT: js/map-outline.js sets window.FMW_OUTLINE (null until a boundary file exists), and the map works
  // the same without it. Text goes in with textContent only.
  function detailHref(id) { return 'listing.html?id=' + encodeURIComponent(id) + (location.search ? '&from=' + encodeURIComponent(location.search) : ''); }
  // Map pins (owner 19:11 PT): the SHAPE says the category (retail = round pin, events = square pin, services = diamond
  // pin); the tip sits on the business's point. Inside the head: the business's own icon when one is on file
  // (F.brandIcon, same-site img/brands/...), else the generic pin's white centre. Delivery-only = an outlined retail pin.
  var PIN_ORDER = ['retail', 'events', 'services', 'business'];
  var PIN_PATH = {
    retail: 'M0 0C-2.4-3.6-6-7.2-6-11a6 6 0 1 1 12 0c0 3.8-3.6 7.4-6 11z',
    events: 'M0 0l-2.6-4.4H-5.5a1.5 1.5 0 0 1-1.5-1.5V-16.5a1.5 1.5 0 0 1 1.5-1.5h11a1.5 1.5 0 0 1 1.5 1.5V-5.9a1.5 1.5 0 0 1-1.5 1.5H2.6z',
    services: 'M0 0L-2.6-4.6-7.4-11 0-18.4 7.4-11 2.6-4.6z',
    business: 'M0 0l-2.4-4.2H-6.6V-17.6H6.6V-4.2H2.4z'
  };
  function pinWord(c) { return c === 'events' ? C.fEvents : c === 'services' ? C.fServices : C.pinCat[c]; }
  function pinShape(d, r) {
    var k = +(r * (d.kind === 'delivery' ? 0.3 : 0.25)).toFixed(3);
    var gp = svg('g', { 'class': 'pin-g pin-' + d.cat, transform: 'translate(' + d.x + ' ' + d.y + ') scale(' + k + ')' });
    gp.appendChild(svg('path', { 'class': 'pin', d: PIN_PATH[d.cat] || PIN_PATH.retail }));
    if (d.brand) {
      gp.appendChild(svg('circle', { 'class': 'pin-face', cx: 0, cy: -11, r: 4.6 }));
      gp.appendChild(svg('image', { 'class': 'pin-brand', href: d.brand, x: -4, y: -15, width: 8, height: 8, preserveAspectRatio: 'xMidYMid slice' }));
    } else gp.appendChild(svg('circle', { 'class': 'pin-hole', cx: 0, cy: -11, r: 2.2 }));
    return gp;
  }
  function renderMap(box, data, results) {
    clear(box); box.hidden = true;
    var m = F.mapDots(data, results.map(function (r) { return r.listing; }), new Date());
    if (!m.dots.length) return;
    var v = F.mapView(m), r = +(v.w / 45).toFixed(2), mh = el('div', 'map-head');
    mh.appendChild(el('h2', null, C.mapTitle)); box.appendChild(mh);
    var s = svg('svg', { viewBox: [v.x, v.y, v.w, v.h].join(' '), 'class': 'map-svg', role: 'group', 'aria-label': C.mapLabel(m.dots.length) });
    var outline = svg('g', { 'class': 'map-outline', 'data-slot': 'outline', 'aria-hidden': 'true' }), O = window.FMW_OUTLINE;
    if (O && Array.isArray(O.paths)) O.paths.forEach(function (d) { if (typeof d === 'string') outline.appendChild(svg('path', { d: d })); });
    s.appendChild(outline);
    var g = svg('g', { 'class': 'map-dots' });
    // delivery rings first and 1.6× larger: a ring at its city's centre stays visible around a storefront dot on the same spot
    var ordered = m.dots.slice().sort(function (x, y) { return (x.kind === 'delivery' ? 0 : 1) - (y.kind === 'delivery' ? 0 : 1); });
    function drawDot(d) {
      var label = C.mapDot(d.name, d.kind, d.city), a = svg('a', { href: detailHref(d.id), 'class': 'dot ' + d.kind, 'data-id': d.id, 'aria-label': label, tabindex: 0 });
      var t = svg('title'); t.textContent = label; a.appendChild(t);
      a.setAttribute('data-cat', d.cat);
      a.appendChild(pinShape(d, r));
      g.appendChild(a);
    }
    // Perf (NEXUS2 profile 2026-11-24: the long task on home/results was building ~1,250 map dots = ~8,750 SVG nodes in one go): the
    // first MAP_FIRST dots at once, the rest MAP_SIZE per animation frame; a newer draw cancels (mapToken). No rAF (node tests) or few dots: all at once.
    var my = ++mapToken, i = 0, raf = window.requestAnimationFrame;
    function stepDots(n) { var end = Math.min(i + n, ordered.length); for (; i < end; i++) drawDot(ordered[i]); }
    if (typeof raf !== 'function' || ordered.length <= MAP_FIRST) stepDots(ordered.length);
    else { stepDots(MAP_FIRST); (function more() { if (i >= ordered.length || my !== mapToken) return; raf.call(window, function () { if (my !== mapToken) return; stepDots(MAP_SIZE); more(); }); })(); }
    s.appendChild(g); box.appendChild(s);
    // the legend: the pin shapes on this map, by category (shape + label, so a category reads without tapping)
    var cats = PIN_ORDER.filter(function (c) { return m.dots.some(function (d) { return d.cat === c; }); });
    if (cats.length) {
      var lg = el('ul', 'map-legend'); lg.setAttribute('aria-label', C.mapLegendLabel);
      cats.forEach(function (c) {
        var li = el('li', 'lg-' + c), sv = svg('svg', { 'class': 'lg-pin pin-' + c, viewBox: '-9 -21 18 22', 'aria-hidden': 'true', focusable: 'false' });
        sv.appendChild(svg('path', { 'class': 'pin', d: PIN_PATH[c] || PIN_PATH.retail }));
        li.appendChild(sv); li.appendChild(el('span', null, pinWord(c))); lg.appendChild(li);
      });
      box.appendChild(lg);
    }
    if (m.dots.some(function (d) { return d.kind === 'delivery'; })) box.appendChild(el('p', 'muted map-note', C.mapDeliveryNote));
    if (m.dropped.length) box.appendChild(el('p', 'muted map-note', C.mapNotShown(m.dropped.length)));
    box.hidden = false;
  }

  // One listing card (approved spec item 8): horizontal, the same fixed size on phone and desktop. A 1:1 branded fallback
  // tile on the left (no shop photos exist, none are faked) and EXACTLY six single-line, truncating lines on the right,
  // unnumbered and unlabelled, in F.cardLines order (name; rating + distance; hours; address; Storefront / Delivery +
  // county; a green check mark + the license number). An empty line 2 keeps its place so every card is the same size.
  // A small map icon (its own button, outside the link) shows the business on the map.
  var showOnMap = function () {};   // set by the home
  // Perf: the map's dots are drawn in chunks (see renderMap); the card list is PAGED (showCards below), so no chunker is needed for the cards.
  var MAP_FIRST = 150, MAP_SIZE = 300, mapToken = 0;   // the map's dots, same idea (see renderMap)
  // The home / results list is PAGED, not endless: the first PAGE cards, then a "Show N more" button (all real results stay reachable; the map keeps every dot).
  var PAGE_FIRST = 24, PAGE_MORE = 60;
  function showCards(out, list) {
    var shown = 0, row = null, live = out.__live || null;
    // the polite status lives in a sibling element OUTSIDE the list (a list item would be read as one more result and the new cards land after it)
    function say(text) {
      if (!live && out.parentNode && out.parentNode.insertBefore) { live = out.__live = el('div', 'sr'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); out.parentNode.insertBefore(live, out.nextSibling); }
      if (live) live.textContent = text;
    }
    // like the map chunker: without requestAnimationFrame (the node tests) or for a short list everything is drawn at once, exactly as before
    if (typeof window.requestAnimationFrame !== 'function' || list.length <= PAGE_FIRST) { for (; shown < list.length; shown++) out.appendChild(card(list[shown])); say(''); return; }
    function next() {
      var first = shown > 0, end = Math.min(shown + (shown ? PAGE_MORE : PAGE_FIRST), list.length), firstNew = null;
      if (row && row.parentNode) row.parentNode.removeChild(row);
      for (; shown < end; shown++) { var c = card(list[shown]); if (!firstNew) firstNew = c; out.appendChild(c); }
      say(C.showMoreCount(shown, list.length));
      if (first && firstNew) { var a = firstNew.querySelector ? firstNew.querySelector('a') : null; if (a && a.focus) a.focus(); }   // after "Show more", focus lands on the first new card
      if (shown < list.length) {
        row = el('li', 'more');
        var b = el('button', 'btn ghost', C.showMore(Math.min(PAGE_MORE, list.length - shown))); b.type = 'button'; b.setAttribute('data-act', 'show-more');
        b.addEventListener('click', next);
        var vis = el('span', 'muted', C.showMoreCount(shown, list.length)); vis.setAttribute('aria-hidden', 'true');   // the live region says it; the visible copy is not read twice
        row.appendChild(b); row.appendChild(vis);
        out.appendChild(row);
      }
    }
    next();
  }
  function card(r) {
    var l = r.listing, L = F.cardLines(r, C), li = el('li', 'shop'), a = el('a', 'listing');
    li.setAttribute('data-id', l.id);
    a.href = detailHref(l.id);
    var th = el('span', 'thumb'); th.setAttribute('aria-hidden', 'true');
    th.appendChild(el('span', 'thumb-a', 'Find My')); th.appendChild(el('span', 'thumb-b', 'Weed'));
    var lines = el('span', 'lines' + (L[2] ? '' : ' lines-5'));   // no hours: five lines share the tile's height (no blank strip)
    var nm = el('h3', 'ln ln-name', L[0]);
    if (F.isPaid(r)) nm.appendChild(el('span', 'sponsored-tag', ' \u00b7 ' + C.sponsored));   // only a real, labelled paid placement; inside the link, so it is part of its accessible name
    lines.appendChild(nm);
    for (var i = 1; i <= 4; i++) lines.appendChild(el('span', 'ln ln-' + i + (i === 2 && !L[i] ? ' ln-none' : ''), L[i] || ' '));   // no hours data: the slot stays (six lines) but is not shown
    var lic = el('span', 'ln ln-lic'); lic.appendChild(icon('check', 'ck')); lic.appendChild(el('span', null, L[5]));
    lines.appendChild(lic);
    a.appendChild(th); a.appendChild(lines); li.appendChild(a);
    var pin = el('button', 'icon-btn pin-btn'); pin.type = 'button';
    pin.setAttribute('aria-label', C.mapShow(l.name)); pin.setAttribute('data-id', l.id); pin.appendChild(icon('pin'));
    pin.addEventListener('click', function () { showOnMap(l.id); });
    li.appendChild(pin);
    return li;
  }
  // A home row from real entries only (F.promoRows): ads 16:9, categories 1:1 tiles, deals / featured cards. The section
  // stays hidden (as shipped in the page) unless there is at least one real entry. Images are same-site (img/...).
  function renderRow(key, entries, seeAll) {
    var sec = doc.getElementById('row-' + key); if (!sec) return;
    var ul = sec.querySelector ? sec.querySelector('ul') : null;
    sec.hidden = true; if (!ul) return;
    clear(ul);
    // a sideways-scrolling list is a scrollable region: keyboard-focusable and named (axe: scrollable-region-focusable)
    ul.setAttribute('tabindex', '0'); ul.setAttribute('aria-label', { ads: C.rowAds, deals: C.rowDeals, categories: C.rowCategories, featured: C.rowFeatured }[key] || '');
    // Weedmaps-style row header (layout pattern only): a "See all" link next to the title for the rows that have a full list behind them. Built like the
    // category tiles: it keeps the current area (?city= / ?county=) and opens the filter IN PLACE (no full reload); `seeAll(key)` comes from the home.
    var old = sec.querySelector ? sec.querySelector('a.seeall') : null; if (old && old.parentNode) old.parentNode.removeChild(old);
    sec.className = String(sec.className || '').replace(/\s*\bhas-seeall\b/g, '');
    var sa = seeAll && entries && entries.length ? seeAll(key) : null;
    if (sa) {
      var all = el('a', 'seeall', C.seeAll); all.href = sa.href; all.setAttribute('aria-label', C.seeAllRow(key === 'deals' ? C.rowDeals : C.rowFeatured));
      all.addEventListener('click', sa.onClick); sec.insertBefore(all, ul); sec.className += ' has-seeall';
    }
    (entries || []).forEach(function (e) {
      var li = el('li', 'tile'), wrap = e.href ? el('a', 'tile-in') : el('div', 'tile-in');
      if (e.href) wrap.href = e.href;
      var im = el('img'); im.src = e.image; im.alt = ''; im.loading = 'lazy'; wrap.appendChild(im);
      wrap.appendChild(el('span', 'tile-label', e.label));
      if (e.license) wrap.appendChild(el('span', 'tile-license mono', e.license));   // placements always show the license number
      if (key === 'ads') wrap.appendChild(el('span', 'ad-tag', C.adTag));   // an ad is always labelled
      li.appendChild(wrap); ul.appendChild(li);
    });
    sec.hidden = !(entries && entries.length >= (key === 'categories' ? 2 : 1));   // a one-tile Categories row is filler, from data or from the listings alike
  }
  var FILTER_COPY = { home: 'fHome', storefront: 'fStorefront', delivery: 'fDelivery', open: 'fOpenNow', deals: 'fDeals', retail: 'fRetail', brands: 'fBrands',
    cultivation: 'fCultivation', manufacturing: 'fManufacturing', distribution: 'fDistribution', testing: 'fTesting', microbusiness: 'fMicrobusiness', services: 'fServices', events: 'fEvents' };

  // The approved home (owner 2026-11-21 17:53 PT): index.html opens straight on the listing (+ the map on desktop) for an
  // area. The location dropdown, a typed city / ZIP and the filter carousel all refine it IN PLACE (history.pushState; the
  // URL stays shareable). results.html is the SAME view, so old results links keep working.
  // Area: ?area= / ?county= / ?city= / a typed place; with none of them on the home, the visitor's last-known area (saved on
  // this device by js/theme.js, checked against the data), else the county with the most licensed listings.
  if (page === 'results' || page === 'search') {
    var p = params(), out = doc.getElementById('results'), head = doc.getElementById('resultsTitle'), stateBox = doc.getElementById('state'), mapEl = doc.getElementById('map');
    var nearby = doc.getElementById('rail-nearby'), form = doc.getElementById('search'), fbar = doc.getElementById('filterbar'), vtog = doc.getElementById('viewtoggle');
    var AREA = window.FMW_AREA || null, canPush = !!(window.history && history.pushState);
    fill(form, p);
    var go = function (u) {
      var qs = u.toString();
      if (!canPush) { location.search = qs ? '?' + qs : ''; return; }
      history.pushState(null, '', qs ? '?' + qs : '?');
      p = params(); fill(form, p); run();
    };
    // the current area + q as URL params (a new filter keeps them)
    var areaParams = function () {
      var u = new URLSearchParams();
      if (p.q) u.set('q', p.q);
      else if (form && form.area && typeof form.area.value === 'string') u.set('area', form.area.value);
      return u;
    };
    if (form && form.addEventListener) {
      // typed city / ZIP: filtered in place, never a trip to results.html (the plain GET stays the no-script fallback)
      form.addEventListener('submit', function (e) {
        if (!canPush) return;
        e.preventDefault();
        var q = F.cleanQuery(form.q && form.q.value), u = new URLSearchParams();
        if (q) u.set('q', q); else u.set('area', form.area ? form.area.value : '');
        go(u);
      });
      if (form.area && form.area.addEventListener) form.area.addEventListener('change', function () {
        if (AREA) AREA.set(form.area.value);   // the last-known location (this device only)
        if (form.q) form.q.value = '';
        var u = new URLSearchParams(); u.set('area', form.area.value); go(u);
      });
    }
    if (canPush && window.addEventListener) window.addEventListener('popstate', function () { p = params(); fill(form, p); run(); });
    // a chip: ?f=<key> on top of the area (Home = no f). The rows are filtered in place (F.filterRows), the URL stays shareable.
    if (fbar && fbar.addEventListener) fbar.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-filter]') : null; if (!b) return;
      var k = F.filterKey(b.getAttribute('data-filter')), u = areaParams();
      if (k !== 'home') u.set('f', k);
      go(u);
    });

    // List / Map (owner 19:16 PT). Phone (< 768px): the two buttons under the filter bar switch the card list and the map
    // (body.view-map; CSS shows one of the two). They are THE phone map control: no map icon in the search bar, no swipe.
    // Desktop (768px and up): the buttons are not shown and the map is always beside the cards.
    var view = 'list';
    var setView = function (v) {
      view = v === 'map' ? 'map' : 'list'; bodyClass('view-map', view === 'map');
      if (vtog && vtog.children) Array.prototype.forEach.call(vtog.children, function (b) { if (b.getAttribute) b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false'); });
    };
    if (vtog && vtog.addEventListener) vtog.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-view]') : null; if (b) setView(b.getAttribute('data-view'));
    });
    // Desktop: a card's map icon marks its dot on the map beside the list (the icon is not shown on phones).
    showOnMap = function (id) {
      if (mapEl && mapEl.querySelectorAll) Array.prototype.forEach.call(mapEl.querySelectorAll('a.dot'), function (d) {
        var on = d.getAttribute('data-id') === id, c = (d.getAttribute('class') || '').replace(/\s*\bsel\b/g, '');
        d.setAttribute('class', on ? c + ' sel' : c);
        if (on && d.parentNode) d.parentNode.appendChild(d);   // drawn last = on top
      });
      if (mapEl && mapEl.scrollIntoView && window.innerWidth >= 768) mapEl.scrollIntoView({ block: 'nearest' });
    };

    // The HOME and results.html load the small state index and only the chosen area's county file(s) (weight 1.0, Phases 2 and 3); the whole
    // state, or any failure or odd response here, falls back to the full data/listings.json as before.
    var homeIndex = null, homeFiles = {};
    var loadHomeIndex = function () {
      var get = homeIndex ? Promise.resolve(homeIndex) : F.loadPart(F.fetchOf(window), 'data/listings-index.json', function (d) { return d && Array.isArray(d.places) && Array.isArray(d.listings) && d.listings.length > 0 && d.listings.every(function (r) { return r && typeof r.county === 'string' && !r.address; }); }).then(function (d) { homeIndex = d; return d; });
      return get.then(function (idx) { return F.assembleHome(idx, {}); }, function () { return load(); });
    };
    var zipMap = null;
    var withAreaFiles = function (data, p) {
      if (!data.light || !homeIndex) return data;
      // a typed place also needs data/zip-county.json (a place is its city name OR its ZIPs); nothing else reads it
      var zm = !p.q ? Promise.resolve(null) : zipMap ? Promise.resolve(zipMap) : F.loadPart(F.fetchOf(window), 'data/zip-county.json', function (d) { return d && d.zips && typeof d.zips === 'object'; }).then(function (d) { zipMap = d; return d; });
      return zm.then(function (z) {
        var keys = F.areaCountyKeys(data, p, z);
        if (!keys.length) return p.q || p.county || p.city ? F.assembleHome(homeIndex, {}) : load();   // an unknown area / place stays light (same "not found"); the whole state needs every row
        return Promise.all(keys.map(function (k) {
          return homeFiles[k] ? homeFiles[k] : F.loadPart(F.fetchOf(window), 'data/counties/' + k + '.json', function (d) { return d && d.county === k && Array.isArray(d.listings); }).then(function (d) { homeFiles[k] = d; return d; });
        })).then(function (list) { var f = {}; keys.forEach(function (k, i) { f[k] = list[i]; }); return F.assembleHome(homeIndex, f); });
      }).then(null, function () { return load(); });   // any failure: the full file, as before
    };
    var run = function () {
      mapToken++; clear(out); clear(stateBox); head.textContent = ''; head.hidden = false; if (mapEl) { clear(mapEl); mapEl.hidden = true; }
      if (nearby) nearby.hidden = true;
      var light = page === 'search' || page === 'results';
      (light ? loadHomeIndex() : load()).then(function (data) {
        menuData(data);
        var now = new Date();
        if (page === 'search' && !p.q && !p.city && !p.hasCounty) {
          // the home's area: the last-known one (if the data still has it), else the busiest county
          var saved = AREA ? AREA.get() : null;
          if (saved != null && F.areaKnown(data, saved, now)) { var sa = F.parseArea(saved); p.county = sa.kind === 'county' ? sa.name : ''; if (sa.kind === 'city') p.city = sa.name; }
          else p.county = F.topCounty(data, now);
        }
        return light ? withAreaFiles(data, p) : data;
      }).then(function (data) {
        var now = new Date();
        fillArea(form, data, p);
        PROMO(data);
        var res = F.search(data, p, now);
        if (res.notFound) {
          drawFilters(F.FILTERS, 'home');
          var c = F.classify(p.q);
          if (res.reason === 'county') { head.textContent = C.unknownCountyTitle(p.county.replace(/\s+county$/i, '')); showState(stateBox, { name: 'unknown-place', body: C.unknownBody, actions: [{ text: C.clearSearch, href: 'index.html' }] }); }
          else if (res.reason === 'badzip') { head.textContent = C.badZipTitle; showState(stateBox, { name: 'bad-zip', body: C.badZipBody(c.value), actions: [{ text: C.clearSearch, href: 'index.html' }] }); }
          else {
            // when only ?city= was given, the city is what was not found: name it
            head.textContent = res.reason === 'zip' ? C.unknownZipTitle(c.value) : C.unknownCityTitle(c.value || p.city);
            showState(stateBox, { name: 'unknown-place', body: C.unknownBody, actions: [{ text: C.clearSearch, href: 'index.html' }] });
          }
          return;
        }
        // the filter carousel: the CUSTOMER set (F.FILTERS; business-only chips are not on it, joe-0045). The active chip: ?f=, else an old ?delivery= / ?open= / ?storefront=
        // link the data honours (search() ignores delivery / open while no row backs them), else Home.
        var active = p.f !== 'home' ? p.f : p.delivery && F.deliveryOffered(data, now) ? 'delivery' : p.openNow && F.openNowOffered(data, now) ? 'open' : p.storefront ? 'storefront' : 'home';
        drawFilters(F.FILTERS, active);
        var placeName = res.place && res.place.name, cityName = matchCity(F.cities(data, now), p.city);
        // only a county chosen (no city): the heading says "in Los Angeles County", the way it names a chosen city (#69)
        var countyName = matchCounty(F.counties(data, now), p.county);
        if (!cityName && countyName) cityName = C.countyName(countyName);
        if (!res.results.length) {
          head.textContent = C.emptyTitle(placeName || cityName);
          showState(stateBox, { name: 'no-results', body: C.emptyBody,
            actions: res.filtered ? [{ text: C.clearFilters, href: 'results.html?q=' + encodeURIComponent(p.q) }] : [] });
          return;
        }
        // a chip: only the area's rows with a REAL value for it. None: say so plainly (never invented rows), one way back.
        CATS(data, res.results);
        // a city view (?area=city:<name>) is a landing page: its own title, description, canonical and sr-only heading (no visible count: owner ruling 2026-11-22)
        if (p.city && !p.q) { var seoCityName = matchCity(F.cities(data, now), p.city); if (seoCityName) seoApply(F.seoCity(seoCityName, res.results.length, SEO_BASE)); }
        var rows = p.f !== 'home' ? F.filterRows(data, res.results, p.f) : res.results;
        if (!rows.length) {
          head.textContent = C.filterEmptyTitle(C[FILTER_COPY[p.f]], placeName || cityName);
          showState(stateBox, { name: 'filter-empty', body: p.f === 'open' ? C.filterEmptyOpen : C.filterEmptyOther,
            actions: [{ text: C.showAll, onClick: function () { go(areaParams()); } }] });
          return;
        }
        res = { place: res.place, results: F.orderCards(rows) };
        // joe-0045 + owner ruling 2026-11-22 ("Yes, remove there too"): NO page shows the "<N> licensed businesses in
        // <area>" line (no replacement copy), neither the home nor results.html; the heading is used only for the empty /
        // not-found states above.
        head.hidden = true;
        if (mapEl) renderMap(mapEl, data, res.results);
        // ONE listing (the old Storefronts rail folded in): every result, nearest first (F.search), named rows before
        // "[Equity Retailer]"-only rows. No ranking-by-rating rail and no paid-placement slot exist on this page.
        showCards(out, res.results);
        if (nearby) nearby.hidden = false;
      }, function (e) { loadFailed(e, head, stateBox, run); });
    };
    var drawFilters = function (keys, active) {
      if (!fbar) return;
      clear(fbar);
      keys.forEach(function (k) {
        var b = el('button', 'fchip', C[FILTER_COPY[k]]); b.type = 'button';
        b.setAttribute('data-filter', k); b.setAttribute('aria-pressed', k === active ? 'true' : 'false');
        fbar.appendChild(b);
      });
    };
    var SEE_ALL = { deals: 'deals', featured: 'brands' };
    var seeAllFor = function (k) {
      if (!SEE_ALL[k]) return null;
      var u = areaParams(); u.set('f', SEE_ALL[k]);
      return { href: '?' + u.toString(), onClick: function (e) { if (!canPush) return; e.preventDefault(); go(u); } };
    };
    var PROMO = function (data) { var rows = F.promoRows(data); F.PROMO_ROWS.forEach(function (k) { renderRow(k, rows[k], seeAllFor); }); };
    // Categories (row 6, a 1:1 single-row carousel) from REAL listing data: one tile per customer category with shown rows
    // in this area (F.categoryTiles). A tile opens the same in-place filter as its chip. Entries in the data file
    // (data.categories, with real images) win when they exist. Fewer than two tiles = the row stays hidden.
    var CATS = function (data, results) {
      if (F.promoRows(data).categories.length) return;
      var sec = doc.getElementById('row-categories'), ul = sec && sec.querySelector ? sec.querySelector('ul') : null;
      if (!sec || !ul) return;
      clear(ul); sec.hidden = true;
      var tiles = F.categoryTiles(data, results);
      tiles.forEach(function (t) {
        var u = areaParams(); u.set('f', t.key);
        var name = C.catTile[t.key] || C[FILTER_COPY[t.key]], li = el('li', 'tile cat-tile cat-' + t.key), a = el('a', 'tile-in');
        a.href = '?' + u.toString(); a.setAttribute('data-cat', t.key); a.setAttribute('aria-label', C.catTileLabel(name));
        var art = el('span', 'cat-art'); art.setAttribute('aria-hidden', 'true'); art.appendChild(icon(t.icon, 'cat-ico'));
        a.appendChild(art); a.appendChild(el('span', 'tile-label', name));
        a.addEventListener('click', function (e) { if (!canPush) return; e.preventDefault(); var v = areaParams(); v.set('f', t.key); go(v); });
        li.appendChild(a); ul.appendChild(li);
      });
      sec.hidden = tiles.length < 2;   // a row of one tile is filler: it shows only with two or more real categories
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
      menuData(data);
      var l = lp.id ? F.byId(data, lp.id) : null;
      if (!l) {
        doc.title = C.listingMissingDocTitle;   // a deep link to an unknown id is a styled not-found page, never blank
        box.appendChild(el('h1', 'name', C.listingMissingTitle));
        showState(box, { name: 'listing-missing', body: C.listingMissingBody, actions: [{ text: C.backToSearch, href: 'index.html' }] });
        return;
      }
      seoApply(F.seoListing(l, SEO_BASE));
      var s = F.openState(l, new Date());
      box.appendChild(el('h1', 'name', l.name));
      var meta = el('div', 'row meta');
      if (s.known !== false) meta.appendChild(badge(s));   // no hours data: no badge
      meta.appendChild(el('span', 'muted', kind(l))); box.appendChild(meta);

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
      // "License verified": only for an active license whose state-record check is recent (not stale), linking the official record
      if (rec && chk.show && !chk.stale && (l.licenseStatus === 'Active' || l.licenseStatus === 'About to Expire')) {
        lic.appendChild(el('p', 'verified-badge', C.licenseVerified));   // text only: the official-record link is the one just below
      }
      if (rec) {
        var ra = el('a', 'record', C.licenseRecord);
        ra.href = rec; ra.target = '_blank'; ra.rel = 'noopener noreferrer';
        lic.appendChild(ra);
      }
      box.appendChild(lic);
      // order-ahead (behind FMW_CONFIG.ordering, off today: the module draws nothing unless the flag is true)
      if (window.FMW_ORDERING && window.FMW_ORDERING.mount) window.FMW_ORDERING.mount(doc, l.license, box);
      // deals (behind FMW_CONFIG.deals, off today; a one-tap 21+ confirmation first)
      if (window.FMW_DEALS && window.FMW_DEALS.mount) window.FMW_DEALS.mount(doc, l.license, box);
      // favorites: a plain "Save" link to the account page (behind FMW_CONFIG.favorites, off today)
      if (window.FMW_FAVORITES && window.FMW_FAVORITES.mountSaveLink) window.FMW_FAVORITES.mountSaveLink(doc, l.id, box);

      // Address per the Privacy page: storefronts in full; delivery-only = city only; missing = said so (F.addressLines)
      var ad = el('section', 'card address'), AL = F.addressLines(l); ad.appendChild(el('h2', null, C.address));
      AL.lines.forEach(function (t) { ad.appendChild(el('p', null, t)); });
      if (AL.note) ad.appendChild(el('p', 'muted addr-note', AL.note === 'delivery' ? C.addressDeliveryNote : AL.note === 'street' ? C.addressNoStreet : C.addressNone));
      box.appendChild(ad);

      // No hours data (all of today's listings): no Hours card at all. A card that only says "Hours not listed" is noise; it returns the day a listing has real hours.
      if (F.hoursKnown(l)) {
        var hr = el('section', 'card'), t = el('table', 'hours'), today = F.localTime(new Date(), l.tz).day;
        hr.appendChild(el('h2', null, C.hours));
        t.appendChild(el('caption', 'sr', C.hours));
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
        // the hand-off to a business that may take orders: say who checks ID, and the age rule (review B/D)
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
