// Business dashboard for an approved account. The server (fmw.my_business and the write RPCs) decides what a role and a
// license type may change. This file only draws that answer. Text goes in with textContent. Nothing here takes a payment.
(function (root) {
  var RETAIL = ['Flower', 'Pre-rolls', 'Vapes', 'Edibles', 'Concentrates', 'Tinctures', 'Topicals', 'Accessories', 'Seeds/Clones'];
  var WHOLESALE = ['Bulk flower', 'Trim', 'Genetics', 'White label', 'Co-packing', 'Distribution'];
  var LABELS = { overview: 'Overview', profile: 'Profile', photos: 'Photos & logo', catalog: 'Inventory / services', deals: 'Deals & promos', inquiries: 'Inquiries', team: 'Team', verification: 'License' };
  function panelsFor(role, caps) {
    var c = caps || {}, out = ['overview'];
    if (role === 'owner' || role === 'manager') out.push('profile');
    out.push('photos');
    if (c.consumer_menu || c.wholesale || c.lab || c.events || c.brand) out.push('catalog');
    if (c.deals) out.push('deals');
    out.push('inquiries', 'verification');
    if (role === 'owner' || role === 'manager') out.splice(out.length - 1, 0, 'team');
    return out;
  }
  function catalogTitle(caps) {
    var c = caps || {};
    if (c.consumer_menu) return 'Menu';
    if (c.wholesale) return 'Wholesale catalog';
    if (c.lab) return 'Testing services';
    if (c.events) return 'Events';
    if (c.brand) return 'Where to buy';
    return 'Inventory / services';
  }
  function httpsUrl(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (s.length > 300 || !/^https:\/\//i.test(s)) return null;
    try {
      var u = new URL(s);
      if (u.protocol !== 'https:' || u.username || u.password || u.hostname.indexOf('.') < 0) return null;
      return u.href;
    } catch (e) { return null; }
  }
  // EXTRA TABS (an extension point, so a new tab can live in its own file): FMW_DASHBOARD.registerTab(key, label, mountFn(doc, panel, ctx), roles?) or, before this file loads, window.FMW_DASHBOARD_TABS = [{ key, label (text, or a function of FMW_COPY), roles, mount }].
  // ctx = { win, biz, token, rpc(name, body) -> Promise<{ ok, data, status, message }>, why(r, fallback) }. A tab is added for the roles it names (default: every role) just before the License tab; it never replaces a built-in tab.
  var BUILTIN = ['overview', 'profile', 'photos', 'catalog', 'deals', 'inquiries', 'team', 'verification'], EXTRA = [];
  // options (4th argument): a list of roles, or { roles, when(biz) -> boolean, after: 'profile' } (when: show the tab only if it returns true, e.g. a license capability; after: sit after that tab instead of just before License)
  function tabEntry(key, label, mountFn, opts) {
    var o = Array.isArray(opts) ? { roles: opts } : (opts && typeof opts === 'object' ? opts : {});
    return { key: key, label: label, mount: mountFn, roles: Array.isArray(o.roles) && o.roles.length ? o.roles : ['owner', 'manager', 'editor'], when: typeof o.when === 'function' ? o.when : null, after: typeof o.after === 'string' ? o.after : null };
  }
  function registerTab(key, label, mountFn, opts) {
    if (typeof key !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/.test(key) || BUILTIN.indexOf(key) >= 0 || typeof mountFn !== 'function') return false;
    EXTRA = EXTRA.filter(function (x) { return x.key !== key; }); EXTRA.push(tabEntry(key, label, mountFn, opts)); return true;
  }
  function hasTab(key) { return EXTRA.some(function (x) { return x.key === key; }); }
  function extraTabs(win, role, biz) {
    var list = EXTRA.slice();
    (Array.isArray(win.FMW_DASHBOARD_TABS) ? win.FMW_DASHBOARD_TABS : []).forEach(function (x) {
      if (x && typeof x.key === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(x.key) && BUILTIN.indexOf(x.key) < 0 && typeof x.mount === 'function' && !list.some(function (y) { return y.key === x.key; })) list.push(tabEntry(x.key, x.label, x.mount, { roles: x.roles, when: x.when, after: x.after }));
    });
    return list.filter(function (x) { if (x.roles.indexOf(role) < 0) return false; try { return !x.when || x.when(biz) === true; } catch (e) { return false; } });
  }
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // A failed call keeps the server's message (the RPCs raise short plain messages for the cases a person can fix); why() turns it into one line for the page.
  function rpc(win, token, name, body) {
    var cfg = win.FMW_CONFIG && win.FMW_CONFIG.authProject, f = win.fetch;
    if (!cfg || !cfg.url || !cfg.anonKey || !token || typeof f !== 'function') return Promise.resolve({ ok: false });
    function fail(r) { return (r && typeof r.json === 'function' ? r.json() : Promise.resolve(null)).then(function (j) { return { ok: false, status: r && r.status, message: j && typeof j.message === 'string' ? j.message : '' }; }, function () { return { ok: false, status: r && r.status, message: '' }; }); }
    return f(cfg.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token, 'Content-Profile': 'fmw' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r && r.ok ? r.json().then(function (j) { return { ok: true, data: j }; }, function () { return { ok: false }; }) : fail(r); }, function () { return { ok: false }; });
  }
  // One plain line for a failed call: the server's own message when it is a short sentence about the input (400 / 403), otherwise the fallback. Never a database error.
  function why(r, fallback) {
    var m = r && typeof r.message === 'string' ? r.message.trim() : '';
    if (r && (r.status === 400 || r.status === 403) && m && m.length <= 120 && !/[{}<>\[\]()]|syntax|violat|relation|column|function|constraint|uuid|type /i.test(m)) return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? '' : '.');
    return fallback;
  }
  function field(doc, label, value, act, kind) {
    var l = el(doc, 'label', null, label), i = el(doc, kind === 'area' ? 'textarea' : 'input');
    i.value = value || ''; if (kind !== 'area') i.type = kind || 'text';
    i.setAttribute('data-act', act); l.appendChild(i); return { label: l, input: i };
  }
  function mount(doc, box, ctx) {
    var win = ctx.win, token = ctx.token;
    var shell = el(doc, 'section', 'dash'); shell.setAttribute('data-state', 'dashboard');
    var nav = el(doc, 'nav', 'dash-nav'); nav.setAttribute('aria-label', 'Business dashboard');
    var panel = el(doc, 'div', 'dash-panel');
    shell.appendChild(nav); shell.appendChild(panel);
    // the workspace comes FIRST in its holder (owner QA: it sat about 1,700px down the page, under the business and checklist cards)
    if (box.firstChild && typeof box.insertBefore === 'function') box.insertBefore(shell, box.firstChild); else box.appendChild(shell);
    var state = { biz: null, tab: 'overview' };
    function say(text) { var p = el(doc, 'p', 'muted', text); p.setAttribute('role', 'status'); panel.appendChild(p); return p; }
    function show(tab) {
      state.tab = tab; panel.textContent = '';
      Array.prototype.forEach.call(nav.children, function (b) { if (b.getAttribute('data-tab') === tab) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      var biz = state.biz, caps = biz && biz.caps || {}, role = biz && biz.role;
      var ext = extraTabs(win, role, biz).filter(function (x) { return x.key === tab; })[0];
      if (ext) {
        try { ext.mount(doc, panel, { win: win, biz: biz, token: token, rpc: function (name, body) { return rpc(win, token, name, body); }, why: why }); }
        catch (e) { panel.textContent = ''; say('This tab could not load. Try again.'); }
        return;
      }
      if (tab === 'overview') overview(biz);
      else if (tab === 'profile' && (role === 'owner' || role === 'manager')) profile(biz);
      else if (tab === 'photos') photos(biz);
      else if (tab === 'catalog') catalog(biz, caps);
      else if (tab === 'deals') deals();
      else if (tab === 'inquiries') inquiries();
      else if (tab === 'team' && (role === 'owner' || role === 'manager')) team(role);
      else if (tab === 'verification') verification(biz);
    }
    function overview(biz) {
      panel.appendChild(el(doc, 'h2', null, 'Overview'));
      var L = biz.license || {};
      panel.appendChild(el(doc, 'p', null, (L.legal_name || biz.profile && biz.profile.display_name || 'Your business')));
      panel.appendChild(el(doc, 'p', 'mono', L.number || ''));
      var kindLine = [L.type, L.county ? L.county + ' County' : ''].filter(Boolean).join(' · ');
      if (kindLine) panel.appendChild(el(doc, 'p', 'muted', kindLine));
      if (L.status) panel.appendChild(el(doc, 'p', null, 'License status: ' + L.status));
      if (L.expires) panel.appendChild(el(doc, 'p', null, 'Expires ' + L.expires));
      if (biz.renewal_soon) panel.appendChild(el(doc, 'p', null, 'Renewal is due within 60 days. Renew it with the state, then the register updates here.'));
      var a = biz.analytics || {};
      panel.appendChild(el(doc, 'p', null, 'Listing views: ' + (a.views || 0) + ' · Website clicks: ' + (a.website_clicks || 0) + ' · Phone clicks: ' + (a.phone_clicks || 0) + ' · Directions: ' + (a.directions_clicks || 0) + ' · Inquiries: ' + (a.inquiries || 0) + ' · Saved by: ' + (a.favorites || 0)));
      if (biz.role === 'owner') panel.appendChild(el(doc, 'p', 'muted', 'Pricing stays on your checklist. Find My Weed does not take a payment on this page.'));
      // the checklist reflects the account: profile from what was loaded, photos and the menu from their own lists
      panel.appendChild(el(doc, 'h3', null, 'Getting started'));
      var list = el(doc, 'ul'); list.setAttribute('data-act', 'ov-list'); panel.appendChild(list);
      var p = biz.profile || {}, caps = biz.caps || {};
      function line(done, text) { var li = el(doc, 'li', null, (done ? 'Done: ' : 'To do: ') + text); li.setAttribute('data-done', done ? 'true' : 'false'); list.appendChild(li); }
      line(!!(p.display_name && p.about), 'Profile filled in');
      var slot = el(doc, 'li', 'muted', 'Checking photos…'), slot2 = null; list.appendChild(slot);
      if (panelsFor(biz.role, caps).indexOf('catalog') >= 0) { slot2 = el(doc, 'li', 'muted', 'Checking your ' + catalogTitle(caps).toLowerCase() + '…'); list.appendChild(slot2); }
      function done(node, ok, text) { node.className = ''; node.textContent = (ok ? 'Done: ' : 'To do: ') + text; node.setAttribute('data-done', ok ? 'true' : 'false'); }
      rpc(win, token, 'media_list', {}).then(function (r) { if (r.ok && Array.isArray(r.data)) done(slot, r.data.length > 0, 'A photo added'); else slot.textContent = 'Photos: could not check.'; });
      if (slot2) {
        var calls = [];
        if (caps.consumer_menu || caps.wholesale) calls.push('inventory_list');
        if (caps.lab) calls.push('service_list');
        if (caps.events) calls.push('event_list');
        if (caps.brand) calls.push('where_list');
        Promise.all(calls.map(function (n) { return rpc(win, token, n, {}); })).then(function (rs) {
          if (rs.some(function (r) { return !r.ok; })) { slot2.textContent = catalogTitle(caps) + ': could not check.'; return; }
          done(slot2, rs.some(function (r) { return Array.isArray(r.data) && r.data.length > 0; }), 'Your ' + catalogTitle(caps).toLowerCase() + ' started');
        });
      }
    }
    function profile(biz) {
      var hoursOn = !!(win.FMW_CONFIG && win.FMW_CONFIG.hours && biz && biz.caps && biz.caps.hours), hoursTab = hasTab('hours');
      panel.appendChild(el(doc, 'h2', null, hoursOn && !hoursTab ? 'Profile & hours' : 'Profile'));
      panel.appendChild(el(doc, 'p', 'muted', 'The state record (legal name, license number, type, status, expiration, county) stays read-only.' + (hoursTab ? ' Weekly hours are on the Hours tab.' : (hoursOn ? ' Weekly hours are in the hours card above.' : ''))));
      var p = biz.profile || {}, caps = biz.caps || {};
      var fields = [
        field(doc, 'Public name', p.display_name, 'pf-name'),
        field(doc, 'Tagline', p.tagline, 'pf-tag'),
        field(doc, 'About', p.about, 'pf-about', 'area'),
        field(doc, 'Public email', p.public_email, 'pf-email', 'email'),
        field(doc, 'Phone', p.phone, 'pf-phone', 'tel'),
        field(doc, 'Website', p.website, 'pf-web', 'url')
      ];
      if (caps.storefront) fields.push(field(doc, 'Street address', p.address_line1, 'pf-line'), field(doc, 'City', p.address_city, 'pf-city'), field(doc, 'ZIP', p.address_zip, 'pf-zip'));
      if (caps.delivery) fields.push(field(doc, 'Delivery cities or ZIPs', p.zones, 'pf-zones', 'area'), field(doc, 'Delivery minimum', p.delivery_minimum, 'pf-min'));
      fields.forEach(function (f) { panel.appendChild(f.label); });
      var social = p.social || {}, SOCIAL = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['x', 'X'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']];
      SOCIAL.forEach(function (s) { var f = field(doc, s[1] + ' link', social[s[0]], 'pf-social-' + s[0], 'url'); panel.appendChild(f.label); });
      var PAY = [['cash', 'Cash'], ['debit', 'Debit'], ['atm', 'ATM on site']], AMEN = [['ada', 'Wheelchair accessible'], ['parking', 'Parking'], ['pickup', 'In-store pickup'], ['curbside', 'Curbside'], ['medical', 'Medical patients welcome'], ['age21', '21+ only']];
      function group(legend, rows, store, prefix) {
        var fs = el(doc, 'fieldset', 'dash-group'); fs.appendChild(el(doc, 'legend', null, legend));
        rows.forEach(function (r) { var lab = el(doc, 'label', 'check'), boxc = el(doc, 'input'); boxc.type = 'checkbox'; boxc.checked = !!(store && store[r[0]]); boxc.setAttribute('data-act', prefix + r[0]); lab.appendChild(boxc); lab.appendChild(el(doc, 'span', null, ' ' + r[1])); fs.appendChild(lab); });
        panel.appendChild(fs);
      }
      if (caps.amenities) { group('Ways to pay', PAY, p.payments, 'pf-pay-'); group('Amenities', AMEN, p.amenities, 'pf-amen-'); }
      var save = el(doc, 'button', 'btn', 'Save profile'); save.type = 'button'; save.setAttribute('data-act', 'pf-save');
      panel.appendChild(save);
      var msg = say(''); msg.setAttribute('data-act', 'pf-msg');
      save.addEventListener('click', function () {
        var body = { display_name: val('pf-name'), tagline: val('pf-tag'), about: val('pf-about'), public_email: val('pf-email'), phone: val('pf-phone'), website: val('pf-web'), social: {} };
        if (caps.storefront) { body.address_line1 = val('pf-line'); body.address_city = val('pf-city'); body.address_zip = val('pf-zip'); }
        if (caps.delivery) { body.zones = val('pf-zones'); body.delivery_minimum = val('pf-min'); }
        ['instagram', 'facebook', 'x', 'youtube', 'tiktok'].forEach(function (k) { body.social[k] = val('pf-social-' + k); });
        if (body.website && httpsUrl(body.website) === null) { msg.textContent = 'Website must start with https://'; return; }
        for (var si = 0; si < SOCIAL.length; si++) { var sv = body.social[SOCIAL[si][0]]; if (sv && httpsUrl(sv) === null) { msg.textContent = SOCIAL[si][1] + ' link must start with https://'; return; } }
        if (caps.amenities) {
          body.payments = {}; body.amenities = {};
          ['cash', 'debit', 'atm'].forEach(function (k) { body.payments[k] = checked('pf-pay-' + k); });
          ['ada', 'parking', 'pickup', 'curbside', 'medical', 'age21'].forEach(function (k) { body.amenities[k] = checked('pf-amen-' + k); });
        }
        rpc(win, token, 'set_my_profile', { p: body }).then(function (r) {
          if (r.ok && r.data) { state.biz = r.data; msg.textContent = 'Saved.'; } else msg.textContent = why(r, 'Could not save. Try again.');
        });
      });
    }
    function val(act) { var n = panel.querySelector('[data-act="' + act + '"]'); return n ? n.value : ''; }
    function checked(act) { var n = panel.querySelector('[data-act="' + act + '"]'); return !!(n && n.checked); }
    function photos() {
      panel.appendChild(el(doc, 'h2', null, 'Photos & media'));
      panel.appendChild(el(doc, 'p', 'muted', 'Logo, banner, and gallery. The server removes camera and location data before storing a photo. Up to 20 listing images. Photos are shrunk to fit for you before they are sent.'));
      var msg = statusLine('ph-msg');
      [['logo', 'Logo'], ['hero', 'Banner'], ['gallery', 'Gallery']].forEach(function (c) {
        var cat = c[0], lab = el(doc, 'label', null, c[1]), input = el(doc, 'input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.setAttribute('data-act', 'up-' + cat);
        lab.appendChild(input); panel.appendChild(lab);
        input.addEventListener('change', function () {
          if (!(input.files && input.files[0])) return;
          msg.textContent = 'Uploading…';
          upload(input.files[0], cat, null).then(function (r) { input.value = ''; msg.textContent = r.ok ? 'Uploaded.' : upMsg(r.error); if (r.ok) loadMedia(); });
        });
      });
      panel.appendChild(msg);
      var grid = el(doc, 'div', 'dash-media'); grid.setAttribute('data-act', 'media-grid'); panel.appendChild(grid);
      function loadMedia() {
        grid.textContent = '';
        rpc(win, token, 'media_list', {}).then(function (r) {
          if (!r.ok) { grid.appendChild(el(doc, 'p', 'muted', 'Could not load your photos. Try again.')); return; }
          var rows = Array.isArray(r.data) ? r.data : [];
          if (!rows.length) { grid.appendChild(el(doc, 'p', 'muted', 'No photos yet.')); return; }
          var base = win.FMW_CONFIG && win.FMW_CONFIG.authProject && win.FMW_CONFIG.authProject.url;
          rows.forEach(function (m) {
            var card = el(doc, 'div', 'dash-item'), name = m.category === 'hero' ? 'banner' : (m.category || 'photo');
            var src = root.FMW_LISTING && root.FMW_LISTING.mediaUrl ? root.FMW_LISTING.mediaUrl(base, m.path) : '';
            if (src) { var img = el(doc, 'img'); img.src = src; img.alt = 'Your ' + name + ' image'; card.appendChild(img); }
            card.appendChild(el(doc, 'p', null, name));
            var del = el(doc, 'button', 'btn ghost', 'Remove'); del.type = 'button'; del.setAttribute('aria-label', 'Remove ' + name + ' image');
            del.addEventListener('click', function () { uploadDelete(m.id).then(function (rr) { msg.textContent = rr.ok ? 'Removed.' : 'Could not remove it. Try again.'; loadMedia(); }); });
            card.appendChild(del); grid.appendChild(card);
          });
        });
      }
      loadMedia();
    }
    function upMsg(code) { return root.FMW_UPLOAD_IMAGE ? root.FMW_UPLOAD_IMAGE.messageFor(code) : 'Could not upload. Try again.'; }
    function upload(file, category, itemId) {
      var cfg = win.FMW_CONFIG && win.FMW_CONFIG.authProject, f = win.fetch, U = root.FMW_UPLOAD_IMAGE;
      if (!cfg || !f) return Promise.resolve({ ok: false, error: 'other' });
      // a phone photo is shrunk first (longest side 1920, EXIF rotation applied, JPEG ~0.85, a PNG logo stays PNG); a document or an undecodable file goes as it is
      return (U ? U.prepare(win, file, category) : Promise.resolve({ file: file })).then(function (p) {
        if (p.error) return { ok: false, error: p.error };
        var fd = new win.FormData(); fd.append('file', p.file); fd.append('category', category); if (itemId) fd.append('item_id', itemId);
        return f(cfg.url + '/functions/v1/fmw-upload-media', { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + token }, body: fd })
          .then(function (r) { return U ? U.outcome(r) : { ok: !!(r && r.ok) }; }, function () { return { ok: false, error: 'network' }; });
      });
    }
    function uploadDelete(id) {
      var cfg = win.FMW_CONFIG && win.FMW_CONFIG.authProject, f = win.fetch;
      if (!cfg || !f) return Promise.resolve({ ok: false });
      return f(cfg.url + '/functions/v1/fmw-upload-media', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'delete', id: id }) })
        .then(function (r) { return { ok: !!(r && r.ok) }; }, function () { return { ok: false }; });
    }
    // one status line per screen (role=status, so a screen reader hears the result of a save, an import or a remove)
    function statusLine(act) { var p = el(doc, 'p', 'muted', ''); p.setAttribute('role', 'status'); p.setAttribute('data-act', act); return p; }
    function removeBtn(name, what, onClick) { var b = el(doc, 'button', 'btn ghost', 'Remove'); b.type = 'button'; b.setAttribute('aria-label', 'Remove ' + what); b.addEventListener('click', onClick); return b; }
    function parseCsvLine(line) {   // commas inside "double quotes" stay in the cell; "" is a quote
      var out = [], cur = '', q = false;
      for (var k = 0; k < line.length; k++) {
        var ch = line.charAt(k);
        if (q) { if (ch === '"') { if (line.charAt(k + 1) === '"') { cur += '"'; k++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur); return out;
    }
    function catalog(biz, caps) {
      panel.appendChild(el(doc, 'h2', null, catalogTitle(caps)));
      if (caps.consumer_menu) panel.appendChild(el(doc, 'p', 'muted', 'A live menu. Nothing is sold or reserved on Find My Weed.'));
      if (caps.wholesale) panel.appendChild(el(doc, 'p', 'muted', 'Products for other licensed businesses. Nothing is sold or priced for the public on Find My Weed.'));
      var msg = statusLine('cat-msg');
      function say2(text) { msg.textContent = text; }
      if (caps.brand) whereToBuy();
      if (caps.lab) serviceForm();
      if (caps.events) eventForm();
      if (caps.consumer_menu || caps.wholesale) itemForm(caps);
      panel.appendChild(msg);
      var list = el(doc, 'div'); list.setAttribute('data-act', 'cat-list'); panel.appendChild(list);
      function group(title) { var g = el(doc, 'div'); g.appendChild(el(doc, 'h3', null, title)); list.appendChild(g); return g; }
      function item(g, text, buttons) { var row = el(doc, 'p', 'dash-row', text); buttons.forEach(function (b) { row.appendChild(b); }); g.appendChild(row); }
      function del(name, arg, id, what) { return removeBtn(name, what, function () { var body = {}; body[arg] = id; rpc(win, token, name, body).then(function (r) { if (r.ok) { say2('Removed.'); refresh(); } else say2(why(r, 'Could not remove it. Try again.')); }); }); }
      function refresh() {
        list.textContent = '';
        var jobs = [];
        if (caps.consumer_menu || caps.wholesale) jobs.push(rpc(win, token, 'inventory_list', {}).then(function (r) { return { kind: 'inv', r: r }; }));
        if (caps.lab || caps.consumer_menu) jobs.push(rpc(win, token, 'service_list', {}).then(function (r) { return { kind: 'svc', r: r }; }));
        if (caps.events) jobs.push(rpc(win, token, 'event_list', {}).then(function (r) { return { kind: 'ev', r: r }; }));
        if (caps.brand) jobs.push(rpc(win, token, 'where_list', {}).then(function (r) { return { kind: 'where', r: r }; }));
        Promise.all(jobs).then(function (groups) {
          var any = false;
          groups.forEach(function (res) {
            if (!res.r.ok) { list.appendChild(el(doc, 'p', 'muted', 'Could not load this list. Try again.')); return; }
            var rows = Array.isArray(res.r.data) ? res.r.data : []; if (!rows.length) return; any = true;
            if (res.kind === 'inv') {
              var g = group(caps.consumer_menu ? 'Menu items' : 'Catalog items');
              rows.forEach(function (row) {
                var whole = row.kind === 'wholesale', offWord = whole ? 'unavailable' : 'out of stock', onWord = whole ? 'available' : 'in stock';
                var stock = el(doc, 'button', 'btn ghost', row.in_stock ? 'Mark ' + offWord : 'Mark ' + onWord); stock.type = 'button'; stock.setAttribute('aria-label', (row.in_stock ? 'Mark ' + offWord + ': ' : 'Mark ' + onWord + ': ') + row.title);
                stock.addEventListener('click', function () {
                  var p = { id: row.id, kind: row.kind, category: row.category, title: row.title, description: row.description, brand: row.brand, strain_type: row.strain_type, thc: row.thc, cbd: row.cbd, size: row.size, price: row.price, featured: row.featured, coa_url: row.coa_url, moq: row.moq, lead_time: row.lead_time, in_stock: !row.in_stock, featured: row.featured, coa_url: row.coa_url, moq: row.moq, lead_time: row.lead_time };
                  rpc(win, token, 'inventory_save', { p: p }).then(function (r) { if (r.ok) { say2('Saved.'); refresh(); } else say2(why(r, 'Could not save. Try again.')); });
                });
                item(g, row.title + (row.category ? ' · ' + row.category : '') + (whole ? (row.moq ? ' · Minimum ' + row.moq : '') + (row.lead_time ? ' · Lead time ' + row.lead_time : '') : (row.price ? ' · ' + row.price : '')) + (row.in_stock ? '' : ' · ' + offWord), [stock, del('inventory_delete', 'p_id', row.id, row.title)]);
              });
            } else if (res.kind === 'svc') {
              var g2 = group('Services');
              rows.forEach(function (row) { item(g2, row.title + (row.price ? ' · ' + row.price : ''), [del('service_delete', 'p_id', row.id, row.title)]); });
            } else if (res.kind === 'ev') {
              var g3 = group('Events');
              rows.forEach(function (row) { item(g3, row.title + (row.venue ? ' · ' + row.venue : '') + (row.starts_on ? ' · ' + String(row.starts_on).slice(0, 10) : ''), [del('event_delete', 'p_id', row.id, row.title)]); });
            } else {
              var g4 = group('Linked retailers');
              rows.forEach(function (row) { item(g4, row.target_license, [del('where_delete', 'p_id', row.id, row.target_license)]); });
            }
          });
          if (!any && groups.every(function (x) { return x.r.ok; })) list.appendChild(el(doc, 'p', 'muted', 'Nothing here yet.'));
        });
      }
      function itemForm(c) {
        var cats = c.consumer_menu ? RETAIL : WHOLESALE;
        var title = field(doc, 'Name', '', 'item-title');
        var catLab = el(doc, 'label', null, 'Category'), cat = el(doc, 'select'); cat.setAttribute('data-act', 'item-cat'); cats.forEach(function (n) { var o = el(doc, 'option', null, n); o.value = n; cat.appendChild(o); }); catLab.appendChild(cat);
        var wholesaleOnly = !c.consumer_menu;
        var price = wholesaleOnly ? null : field(doc, 'Price (display only)', '', 'item-price');
        var moq = wholesaleOnly ? field(doc, 'Minimum order', '', 'item-moq') : null, lead = wholesaleOnly ? field(doc, 'Lead time', '', 'item-lead') : null;
        var save = el(doc, 'button', 'btn', 'Add item'); save.type = 'button'; save.setAttribute('data-act', 'item-save');
        panel.appendChild(title.label); panel.appendChild(catLab); if (price) panel.appendChild(price.label); if (moq) { panel.appendChild(moq.label); panel.appendChild(lead.label); } panel.appendChild(save);
        if (c.consumer_menu) {
          var csvLab = el(doc, 'label', null, 'Import a CSV'), csv = el(doc, 'input'); csv.type = 'file'; csv.accept = '.csv,text/csv'; csv.setAttribute('data-act', 'item-csv'); csvLab.appendChild(csv);
          panel.appendChild(el(doc, 'p', 'muted', 'CSV columns: title, category, price. A bad row stops the import; the rows before it are kept.'));
          panel.appendChild(csvLab);
          csv.addEventListener('change', function () {
            var file = csv.files && csv.files[0]; if (!file || !win.FileReader) return;
            var reader = new win.FileReader();
            reader.onload = function () { say2('Importing…'); importCsv(String(reader.result || ''), 'retail').then(function (res) { say2(res.ok ? 'Imported ' + res.done + ' item' + (res.done === 1 ? '' : 's') + '.' : 'Stopped at row ' + res.row + ': ' + why(res.r, 'the row was refused') + ' ' + res.done + ' earlier row' + (res.done === 1 ? ' was' : 's were') + ' added.'); csv.value = ''; refresh(); }); };
            reader.readAsText(file);
          });
        }
        save.addEventListener('click', function () {
          if (!title.input.value.trim()) { say2('Enter a name.'); return; }
          var body = { kind: c.consumer_menu ? 'retail' : 'wholesale', category: cat.value, title: title.input.value, in_stock: true };
          if (price) body.price = price.input.value; else { body.moq = moq.input.value; body.lead_time = lead.input.value; }   // a wholesale item carries a minimum order and a lead time, never a price
          rpc(win, token, 'inventory_save', { p: body }).then(function (r) {
            if (r.ok) { title.input.value = ''; if (price) price.input.value = ''; else { moq.input.value = ''; lead.input.value = ''; } say2('Added.'); refresh(); } else say2(why(r, 'Could not add the item. Try again.'));
          });
        });
      }
      function serviceForm() {
        var title = field(doc, 'Service', '', 'svc-title'), price = field(doc, 'Price or quote', '', 'svc-price');
        var save = el(doc, 'button', 'btn', 'Add service'); save.type = 'button'; save.setAttribute('data-act', 'svc-save');
        panel.appendChild(title.label); panel.appendChild(price.label); panel.appendChild(save);
        save.addEventListener('click', function () {
          if (!title.input.value.trim()) { say2('Enter the service name.'); return; }
          rpc(win, token, 'service_save', { p: { title: title.input.value, price: price.input.value } }).then(function (r) { if (r.ok) { title.input.value = ''; price.input.value = ''; say2('Added.'); refresh(); } else say2(why(r, 'Could not add the service. Try again.')); });
        });
      }
      function eventForm() {
        var title = field(doc, 'Event', '', 'ev-title'), venue = field(doc, 'Venue', '', 'ev-venue'), when = field(doc, 'Date', '', 'ev-date', 'date'), ticket = field(doc, 'Ticket link', '', 'ev-ticket', 'url');
        var save = el(doc, 'button', 'btn', 'Add event'); save.type = 'button'; save.setAttribute('data-act', 'ev-save');
        panel.appendChild(title.label); panel.appendChild(venue.label); panel.appendChild(when.label); panel.appendChild(ticket.label); panel.appendChild(save);
        save.addEventListener('click', function () {
          if (!title.input.value.trim()) { say2('Enter the event name.'); return; }
          if (ticket.input.value && httpsUrl(ticket.input.value) === null) { say2('The ticket link must start with https://'); return; }
          rpc(win, token, 'event_save', { p: { title: title.input.value, venue: venue.input.value, starts_on: when.input.value, ticket_url: ticket.input.value } }).then(function (r) {
            if (r.ok) { title.input.value = ''; venue.input.value = ''; when.input.value = ''; ticket.input.value = ''; say2('Added.'); refresh(); } else say2(why(r, 'Could not add the event. Try again.'));
          });
        });
      }
      function whereToBuy() {
        var lic = field(doc, 'Retailer license number', '', 'wtb-lic');
        var save = el(doc, 'button', 'btn', 'Link a retailer'); save.type = 'button'; save.setAttribute('data-act', 'wtb-save');
        panel.appendChild(el(doc, 'p', 'muted', 'Where to buy links only to an approved, live licensed retailer.'));
        panel.appendChild(lic.label); panel.appendChild(save);
        save.addEventListener('click', function () {
          if (!lic.input.value.trim()) { say2('Enter the retailer\'s license number.'); return; }
          rpc(win, token, 'where_save', { p_license: lic.input.value }).then(function (r) { if (r.ok) { lic.input.value = ''; say2('Linked.'); refresh(); } else say2(why(r, 'Could not link that retailer. Check the license number.')); });
        });
      }
      refresh();
    }
    // returns { ok: true, done } or { ok: false, row, r, done }: row = the 1-based line that stopped it
    function importCsv(text, kind) {
      var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
      var head = lines.length ? parseCsvLine(lines[0]).map(function (c) { return c.trim().toLowerCase(); }) : [];
      var start = head[0] === 'title' && head[1] === 'category' ? 1 : 0;
      var chain = Promise.resolve({ ok: true, done: 0 });
      for (var i = start; i < lines.length; i++) {
        (function (line, n) {
          chain = chain.then(function (prev) {
            if (!prev.ok) return prev;
            var cols = parseCsvLine(line);
            var title = (cols[0] || '').trim(), category = (cols[1] || '').trim(), price = (cols[2] || '').trim();
            return rpc(win, token, 'inventory_save', { p: { kind: kind, title: title, category: category, price: price, in_stock: true } }).then(function (r) {
              return r.ok ? { ok: true, done: prev.done + 1 } : { ok: false, row: n, r: r, done: prev.done };
            });
          });
        })(lines[i], i + 1);
      }
      return chain;
    }
    var DEAL_KINDS = { daily: 'Daily deal', first: 'First-time customers', bogo: 'Buy one, get one', percent: 'Percent off' };
    function deals() {
      panel.appendChild(el(doc, 'h2', null, 'Deals & promos'));
      panel.appendChild(el(doc, 'p', 'muted', 'Shown on your listing while they are current. No coupon checkout.'));
      var title = field(doc, 'Deal', '', 'deal-title'), detail = field(doc, 'Details', '', 'deal-detail'), from = field(doc, 'Starts (optional)', '', 'deal-from', 'date'), to = field(doc, 'Ends (optional)', '', 'deal-to', 'date');
      var kindLab = el(doc, 'label', null, 'Type'), kind = el(doc, 'select'); kind.setAttribute('data-act', 'deal-kind'); Object.keys(DEAL_KINDS).forEach(function (k) { var o = el(doc, 'option', null, DEAL_KINDS[k]); o.value = k; kind.appendChild(o); }); kindLab.appendChild(kind);
      var save = el(doc, 'button', 'btn', 'Publish deal'); save.type = 'button'; save.setAttribute('data-act', 'deal-save');
      var msg = statusLine('deal-msg'), list = el(doc, 'div'); list.setAttribute('data-act', 'deal-list');
      panel.appendChild(title.label); panel.appendChild(detail.label); panel.appendChild(kindLab); panel.appendChild(from.label); panel.appendChild(to.label); panel.appendChild(save); panel.appendChild(msg); panel.appendChild(list);
      function refresh() {
        list.textContent = '';
        rpc(win, token, 'deal_list', {}).then(function (r) {
          if (!r.ok) { list.appendChild(el(doc, 'p', 'muted', 'Could not load your deals. Try again.')); return; }
          var rows = Array.isArray(r.data) ? r.data : [];
          if (!rows.length) { list.appendChild(el(doc, 'p', 'muted', 'No deals yet.')); return; }
          rows.forEach(function (d) {
            var when = (d.starts_at || d.ends_at) ? ' · ' + (d.starts_at ? String(d.starts_at).slice(0, 10) : '') + ' to ' + (d.ends_at ? String(d.ends_at).slice(0, 10) : '') : '';
            var row = el(doc, 'p', 'dash-row', d.title + ' · ' + (DEAL_KINDS[d.kind] || d.kind) + when + ' · ' + (d.published ? 'Showing' : 'Hidden'));
            var tog = el(doc, 'button', 'btn ghost', d.published ? 'Hide' : 'Show'); tog.type = 'button'; tog.setAttribute('aria-label', (d.published ? 'Hide deal: ' : 'Show deal: ') + d.title);
            tog.addEventListener('click', function () {
              rpc(win, token, 'deal_save', { p: { id: d.id, title: d.title, detail: d.detail, kind: d.kind, starts_at: d.starts_at, ends_at: d.ends_at, inventory_id: d.inventory_id, published: !d.published } }).then(function (rr) { if (rr.ok) { msg.textContent = 'Saved.'; refresh(); } else msg.textContent = why(rr, 'Could not save. Try again.'); });
            });
            row.appendChild(tog);
            row.appendChild(removeBtn('deal_delete', d.title, function () { rpc(win, token, 'deal_delete', { p_id: d.id }).then(function (rr) { if (rr.ok) { msg.textContent = 'Removed.'; refresh(); } else msg.textContent = why(rr, 'Could not remove it. Try again.'); }); }));
            list.appendChild(row);
          });
        });
      }
      save.addEventListener('click', function () {
        if (!title.input.value.trim()) { msg.textContent = 'Enter the deal.'; return; }
        rpc(win, token, 'deal_save', { p: { title: title.input.value, detail: detail.input.value, kind: kind.value, starts_at: from.input.value, ends_at: to.input.value, published: true } }).then(function (r) {
          if (r.ok) { title.input.value = ''; detail.input.value = ''; from.input.value = ''; to.input.value = ''; msg.textContent = 'Published.'; refresh(); } else msg.textContent = why(r, 'Could not publish the deal. Try again.');
        });
      });
      refresh();
    }
    function contactLink(kind, raw) {   // a mailto: or tel: link only for a value that looks like one; anything else is plain text
      var s = String(raw == null ? '' : raw).trim(); if (!s) return null;
      if (kind === 'email' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) && s.length <= 254) { var a = el(doc, 'a', null, s); a.href = 'mailto:' + s; return a; }
      if (kind === 'phone' && /^\+?[0-9 ().-]{7,20}$/.test(s)) { var b = el(doc, 'a', null, s); b.href = 'tel:' + (s.charAt(0) === '+' ? '+' : '') + s.replace(/[^0-9]/g, ''); return b; }
      return el(doc, 'span', null, s);
    }
    function inquiries() {
      panel.appendChild(el(doc, 'h2', null, (state.biz && state.biz.caps && state.biz.caps.wholesale) ? 'Wholesale inquiries' : 'Inquiries'));
      var msg = statusLine('inq-msg'), list = el(doc, 'div'); panel.appendChild(msg); panel.appendChild(list);
      rpc(win, token, 'inquiry_list', {}).then(function (r) {
        if (!r.ok) { list.appendChild(el(doc, 'p', 'muted', 'Could not load your inquiries. Try again.')); return; }
        var rows = Array.isArray(r.data) ? r.data : [];
        if (!rows.length) { list.appendChild(el(doc, 'p', 'muted', 'No inquiries yet.')); return; }
        rows.forEach(function (q) {
          var card = el(doc, 'article', 'dash-item');
          card.appendChild(el(doc, 'p', null, (q.name || 'Someone') + ' · ' + (q.kind || 'inquiry') + (q.created_at ? ' · ' + String(q.created_at).slice(0, 10) : '') + (q.handled ? ' · handled' : '')));
          card.appendChild(el(doc, 'p', null, q.message || ''));
          // how to answer them: the contact they left, as links
          var how = el(doc, 'p', 'muted', ''), e = contactLink('email', q.email), ph = contactLink('phone', q.phone);
          if (e || ph) { how.appendChild(doc.createTextNode('Reply: ')); if (e) how.appendChild(e); if (e && ph) how.appendChild(doc.createTextNode(' · ')); if (ph) how.appendChild(ph); card.appendChild(how); }
          var btn = el(doc, 'button', 'btn ghost', q.handled ? 'Mark new' : 'Mark handled'); btn.type = 'button';
          btn.addEventListener('click', function () { rpc(win, token, 'inquiry_mark', { p_id: q.id, p_handled: !q.handled }).then(function (rr) { if (rr.ok) show('inquiries'); else msg.textContent = why(rr, 'Could not update it. Try again.'); }); });
          card.appendChild(btn); list.appendChild(card);
        });
      });
    }
    function team(role) {
      panel.appendChild(el(doc, 'h2', null, 'Team'));
      var list = el(doc, 'div'); panel.appendChild(list);
      if (role === 'owner') {
        var email = field(doc, 'Email', '', 'tm-email', 'email');
        var roleLab = el(doc, 'label', null, 'Role'), sel = el(doc, 'select'); sel.setAttribute('data-act', 'tm-role'); [['manager', 'Manager (edits the profile and everything below)'], ['editor', (state.biz && state.biz.caps && state.biz.caps.consumer_menu) ? 'Editor (menu, deals, photos, inquiries)' : 'Editor (catalog, photos, inquiries)']].forEach(function (r) { var o = el(doc, 'option', null, r[1]); o.value = r[0]; sel.appendChild(o); }); roleLab.appendChild(sel);
        var save = el(doc, 'button', 'btn', 'Create invite'); save.type = 'button'; save.setAttribute('data-act', 'tm-invite');
        var msg = el(doc, 'p', 'muted', ''); msg.setAttribute('data-act', 'tm-msg');
        panel.appendChild(email.label); panel.appendChild(roleLab); panel.appendChild(save); panel.appendChild(msg);
        save.addEventListener('click', function () {
          var to = email.input.value.trim();
          rpc(win, token, 'team_invite', { p_email: to, p_role: sel.value }).then(function (r) {
            msg.textContent = '';
            var d = r.ok ? r.data : null;
            if (d && d.ok && d.token) {
              msg.textContent = 'Invite code for ' + to + ' (one use, 72 hours): ';
              var code = el(doc, 'code', 'mono', d.token); code.setAttribute('data-act', 'tm-code'); msg.appendChild(code);
              msg.appendChild(el(doc, 'span', null, ' Send it to them. They sign in with that email address, open Account, and paste it under Join a business team.'));
              if (win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText) {
                var copy = el(doc, 'button', 'btn ghost', 'Copy code'); copy.type = 'button'; copy.setAttribute('data-act', 'tm-copy');
                copy.addEventListener('click', function () { win.navigator.clipboard.writeText(d.token).then(function () { copy.textContent = 'Copied'; }, function () { copy.textContent = 'Select the code and copy it'; }); });
                msg.appendChild(copy);
              }
              email.input.value = ''; loadList();
            } else if (d && d.error === 'limit') msg.textContent = 'Too many invites. Try again tomorrow.';
            else if (d && d.error === 'email') msg.textContent = 'Enter a valid email address.';
            else msg.textContent = why(r, 'Could not create the invite. Try again.');
          });
        });
      }
      function loadList() {
        list.textContent = '';
        rpc(win, token, 'my_team', {}).then(function (r) {
          if (!r.ok) { list.appendChild(el(doc, 'p', 'muted', 'Could not load the team. Try again.')); return; }
          var rows = Array.isArray(r.data) ? r.data : [];
          rows.forEach(function (m) {
            var row = el(doc, 'p', null, (m.display_name ? m.display_name + ' · ' : '') + (m.email || '') + ' · ' + m.role + (m.status && m.status !== 'active' ? ' (' + m.status + ')' : ''));
            if (role === 'owner' && m.role !== 'owner') {
              var rev = el(doc, 'button', 'btn ghost', 'Remove'); rev.type = 'button'; rev.setAttribute('aria-label', 'Remove ' + (m.email || 'this member'));
              rev.addEventListener('click', function () { rpc(win, token, 'team_revoke', { p_member: m.member_id }).then(function (rr) { if (rr.ok) loadList(); else list.insertBefore(el(doc, 'p', 'muted', why(rr, 'Could not remove that member.')), list.firstChild); }); });
              row.appendChild(rev);
            }
            list.appendChild(row);
          });
        });
      }
      loadList();
    }
    function verification(biz) {
      panel.appendChild(el(doc, 'h2', null, 'License'));
      var L = biz.license || {};
      panel.appendChild(el(doc, 'p', null, biz.role === 'owner' ? 'This account is approved for this license.' : 'You are ' + (biz.role === 'editor' ? 'an ' : 'a ') + (biz.role || 'member') + ' on this account.'));
      panel.appendChild(el(doc, 'p', 'mono', L.number || ''));
      if (L.status) panel.appendChild(el(doc, 'p', null, L.status));
      panel.appendChild(el(doc, 'p', 'muted', 'If the name on the account does not match the state record, upload a document for a person on our team to review. It is never shown on the public listing.'));
      var input = el(doc, 'input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,application/pdf'; input.setAttribute('data-act', 'claim-file'); input.setAttribute('aria-label', 'Document that shows the name on this license');   // the only control on the License tab: named for assistive tech (axe: label)
      panel.appendChild(input);
      var msg = say('');
      input.addEventListener('change', function () {
        var file = input.files && input.files[0]; if (!file) return;
        upload(file, 'claim', null).then(function (r) { msg.textContent = r.ok ? 'Uploaded for review.' : upMsg(r.error); });
      });
      if (biz.role === 'owner') {
        var rel = el(doc, 'button', 'btn ghost', 'Release this business'); rel.type = 'button'; rel.setAttribute('data-act', 'release');
        panel.appendChild(rel);
        var armed = false;   // two steps: this removes the business from the account, so the first click only asks
        rel.addEventListener('click', function () {
          if (!armed) { armed = true; rel.textContent = 'Yes, release this business'; msg.textContent = 'This deletes the photos of this business, ends its approval and removes everyone on the team from it. Click again to confirm.'; var no = el(doc, 'button', 'btn ghost', 'Cancel'); no.type = 'button'; no.setAttribute('data-act', 'release-cancel'); no.addEventListener('click', function () { armed = false; rel.textContent = 'Release this business'; msg.textContent = ''; if (no.parentNode) no.parentNode.removeChild(no); }); rel.parentNode.insertBefore(no, rel.nextSibling); return; }
          rpc(win, token, 'release_my_business', {}).then(function (r) {
            msg.textContent = r.ok ? 'This business is no longer on your account. You can delete the account from Your data.' : 'Could not release. Transfer ownership first if someone else should keep it.';
            if (r.ok && r.data && r.data.paths && win.fetch) {
              var cfg = win.FMW_CONFIG.authProject;
              win.fetch(cfg.url + '/functions/v1/fmw-upload-media', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'purge', paths: r.data.paths }) });
            }
          });
        });
      }
    }
    return rpc(win, token, 'my_business', {}).then(function (r) {
      if (!r.ok || !r.data) { say('Business tools are not available for this account yet.'); return 'off'; }
      state.biz = r.data;
      LABELS.catalog = catalogTitle(r.data.caps);
      LABELS.profile = win.FMW_CONFIG && win.FMW_CONFIG.hours && r.data.caps && r.data.caps.hours && !hasTab('hours') ? 'Profile & hours' : 'Profile';   // hours are on their own tab when it is registered (js/dashboard-hours.js)
      var order = panelsFor(r.data.role, r.data.caps), more = extraTabs(win, r.data.role, r.data), ids = order.slice();
      more.forEach(function (x) {   // each extra goes after the tab it asks for (when that tab is there), else just before License, else last
        var a = x.after ? ids.indexOf(x.after) : -1, v = ids.indexOf('verification');
        ids.splice(a >= 0 ? a + 1 : (v >= 0 ? v : ids.length), 0, x.key);
      });
      ids.forEach(function (tab) {
        var ex = more.filter(function (x) { return x.key === tab; })[0], text = ex ? (typeof ex.label === 'function' ? ex.label(win.FMW_COPY) : ex.label) : (LABELS[tab] || tab);
        var b = el(doc, 'button', null, String(text == null ? tab : text)); b.type = 'button'; b.setAttribute('data-tab', tab);
        b.addEventListener('click', function () { show(tab); var h = panel.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); if (h.focus) h.focus(); } }); nav.appendChild(b);
      });
      show('overview');
      return 'dashboard';
    }, function () { say('Business tools are not available for this account yet.'); return 'off'; });
  }
  // The invite code card: for a signed-in account that is not (yet) a member of any business. team_accept checks the code and that the signed-in email is the invited one.
  function joinCard(doc, holder, ctx) {
    var win = ctx.win, sec = el(doc, 'details', 'dash dash-join'); sec.setAttribute('data-state', 'join-team');   // collapsed: most signed-in accounts are customers and never need it
    sec.appendChild(el(doc, 'summary', null, 'Have a business invite code?'));
    var panel = el(doc, 'div', 'dash-panel'); sec.appendChild(panel);
    panel.appendChild(el(doc, 'h2', null, 'Join a business team'));
    panel.appendChild(el(doc, 'p', 'muted', 'Invited to help run a business on Find My Weed? Sign in with the email address that was invited, then paste the invite code here.'));
    var f = field(doc, 'Invite code', '', 'inv-code'); f.input.setAttribute('autocomplete', 'off'); f.input.setAttribute('spellcheck', 'false'); panel.appendChild(f.label);
    var btn = el(doc, 'button', 'btn', 'Join this business'); btn.type = 'button'; btn.setAttribute('data-act', 'inv-join'); panel.appendChild(btn);
    var msg = el(doc, 'p', 'muted', ''); msg.setAttribute('role', 'status'); msg.setAttribute('data-act', 'inv-msg'); panel.appendChild(msg);
    btn.addEventListener('click', function () {
      var code = f.input.value.trim();
      if (!/^[0-9a-f]{64}$/i.test(code)) { msg.textContent = 'That does not look like an invite code. Paste the whole code you were sent.'; return; }
      btn.disabled = true; msg.textContent = 'Checking…';
      rpc(win, ctx.token, 'team_accept', { p_token: code }).then(function (r) {
        btn.disabled = false;
        if (r.ok && r.data && r.data.ok) {
          msg.textContent = 'You have joined this business. ';
          var go = el(doc, 'button', 'btn', 'Open business tools'); go.type = 'button'; go.addEventListener('click', function () { if (win.location && win.location.reload) win.location.reload(); }); msg.appendChild(go);
        } else msg.textContent = r.status === 403 ? 'That code did not work. Check that you signed in with the invited email, and that the code is less than 72 hours old and not used yet.' : why(r, 'Could not join. Try again.');
      });
    });
    holder.appendChild(sec); return sec;
  }
  // For any signed-in account: the dashboard when it belongs to a business (owner, manager or editor), otherwise the join card. -> Promise of 'dashboard' | 'join'.
  function mountMember(doc, box, ctx) {
    var holder = el(doc, 'div'); box.appendChild(holder);
    return rpc(ctx.win, ctx.token, 'my_business', {}).then(function (r) {
      if (r.ok && r.data) { mount(doc, holder, ctx); return 'dashboard'; }
      joinCard(doc, holder, ctx); return 'join';
    });
  }
  var api = { mount: mount, registerTab: registerTab, hasTab: hasTab, mountMember: mountMember, joinCard: joinCard, why: why, panelsFor: panelsFor, catalogTitle: catalogTitle, httpsUrl: httpsUrl, RETAIL: RETAIL, WHOLESALE: WHOLESALE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FMW_DASHBOARD = api;
})(typeof window !== 'undefined' ? window : globalThis);
