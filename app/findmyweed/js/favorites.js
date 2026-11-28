// FMW FAVORITES (docs/FMW_FAVORITES_SPEC_DRAFT.md), BEHIND FMW_CONFIG.favorites === true (site.json favorites, ON since 2026-11-26).
// A listing page has a plain "Save" link to the account page (?save=<id>); a signed-in CUSTOMER confirms there and sees their saved listings. Private to the account.
// All data goes through an injected source, window.FMW_FAVORITES_SOURCE:
//   isCustomer() -> boolean   (false for signed-out visitors and business accounts: then NOTHING is drawn)
//   load() -> Promise of listing ids     add(id) -> Promise     remove(id) -> Promise
// This file has no network, no storage and no account code of its own; the server (RLS, cap of 200) is the authority. No payments.
(function (root) {
  var T = { save: 'Save', saved: 'Saved', saveLinkLabel: 'Save this listing to your favorites (opens your account)', failed: 'Could not update your favorites. Try again.',
    limit: 'You have reached the limit of 200 saved listings. Remove one to save another.',   // NEW (draft, for Muse)
    title: 'Saved listings', none: 'No saved listings yet.', loading: 'Loading…', view: 'View', confirm: 'Save this listing to your favorites?', confirmBtn: 'Save', confirmDone: 'Saved.', viewListing: 'View the listing',
    // Favorites layout (2026-11-27): three tabs. Brands and Events have no saved-items storage yet, so they show an honest empty state that links to browse.
    tabsLabel: 'Favorites', tabBusinesses: 'Businesses', tabBrands: 'Brands', tabEvents: 'Events',
    noBrands: 'No saved brands yet.', noEvents: 'No saved events yet.',
    browseBusinesses: 'Browse businesses', browseBrands: 'Browse brands', browseEvents: 'Browse events',
    signedOutTitle: 'Favorites', signedOutPrompt: 'Sign in to save across devices.', signIn: 'Sign in',
    pageTitle: 'Favorites', docTitle: 'Favorites \u00b7 Find My Weed', remove: 'Remove', removeLabel: function (n) { return 'Remove ' + n + ' from favorites'; },
    removeFailed: 'Could not remove it. Try again.', backToAccount: 'Your account' };
  var HEART = 'M12 20s-8-5-8-11a4 4 0 0 1 8-1.5A4 4 0 0 1 20 9c0 6-8 11-8 11z';   // the menu's Favorites heart (js/pages.js ICONS.heart)
  // where each tab's "browse" link goes (relative, so it works under the site's basePath)
  var BROWSE = { businesses: 'dispensaries/', brands: 'brands/', events: 'events' };
  // a listing id from a ?save= link: only the slug shape is accepted (the server checks that the listing exists); anything else is ignored
  var SID = root.FMW_SAVEID || (typeof require === 'function' ? require('./save-id.js') : null);   // js/save-id.js: the one rule, shared with the sign-up page
  var SAVE_RE = SID ? SID.RE : /(?!)/;
  function open(opts) {
    var win = (opts && opts.win) || root, CFG = win.FMW_CONFIG || {}, src = win.FMW_FAVORITES_SOURCE || null;
    if (CFG.favorites !== true || !src || typeof src.isCustomer !== 'function' || typeof src.load !== 'function') return null;
    try { if (src.isCustomer() !== true) return null; } catch (e) { return null; }
    return src;
  }
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // The "Save" link on a listing page (Grok 2026-11-24, option 3): a plain link to account.html?save=<id>. It is a NAVIGATION, so the public listing page
  // makes no auth call and needs no CSP change; the account page validates the id, shows a visible confirm and only then saves. Behind the flag.
  function mountSaveLink(doc, id, into, opts) {
    var win = (opts && opts.win) || root, CFG = win.FMW_CONFIG || {};
    if (CFG.favorites !== true || !into || typeof id !== 'string' || !SAVE_RE.test(id)) return null;
    var a = el(doc, 'a', 'btn ghost small fav', T.save); a.href = 'account?save=' + encodeURIComponent(id); a.setAttribute('data-act', 'favorite'); a.setAttribute('aria-label', T.saveLinkLabel);
    into.appendChild(a);
    return { state: 'link' };
  }
  // The listing slug a page's own ?save= carries, only with the flag on and only when it has the slug shape; '' otherwise. The account page's
  // signed-out Sign in link uses it so the id rides through sign-in (docs/FMW_SIGNIN_RETURN_TARGET_DESIGN_DRAFT.md).
  function saveParam(win) { return SID && win && win.location ? SID.fromSearch(win.location.search, win.FMW_CONFIG) : ''; }
  function browseLink(doc, key) { var a = el(doc, 'a', 'btn small', T['browse' + key.charAt(0).toUpperCase() + key.slice(1)]); a.href = BROWSE[key]; a.setAttribute('data-act', 'browse-' + key); return a; }
  function heartIcon(doc) {
    if (!doc.createElementNS) return el(doc, 'span', 'ico');
    var NS = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(NS, 'svg'), path = doc.createElementNS(NS, 'path');
    svg.setAttribute('class', 'ico'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    path.setAttribute('d', HEART); svg.appendChild(path); return svg;
  }
  // An empty tab: the heart, ONE line, and a Browse button (KODE 2026-11-27).
  function emptyState(doc, key, text) {
    var box = el(doc, 'div', 'state fav-empty'); box.setAttribute('data-empty', key);
    box.appendChild(heartIcon(doc)); box.appendChild(el(doc, 'p', null, text));
    var r = el(doc, 'p'); r.appendChild(browseLink(doc, key)); box.appendChild(r); return box;
  }
  // Saved ids -> full listing records, the way the listing page loads one (js/pages.js loadListing): the small index, then only the county files the ids live in.
  // Same-site data/ files only (the account page's CSP already allows 'self'). An id whose record cannot be found stays as a card titled with its license number.
  function loadRecords(win, ids) {
    var F = win.FMW; if (!F || !F.loadPart || !F.fetchOf || !F.countyFileKey) return Promise.resolve({});
    var want = {}; ids.forEach(function (id) { want[String(id).toLowerCase()] = true; });
    return F.loadPart(F.fetchOf(win), 'data/listings-index.json', function (d) { return d && Array.isArray(d.listings); }).then(function (idx) {
      var keys = {}; idx.listings.forEach(function (r) { if (r && want[String(r.license || '').toLowerCase()] && typeof r.county === 'string') keys[F.countyFileKey(r.county)] = true; });
      return Promise.all(Object.keys(keys).map(function (k) {
        return F.loadPart(F.fetchOf(win), 'data/counties/' + k + '.json', function (d) { return d && Array.isArray(d.listings); }).then(function (cf) { return cf.listings; }, function () { return []; });
      }));
    }).then(function (lists) {
      var out = {}; lists.forEach(function (ls) { ls.forEach(function (l) { var id = String(l.license || l.id || '').toLowerCase(); if (want[id]) out[id] = l; }); }); return out;
    }).catch(function () { return {}; });
  }
  // One saved business, drawn as the search-results card (js/pages.js card(): li.shop > a.listing, monogram tile, name, type · place, REC / MED) from the SAME
  // F.cardModel, plus a heart "Remove" button under it (a sibling of the link, as the results' map / directions buttons are). No hours or distance: nothing to compute here.
  function savedCard(doc, win, id, l, onRemove) {
    var F = win.FMW, C = win.FMW_COPY || {}, li = el(doc, 'li', 'shop'), a = el(doc, 'a', 'listing'); li.setAttribute('data-id', id);
    a.href = 'listing?id=' + encodeURIComponent(id);
    var rec = l || { id: id, name: id.toUpperCase(), storefront: false };
    var M = F && F.cardModel && l ? F.cardModel({ listing: l, known: false }, C) : { name: rec.name, line2: '', badge: [] };
    var th = el(doc, 'span', 'thumb', F && F.monogram ? F.monogram(M.name) : String(M.name).slice(0, 2).toUpperCase()); th.setAttribute('aria-hidden', 'true');
    var lines = el(doc, 'span', 'lines'); lines.appendChild(el(doc, 'h3', 'ln ln-name', M.name)); if (M.line2) lines.appendChild(el(doc, 'span', 'ln ln-2', M.line2));
    if (M.badge && M.badge.length) { var bd = el(doc, 'span', 'rec-badges'); M.badge.forEach(function (t) { var x = el(doc, 'span', 'rec-badge ' + t.toLowerCase(), t); var lab = t === 'REC' ? C.cardRecLabel : C.cardMedLabel; if (lab) { x.setAttribute('title', lab); x.setAttribute('aria-label', lab); } bd.appendChild(x); }); a.appendChild(bd); }
    a.appendChild(th); a.appendChild(lines); li.appendChild(a);
    var rm = el(doc, 'button', 'btn ghost small fav-remove'); rm.type = 'button'; rm.setAttribute('data-act', 'unfavorite'); rm.setAttribute('aria-label', T.removeLabel(M.name));
    rm.appendChild(heartIcon(doc)); rm.appendChild(el(doc, 'span', null, T.remove)); rm.addEventListener('click', function () { onRemove(id, li, rm); });
    var row = el(doc, 'p', 'fav-actions'); row.appendChild(rm); li.appendChild(row);
    return li;
  }
  // #saved = the Favorites page (the menu's Favorites link is account.html#saved): title "Favorites", and only the favorites card is shown; the rest of the account page is
  // hidden, not removed (it is the same page and data). Any other address keeps the full account page with the card in it.
  function favoritesOnly(win) { try { return String(win.location && win.location.hash || '') === '#saved'; } catch (e) { return false; } }
  function focusPage(doc, win, into, sec) {
    if (!favoritesOnly(win)) return false;
    try { doc.title = T.docTitle; } catch (e) { /* title is cosmetic */ }
    var h1 = doc.getElementById ? doc.getElementById('account-title') : null; if (h1) h1.textContent = T.pageTitle;
    // The section can sit inside a nested container (the card-based account layout, js/account-cards.js), so every sibling on the way up to the
    // #account root is hidden, not only the section's own siblings. Nothing is removed: it is the same page, only the favorites are in view.
    var root = (doc.getElementById && doc.getElementById('account')) || into;
    var hideOthers = function () {
      var node = sec, guard = 0;
      while (node && node !== root && guard++ < 20) {
        var parent = node.parentNode || (node === sec ? into : null); if (!parent) break;
        Array.prototype.forEach.call(parent.children || [], function (c) { if (c !== node) c.hidden = true; });
        node = parent;
      }
    };
    hideOthers();
    if (win.MutationObserver) { try { new win.MutationObserver(function () { hideOthers(); if (h1 && h1.textContent !== T.pageTitle) h1.textContent = T.pageTitle; }).observe(root, { childList: true, subtree: true }); } catch (e) { /* best effort */ } }
    var back = el(doc, 'p', 'fav-back'); var bl = el(doc, 'a', null, T.backToAccount); bl.href = 'account'; back.appendChild(bl); sec.appendChild(back);
    if (win.addEventListener) win.addEventListener('hashchange', function () { try { win.location.reload(); } catch (e) { /* stays */ } });
    // #saved would scroll past the page title; the Favorites page starts at its top (now and once the cards have loaded)
    var top = function () { try { if (win.scrollTo) win.scrollTo(0, 0); } catch (e) { /* cosmetic */ } }; top(); if (win.setTimeout) win.setTimeout(top, 400);
    return true;
  }
  // Three tabs (Businesses, Brands, Events) in the existing card. ARIA tabs: one tablist, each tab controls one panel; arrow keys move between tabs.
  // Selected tab = 'btn small', others 'btn ghost small' (existing button styles: no new CSS). Returns { panels, select }.
  function mountTabs(doc, sec) {
    var keys = ['businesses', 'brands', 'events'], tabs = {}, panels = {};
    var bar = el(doc, 'div', 'actions fav-tabs'); bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', T.tabsLabel); sec.appendChild(bar);
    function select(key, focus) {
      keys.forEach(function (k) {
        var on = k === key; tabs[k].setAttribute('aria-selected', on ? 'true' : 'false'); tabs[k].setAttribute('tabindex', on ? '0' : '-1');
        tabs[k].className = on ? 'btn small' : 'btn ghost small'; panels[k].hidden = !on; if (panels[k].setAttribute) panels[k].setAttribute('data-active', on ? 'true' : 'false');
      });
      sec.setAttribute('data-tab', key); if (focus && tabs[key].focus) tabs[key].focus();
    }
    keys.forEach(function (k, i) {
      var t = el(doc, 'button', null, T['tab' + k.charAt(0).toUpperCase() + k.slice(1)]); t.type = 'button'; t.id = 'fav-tab-' + k;
      t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', 'fav-panel-' + k); t.setAttribute('data-tab', k);
      t.addEventListener('click', function () { select(k); });
      t.addEventListener('keydown', function (e) {
        var d = e && (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0); if (!d) return;
        if (e.preventDefault) e.preventDefault(); select(keys[(i + d + keys.length) % keys.length], true);
      });
      tabs[k] = t; bar.appendChild(t);
      var p = el(doc, 'div', 'fav-panel'); p.id = 'fav-panel-' + k; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', 'fav-tab-' + k); p.setAttribute('data-panel', k);
      panels[k] = p; sec.appendChild(p);
    });
    // Brands and Events: nothing can be saved there yet, so an empty state with a way to browse
    [['brands', T.noBrands], ['events', T.noEvents]].forEach(function (x) { panels[x[0]].appendChild(emptyState(doc, x[0], x[1])); });
    select('businesses');
    return { tabs: tabs, panels: panels, select: select };
  }
  // Signed out (account page, flag on): the favorites card with a prompt to sign in. Nothing is loaded: there is no session to load with.
  function mountSignedOut(doc, into, opts) {
    var win = (opts && opts.win) || root, CFG = win.FMW_CONFIG || {};
    if (CFG.favorites !== true || !into) return null;
    var sec = el(doc, 'section', 'card favorites'); sec.id = 'saved'; sec.setAttribute('data-state', 'favorites-signed-out'); sec.appendChild(el(doc, 'h2', null, T.signedOutTitle));
    var p = el(doc, 'p', null, T.signedOutPrompt); p.setAttribute('role', 'status'); sec.appendChild(p);
    var sv = saveParam(win), a = el(doc, 'a', 'btn small', T.signIn); a.href = 'signup?mode=signin' + (sv ? '&save=' + encodeURIComponent(sv) : ''); a.setAttribute('data-act', 'favorites-signin');
    var row = el(doc, 'p'); row.appendChild(a); sec.appendChild(row); into.appendChild(sec);
    focusPage(doc, win, into, sec);
    return { state: 'signed-out' };
  }
  // the "Saved listings" list on the account page, now the Businesses tab of the Favorites card
  function mountList(doc, into, opts) {
    var src = open(opts); if (!src || !into) return null;
    var win = (opts && opts.win) || root;
    var sec = el(doc, 'section', 'card favorites'); sec.id = 'saved'; sec.setAttribute('data-state', 'favorites'); sec.appendChild(el(doc, 'h2', null, T.title));
    var tabsUi = mountTabs(doc, sec), biz = tabsUi.panels.businesses;
    var msg = el(doc, 'p', 'muted', T.loading); msg.setAttribute('role', 'status'); var list = el(doc, 'ul', 'listings fav-list'); biz.appendChild(msg); biz.appendChild(list);
    var empty = emptyState(doc, 'businesses', T.none); empty.hidden = true; biz.appendChild(empty);
    into.appendChild(sec);
    focusPage(doc, win, into, sec);
    var records = {};
    function showEmpty() { var n = list.children ? list.children.length : 0; empty.hidden = n > 0; if (!n) msg.textContent = ''; }
    function onRemove(id, li, btn) {
      btn.disabled = true; msg.textContent = '';
      Promise.resolve().then(function () { return src.remove(id); }).then(function () { if (li.parentNode && li.parentNode.removeChild) li.parentNode.removeChild(li); else if (list.removeChild) list.removeChild(li); showEmpty(); }, function () { btn.disabled = false; msg.textContent = T.removeFailed; });
    }
    var names = (opts && opts.names) || null;   // optional id -> display name, so the list reads as names
    var raw = opts && 'save' in opts ? opts.save : saveParam(win);
    var saveId = typeof raw === 'string' && SAVE_RE.test(raw) ? raw : '';
    function addRow(id) {
      var l = records[String(id).toLowerCase()] || null;
      if (!l && names && names[id]) l = { id: id, name: names[id], storefront: false };   // a caller-supplied name (tests, or a future save-time name)
      list.appendChild(savedCard(doc, win, id, l, onRemove));
    }
    Promise.resolve().then(function () { return src.load(); }).then(function (ids) {
      var rows = (Array.isArray(ids) ? ids : []).filter(function (x) { return typeof x === 'string' && x; });
      var ready = rows.length ? loadRecords(win, rows.concat(saveId ? [saveId] : [])).then(function (r) { records = r; }) : Promise.resolve();
      return ready.then(function () { return rows; });
    }).then(function (rows) {
      msg.textContent = ''; empty.hidden = rows.length > 0;
      rows.forEach(addRow);
      // a "Save" link from a listing page (?save=<id>): NEVER saved on arrival; a visible confirm button is the only way it is added
      if (saveId && rows.indexOf(saveId) < 0) {
        var box = el(doc, 'div', 'save-confirm'); box.setAttribute('data-state', 'confirm'); box.setAttribute('role', 'group');
        box.appendChild(el(doc, 'p', null, T.confirm));
        var lk = el(doc, 'a', null, T.viewListing); lk.href = 'listing?id=' + encodeURIComponent(saveId); box.appendChild(lk);
        var ok = el(doc, 'button', 'btn small', T.confirmBtn); ok.type = 'button'; ok.setAttribute('data-act', 'confirm-save');
        var note = el(doc, 'p', 'muted'); note.setAttribute('role', 'status');
        ok.addEventListener('click', function () {
          ok.disabled = true; note.textContent = '';
          Promise.resolve().then(function () { return src.add(saveId); }).then(function () { return records[saveId] ? null : loadRecords(win, [saveId]).then(function (r) { if (r[saveId]) records[saveId] = r[saveId]; }); }).then(function () { addRow(saveId); msg.textContent = ''; empty.hidden = true; box.setAttribute('data-state', 'done'); while (box.firstChild) box.removeChild(box.firstChild); box.appendChild(el(doc, 'p', null, T.confirmDone)); }, function (err) { ok.disabled = false; note.textContent = err && err.code === 'P0005' ? T.limit : T.failed; });
        });
        box.appendChild(ok); box.appendChild(note); biz.insertBefore ? biz.insertBefore(box, list) : biz.appendChild(box);
      }
    }, function () { msg.textContent = T.failed; });
    return { state: 'open', select: tabsUi.select };
  }
  var api = { T: T, SAVE_RE: SAVE_RE, BROWSE: BROWSE, loadRecords: loadRecords, savedCard: savedCard, mountSaveLink: mountSaveLink, saveParam: saveParam, mountList: mountList, mountSignedOut: mountSignedOut };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_FAVORITES = api;
})(this);
