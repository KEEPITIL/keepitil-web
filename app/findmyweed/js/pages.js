// Renders the 3 basics (search, results, listing) from data/listings.json. Text goes in with textContent only.
(function () {
  var C = window.FMW_COPY, F = window.FMW, doc = document, page = doc.body.getAttribute('data-page');
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // SEO (1.0 cut): the head of a listing / city view says what the page is. Googlebot renders this script, so title, description,
  // canonical and JSON-LD are read from the rendered page. Set with attributes / textContent only; JSON-LD has "<" escaped.
  // The canonical / share base: the APEX origin the config names (the apex, also when the page is opened on www or on another host that serves this build: the matching page there), never the origin the visitor
  // happens to be on. Without a canonicalOrigin it falls back to this origin + basePath, as before.
  var SEO_CLEAN = !!(window.FMW_CONFIG && window.FMW_CONFIG.canonicalOrigin);   // the apex serves extensionless URLs: its canonicals never end in .html
  var SEO_BASE = (window.FMW_CONFIG && window.FMW_CONFIG.canonicalOrigin) || ((typeof location !== 'undefined' && location.origin ? location.origin : '') + ((window.FMW_CONFIG && window.FMW_CONFIG.basePath) || ''));
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
  // The per-county pages (/dispensaries/<county>/, /delivery/<county>/: tools/county-pages.js) are the map page two folders down with the county and the kind preset in <body data-county data-kind>:
  // their links and data are root-absolute under basePath (like the 404 page), and the preset applies only until the visitor picks something else.
  var DEEP = !!(doc.body.getAttribute('data-county') || doc.body.getAttribute('data-deep')), DB = DEEP ? (((window.FMW_CONFIG && window.FMW_CONFIG.basePath) || '') + '/') : '';
  // data/ requests are root-absolute on those pages (every call site stays 'data/...'): one thin wrapper instead of editing each
  if (DEEP && window.fetch) { var fetch0 = window.fetch; window.fetch = function (u, o) { return fetch0.call(window, typeof u === 'string' && /^data\//.test(u) ? DB + u : u, o); }; }   // same requests, only the path is made root-absolute (no new URL, no new host)
  function params() {
    var p = new URLSearchParams(location.search);
    // county: the area (location selector). A typed place (q) wins over it, so "Oakland" from the Los Angeles home finds
    // Oakland. hasCounty: the URL names a county (even "All counties" = ''), so the home's default county does not apply.
    var r = { f: F.filterKey(p.get('f')), fs: F.chipKeys(p.get('f')), q: F.cleanQuery(p.get('q')), delivery: p.get('delivery') === '1', storefront: p.get('storefront') === '1', openNow: p.get('open') === '1', city: F.cleanQuery(p.get('city')), county: F.cleanQuery(p.get('county')), hasCounty: p.has('county'), id: p.get('id') || '' };
    // area (the search bar's location dropdown): "county:<name>" | "city:<name>" | "" (the whole state). It names the area, so
    // the home's remembered / default area does not apply; ?county= and ?city= links keep working as before.
    if (p.has('area')) { var a = F.parseArea(p.get('area')); r.hasCounty = true; r.county = a.kind === 'county' ? a.name : ''; if (a.kind === 'city') r.city = a.name; }
    if (DEEP && doc.body.getAttribute('data-county') && !p.has('area') && !p.has('q') && !p.has('city') && !p.has('county')) { r.hasCounty = true; r.county = doc.body.getAttribute('data-county') || ''; }
    if (DEEP && doc.body.getAttribute('data-kind') && !p.has('f') && !r.delivery && !r.storefront) { r.f = F.filterKey(doc.body.getAttribute('data-kind')); r.fs = F.chipKeys(doc.body.getAttribute('data-kind')); r.seeded = true; }
    if (r.q) r.county = '';
    return r;
  }
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
  // Same rule as tools/page-href.js and js/fmw.js (a test keeps the three equal). Flat pages stay relative; the 404 and county pages are absolute under basePath.
  function cleanPageHref(p) {
    var s = String(p == null ? '' : p);
    if (/^(?:mailto:|https?:|tel:|#)/i.test(s)) return s;
    s = s.replace(/(^|\/)index\.html(?=$|[?#])/g, function (m, pre) { return pre ? pre : './'; });
    s = s.replace(/(^|\/)(?!learn\.html\b)([a-z0-9_-]+)\.html(?=$|[?#])/gi, function (m, pre, name) { return pre + name; });
    return s;
  }
  var HERE = function (rel) {
    var c = cleanPageHref(rel);
    if (page === 'notfound' || DEEP) { var root = ((window.FMW_CONFIG && window.FMW_CONFIG.basePath) || ''); return c === './' ? root + '/' : root + '/' + c; }
    return c;
  };
  // EVENTS (site.json "events", off by default): js/events-public.js is loaded ONLY while the flag is on. It draws the home rail / county section, the events page and an event's own page; with the flag off nothing here runs.
  var EVENTS_ON = !!(window.FMW_CONFIG && window.FMW_CONFIG.events === true);
  var withEvents = function (fn) { if (!EVENTS_ON) return; if (window.FMW_EVENTS_PUBLIC) { fn(window.FMW_EVENTS_PUBLIC); return; } var sc = doc.createElement('script'); sc.src = HERE('js/events-public.js'); sc.onload = function () { if (window.FMW_EVENTS_PUBLIC) fn(window.FMW_EVENTS_PUBLIC); }; doc.head.appendChild(sc); };
  var EV_OPTS = { href: function (id) { return HERE('listing.html?id=event-' + id); }, createHref: HERE('signup.html?as=organizer'), allHref: HERE('events.html') };
  withEvents(function (EP) { if (page === 'events') EP.mountPage(window, doc, EV_OPTS); else EP.mountAuto(window, doc, EV_OPTS); });
  var NAV_ITEMS = function () { return EVENTS_ON ? C.NAV_MENU.map(function (it) { return it.key === 'cat-events' ? Object.assign({}, it, { page: 'events.html' }) : it; }) : C.NAV_MENU; };   // the Event Organizer item opens the events page while events are on
  if (ACCT) doc.querySelectorAll('button.signin').forEach(function (b) {
    var a = el('a', b.className, SIGNED_IN ? C.account : b.textContent); a.href = HERE(SIGNED_IN ? 'account.html' : 'signup.html'); b.parentNode.replaceChild(a, b);
    var note = doc.getElementById('signin-note'); if (note && note.parentNode) note.parentNode.removeChild(note);
  });
  if (CLAIMS) doc.querySelectorAll('a[data-biz]').forEach(function (n) { n.href = HERE('signup.html?as=business'); });
  // site.json "bizLeads" on: List Your Business opens the business sign-up page (for-business.html: pitch, form, FAQ), which links on to the business account path. Off: the links above are unchanged.
  if (window.FMW_CONFIG && window.FMW_CONFIG.bizLeads === true) doc.querySelectorAll('a[data-biz]').forEach(function (n) { n.href = HERE('for-business.html'); });
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
    check: 'M4.5 12.5l5 5 10-11', pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', close: 'M6 6l12 12M18 6 6 18', directions: 'M4 12l16-8-8 16-2-6z'
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
  // The header bell and cart (Joe 2026-11-26): two small panels. The bell lists REAL updates only (none exist yet: no badge, an honest "No new updates."); the cart is "Ordering is coming soon"
  // (Find My Weed takes no orders: no checkout, no items). Esc, a click outside or the other button closes one; focus returns to the button.
  (function headerPanels() {
    var pairs = [['notif-btn', 'notif-panel'], ['cart-btn', 'cart-panel']].map(function (p) { return { btn: doc.getElementById(p[0]), panel: doc.getElementById(p[1]) }; }).filter(function (p) { return p.btn && p.panel && p.btn.addEventListener; });
    if (!pairs.length) return;
    function closeAll(except, refocus) { pairs.forEach(function (p) { if (p === except) return; var was = !p.panel.hidden; p.panel.hidden = true; p.btn.setAttribute('aria-expanded', 'false'); if (was && refocus) p.btn.focus(); }); }
    pairs.forEach(function (p) {
      p.btn.addEventListener('click', function () { var on = p.panel.hidden; closeAll(p, false); p.panel.hidden = !on; p.btn.setAttribute('aria-expanded', on ? 'true' : 'false'); });
    });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(null, true); });
    doc.addEventListener('click', function (e) { var t = e.target; if (t && t.closest && t.closest('.hdr-pop')) return; closeAll(null, false); });
  })();
  var menuData = function () {};   // set by the menu; called with the data a page loads
  function bodyClass(c, on) { var b = doc.body; if (b && b.classList) b.classList[on ? 'add' : 'remove'](c); }
  (function menu() {
    var btn = doc.getElementById('menu-btn'), panel = doc.getElementById('menu-panel');
    if (!btn || !panel || !btn.addEventListener || !F || !F.menuItems || !C.NAV_MENU) return;   // a missing module must never abort the rest of the page script
    var cfg = window.FMW_CONFIG || {}, base = cfg.basePath || '', abs = page === 'notfound' || DEEP, isOpen = false, offered = {};
    var drawer = doc.getElementById('drawer');   // the LEFT drawer (homepage layout v2): a modal dialog holding the scrim and the menu panel
    panel.setAttribute('aria-label', C.navMenuLabel);
    if (drawer && drawer.setAttribute) drawer.setAttribute('aria-label', C.navDrawerLabel);
    var scrim = drawer && drawer.querySelector ? drawer.querySelector('.scrim') : null;
    if (scrim && scrim.addEventListener) scrim.addEventListener('click', function () { setOpen(false, true); });
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
    // ONE item renderer for the drawer AND the left rail: both are built from C.NAV_MENU (groups 1 and 2) through this, so the two cannot drift apart (tests/menu-rail-parity.test.js)
    function menuNode(it, cls, noteId) {
      var li = el('li', cls + '-item'), n;
      if (it.disabled) n = soonButton(cls + '-link soon', null, it.account ? noteId : null);
      else { n = el('a', cls + '-link'); n.href = it.href; }
      if (it.icon) n.appendChild(icon(it.icon));
      n.appendChild(el('span', cls === 'menu' ? 'menu-label' : null, it.label));
      if (it.disabled) n.appendChild(el('span', 'soon-tag', C.comingSoon));
      return { li: li, a: n };
    }
    function menuOpts(rail) { return { accounts: cfg.accounts === true, signedIn: SIGNED_IN, business: SIGNED_IN && SESS.isBusiness && SESS.isBusiness() === true, basePath: base, absolute: abs, offered: EVENTS_ON ? Object.assign({}, offered, { 'licensed-events': true }) : offered, reportHref: rail ? '' : reportHref() }; }
    function draw() {
      // a redraw while open (data arriving) keeps focus on the same item
      var a = doc.activeElement, keep = isOpen && a && panel.contains(a) ? (a.getAttribute('data-menu') || (a.parentNode && a.parentNode.getAttribute && a.parentNode.getAttribute('data-menu'))) : null;
      clear(panel);
      var noteId = 'menu-acct-note', acct = el('div', 'menu-acct'), groups = {}, order = [], anySoonAcct = false;
      F.menuItems(NAV_ITEMS(), menuOpts(false)).forEach(function (it) {
        var n;
        if (!it.group) {   // the two account pills, side by side at the top
          if (it.disabled) { n = soonButton('pill ' + (it.pill || 'outline'), it.label, noteId); anySoonAcct = true; }
          else { n = el('a', 'pill ' + (it.pill || 'outline'), it.label); n.href = it.href; }
          n.setAttribute('data-menu', it.key); acct.appendChild(n); return;
        }
        if (!groups[it.group]) { groups[it.group] = el('ul', 'menu-group'); if (C.NAV_GROUP_HEADINGS && C.NAV_GROUP_HEADINGS[it.group]) groups[it.group].setAttribute('aria-label', C.NAV_GROUP_HEADINGS[it.group]); groups[it.group].setAttribute('data-group', String(it.group)); order.push(it.group); }
        var nd = menuNode(it, 'menu', noteId), li = nd.li; li.setAttribute('data-menu', it.key); li.appendChild(nd.a); groups[it.group].appendChild(li);
      });
      if (SIGNED_IN) {   // signed in: Account, and Sign out (the account page runs the full server revoke when it is opened with ?signout=1)
        var ac = el('a', 'pill outline', C.account); ac.href = HERE('account.html'); ac.setAttribute('data-menu', 'account'); acct.appendChild(ac);
        var so = el('a', 'pill fill', C.signOut); so.href = HERE('account.html?signout=1'); so.setAttribute('data-menu', 'signout'); acct.appendChild(so);
      }
      panel.appendChild(acct);
      if (anySoonAcct) { var note = el('p', 'menu-note muted', C.signInSoon); note.id = noteId; panel.appendChild(note); }
      order.forEach(function (g) {
        if (C.NAV_GROUP_HEADINGS && C.NAV_GROUP_HEADINGS[g]) panel.appendChild(el('h2', 'menu-h', C.NAV_GROUP_HEADINGS[g]));   // "Licensed categories"
        panel.appendChild(groups[g]);
      });
      panel.appendChild(themePill());
      drawRail();
      if (keep) { var k = panel.querySelector('[data-menu="' + keep + '"]'); if (k && k.tagName !== 'LI' && k.focus) k.focus(); else if (k) { var kk = k.querySelector('a, button'); if (kk) kk.focus(); } }
    }
    // The persistent LEFT RAIL (Weedmaps style) from 1024px up. Joe 2026-11-27: it shows EVERY item the drawer shows, in the same order (the main links, then "Licensed categories"; not the account pills and not the Help group), built from the same C.NAV_MENU list through the same menuNode(); a link whose page is not live yet is the same disabled "Coming soon" item as in the drawer. It scrolls on its own when taller than the viewport (CSS overflow:auto).
    function drawRail() {
      if (doc.body && doc.body.hasAttribute && doc.body.hasAttribute('data-map')) return;   // the map pages (/dispensaries/, /delivery/) have no always-on menu rail: the menu opens only from its button (owner direction 2026-11-26)
      var nav = doc.getElementById('side-rail');
      if (!nav) { nav = el('nav', 'side-rail'); nav.id = 'side-rail'; nav.setAttribute('aria-label', C.railLabel); doc.body.appendChild(nav); }
      clear(nav);
      var here = String((window.location && location.pathname) || '').replace(/index\.html$/, ''), groups = {}, order = [];
      F.menuItems(NAV_ITEMS(), menuOpts(true)).forEach(function (it) {
        if (it.group !== 1 && it.group !== 2) return;   // the account pills and the Help / About / Privacy / Terms / Report group stay drawer-only
        var nd = menuNode(it, 'rail', null), a = nd.a;
        if (!groups[it.group]) { groups[it.group] = el('ul', 'rail-group'); if (C.NAV_GROUP_HEADINGS && C.NAV_GROUP_HEADINGS[it.group]) groups[it.group].setAttribute('aria-label', C.NAV_GROUP_HEADINGS[it.group]); groups[it.group].setAttribute('data-group', String(it.group)); order.push(it.group); }
        nd.li.setAttribute('data-menu', it.key);
        if (!it.disabled && it.href) {
          var path = it.href.split('#')[0].split('?')[0].replace(/index\.html$/, ''); if (path ? (here && here.slice(-path.length) === path && path !== '/') : (it.key === 'home' && (here === '/' || here === '' || /\/$/.test(here) && !/\/(dispensaries|delivery|brands|learn|services|map)\/$/.test(here) && here.split('/').length <= 3))) a.setAttribute('aria-current', 'page');
        }
        nd.li.appendChild(a); groups[it.group].appendChild(nd.li);
      });
      order.forEach(function (g) {
        if (C.NAV_GROUP_HEADINGS && C.NAV_GROUP_HEADINGS[g]) nav.appendChild(el('h2', 'rail-h', C.NAV_GROUP_HEADINGS[g]));
        nav.appendChild(groups[g]);
      });
      bodyClass('has-rail', nav.children.length > 0);
    }
    // the "Report an unlicensed seller" mailto is the footer's own link (one address, one subject), read from the page, never typed twice
    function reportHref() { var r = doc.querySelector ? doc.querySelector('.foot .report-seller a') : null; return r && r.getAttribute ? r.getAttribute('href') : ''; }
    function items() { return Array.prototype.slice.call(panel.querySelectorAll('a[href], button')); }
    function setOpen(on, refocus) {
      isOpen = on; panel.hidden = !on; if (drawer) drawer.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
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
      offered = F.menuOffered(data, now);
      draw();
    };
    // About / Privacy / Terms need only two flags, not all 1,249 listings (1.0 baseline: -75 KB gz): data/offered.json, kept in step with
    // listings.json by tests/offered-json.test.js. If it cannot be read the menu simply keeps its disabled items.
    // /brands/: the approved brands as a grid of tiles (behind site.json brandsPublic); nothing is drawn while it is off or empty (the page keeps its explanation)
    if (page === 'brands' && window.FMW_BRANDS) window.FMW_BRANDS.list(window, 48).then(function (rows) {
      var art = doc.getElementById('info'); if (!art || !rows.length) return;
      var sec = el('section', 'card brand-grid'), ul = el('ul', 'brand-list'); sec.appendChild(el('h2', null, C.brandsTitle));
      rows.forEach(function (b) { var li = el('li', 'brand-slide'); li.appendChild(window.FMW_BRANDS.tile(doc, window, b, 'brand-tile brand-real', function (s) { return HERE(window.FMW_BRANDS.href(s)); })); ul.appendChild(li); });
      var prose = art.querySelector('.prose'); if (prose) prose.hidden = true;   // "Brands are coming / no brands are listed until then" is no longer true once brands exist
      sec.appendChild(ul); var h1 = art.querySelector('h1'); if (h1 && h1.nextSibling) art.insertBefore(sec, h1.nextSibling); else art.appendChild(sec);
    });
    if (page === 'about' || page === 'privacy' || page === 'terms') window.fetch('data/offered.json', { cache: 'no-store' }).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (o) {
      if (o && typeof o.storefront === 'boolean' && typeof o.delivery === 'boolean') { offered = { storefront: o.storefront, delivery: o.delivery, 'delivery-nonstore': o.delivery }; draw(); }
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

  // LOCATION (owner direction 2026-11-26): a button opens State -> County (filtered by the state) -> City (filtered by the county). The choice is written into the form's own area select (the one source
  // of truth the URL, the last-known area and the map already use), so every existing path keeps working; the select itself is no longer shown.
  function fillLocation(data, p) {
    var st = doc.getElementById('loc-state'), co = doc.getElementById('loc-county'), ci = doc.getElementById('loc-city'), now = new Date(); if (!st || !co || !ci) return;
    var tree = F.locationTree(data, now), cityName = matchCity(F.cities(data, now), p.city), countyName = matchCounty(F.counties(data, now), p.county);
    if (cityName && !countyName) tree.counties.forEach(function (c) { if (c.cities.some(function (x) { return F.placeKey(x) === F.placeKey(cityName); })) countyName = c.name; });
    var opts = function (sel, first, list) { while (sel.firstChild) sel.removeChild(sel.firstChild); [first].concat(list).forEach(function (o) { var op = doc.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); }); };
    opts(st, ['CA', tree.state], []);
    opts(co, ['', C.locAllCounties], tree.counties.map(function (c) { return [c.name, C.countyName(c.name)]; }));
    var cur = null; tree.counties.forEach(function (c) { if (countyName && F.countyKey(c.name) === F.countyKey(countyName)) cur = c; });
    opts(ci, ['', C.locAllCities], cur ? cur.cities.map(function (x) { return [x, x]; }) : []);
    ci.disabled = !cur; co.value = cur ? cur.name : ''; ci.value = cityName && cur ? cityName : '';
    var now2 = doc.getElementById('loc-now'); if (now2) { now2.textContent = cityName || (cur ? C.countyName(cur.name) : tree.state);
      // the place name also goes in the button's accessible name and tooltip: on a narrow phone the pill shows only the pin (the name is hidden), and a hidden name is not announced
      var lb = doc.getElementById('loc-btn'); if (lb && lb.setAttribute) { lb.setAttribute('aria-label', C.locButton + ': ' + now2.textContent); lb.setAttribute('title', now2.textContent); } }
  }

  function load() { return F.loadData(window.fetch.bind(window), 'data/listings.json'); }
  // The listing page needs ONE listing: the small index (data/listings-index.json) + that listing's county file (data/counties/<key>.json), assembled into the full data shape
  // (the other rows are light rows, enough for the menu flags). An unknown id keeps the not-found page; any failure, or a county file that lacks the license, falls back to the
  // whole data/listings.json as before. tests/listing-split.test.js proves the listing and the menu flags are identical.
  function loadListing(id) {
    var want = String(id || '').toLowerCase();
    return F.loadPart(F.fetchOf(window), 'data/listings-index.json', function (d) { return d && Array.isArray(d.places) && Array.isArray(d.listings) && d.listings.length > 0 && d.listings.every(function (r) { return r && typeof r.county === 'string' && !r.address; }); })
      .then(function (idx) {
        var row = null; idx.listings.forEach(function (r) { if (!row && String(r.license || '').toLowerCase() === want) row = r; });
        if (!row) return F.assembleHome(idx, {});
        var k = F.countyFileKey(row.county);
        return F.loadPart(F.fetchOf(window), 'data/counties/' + k + '.json', function (d) { return d && d.county === k && Array.isArray(d.listings); }).then(function (cf) {
          if (!cf.listings.some(function (l) { return String(l.license || '').toLowerCase() === want; })) return load();
          var files = {}; files[k] = cf; return F.assembleHome(idx, files);
        });
      }).catch(function () { return load(); });
  }
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
      if (act.href) { n = el('a', 'btn ghost', act.text); n.href = /^[?#]/.test(act.href) ? act.href : HERE(act.href); }   // a page link is root-absolute on the 404 and the per-county pages
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
  function clear(n) { if (!n) return; while (n.firstChild) n.removeChild(n.firstChild); }

  // About / Privacy / 404: plain-text sections from copy.js (C.info[page]); textContent only.
  if (page === 'about' || page === 'privacy' || page === 'help' || page === 'notfound') {
    var info = C.info[page], box = doc.getElementById('info');
    box.appendChild(el('h1', 'name', info.title));
    info.sections.forEach(function (sec) {
      var s = el('section', 'card prose');
      if (sec.h) s.appendChild(el('h2', null, sec.h));
      sec.p.forEach(function (t) { s.appendChild(el('p', null, t)); });
      box.appendChild(s);
    });
    if (info.back) { var b = el('a', 'btn', info.back); b.href = ((window.FMW_CONFIG && window.FMW_CONFIG.basePath) || '') + '/'; box.appendChild(b); }   // 404 can be at any depth: absolute, under basePath
    return;
  }


  // The map (Phase 1): one SVG drawn here from the same results as the list, self-hosted, no tiles, no other request.
  // Each dot is an SVG link to the same detail page as its card, focusable and labelled (C.mapDot). The state / county
  // outline is a SLOT: js/map-outline.js sets window.FMW_OUTLINE (null until a boundary file exists), and the map works
  // the same without it. Text goes in with textContent only.
  function detailHref(id) { return HERE('listing.html?id=' + encodeURIComponent(id)) + (location.search ? '&from=' + encodeURIComponent(location.search) : ''); }
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
  // The map page's library (186 KB) + mapview are NOT in the page's blocking scripts: tools/county-pages.js writes them as inert
  // <script type="text/x-lazy" src> placeholders (never fetched by the browser; still stamped by the build). They load here, AFTER the list
  // has drawn on desktop, or on the first Map-tab tap on a phone, so the card list is not competing with ~440 KB of map bytes (390px, throttled 4G).
  var mapLazy = { box: null, results: null, started: false };
  function drawMap(box, results) { window.FMW_MAPVIEW.draw(box, results, { C: C, card: card, onSelect: function (id) { if (mapSelect) mapSelect(id); } }); }
  function isPhone() { return !!(window.matchMedia && window.matchMedia('(max-width:767px)').matches); }
  function loadMapLibs(done) {
    var tags = doc.querySelectorAll('script[type="text/x-lazy"][src]'), i = 0;
    if (!tags.length) { done(false); return; }
    (function next() {
      if (i >= tags.length) { done(true); return; }
      var t = tags[i++], sc = doc.createElement('script');
      sc.src = t.getAttribute('src'); sc.onload = next; sc.onerror = function () { done(false); };
      doc.head.appendChild(sc);
    })();
  }
  function mapKick() {
    if (mapLazy.started || !mapLazy.box || window.FMW_MAPVIEW) return;
    var phone = isPhone();
    if (phone && !(doc.body.className || '').match(/(^|\s)view-map(\s|$)/)) return;   // phone, List view: the map is not on screen, nothing to load yet
    mapLazy.started = true;
    var go = function () {
      loadMapLibs(function (ok) {
        if (ok && window.FMW_MAPVIEW) { drawMap(mapLazy.box, mapLazy.results); return; }
        var b = mapLazy.box; b.hidden = false; clear(b); var p = el('p', 'muted map-note', C.mapPage.loadFailed); b.appendChild(p);
      });
    };
    if (phone || !window.requestIdleCallback) go(); else window.requestIdleCallback(go, { timeout: 1200 });
  }
  function renderMap(box, data, results) {
    if (doc.body.getAttribute('data-map') === '1') {
      if (window.FMW_MAPVIEW) { drawMap(box, results); return; }
      mapLazy.box = box; mapLazy.results = results;
      if (!isPhone()) box.hidden = false;   // desktop: the map column exists from the first paint, so the list does not shift when the map arrives
      mapKick(); return;
    }
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
    if (m.dropped.length + m.skipped) box.appendChild(el('p', 'muted map-note', C.mapNotShown(m.dropped.length + m.skipped)));   // dots + this number = the list's number
    box.hidden = false;
  }

  // One listing card (approved spec item 8): horizontal, the same fixed size on phone and desktop. A 1:1 branded fallback
  // tile on the left (no shop photos exist, none are faked) and EXACTLY six single-line, truncating lines on the right,
  // unnumbered and unlabelled, in F.cardLines order (name; rating + distance; hours; address; Storefront / Delivery +
  // county; a green check mark + the license number). An empty line 2 keeps its place so every card is the same size.
  // A small map icon (its own button, outside the link) shows the business on the map.
  var showOnMap = function () {};   // set by the home
  var mapSelect = null;   // the map page: a pin was chosen, mark its card
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
    if (typeof window.requestAnimationFrame !== 'function' || list.length <= PAGE_FIRST) { for (; shown < list.length; shown++) out.appendChild(card(list[shown], shown + 1)); say(''); return; }
    function next() {
      var first = shown > 0, end = Math.min(shown + (shown ? PAGE_MORE : PAGE_FIRST), list.length), firstNew = null;
      if (row && row.parentNode) row.parentNode.removeChild(row);
      for (; shown < end; shown++) { var c = card(list[shown], shown + 1); if (!firstNew) firstNew = c; out.appendChild(c); }
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
  var IS_APPLE = /iPhone|iPad|iPod/.test(String(window.navigator && navigator.userAgent || '')) || (/Macintosh/.test(String(window.navigator && navigator.userAgent || '')) && (navigator.maxTouchPoints || 0) > 1);
  // The result card (redesign PR-2): ONE link around the whole card (the name, a kind pill, distance, address, county, the license line and its status chip);
  // the black monogram tile with neon initials is decoration. The two icon buttons (show on the map, Directions) are siblings of the link, never inside it.
  // Joe's Leafly-style card (2026-11-26): ONE link around the whole card with only these rows (F.cardModel): 1 "N. Name", 2 licence type, City ST, whole miles, 3 rating + deals (only when real), 4 today's hours
  // with a dot + Open / Closed (only with real hours), 5 Pickup / Delivery as offered, 6 REC / MED top right. No ordering, no cart. The report / remove link (Grok's condition) sits under the card.
  function card(r, index) {
    var l = r.listing, M = F.cardModel(r, C, index), li = el('li', 'shop'), a = el('a', 'listing');
    li.setAttribute('data-id', l.id);
    a.href = detailHref(l.id);
    var th = el('span', 'thumb', F.monogram(l.name)); th.setAttribute('aria-hidden', 'true');
    var lines = el('span', 'lines');
    var nm = el('h3', 'ln ln-name', M.rank + M.name);
    if (F.isPaid(r)) nm.appendChild(el('span', 'sponsored-tag', ' \u00b7 ' + C.sponsored));   // only a real, labelled paid placement; inside the link, so it is part of its accessible name
    lines.appendChild(nm);
    if (M.line2) lines.appendChild(el('span', 'ln ln-2', M.line2));
    if (M.rating || M.deals) lines.appendChild(el('span', 'ln ln-3', [M.rating, M.deals].filter(Boolean).join(' \u00b7 ')));
    if (M.hours || M.dist) {   // row d: today's open / closed dot (only with real hours) + the whole-mile distance (only with a known location)
      var h = el('span', 'ln ln-hours' + (M.hours ? ' ' + M.hours : ''));
      if (M.hours) { var dot = el('span', 'dot'); dot.setAttribute('aria-hidden', 'true'); h.appendChild(dot); h.appendChild(el('span', null, M.hours === 'open' ? C.cardOpen : C.cardClosed)); }
      if (M.dist) h.appendChild(el('span', 'dist', (M.hours ? ' \u00b7 ' : '') + M.dist));
      lines.appendChild(h);
    }
    if (M.offers.length) { var o = el('span', 'ln ln-offers'); M.offers.forEach(function (t) { o.appendChild(el('span', 'offer', t)); }); lines.appendChild(o); }
    if (M.badge.length) { var bd = el('span', 'rec-badges'); M.badge.forEach(function (t) { var x = el('span', 'rec-badge ' + t.toLowerCase(), t); x.setAttribute('title', t === 'REC' ? C.cardRecLabel : C.cardMedLabel); x.setAttribute('aria-label', t === 'REC' ? C.cardRecLabel : C.cardMedLabel); bd.appendChild(x); }); a.appendChild(bd); }
    a.appendChild(th); a.appendChild(lines); li.appendChild(a);
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
    // Redesign PR-4: an Ads or Deals row with no real entry stays hidden (the old dashed invite boxes are gone; the claim band near the foot of the home replaces them).
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
  var FILTER_COPY = { home: 'fHome', pickup: 'fPickup', medical: 'fMedical', recreational: 'fRecreational', storefront: 'fStorefront', delivery: 'fDelivery', open: 'fOpenNow', deals: 'fDeals', retail: 'fRetail', brands: 'fBrands',
    cultivation: 'fCultivation', manufacturing: 'fManufacturing', distribution: 'fDistribution', testing: 'fTesting', microbusiness: 'fMicrobusiness', eventorg: 'fEventorg', services: 'fServices', events: 'fEvents' };

  // The approved home (owner 2026-11-21 17:53 PT): index.html opens straight on the listing (+ the map on desktop) for an
  // area. The location dropdown, a typed city / ZIP and the filter carousel all refine it IN PLACE (history.pushState; the
  // URL stays shareable). results.html is the SAME view, so old results links keep working.
  // Area: ?area= / ?county= / ?city= / a typed place; with none of them on the home, the visitor's last-known area (saved on
  // this device by js/theme.js, checked against the data), else the county with the most licensed listings.
  if (page === 'results' || page === 'search') {
    var p = params(), out = doc.getElementById('results'), head = doc.getElementById('resultsTitle'), stateBox = doc.getElementById('state'), mapEl = doc.getElementById('map');
    var nearby = doc.getElementById('rail-nearby'), form = doc.getElementById('search'), fbar = doc.getElementById('filterbar'), vtog = doc.getElementById('viewtoggle');
    var AREA = window.FMW_AREA || null, canPush = !!(window.history && history.pushState);
    // the map page (map/): a vector map beside the cards, "Results 1-N", a Sort that offers only orders the data supports; the card list is still the accessible alternative to the map
    // the HOME has no list and no map (Homepage v2: they live at /dispensaries/): the sections only; a typed search, a chip or a city go to /dispensaries/, a county pick redraws the sections in place
    var LISTLESS = page === 'search' && !out;
    // HOME: its sections stay out of the page (CSS .home-pending) until every one has decided, so none pushes another down after the first paint; a 4 s failsafe reveals whatever is there
    var revealHome = function () { var m = doc.getElementById('home'); if (m && m.className) m.className = String(m.className).replace(/\s*\bhome-pending\b/g, ''); };
    if (LISTLESS) setTimeout(revealHome, 4000);
    if (LISTLESS && window.FMW_HOME && window.FMW_HOME.drawPrimeEarly) window.FMW_HOME.drawPrimeEarly({ el: el, clear: clear, HERE: HERE, claims: CLAIMS });   // the Prime banner does not wait for the listings (LCP)
    var MAPPAGE = doc.body.getAttribute('data-map') === '1', rangeEl = doc.getElementById('results-range'), sortSel = doc.getElementById('sort');
    var setRange = function (n) { if (rangeEl) rangeEl.textContent = n ? C.mapPage.resultsRange(n) : ''; };
    // FEATURED strip of a category page (not in the phone's Map view): this category's real paid placements (the county PRIME first, then paid by rank) as cards; with none, honest house slots
    // "Featured spot for <Category> in <County> / Claim a featured spot" (a link to the business sign-up). Never a made-up business.
    var drawFeatured = function (rows) {
      var sec = doc.getElementById('featured'), ul = sec && sec.querySelector ? sec.querySelector('ul') : null; if (!sec || !ul) return;
      clear(ul);
      var kind = doc.body.getAttribute('data-kind') || '', cat = /^business:/.test(kind) ? C.industryCat[kind.slice(9)] || '' : navLabel(kind === 'delivery' ? 'deliveries' : 'storefronts');
      var place = p && p.county ? C.countyName(String(p.county).replace(/\s+county$/i, '')) : C.locDefault;
      var paid = (rows || []).filter(F.isPaid).sort(function (a, b) { return a.listing.placement.rank - b.listing.placement.rank; }).slice(0, 5);
      if (paid.length) paid.forEach(function (r, i) { var li = card(r, i + 1); li.className += ' feat-card'; ul.appendChild(li); });
      else for (var i = 0; i < 2; i++) {
        var li = el('li', 'feat-slot'), a = el('a', 'feat-in'); a.href = CLAIMS ? HERE('signup.html?as=business') : HERE('for-business.html');
        a.appendChild(el('span', 'feat-t', C.featuredSlot(cat, place))); a.appendChild(el('span', 'feat-claim', C.featuredClaim)); li.appendChild(a); ul.appendChild(li);
      }
      sec.hidden = false;
    };
    var featHide = function () { var f = doc.getElementById('featured'); if (f) f.hidden = true; };
    var markCard = function (id) { Array.prototype.forEach.call(out.querySelectorAll ? out.querySelectorAll('li.shop') : [], function (li) { var on = li.getAttribute('data-id') === id; li.className = 'shop' + (on ? ' sel' : ''); if (on && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' }); }); };
    mapSelect = markCard; if (sortSel && sortSel.addEventListener) sortSel.addEventListener('change', function () { run(); });
    // USE MY LOCATION: the coordinates live in this variable ONLY (no URL, no storage, no request); a new search or area choice clears them
    var NEAR = null, nearBusy = false, nearBtn = doc.getElementById('near-me'), nearSay = doc.getElementById('near-status');
    var nearNote = function (text) { if (!nearSay) return; nearSay.textContent = text || ''; nearSay.hidden = !text; };
    fill(form, p);
    var go = function (u) {
      var qs = u.toString();
      if (LISTLESS && (u.get('q') || u.get('f') || /^city:/i.test(u.get('area') || ''))) { location.href = HERE('dispensaries/') + (qs ? '?' + qs : ''); return; }
      if (!canPush) { location.search = qs ? '?' + qs : ''; return; }
      history.pushState(null, '', qs ? '?' + qs : '?');
      p = params(); fill(form, p); run();
    };
    // the current area + q as URL params (a new filter keeps them)
    var areaParams = function (keepChips) {
      var u = new URLSearchParams();
      if (p.q) u.set('q', p.q);
      else if (form && form.area && typeof form.area.value === 'string') u.set('area', form.area.value);
      if (keepChips && p.fs.length) u.set('f', p.fs.join(','));   // the chips stay on when the area or the search changes (Weedmaps style)
      return u;
    };
    if (form && form.addEventListener) {
      // typed city / ZIP: filtered in place, never a trip to results.html (the plain GET stays the no-script fallback)
      form.addEventListener('submit', function (e) {
        NEAR = null; nearNote('');
        if (LISTLESS) { if (form.area && F.cleanQuery(form.q && form.q.value)) form.area.setAttribute('disabled', ''); return; }   // the home: the plain GET to dispensaries/ does the search (a typed place wins over the area pick)
        if (!canPush) return;
        e.preventDefault();
        var q = F.cleanQuery(form.q && form.q.value), u = new URLSearchParams();
        if (q) u.set('q', q); else u.set('area', form.area ? form.area.value : '');
        if (p.fs.length) u.set('f', p.fs.join(','));
        go(u);
      });
      if (form.area && form.area.addEventListener) form.area.addEventListener('change', function () {
        NEAR = null; nearNote('');
        if (AREA) AREA.set(form.area.value);   // the last-known location (this device only)
        if (form.q) form.q.value = '';
        var u = new URLSearchParams(); u.set('area', form.area.value); if (p.fs.length) u.set('f', p.fs.join(',')); go(u);
      });
    }
    // the Location button and its cascade: choosing writes the area, keeps the chips, closes the panel on a final choice
    var locBtn = doc.getElementById('loc-btn'), locPanel = doc.getElementById('loc-panel');
    var locOpen = function (on) { if (!locBtn || !locPanel) return; locPanel.hidden = !on; locBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    if (locBtn && locBtn.addEventListener) {
      locBtn.addEventListener('click', function () { locOpen(locPanel.hidden); });
      doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && locPanel && !locPanel.hidden) { locOpen(false); locBtn.focus(); } });
      var locPick = function (id) {
        var sel = doc.getElementById(id); if (!sel || !sel.addEventListener) return;
        sel.addEventListener('change', function () {
          var co = doc.getElementById('loc-county'), ci = doc.getElementById('loc-city'), v = '';
          if (id === 'loc-city' && ci.value) v = F.areaValue('city', ci.value); else if (id !== 'loc-state' && co.value) v = F.areaValue('county', co.value);
          if (form && form.area) form.area.value = v;
          NEAR = null; nearNote('');
          if (AREA) AREA.set(v);
          if (form && form.q) form.q.value = '';
          var u = new URLSearchParams(); u.set('area', v); if (p.fs.length) u.set('f', p.fs.join(','));
          if (id === 'loc-city' || (id === 'loc-county' && !co.value) || id === 'loc-state') locOpen(false);
          go(u);
        });
      };
      ['loc-state', 'loc-county', 'loc-city'].forEach(locPick);
    }
    // USE MY LOCATION: asks the browser ONLY on this click (never on load). The position is used in this page's memory to sort the shown storefronts; it is not put in the address, not stored
    // on the device in any form and not sent anywhere (the data files are fetched without it).
    if (LISTLESS && nearBtn) nearBtn.hidden = true;   // "use my location" needs the list: it lives on /dispensaries/
    if (nearBtn && nearBtn.addEventListener) nearBtn.addEventListener('click', function () {
      var geo = window.navigator && window.navigator.geolocation;
      if (!geo || !geo.getCurrentPosition) { nearNote(C.nearNoSupport); return; }
      if (nearBusy) return;   // one request at a time
      nearBusy = true; nearBtn.setAttribute('aria-busy', 'true'); nearNote(C.nearAsking);
      geo.getCurrentPosition(function (pos) {
        nearBusy = false; nearBtn.removeAttribute('aria-busy');
        var c = pos && pos.coords;
        if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') { nearNote(C.nearUnavailable); return; }
        NEAR = { lat: c.latitude, lng: c.longitude }; if (form && form.q) form.q.value = '';
        nearNote(C.nearShowing); p = params(); p.q = ''; p.city = ''; p.county = ''; p.hasCounty = false; run();
      }, function (err) {
        nearBusy = false; nearBtn.removeAttribute('aria-busy');
        nearNote(err && err.code === 1 ? C.nearDenied : err && err.code === 3 ? C.nearTimeout : C.nearUnavailable);
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
    });
    if (canPush && window.addEventListener) window.addEventListener('popstate', function () { NEAR = null; nearNote(''); p = params(); fill(form, p); run(); });
    // a chip: ?f=<key> on top of the area (Home = no f). The rows are filtered in place (F.filterRows), the URL stays shareable.
    // MULTI-select (owner direction 2026-11-26): each chip toggles on its own; several can be on at once. An inactive chip (no real data behind it) does nothing.
    if (fbar && fbar.addEventListener) fbar.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-filter]') : null; if (!b || b.getAttribute('aria-disabled') === 'true') return;
      var k = b.getAttribute('data-filter'), on = p.fs.indexOf(k) >= 0, next = F.chipKeys((on ? p.fs.filter(function (x) { return x !== k; }) : p.fs.concat([k])).join(',')), u = areaParams();
      if (next.length) u.set('f', next.join(','));
      go(u);
    });

    // List / Map (owner 19:16 PT). Phone (< 768px): the two buttons under the filter bar switch the card list and the map
    // (body.view-map; CSS shows one of the two). They are THE phone map control: no map icon in the search bar, no swipe.
    // Desktop (768px and up): the buttons are not shown and the map is always beside the cards.
    var view = 'list';
    var setView = function (v) {
      view = v === 'map' ? 'map' : 'list'; bodyClass('view-map', view === 'map');
      if (view === 'map') { if (mapLazy.box && !window.FMW_MAPVIEW) mapLazy.box.hidden = false; mapKick(); }
      if (vtog && vtog.children) Array.prototype.forEach.call(vtog.children, function (b) { if (b.getAttribute) b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false'); });
    };
    if (/[?&]view=map\b/.test(location.search || '') || /^#map$/.test(location.hash || '')) setView('map');   // the drawer's Map link opens the map view on a phone (the desktop shows the map beside the list anyway)
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
    var homeIndex = null, homeFiles = {}, fullFor = null, namesFile = null, namesFor = null;   // namesFor: the typed text whose name search uses the names-only index (data/listings-names.json) + the county files of the matches; fullFor: the fallback when that file cannot be read (the full data/listings.json)
    var bizHits = {}, bizFiles = {}, bizNames = null;
    var loadBizCounty = function (key) { return bizFiles[key] || (bizFiles[key] = F.loadPart(F.fetchOf(window), 'data/business/' + key + '.json', function (d) { return d && Array.isArray(d.listings); })); };
    var loadBizHits = function (q) {
      var names = bizNames ? Promise.resolve(bizNames) : F.loadPart(F.fetchOf(window), 'data/business-names.json', function (d) { return d && Array.isArray(d.names); }).then(function (n) { bizNames = n; return n; });
      return names.then(function (n) {
        var hits = F.bizNameMatches(n, q, 30), want = {}, keys = [];
        hits.forEach(function (h) { want[h[0]] = true; if (keys.indexOf(h[3]) < 0 && keys.length < 6) keys.push(h[3]); });
        return Promise.all(keys.map(loadBizCounty)).then(function (files) {
          var rows = []; files.forEach(function (f) { f.listings.forEach(function (l) { if (want[l.id]) rows.push({ listing: l, miles: null, known: false }); }); });
          return rows;
        });
      });
    };
    var loadNames = function () { return namesFile ? Promise.resolve(namesFile) : F.loadPart(F.fetchOf(window), 'data/listings-names.json', function (d) { return d && Array.isArray(d.names) && d.names.length > 0; }).then(function (d) { namesFile = d; return d; }); };
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
        if (namesFor === p.q && namesFile) F.nameCountyKeys(homeIndex, F.nameIds(namesFile, p.q)).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });   // + the counties of the listings whose NAME matches the typed text
        if (!keys.length) return p.q || p.county || p.city ? F.assembleHome(homeIndex, {}) : load();   // an unknown area / place stays light (same "not found"); the whole state needs every row
        return Promise.all(keys.map(function (k) {
          return homeFiles[k] ? homeFiles[k] : F.loadPart(F.fetchOf(window), 'data/counties/' + k + '.json', function (d) { return d && d.county === k && Array.isArray(d.listings); }).then(function (d) { homeFiles[k] = d; return d; });
        })).then(function (list) { var f = {}; keys.forEach(function (k, i) { f[k] = list[i]; }); return F.assembleHome(homeIndex, f); });
      }).then(null, function () { return load(); });   // any failure: the full file, as before
    };
    // /<category>/<county>/ (tools/county-pages.js): the page lists one non-retail category of one county from data/business/<county>.json (no coordinates, so no map). Once the visitor
    // picks anything (a search, an area, a pill) the URL has a query and the normal search takes over.
    var BIZ = DEEP && /^business:/.test(doc.body.getAttribute('data-kind') || '') && !location.search;
    var runBusiness = function () {
      var cat = doc.body.getAttribute('data-kind').slice(9), fixed = doc.body.getAttribute('data-county');
      // a county page has its county; the category page (/cultivation/) uses the picked county (?area=county:...), else the county with the most rows of that category
      var keyP = fixed ? Promise.resolve(F.countyFileKey(fixed)) : p.hasCounty && p.county ? Promise.resolve(F.countyFileKey(p.county)) :
        F.loadPart(F.fetchOf(window), 'data/business-summary.json', function (d) { return d && d.categories && typeof d.categories === 'object'; }).then(function (d) {
          var cs = (d.categories[cat] && d.categories[cat].counties) || {}, best = '', top = -1; Object.keys(cs).forEach(function (k) { if (cs[k] > top) { top = cs[k]; best = k; } }); return best;
        });
      keyP.then(function (key) { return F.loadPart(F.fetchOf(window), 'data/business/' + key + '.json', function (d) { return d && Array.isArray(d.listings); }); }).then(function (d) {
        var rows = d.listings.filter(function (l) { return l.category === cat && l.published === true; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }).map(function (l) { return { listing: l, miles: null, known: false }; });
        if (!rows.length) { showState(stateBox, { name: 'filter-empty', body: C.filterEmptyOther, actions: [{ text: C.showAll, href: HERE('index.html') }] }); return; }
        // paid placements from the server (js/placements.js; dormant until site.json "placements" is true): they mark rows already in this county file; any failure leaves the rows as they are
        var PL = window.FMW_PLACEMENTS, finish = function () {
          // FEATURED first (real paid placements only: the county PRIME listing, then the paid ones by rank); with none, Featured is not drawn and every listing shows as free
          var paid = rows.filter(F.isPaid).sort(function (a, b) { return a.listing.placement.rank - b.listing.placement.rank; }), free = rows.filter(function (r) { return !F.isPaid(r); });
          if (MAPPAGE && sortSel && sortSel.value === 'name') free.sort(function (a, b) { return String(a.listing.name).localeCompare(String(b.listing.name)); });
          rows = paid.concat(free); setRange(rows.length); drawFeatured(rows);
          showCards(out, rows);
          if (paid.length) { var fh = el('li', 'feat-head', C.featuredHeading); fh.setAttribute('role', 'presentation'); out.insertBefore(fh, out.firstChild); }
          if (mapEl) renderMap(mapEl, null, rows);
          if (nearby) nearby.hidden = false;
        };
        (PL ? PL.load(window, d.county, cat) : Promise.resolve([])).then(function (slots) { if (PL) PL.apply(rows, slots); }, function () {}).then(finish);
      }, function (e) { loadFailed(e, head, stateBox, run); });
      loadHomeIndex().then(function (data) { fillArea(form, data, p); fillLocation(data, p); drawFilters(data, p.fs); menuData(data); }, function () {});
    };
    var run = function () {
      mapToken++; clear(out); clear(stateBox); head.textContent = ''; head.hidden = false; setRange(0); featHide(); if (mapEl && !MAPPAGE) { clear(mapEl); mapEl.hidden = true; }
      if (nearby) nearby.hidden = true;
      if (BIZ) { runBusiness(); return; }
      var light = page === 'search' || page === 'results';
      (light && !NEAR && fullFor !== p.q ? loadHomeIndex() : load()).then(function (data) {
        menuData(data);
        var now = new Date();
        if (page === 'search' && !NEAR && !p.q && !p.city && !p.hasCounty) {
          // the home's area: the last-known one (if the data still has it), else the busiest county
          var saved = AREA ? AREA.get() : null;
          if (saved != null && F.areaKnown(data, saved, now)) { var sa = F.parseArea(saved); p.county = sa.kind === 'county' ? sa.name : ''; if (sa.kind === 'city') p.city = sa.name; }
          else p.county = F.topCounty(data, now);
        }
        return light && !NEAR ? withAreaFiles(data, p) : data;
      }).then(function (data) {
        var now = new Date();
        fillArea(form, data, p); fillLocation(data, p);
        PROMO(data);
        if (LISTLESS) {
          head.textContent = ''; drawFilters(data, p.fs.length ? p.fs : []); drawBrowse(data);
          var hc = matchCounty(F.counties(data, now), p.county) || F.topCounty(data, now);
          var homeDone = [drawIndustry(hc)];
          if (window.FMW_HOME) homeDone.push(window.FMW_HOME.draw({ data: data, county: hc, card: card, el: el, clear: clear, HERE: HERE, claims: CLAIMS }));
          Promise.all(homeDone).then(revealHome, revealHome);
          return;
        }
        var res = F.search(data, NEAR ? { near: NEAR } : p, now);
        if (NEAR && res.results) res.results = res.results.slice(0, 30);   // the nearest 30; rows with no coordinates (delivery-only) sort after the located ones
        // NAME SEARCH (Joe 2026-11-25): the light files have no business names. A typed text that is not a place may still be a business name: read the NAMES-ONLY index
        // (data/listings-names.json: id + name, ~14 KB gz, built from the same listings), load the county files of the listings whose name matches, and search again: the same rows in the
        // same order as the full file gives. A place that is found draws at once; the names index is then read in the background and the page is redrawn only when a business NAME
        // outside the place also matches. If the names file cannot be read, the full listings.json is used instead, as before.
        // SEARCH ALL (retail + delivery + the non-retail licences): a typed business name that is not a place also looks in the non-retail names index (data/business-names.json);
        // the matching rows come from their county files and are appended to the list (no coordinates, so they are in the list only). Read in the background, then the page is redrawn once.
        var bizTry = !res.place && (!p.fs.length || p.seeded) && F.classify(p.q).kind === 'city' && F.classify(p.q).value.length >= 3, extra = [];
        if (bizTry) {
          if (bizHits[p.q] === undefined) { bizHits[p.q] = []; var typedQ = p.q; loadBizHits(typedQ).then(function (rows) { if (rows.length && p.q === typedQ) { bizHits[typedQ] = rows; run(); } }, function () {}); }
          extra = bizHits[p.q] || [];
        }
        if (extra.length) { res = { place: res.place, results: (res.results || []).concat(extra), filtered: res.filtered }; }
        var nameTry = data.light && namesFor !== p.q && fullFor !== p.q && F.classify(p.q).kind === 'city' && F.classify(p.q).value.length >= 3;
        if (nameTry && res.notFound && res.reason === 'city') {
          return loadNames().then(function () { namesFor = p.q; return run(); }, function () { fullFor = p.q; return run(); });
        }
        if (nameTry && !res.notFound && res.place) {
          var typed = p.q, have = {};
          res.results.forEach(function (r) { have[String(r.listing.id)] = true; });
          loadNames().then(function (n) { if (p.q === typed && namesFor !== typed && F.nameIds(n, typed).some(function (id) { return !have[id]; })) { namesFor = typed; run(); } }, function () {});
        }
        if (res.notFound) {
          drawFilters(data, p.fs);
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
        // the chips ON: ?f=a,b (several at once), else an old ?delivery= / ?open= / ?storefront= link the data honours
        var fs = p.fs.length ? p.fs : p.delivery && F.deliveryOffered(data, now) ? ['delivery'] : p.openNow && F.openNowOffered(data, now) ? ['open'] : p.storefront ? ['storefront'] : [];
        if (p.seeded && extra.length) fs = [];   // a typed business name searches ALL: the page's own preset chip (Storefronts) does not hide the non-retail matches
        drawFilters(data, fs);
        drawBrowse(data);
        var homeCounty = matchCounty(F.counties(data, new Date()), p.county) || F.topCounty(data, new Date());
        drawIndustry(homeCounty);
        if (window.FMW_HOME) window.FMW_HOME.draw({ data: data, county: homeCounty, card: card, el: el, clear: clear, HERE: HERE, claims: CLAIMS });
        var placeName = res.place && res.place.name, cityName = matchCity(F.cities(data, now), p.city);
        // only a county chosen (no city): the heading says "in Los Angeles County", the way it names a chosen city (#69)
        var countyName = matchCounty(F.counties(data, now), p.county);
        if (!cityName && countyName) cityName = C.countyName(countyName);
        if (!res.results.length) {
          head.textContent = C.emptyTitle(placeName || cityName);
          showState(stateBox, { name: 'no-results', body: C.emptyBody,
            actions: res.filtered ? [{ text: C.clearFilters, href: 'dispensaries/?q=' + encodeURIComponent(p.q) }] : [] });
          return;
        }
        // a chip: only the area's rows with a REAL value for it. None: say so plainly (never invented rows), one way back.
        CATS(data, res.results);
        // a city view (?area=city:<name>) is a landing page: its own title, description, canonical and sr-only heading (no visible count: owner ruling 2026-11-22)
        if (p.city && !p.q) { var seoCityName = matchCity(F.cities(data, now), p.city); if (seoCityName) seoApply(F.seoCity(seoCityName, res.results.length, SEO_BASE, SEO_CLEAN)); }
        // MULTI-select chips: the TYPE chips are OR'd, the attribute chips AND'd (F.filterRowsMulti). The license categories live in their own county files: loaded for the active county once, then cached.
        var cityPlaceForDelivery = res.place || (p.city && !p.county ? F.cityPlace(data, p.city) : null);   // a typed place, or a city chosen from the area list
        var needBiz = fs.some(function (k) { return BIZ_CHIPS.indexOf(k) >= 0; }), bizKey = F.countyFileKey(activeCounty(data, now));
        if (needBiz && bizCache[bizKey] === undefined) {
          bizCache[bizKey] = [];
          return F.loadPart(F.fetchOf(window), 'data/business/' + bizKey + '.json', function (d) { return d && Array.isArray(d.listings); }).then(function (d) {
            bizCache[bizKey] = d.listings.map(function (l) { return { listing: l, miles: null, known: false }; }); run();
          }, function () { run(); });
        }
        var base = res.results;
        // the Delivery chip in a CITY search: the delivery services licensed in the city's county, each marked as such (F.deliveryInCityCounty; the card says so, never "delivers to you")
        if (fs.indexOf('delivery') >= 0 && cityPlaceForDelivery) base = F.deliveryCityRows(data, cityPlaceForDelivery, now, base);
        var rows = fs.length ? F.filterRowsMulti(data, base, fs, needBiz ? (bizCache[bizKey] || []) : []) : res.results;
        if (!rows.length) {
          head.textContent = C.filterEmptyTitle(fs.map(function (k) { return C[FILTER_COPY[k]]; }).join(' + '), placeName || cityName);
          showState(stateBox, { name: 'filter-empty', body: fs.indexOf('open') >= 0 ? C.filterEmptyOpen : C.filterEmptyOther,
            actions: [{ text: C.showAll, onClick: function () { go(areaParams()); } }] });
          return;
        }
        res = { place: res.place, results: F.orderCards(rows) };
        if (MAPPAGE && sortSel && sortSel.value === 'name') res.results = res.results.slice().sort(function (a, b) { return String(a.listing.name).localeCompare(String(b.listing.name)); });
        setRange(res.results.length); if (MAPPAGE) drawFeatured(res.results);
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
    // the chips with real data behind them (F.chipsOffered), plus the active one when an old link names a chip that is not offered (so what is pressed is always on the bar)
    var chipKeys = function (data, active) {
      var keys = F.chipsOffered(data, new Date());
      if (active && active !== 'home' && F.FILTERS.indexOf(active) >= 0 && keys.indexOf(active) < 0) keys = F.FILTERS.filter(function (k) { return keys.indexOf(k) >= 0 || k === active; });
      return keys;
    };
    // Redesign PR-4: "Browse by area" tiles (home only: the section exists only in index.html) from the real county counts; no tiles, no section.
    var drawBrowse = function (data) {
      var sec = doc.getElementById('browse-area'), ul = sec && sec.querySelector ? sec.querySelector('ul') : null;
      if (!sec || !ul) return;
      clear(ul);
      // plain crawlable links (Homepage v2): a county goes to its own page (dispensaries/<county>/), a city to the dispensaries page for that city.
      // Joe 2026-11-27: a card is ONE line (the name only); the "All counties" / "All cities" BUTTON sits right after the section title and opens the rest in place.
      var countyTile = function (t) {
        var li = el('li', 'area-tile'), a = el('a', 'area-in'), nm = C.countyName(t.name.replace(/\s+county$/i, ''));
        a.href = 'dispensaries/' + F.countyFileKey(t.name) + '/';
        a.setAttribute('aria-label', C.browseTileLabel(nm, t.count));
        a.appendChild(el('span', 'area-name', t.name.replace(/\s+county$/i, '')));
        li.appendChild(a); return li;
      };
      // the button (after the title) and the list it opens (the rest of the items, hidden until pressed)
      var moreButton = function (head, label, rest, build, listClass, listId) {
        if (!rest.length) return null;
        var btn = el('button', 'seeall-btn', label), rul = el('ul', listClass); btn.type = 'button';
        rul.id = listId; rul.hidden = true; btn.setAttribute('aria-controls', listId); btn.setAttribute('aria-expanded', 'false');
        rest.forEach(function (t) { rul.appendChild(build(t)); });
        btn.addEventListener('click', function () { var open = rul.hidden; rul.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); });
        head.appendChild(btn); return rul;
      };
      var all = F.areaTiles(data, new Date(), 0), top = all.slice(0, 10), rest = all.slice(10);
      top.forEach(function (t) { ul.appendChild(countyTile(t)); });
      var old = sec.querySelectorAll ? sec.querySelectorAll('.top-cities, .seeall-btn, .area-rest') : [];
      Array.prototype.forEach.call(old, function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      var head = sec.querySelector ? sec.querySelector('.row-head') : null, restUl = head ? moreButton(head, C.browseAllCounties, rest, countyTile, 'area-tiles area-rest', 'area-rest-counties') : null;
      if (restUl) sec.insertBefore(restUl, ul.nextSibling);
      var cities = F.cityTiles(data, new Date(), 5000);
      if (cities.length) {
        var cb = el('div', 'top-cities'), ch = el('div', 'row-head'), cu = el('ul', 'area-tiles city-tiles');
        var cityTile = function (t) {
          var li = el('li', 'area-tile'), a = el('a', 'area-in'); a.href = 'dispensaries/?area=' + encodeURIComponent(F.areaValue('city', t.name));
          a.setAttribute('aria-label', C.browseCityLabel(t.name, t.count)); a.appendChild(el('span', 'area-name', t.name)); li.appendChild(a); return li;
        };
        cities.slice(0, 10).forEach(function (t) { cu.appendChild(cityTile(t)); });
        ch.appendChild(el('h3', null, C.browseCitiesTitle));
        var crest = moreButton(ch, C.browseAllCities, cities.slice(10), cityTile, 'area-tiles city-tiles area-rest', 'area-rest-cities');
        cb.appendChild(ch); cb.appendChild(cu); if (crest) cb.appendChild(crest); sec.appendChild(cb);
      }
      sec.hidden = top.length === 0;
    };
    // Homepage layout v2, rows 9-14: the non-retail categories. Counts from data/business-summary.json; the cards of the chosen county from data/business/<county>.json (read only when this section
    // exists, i.e. on the home). A category with none statewide is not drawn; one with none in the county says so plainly and gives the statewide number (no invented link).
    var industry = { summary: null, files: {} };
    var navLabel = function (k) { var f = (C.NAV_MENU || []).filter(function (i) { return i.key === k; })[0]; return f ? f.label : k; };
    var drawIndustry = function (county) {
      var sec = doc.getElementById('industry'); if (!sec || !sec.querySelector || !county) return Promise.resolve();
      var tiles = sec.querySelector('ul'), rowsBox = sec.querySelector('.industry-rows'), key = F.countyFileKey(county), name = C.countyName(String(county).replace(/\s+county$/i, ''));
      var sumP = industry.summary ? Promise.resolve(industry.summary) : F.loadPart(F.fetchOf(window), 'data/business-summary.json', function (d) { return d && d.categories && typeof d.categories === 'object'; });
      var fileP = industry.files[key] ? Promise.resolve(industry.files[key]) : F.loadPart(F.fetchOf(window), 'data/business/' + key + '.json', function (d) { return d && Array.isArray(d.listings); }).then(function (d) { industry.files[key] = d; return d; }, function () { return { listings: [] }; });
      return Promise.all([sumP, fileP]).then(function (both) {
        industry.summary = both[0]; var sum = both[0].categories, listings = both[1].listings || [];
        clear(tiles); clear(rowsBox);
        var cats = Object.keys(C.industryCat).filter(function (k) { return sum[k] && sum[k].count > 0; });
        // the carousel (Joe 2026-11-27): Services first (the default), then Storefront, Delivery and the licence categories, in ORDER; each card is 3:2 and shows the NAME ONLY.
        // A card links to its page, or jumps to its row below when that category has rows; one with nothing yet stays visible but is not linked (no dead link).
        var ORDER = ['services', 'retail', 'delivery', 'cultivation', 'manufacturing', 'distribution', 'testing', 'microbusiness', 'eventorg'];
        var PAGES_OF = { services: 'services/', retail: 'dispensaries/', delivery: 'delivery/' };
        ORDER.forEach(function (k, i) {
          var has = !!(sum[k] && sum[k].count > 0), href = PAGES_OF[k] || (has ? '#cat-' + k : '');
          var li = el('li', 'cat-tile-i'), a = href ? el('a', 'cat-tile-in') : el('span', 'cat-tile-in cat-tile-off');
          if (href) a.href = href; else a.setAttribute('aria-disabled', 'true');
          if (i === 0) a.className += ' cat-tile-default';
          a.appendChild(el('span', 'cat-tile-name', C.industryCarousel['car_' + k]));
          li.appendChild(a); tiles.appendChild(li);
        });
        cats.forEach(function (k) {
          var inCounty = listings.filter(function (l) { return l.category === k && l.published === true; }), nCounty = (sum[k].counties && sum[k].counties[key]) || inCounty.length;
          var row = el('section', 'industry-row'); row.id = 'cat-' + k;
          var rh = el('div', 'row-head'); rh.appendChild(el('h3', null, C.industryCat[k])); row.appendChild(rh);
          if (!inCounty.length) row.appendChild(el('p', 'muted', C.industryNone(name, sum[k].count)));
          else {
            var shown = inCounty.slice(0, 12);
            var va = el('a', 'seeall', C.industryViewAll); va.href = k + '/' + key + '/'; va.setAttribute('aria-label', C.industryViewAllLabel(C.industryCat[k], name)); rh.appendChild(va);
            var ul = el('ul', 'listings hscroll-cards'); ul.setAttribute('tabindex', '0'); ul.setAttribute('aria-label', C.industryRowLabel(C.industryCat[k], name));
            shown.forEach(function (l, i) { ul.appendChild(card({ listing: l, miles: null, known: false }, i + 1)); });
            row.appendChild(ul);
          }
          rowsBox.appendChild(row);
        });
        sec.hidden = false;
      }, function () { sec.hidden = true; });
    };
    // The chip row: ALL twelve chips are drawn (Weedmaps style); a chip is LIT (enabled) only when real data backs it (F.chipsLit: the shown rows, and the business summary for the license
    // categories). An unbacked chip stays visible but inactive (aria-disabled); a pressed one is always enabled so it can be turned off.
    var BIZ_CHIPS = ['cultivation', 'manufacturing', 'distribution', 'testing', 'microbusiness'], bizSummary = null, bizAsked = false, bizCache = {}, lastChipData = null, lastChipFs = [];
    var loadBizSummary = function () {
      if (bizAsked) return; bizAsked = true;
      try { F.loadPart(F.fetchOf(window), 'data/business-summary.json', function (d) { return d && d.categories && typeof d.categories === 'object'; }).then(function (sm) { bizSummary = sm; if (lastChipData) drawFilters(lastChipData, lastChipFs); }, function () {}); } catch (e) { /* no fetch: the categories stay inactive */ }
    };
    var drawFilters = function (data, fs) {
      if (!fbar) return;
      lastChipData = data; lastChipFs = fs || [];
      var lit = F.chipsLit(data, new Date(), bizSummary), on = lastChipFs;
      clear(fbar);
      var icon = function (kind) {
        var g = svg('svg', { 'class': 'ico', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
        if (kind === 'tag') { g.appendChild(svg('path', { d: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z' })); g.appendChild(svg('circle', { cx: 7.5, cy: 7.5, r: 1.5 })); }
        else g.appendChild(svg('path', { d: 'm6 9 6 6 6-6' }));   // the chevron of a dropdown chip
        return g;
      };
      F.CHIP_KEYS.forEach(function (k) {
        var isLit = lit.indexOf(k) >= 0, pressed = on.indexOf(k) >= 0, b = el('button', 'fchip' + (isLit || pressed ? '' : ' off')); b.type = 'button';
        if (k === 'deals') b.appendChild(icon('tag'));
        b.appendChild(el('span', null, C[FILTER_COPY[k]]));
        b.setAttribute('data-filter', k); b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        if (!isLit && !pressed) b.setAttribute('aria-disabled', 'true');
        fbar.appendChild(b);
        // Products and Brand: dropdown chips right after Curbside pickup. They list real options only (F.dropdownOptions); with none they are dimmed and aria-disabled, never a fake list.
        if (k === 'pickup') F.DROPDOWN_CHIPS.forEach(function (d) {
          var has = F.dropdownOptions(data, d).length > 0, db = el('button', 'fchip dd' + (has ? '' : ' off')); db.type = 'button';
          db.appendChild(el('span', null, d === 'products' ? C.fProducts : C.fBrandMenu)); db.appendChild(icon('chevron'));
          db.setAttribute('data-dropdown', d); db.setAttribute('aria-haspopup', 'listbox'); db.setAttribute('aria-expanded', 'false');
          if (!has) db.setAttribute('aria-disabled', 'true');
          fbar.appendChild(db);
        });
      });
      loadBizSummary();
    };
    // the county the page is showing (for the license-category files): a chosen county, else the county of a chosen city, else the busiest one
    var activeCounty = function (data, now) {
      var c = matchCounty(F.counties(data, now), p.county); if (c) return c;
      if (p.city) { var t = F.locationTree(data, now).counties, k = F.placeKey ? F.placeKey(p.city) : String(p.city).toLowerCase(); for (var i = 0; i < t.length; i++) if (t[i].cities.some(function (x) { return (F.placeKey ? F.placeKey(x) : x.toLowerCase()) === k; })) return t[i].name; }
      return F.topCounty(data, now);
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
    back.href = 'dispensaries/' + (from && from.charAt(0) === '?' ? from : '');
    // a BRAND page (listing.html?id=brand-<32 hex>, behind site.json brandsPublic): the brand's own public card, read from the public brand RPC; never a licence, never storefront data
    var BR = /^brand-([0-9a-f]{32})$/.exec(String(lp.id || '').toLowerCase());
    if (BR && window.FMW_BRANDS && window.FMW_BRANDS.enabled(window)) {
      back.href = HERE('brands/');
      window.FMW_BRANDS.detail(window, BR[1]).then(function (d) {
        clear(box);
        if (!d) { doc.title = C.listingMissingDocTitle; box.appendChild(el('h1', 'name', C.listingMissingTitle)); showState(box, { name: 'listing-missing', body: C.listingMissingBody, actions: [{ text: C.backToSearch, href: 'index.html' }] }); return; }
        var nm = String(d.profile.display_name); doc.title = nm + ' · Find My Weed';
        box.appendChild(el('h1', 'name', nm)); if (d.profile.tagline) box.appendChild(el('p', 'lp-line2 muted', String(d.profile.tagline)));
        if (window.FMW_LISTING && window.FMW_LISTING.draw) window.FMW_LISTING.draw(doc, box, d, window.FMW_CONFIG && window.FMW_CONFIG.authProject && window.FMW_CONFIG.authProject.url);
      });
      return;
    }
    // an EVENT's own page (listing.html?id=event-<uuid>, only while site.json "events" is on)
    if (EVENTS_ON && /^event-/.test(String(lp.id || '').toLowerCase())) { back.href = HERE('events.html'); withEvents(function (EP) { EP.mountDetail(window, doc, box, String(lp.id).toLowerCase().replace(/^event-/, ''), { copy: C, allHref: HERE('events.html'), createHref: HERE('signup.html?as=organizer') }); }); return; }
    // a STATIC brand page (listing.html?id=brand-<slug>): js/brand-static.js draws a real brand from data/brands.json on the shared account template
    if (!BR && window.FMW_BRAND_STATIC && window.FMW_BRAND_STATIC.matches(lp.id)) { back.href = HERE('brands/'); window.FMW_BRAND_STATIC.mount(window, doc, box, lp.id, { copy: C, claimHref: HERE('signup.html?as=business'), signinHref: HERE('signup.html?as=organizer&mode=signin'), missing: function (b) { b.appendChild(el('h1', 'name', C.listingMissingTitle)); showState(b, { name: 'listing-missing', body: C.listingMissingBody, actions: [{ text: C.backToSearch, href: 'index.html' }] }); } }); return; }
    var runListing = function () {
    clear(box);
    // a cultivation / manufacturing / distribution / testing / microbusiness card links here too: its record is in data/business/<county>.json (found through data/business-names.json), not in the storefront data
    var withBusiness = function (data) {
      if (!lp.id || F.byId(data, lp.id)) return data;
      var want = String(lp.id).toLowerCase();
      return F.loadPart(F.fetchOf(window), 'data/business-names.json', function (d) { return d && Array.isArray(d.names); }).then(function (nm) {
        var row = nm.names.filter(function (r) { return r && r[0] === want; })[0]; if (!row || !/^[a-z0-9-]+$/.test(String(row[3]))) return data;
        return F.loadPart(F.fetchOf(window), 'data/business/' + row[3] + '.json', function (d) { return d && Array.isArray(d.listings); }).then(function (cf) {
          var rec = cf.listings.filter(function (x) { return x && x.id === want && x.published === true; })[0];
          return rec ? Object.assign({}, data, { listings: (data.listings || []).concat([rec]) }) : data;
        });
      }).catch(function () { return data; });
    };
    loadListing(lp.id).then(withBusiness).then(function (data) {
      menuData(data);
      var l = lp.id ? F.byId(data, lp.id) : null;
      if (!l) {
        var miss = function () {
          doc.title = C.listingMissingDocTitle;   // a deep link to an unknown id is a styled not-found page, never blank
          box.appendChild(el('h1', 'name', C.listingMissingTitle));
          showState(box, { name: 'listing-missing', body: C.listingMissingBody, actions: [{ text: C.backToSearch, href: 'index.html' }] });
        };
        if (window.FMW_LISTING && window.FMW_LISTING.mountMissing) window.FMW_LISTING.mountMissing(doc, box, lp.id, miss);
        else miss();
        return;
      }
      seoApply(F.seoListing(l, SEO_BASE, SEO_CLEAN));
      // an EVENT ORGANIZER record is drawn on the shared account template (js/organizer-page.js)
      if (window.FMW_ORGANIZER_PAGE && window.FMW_ORGANIZER_PAGE.matches(l) && window.FMW_ORGANIZER_PAGE.mount(window, doc, box, l, { copy: C, claimHref: HERE('signup.html?as=organizer'), record: F.dccRecordUrl(l.license) })) return;
      var s = F.openState(l, new Date());
      // The header, in the same Leafly style as the cards (owner direction 2026-11-26): name + REC / MED, licence type · city, ST, rating / deals, today's open / closed dot, Pickup / Delivery.
      // Every row is read from the record by F.cardModel (the card's own function) and appears ONLY with real data; distance needs a known location, which this page does not have.
      var pf = F.profileFacts(l, C);   // the card's own facts, read from the same record through the same helpers (kind, county, rating)
      var M = F.cardModel({ listing: l, miles: null, known: s.known !== false, open: s.open === true }, C);
      var head = el('header', 'lp-head'), top = el('div', 'lp-top');
      top.appendChild(el('h1', 'name', l.name));
      if (M.badge.length) { var bd = el('span', 'rec-badges lp-badges'); M.badge.forEach(function (t) { var x = el('span', 'rec-badge ' + t.toLowerCase(), t); x.setAttribute('title', t === 'REC' ? C.cardRecLabel : C.cardMedLabel); x.setAttribute('aria-label', t === 'REC' ? C.cardRecLabel : C.cardMedLabel); bd.appendChild(x); }); top.appendChild(bd); }
      head.appendChild(top);
      if (M.line2) head.appendChild(el('p', 'lp-line2 muted', M.line2));
      if (M.rating || M.deals) head.appendChild(el('p', 'lp-rating muted', [M.rating, M.deals].filter(Boolean).join(' \u00b7 ')));
      var hoursLine = el('p', 'lp-hours');
      var drawHours = function (st) {   // the dot + the existing badge text ("Open until 9 PM" / "Closed"); nothing without hours
        clear(hoursLine); hoursLine.hidden = true; if (st.known === false) return;
        hoursLine.className = 'lp-hours ln-hours ' + (st.open ? 'open' : 'closed'); var dot = el('span', 'dot'); dot.setAttribute('aria-hidden', 'true');
        hoursLine.appendChild(dot); hoursLine.appendChild(el('span', null, st.open ? C.openUntil(F.fmtTime(st.until)) : C.closed)); hoursLine.hidden = false;
      };
      drawHours(s); head.appendChild(hoursLine);
      if (M.offers.length) { var of = el('p', 'lp-offers ln-offers'); M.offers.forEach(function (t) { of.appendChild(el('span', 'offer', t)); }); head.appendChild(of); }
      // a cultivation / manufacturing / distribution / testing / microbusiness record is drawn by the ONE shared account template (js/account-page.js, Joe 2026-11-27): name, category, county, the public contact block
      // and the unclaimed note. Phone and website appear only when a real value exists (the owner-supplied contact below); nothing is guessed. The licence card below stays.
      var NR = !!(l.category && C.industryCat && C.industryCat[l.category] && window.FMW_ACCOUNT);
      var acctNode = null;
      var dccDate = F.licenseCheck(l, new Date()).text || '', dccOn = !!(l.phone || l.website);   // the state record's phone and website (Joe 2026-11-27), normalised at export; the owner's own contact below replaces them
      var drawAcct = function (k) {
        var own = !!(k && (k.tel || k.website)), tel = own ? (k.tel ? k.tel.replace(/^tel:/, '') : '') : (l.phone || ''), web = own ? k.website : l.website;
        var n = window.FMW_ACCOUNT.build(doc, { name: l.name, category: l.licenseType || C.industryCat[l.category], location: pf.county ? pf.county + ', ' + ((l.address && l.address.state) || 'CA') : '',
          phone: tel, website: web, claimed: own, source: C.acctSourceLicense || 'the state license record',
          contactNote: !own && dccOn ? C.acctContactDcc(dccDate) : '', correctHref: !own && dccOn && l.license ? C.acctCorrectHref(l.license) : '' }, { copy: C, claimHref: ((window.FMW_CONFIG && window.FMW_CONFIG.basePath) || '') + '/business/' });
        if (acctNode && acctNode.parentNode) acctNode.parentNode.replaceChild(n, acctNode);
        acctNode = n; return n;
      };
      if (NR) box.appendChild(drawAcct(null)); else box.appendChild(head);

      var lic = el('section', 'card'); lic.appendChild(el('h2', null, C.license));
      lic.appendChild(el('p', 'mono', l.license || C.stripNoNumber));
      if (l.licenseType) lic.appendChild(el('p', 'muted', l.licenseType));
      var strip = F.licenseStrip(l), sp = el('p', 'license-strip', pf.strip);   // status + expiry, from the listing's own fields
      sp.setAttribute('data-strip', strip.status && strip.expires ? 'full' : 'partial'); lic.appendChild(sp);
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
      var DT = F.profileFacts(l, C).designation; if (DT) ad.appendChild(el('p', 'designation', DT));
      if (AL.note) ad.appendChild(el('p', 'muted addr-note', AL.note === 'delivery' ? C.addressDeliveryNote : AL.note === 'deliveryCounty' ? C.addressDeliveryCountyNote : AL.note === 'city' ? C.addressCityNote : AL.note === 'street' ? C.addressNoStreet : C.addressNone));
      // Directions: a storefront with a real street only (F.directionsUrl is '' for any other record): Apple Maps on iPhone / iPad, Google Maps elsewhere
      var apple = /iPhone|iPad|iPod/.test(String(window.navigator && navigator.userAgent || '')) || (/Macintosh/.test(String(window.navigator && navigator.userAgent || '')) && (navigator.maxTouchPoints || 0) > 1),
        dir = F.directionsUrl(l, apple);
      if (dir) {
        var da = el('a', 'btn ghost directions', C.directions); da.href = dir; da.target = '_blank'; da.rel = 'noopener noreferrer';
        da.setAttribute('aria-label', C.directionsLabel(l.name)); da.setAttribute('data-maps', apple ? 'apple' : 'google'); ad.appendChild(da);
      }
      // a cultivation / manufacturing / distribution / testing / microbusiness record has the county only and no menu: no "Address not listed" and no "No menu link yet" cards for it
      var NONRETAIL = !!(l.category && C.industryCat && C.industryCat[l.category]);
      if (!NONRETAIL) box.appendChild(ad);
      // the state record's own phone and website (DCC, Joe 2026-11-27) on a retail page, until the owner's own contact (below) replaces it
      var dccCard = null;
      if (!NONRETAIL && (l.phone || l.website)) {
        dccCard = el('section', 'card contact'); dccCard.setAttribute('data-card', 'contact'); dccCard.setAttribute('data-source', 'dcc'); dccCard.appendChild(el('h2', null, C.contactTitle));
        var dr = el('div', 'actions');
        if (l.phone) { var da2 = el('a', 'btn ghost call', C.call); da2.href = 'tel:' + l.phone; da2.setAttribute('aria-label', C.callLabel(l.name)); dr.appendChild(da2); }
        if (l.website) { var dw = el('a', 'btn ghost website', C.website); dw.href = l.website; dw.target = '_blank'; dw.rel = 'noopener noreferrer nofollow'; dw.setAttribute('aria-label', C.websiteLabel(l.name)); dr.appendChild(dw); }
        dccCard.appendChild(dr); dccCard.appendChild(el('p', 'muted acct-contact-src', C.acctContactDcc(dccDate)));
        var dx = el('a', 'acct-correct', C.acctCorrect); dx.href = C.acctCorrectHref(l.license); dccCard.appendChild(dx);
        ad.parentNode.insertBefore(dccCard, ad.nextSibling);
      }
      // OWNER-SUPPLIED CONTACT (Grok 2026-11-25, option c): a phone and a website the approved business added itself, read from the server only while site.json "contact" is on (window.FMW_CONTACT
      // exists only then). A Contact card with a Call button (tel:) and a Website link is drawn ONLY for a field that is set and passes the same checks again; nothing otherwise, no placeholder.
      if (window.FMW_CONTACT && window.FMW_CONTACT_UTIL) window.FMW_CONTACT.forLicense(l.license).then(function (r) {
        var k = r && r.ok ? window.FMW_CONTACT_UTIL.links(r.data) : { tel: '', website: '' };
        if (!k.tel && !k.website) return;
        if (NR) { drawAcct(k); return; }   // the template draws the contact block for these pages
        var cc = el('section', 'card contact'); cc.appendChild(el('h2', null, C.contactTitle)); cc.setAttribute('data-card', 'contact');
        var cr = el('div', 'actions');
        if (k.tel) { var ca = el('a', 'btn ghost call', C.call); ca.href = k.tel; ca.setAttribute('aria-label', C.callLabel(l.name)); cr.appendChild(ca); }
        if (k.website) { var wa = el('a', 'btn ghost website', C.website); wa.href = k.website; wa.target = '_blank'; wa.rel = 'noopener noreferrer nofollow'; wa.setAttribute('aria-label', C.websiteLabel(l.name)); cr.appendChild(wa); }
        if (dccCard && dccCard.parentNode) dccCard.parentNode.removeChild(dccCard);   // the owner's own contact replaces the state record's
        cc.appendChild(cr); ad.parentNode.insertBefore(cc, ad.nextSibling);
      }, function () {});

      // No hours data (all of today's listings): no Hours card at all. A card that only says "Hours not listed" is noise; it returns the day a listing has real hours.
      // The card is built from ONE function so the owner-supplied hours (below) draw exactly the same card as hours in the data would.
      var hoursCardFor = function (lh, note) {
        var hr = el('section', 'card'), t = el('table', 'hours'), today = F.localTime(new Date(), lh.tz).day;
        hr.setAttribute('data-card', 'hours'); hr.appendChild(el('h2', null, C.hours));
        t.appendChild(el('caption', 'sr', C.hours));
        F.weekHours(lh).forEach(function (h) {
          var tr = el('tr', h.key === today ? 'today' : null), th = el('th', null, h.day);
          th.scope = 'row';
          if (h.key === today) tr.setAttribute('aria-current', 'date');
          tr.appendChild(th); tr.appendChild(el('td', null, h.text)); t.appendChild(tr);
        });
        hr.appendChild(t); if (note) hr.appendChild(el('p', 'muted hours-note', note));
        return hr;
      };
      if (F.hoursKnown(l)) box.appendChild(hoursCardFor(l, ''));

      var mn = el('section', 'card'), url = F.safeUrl(l.menuUrl); mn.appendChild(el('h2', null, C.menu));
      if (url) {
        var m = el('a', 'btn ghost', C.menuLink); m.href = url; m.target = '_blank'; m.rel = 'noopener noreferrer nofollow';
        // the hand-off to a business that may take orders: say who checks ID, and the age rule (review B/D)
        var mnote = el('p', 'muted', C.menuNote); mnote.id = 'menu-note'; m.setAttribute('aria-describedby', 'menu-note');
        mn.appendChild(m); mn.appendChild(mnote);
      }
      else mn.appendChild(el('p', 'muted', C.noMenu));
      if (!NONRETAIL) box.appendChild(mn);

      // OWNER-SUPPLIED HOURS (Joe/Grok 2026-11-25): the approved business's own opening hours, read from the server only while site.json "hours" is on (window.FMW_HOURS exists only then) and only when the
      // data has none. They pass the same checks again (FMW_HOURS_UTIL.usable), then go through the EXISTING logic: F.openState decides the badge, F.weekHours the Hours card. Nothing otherwise, no placeholder.
      if (window.FMW_HOURS && window.FMW_HOURS_UTIL && !F.hoursKnown(l)) window.FMW_HOURS.forLicense(l.license).then(function (r) {
        var u = r && r.ok ? window.FMW_HOURS_UTIL.usable(r.data) : { hours: null, note: '' };
        if (!u.hours) return;
        var lh = {}; for (var k in l) if (Object.prototype.hasOwnProperty.call(l, k)) lh[k] = l[k]; lh.hours = u.hours;
        if (!F.hoursKnown(lh)) return;
        var s2 = F.openState(lh, new Date());
        drawHours(s2);
        box.insertBefore(hoursCardFor(lh, u.note), mn);
      }, function () {});

      // Approved business overlay (profile, photos, menu or services, deals). Text only. Absent until js/listing-overlay.js loads.
      if (window.FMW_LISTING && window.FMW_LISTING.mount) window.FMW_LISTING.mount(doc, box, l);
      // "Contact for wholesale" (dormant behind site.json wholesaleInquiry): the form appears only on a live wholesale business
      if (window.FMW_WHOLESALE && window.FMW_WHOLESALE.mount) window.FMW_WHOLESALE.mount(doc, box, l);

      // "Claim this listing" is a live link to the business sign-up (signup.html?as=business). The sign-up page itself says
      // what is open and what is not; the claim is confirmed by the team after sign-up, so nothing here promises a price or a result.
      var cl = el('section', 'card claim'), b = el('a', 'btn', C.claim), note = el('p', 'muted', C.claimNote);
      note.id = 'claim-note';
      b.href = HERE('signup.html?as=business'); b.setAttribute('aria-describedby', 'claim-note');
      cl.appendChild(b); cl.appendChild(note); if (!NR) box.appendChild(cl);   // the account template carries its own claim link

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
