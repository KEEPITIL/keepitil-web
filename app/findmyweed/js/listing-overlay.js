// Public listing overlay. Reads the approved business record and draws it with textContent only.
// Image addresses are set with img.src and only when the host is this project's Storage host.
(function (root) {
  var PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(logo|hero|gallery|inventory|service)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp|png)$/i;
  function licenseShape(s) {
    var t = String(s || '').trim().toUpperCase();
    return /^[A-Z]{1,4}\d{0,2}-\d{7}-LIC$/.test(t) || /^CCL\d{2}-\d{7}$/.test(t) || /^DCC-\d{8}$/.test(t);
  }
  function httpsUrl(raw) {
    var s = String(raw || '').trim();
    if (!s || s.length > 300 || !/^https:\/\//i.test(s)) return '';
    try {
      var u = new URL(s);
      if (u.protocol !== 'https:' || u.username || u.password) return '';
      var h = u.hostname.toLowerCase();
      if (h === 'localhost' || h.endsWith('.local') || h.indexOf('.') < 0) return '';
      if (/^(127\.|10\.|192\.168\.|0\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)) return '';
      return u.href;
    } catch (e) { return ''; }
  }
  function mediaUrl(base, path) {
    var b = String(base || '').replace(/\/$/, '');
    var p = String(path || '');
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(b) || !PATH_RE.test(p)) return '';
    return b + '/storage/v1/object/public/fmw-business-media/' + p;
  }
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function rpc(win, name, body) {
    var cfg = win.FMW_CONFIG && win.FMW_CONFIG.authProject, f = win.fetch;
    if (!cfg || !cfg.url || !cfg.anonKey || typeof f !== 'function') return Promise.resolve(null);
    return f(cfg.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r && r.ok ? r.json().then(function (j) { return j; }, function () { return null; }) : null; }, function () { return null; });   // an empty body (the void tracking call answers with none) is null, never an unhandled rejection
  }
  function track(win, license, kind) { rpc(win, 'fmw_track_event', { p_license: license, p_kind: kind }); }
  // The menu and the deals come as bounded pages from their own RPCs (P2: fmw_listing_menu, fmw_listing_deals) once the overlay answers menu_total / deal_count (numbers); an older overlay that still
  // carries items / deals arrays is drawn as before, so this ships before the SQL does. ctx = { win, license } (without it nothing is fetched).
  var PAGE = 25;
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function menuLine(it, wholesale) {
    var bits = [it.title];
    if (it.category) bits.push(it.category);
    if (wholesale) { if (it.moq) bits.push('MOQ ' + it.moq); if (it.lead_time) bits.push('Lead time ' + it.lead_time); }
    else { if (it.price) bits.push(it.price); if (it.in_stock === false) bits.push('Out of stock'); }
    return bits.join(' · ');
  }
  function drawMenu(doc, sec, ctx, total, wholesale) {
    var wrap = el(doc, 'div', 'biz-menu'); wrap.setAttribute('data-card', 'menu');
    wrap.appendChild(el(doc, 'h3', 'biz-h', (wholesale ? 'Wholesale catalog' : 'Menu') + ' (' + total + ')'));
    var list = el(doc, 'div', 'biz-menu-list'), more = el(doc, 'button', 'btn ghost', 'Show more'), msg = el(doc, 'p', 'muted', ''); more.type = 'button'; more.hidden = true; msg.setAttribute('role', 'status');
    wrap.appendChild(list); wrap.appendChild(msg); wrap.appendChild(more); sec.appendChild(wrap);
    var shown = 0;
    function load() {
      more.disabled = true; msg.textContent = '';
      rpc(ctx.win, 'fmw_listing_menu', { p_license: ctx.license, p_limit: PAGE, p_offset: shown }).then(function (r) {
        more.disabled = false;
        if (!r || !Array.isArray(r.items)) { msg.textContent = 'Could not load the ' + (wholesale ? 'catalog' : 'menu') + '.'; more.textContent = 'Try again'; more.hidden = false; return; }
        r.items.forEach(function (it) {
          list.appendChild(el(doc, 'p', null, menuLine(it, wholesale)));
          if (it.description) list.appendChild(el(doc, 'p', 'muted', it.description));
        });
        shown += r.items.length;
        more.textContent = 'Show more'; more.hidden = !(r.items.length > 0 && shown < (typeof r.total === 'number' ? r.total : total));
      });
    }
    more.addEventListener('click', load); load();
  }
  function drawDeals(doc, sec, ctx, count) {
    var wrap = el(doc, 'div', 'biz-deals'); wrap.setAttribute('data-card', 'deals');
    wrap.appendChild(el(doc, 'h3', 'biz-h', plural(count, 'deal', 'deals')));
    var list = el(doc, 'div'), msg = el(doc, 'p', 'muted', ''); msg.setAttribute('role', 'status'); wrap.appendChild(list); wrap.appendChild(msg); sec.appendChild(wrap);
    rpc(ctx.win, 'fmw_listing_deals', { p_license: ctx.license }).then(function (r) {
      if (!r || !Array.isArray(r.deals)) { msg.textContent = 'Could not load the deals.'; return; }
      r.deals.forEach(function (d) { list.appendChild(el(doc, 'p', null, d.title + (d.detail ? ' — ' + d.detail : '') + (d.ends_at ? ' · until ' + String(d.ends_at).slice(0, 10) : ''))); });
    });
  }
  function draw(doc, box, data, base, ctx) {
    var paged = !!data && (typeof data.menu_total === 'number' || typeof data.deal_count === 'number');
    var dealsOn = !!(data && data.caps && data.caps.deals === true), retail = !!(data && data.caps && data.caps.consumer_menu === true);   // deals only for a license whose capabilities say so; prices and stock only on a retail menu   // the P2 shape: counts here, rows from their own RPCs
    if (!data || !data.profile && !(data.media && data.media.length) && !(data.items && data.items.length) && !(data.menu_total > 0) && !(data.deal_count > 0)) return false;
    var sec = el(doc, 'section', 'card biz-overlay'); sec.setAttribute('data-card', 'overlay');
    sec.appendChild(el(doc, 'h2', null, 'From this business'));
    var p = data.profile || {};
    if (p.display_name) sec.appendChild(el(doc, 'p', null, p.display_name));
    // the counts the page now gets from the overlay: "3 deals · 120 menu items"
    var counts = [];
    if (dealsOn && data.deal_count > 0) counts.push(plural(data.deal_count, 'deal', 'deals'));
    if (data.menu_total > 0) counts.push(plural(data.menu_total, (data.caps && data.caps.consumer_menu) ? 'menu item' : 'catalog item', (data.caps && data.caps.consumer_menu) ? 'menu items' : 'catalog items'));
    if (counts.length) { var cl = el(doc, 'p', 'biz-counts', counts.join(' · ')); cl.setAttribute('data-card', 'counts'); sec.appendChild(cl); }
    if (p.tagline) sec.appendChild(el(doc, 'p', 'muted', p.tagline));
    if (p.about) sec.appendChild(el(doc, 'p', null, p.about));
    if (p.address_line1) sec.appendChild(el(doc, 'p', null, [p.address_line1, p.address_city, p.address_zip].filter(Boolean).join(', ')));
    if (p.zones) sec.appendChild(el(doc, 'p', null, 'Delivery area: ' + p.zones));
    if (p.delivery_minimum) sec.appendChild(el(doc, 'p', null, 'Delivery minimum: ' + p.delivery_minimum));
    // amenities and payments the business ticked, as plain chips (only ticked ones; nothing is implied for the rest)
    var chips = function (map, labels, title) {
      var on = Object.keys(labels).filter(function (k) { return map && map[k] === true; });
      if (!on.length) return;
      sec.appendChild(el(doc, 'h3', 'biz-h', title));
      var row = el(doc, 'p', 'biz-chips'); on.forEach(function (k) { row.appendChild(el(doc, 'span', 'offer', labels[k])); }); sec.appendChild(row);
    };
    chips(p.amenities, { ada: 'Wheelchair accessible', parking: 'Parking', pickup: 'Pickup', curbside: 'Curbside', medical: 'Medical patients welcome', age21: '21+ only' }, 'Amenities');
    chips(p.payments, { cash: 'Cash', debit: 'Debit', atm: 'ATM on site' }, 'Payments accepted');
    var social = p.social || {};
    Object.keys(social).forEach(function (k) {
      var href = httpsUrl(social[k]); if (!href) return;
      var a = el(doc, 'a', null, k); a.href = href; a.rel = 'noopener noreferrer nofollow'; a.target = '_blank'; sec.appendChild(a);
    });
    (data.media || []).forEach(function (m) {
      var src = mediaUrl(base, m.path); if (!src) return;
      var img = el(doc, 'img', 'biz-photo'); img.src = src; img.alt = ''; sec.appendChild(img);
    });
    if (paged && ctx && ctx.win && ctx.license && data.menu_total > 0) drawMenu(doc, sec, ctx, data.menu_total, !(data.caps && data.caps.consumer_menu));
    if (!paged && (data.items || []).length) sec.appendChild(el(doc, 'h3', 'biz-h', (!retail && data.caps && data.caps.wholesale === true) ? 'Wholesale catalog' : 'Menu'));   // the older overlay shape: a wholesale list is never headed Menu
    (paged ? [] : (data.items || [])).forEach(function (it) {
      // the older overlay shape: a price and a stock note only on a RETAIL menu (a wholesale row never shows either, whatever the old SQL sent)
      var row = el(doc, 'p', null, it.title + (retail && it.price ? ' · ' + it.price : '') + (retail && it.in_stock === false ? ' · Out of stock' : ''));
      sec.appendChild(row);
      if (it.description) sec.appendChild(el(doc, 'p', 'muted', it.description));
    });
    (data.services || []).forEach(function (s) { sec.appendChild(el(doc, 'p', null, s.title + (s.price ? ' · ' + s.price : ''))); });
    if (paged && dealsOn && ctx && ctx.win && ctx.license && data.deal_count > 0) drawDeals(doc, sec, ctx, data.deal_count);
    if (!paged && dealsOn && (data.deals || []).length) sec.appendChild(el(doc, 'h3', 'biz-h', 'Deals'));
    (paged || !dealsOn ? [] : (data.deals || [])).forEach(function (d) { sec.appendChild(el(doc, 'p', null, d.title + (d.detail ? ' — ' + d.detail : ''))); });
    if ((data.events || []).length) sec.appendChild(el(doc, 'h3', 'biz-h', 'Events'));
    (data.events || []).forEach(function (ev) {
      sec.appendChild(el(doc, 'p', null, ev.title + (ev.starts_on ? ' · ' + ev.starts_on : '')));
      var href = httpsUrl(ev.ticket_url);
      if (href) { var a = el(doc, 'a', null, 'Tickets'); a.href = href; a.rel = 'noopener noreferrer nofollow'; a.target = '_blank'; sec.appendChild(a); }
    });
    // a brand's "Where to buy": each licence is a link to that retailer's own listing (the server already limits it to approved, live retailers)
    var where = (data.where || []).filter(licenseShape);
    if (where.length) sec.appendChild(el(doc, 'h3', 'biz-h', 'Where to buy'));
    where.forEach(function (lic) { var p = el(doc, 'p', 'mono'), a = el(doc, 'a', null, String(lic).toUpperCase()); a.href = 'listing.html?id=' + encodeURIComponent(String(lic).toLowerCase()); p.appendChild(a); sec.appendChild(p); });
    box.appendChild(sec);
    return true;
  }
  function mount(doc, box, listing) {
    var win = root;
    var lic = listing && listing.license;
    if (!licenseShape(lic)) return;
    var base = win.FMW_CONFIG && win.FMW_CONFIG.authProject && win.FMW_CONFIG.authProject.url;
    var key = String(lic).toUpperCase();
    track(win, key, 'view');
    if (box && box.addEventListener) box.addEventListener('click', function (e) {
      var t = e.target, c = t && t.className ? String(t.className) : '';
      var kind = c.indexOf('call') >= 0 ? 'phone' : c.indexOf('website') >= 0 ? 'website' : c.indexOf('directions') >= 0 ? 'directions' : '';
      if (kind) track(win, key, kind);
    });
    rpc(win, 'fmw_listing_overlay', { p_license: key }).then(function (data) {
      if (data && typeof data === 'object') draw(doc, box, data, base, { win: win, license: key });
    });
  }
  function mountMissing(doc, box, id, showMissing) {
    if (!licenseShape(id)) { showMissing(); return; }
    var win = root, base = win.FMW_CONFIG && win.FMW_CONFIG.authProject && win.FMW_CONFIG.authProject.url;
    rpc(win, 'fmw_listing_overlay', { p_license: String(id).toUpperCase() }).then(function (data) {
      if (!data || !data.profile) { showMissing(); return; }
      draw(doc, box, data, base, { win: win, license: String(id).toUpperCase() });
    }, showMissing);
  }
  var api = { licenseShape: licenseShape, httpsUrl: httpsUrl, mediaUrl: mediaUrl, draw: draw, mount: mount, mountMissing: mountMissing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FMW_LISTING = api;
})(typeof window !== 'undefined' ? window : globalThis);
