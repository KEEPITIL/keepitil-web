/* Creator controls on /dashboard: public link, UTM/promoter link, promo codes, and traffic counts.
   Strings from the database are written with textContent. Buttons use addEventListener, never inline handlers.
   RPCs: kil_list_promo_codes, kil_upsert_promo_code, kil_event_traffic (owner-only; see the promo migration). */
(function (root) {
  'use strict';
  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function slugOk(s) { return /^[a-z0-9][a-z0-9-]{0,200}$/.test(String(s || '')); }
  function cleanUtm(v) { return String(v || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80); }
  function codeOk(v) { return /^[A-Z0-9_-]{2,24}$/.test(String(v || '')); }
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCsv(rows) {
    var head = ['name', 'email', 'tier', 'quantity', 'checked_in', 'at'];
    var lines = [head.join(',')];
    (rows || []).forEach(function (r) {
      lines.push([r.name, r.email, r.tier, r.quantity == null ? 1 : r.quantity, r.checked_in ? 'yes' : 'no', r.at].map(csvCell).join(','));
    });
    return lines.join('\n');
  }
  function downloadCsv(doc, filename, text) {
    try {
      var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      var u = URL.createObjectURL(blob);
      var a = el(doc, 'a'); a.href = u; a.download = filename;
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 500);
    } catch (e) {}
  }
  function attendeesBlock(doc, slug, hnd) {
    var box = el(doc, 'div', 'cr-people');
    box.appendChild(el(doc, 'p', 'cr-k', 'Attendees'));
    var search = el(doc, 'input'); search.type = 'search'; search.className = 'cr-find'; search.placeholder = 'Search name or email'; search.setAttribute('aria-label', 'Search attendees');
    var filter = el(doc, 'select'); filter.className = 'cr-filter'; filter.setAttribute('aria-label', 'Filter check-in');
    [['all', 'All'], ['in', 'Checked in'], ['out', 'Not checked in']].forEach(function (o) { var opt = el(doc, 'option', '', o[1]); opt.value = o[0]; filter.appendChild(opt); });
    var exp = el(doc, 'button', 'cr-btn', 'Export CSV'); exp.type = 'button';
    var table = el(doc, 'div', 'cr-att');
    var all = [];
    function draw() {
      var q = search.value.trim().toLowerCase();
      var mode = filter.value;
      var shown = all.filter(function (r) {
        var hay = (String(r.name || '') + ' ' + String(r.email || '') + ' ' + String(r.tier || '')).toLowerCase();
        if (q && hay.indexOf(q) < 0) return false;
        if (mode === 'in' && !r.checked_in) return false;
        if (mode === 'out' && r.checked_in) return false;
        return true;
      });
      table.textContent = '';
      if (!shown.length) { table.appendChild(el(doc, 'p', 'cr-note', all.length ? 'No matches.' : 'No attendees yet.')); return; }
      shown.forEach(function (r) {
        table.appendChild(el(doc, 'p', 'cr-att-row', [r.name || '—', r.email || '—', r.tier || '—', String(r.quantity == null ? 1 : r.quantity), r.checked_in ? 'Checked in' : 'Not checked in', r.at || ''].join(' · ')));
      });
    }
    search.addEventListener('input', draw);
    filter.addEventListener('change', draw);
    exp.addEventListener('click', function () {
      var text = toCsv(all);
      if (hnd && hnd.exportCsv) hnd.exportCsv(slug, text); else downloadCsv(doc, slug + '-attendees.csv', text);
    });
    box.appendChild(search); box.appendChild(filter); box.appendChild(exp); box.appendChild(table);
    if (hnd && hnd.loadCustomers) Promise.resolve(hnd.loadCustomers(slug)).then(function (rows) { all = Array.isArray(rows) ? rows : []; draw(); }, function () { draw(); });
    else draw();
    return box;
  }

  function publicUrl(slug) { return 'https://keepitil.com/event?e=' + encodeURIComponent(slug); }
  function trackingUrl(slug, utm) {
    var u = new URL(publicUrl(slug));
    [['utm_source', utm.source], ['utm_medium', utm.medium], ['utm_campaign', utm.campaign], ['utm_content', utm.promoter]].forEach(function (pair) {
      var v = cleanUtm(pair[1]); if (v) u.searchParams.set(pair[0], v);
    });
    return u.toString();
  }

  function copyText(text, btn) {
    var done = function () { if (btn) { var old = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = old; }, 1200); } };
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(done, function () {});
      return;
    }
    done();
  }

  function field(doc, label, cls) {
    var wrap = el(doc, 'label', 'cr-field');
    wrap.appendChild(el(doc, 'span', '', label));
    var input = el(doc, 'input'); input.type = 'text'; input.className = cls; input.maxLength = 80; input.autocomplete = 'off';
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }

  /* events: [{ event_id|id, slug, title }] -> section. Pure aside from the copy/save callbacks. */
  function render(doc, events, handlers) {
    var hnd = handlers || {};
    var wrap = el(doc, 'section', 'cr-tools'); wrap.setAttribute('aria-label', 'Promote your events');
    wrap.appendChild(el(doc, 'div', 'head2', 'Promote'));
    wrap.appendChild(connectBar(doc, (hnd && hnd.connect) || 'not_connected', hnd && hnd.connectPayouts));
    var list = Array.isArray(events) ? events : [];
    if (!list.length) { wrap.appendChild(el(doc, 'p', 'cr-empty', 'Create an event to get a share link, a promoter link, and a promo code.')); return wrap; }
    list.forEach(function (ev) {
      var slug = String(ev.slug || '');
      var id = ev.event_id != null ? ev.event_id : ev.id;
      var card = el(doc, 'article', 'cr-card'); card.setAttribute('data-event', String(id == null ? '' : id));
      card.appendChild(el(doc, 'h3', 'cr-title', ev.title || 'Untitled'));
      if (!slugOk(slug)) { card.appendChild(el(doc, 'p', 'cr-note', 'This event has no public link yet.')); wrap.appendChild(card); return; }
      var url = publicUrl(slug);
      card.appendChild(el(doc, 'p', 'cr-k', 'Public link'));
      var link = el(doc, 'a', 'cr-link', url); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      card.appendChild(link);
      var copyPublic = el(doc, 'button', 'cr-btn', 'Copy link'); copyPublic.type = 'button';
      copyPublic.addEventListener('click', function () { copyText(url, copyPublic); });
      card.appendChild(copyPublic);

      card.appendChild(el(doc, 'p', 'cr-k', 'Promoter link'));
      var row = el(doc, 'div', 'cr-row');
      var src = field(doc, 'Source', 'cr-src'); var med = field(doc, 'Medium', 'cr-med');
      var camp = field(doc, 'Campaign', 'cr-camp'); var pro = field(doc, 'Promoter', 'cr-pro');
      [src, med, camp, pro].forEach(function (f) { row.appendChild(f.wrap); });
      card.appendChild(row);
      var built = el(doc, 'p', 'cr-built', url);
      var copyTrack = el(doc, 'button', 'cr-btn', 'Copy promoter link'); copyTrack.type = 'button';
      function refresh() {
        var next = trackingUrl(slug, { source: src.input.value, medium: med.input.value, campaign: camp.input.value, promoter: pro.input.value });
        built.textContent = next;
      }
      [src, med, camp, pro].forEach(function (f) { f.input.addEventListener('input', refresh); });
      copyTrack.addEventListener('click', function () { refresh(); copyText(built.textContent, copyTrack); });
      card.appendChild(copyTrack); card.appendChild(built);

      card.appendChild(el(doc, 'p', 'cr-k', 'Promo code'));
      var prow = el(doc, 'div', 'cr-row');
      var code = field(doc, 'Code', 'cr-code'); code.input.maxLength = 24;
      var pct = field(doc, 'Percent off', 'cr-pct'); pct.input.inputMode = 'numeric'; pct.input.maxLength = 3;
      var activeLab = el(doc, 'label', 'cr-field'); activeLab.appendChild(el(doc, 'span', '', 'Active'));
      var active = el(doc, 'input'); active.type = 'checkbox'; active.className = 'cr-on'; active.checked = true;
      activeLab.appendChild(active);
      prow.appendChild(code.wrap); prow.appendChild(pct.wrap); prow.appendChild(activeLab);
      card.appendChild(prow);
      var save = el(doc, 'button', 'cr-btn', 'Save code'); save.type = 'button';
      var msg = el(doc, 'p', 'cr-msg', '');
      var codes = el(doc, 'ul', 'cr-codes');
      save.addEventListener('click', function () {
        var c = String(code.input.value || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        var n = parseInt(pct.input.value, 10);
        code.input.value = c;
        if (!codeOk(c) || !(n >= 1 && n <= 100)) { msg.textContent = 'Use 2–24 letters or numbers, and a percent from 1 to 100.'; return; }
        msg.textContent = 'Saving…';
        Promise.resolve(hnd.saveCode && hnd.saveCode({ eventId: id, code: c, percent: n, active: !!active.checked })).then(function (res) {
          var err = res && (res.error || (res.data && res.data.error));
          msg.textContent = err ? 'Could not save that code.' : 'Saved.';
          if (!err && hnd.loadCodes) paintCodes(codes, null);
          if (!err && hnd.loadCodes) Promise.resolve(hnd.loadCodes(id)).then(function (rows) { paintCodes(codes, rows); });
        }, function () { msg.textContent = 'Could not save that code.'; });
      });
      card.appendChild(save); card.appendChild(msg); card.appendChild(codes);
      if (hnd.loadCodes) Promise.resolve(hnd.loadCodes(id)).then(function (rows) { paintCodes(codes, rows); }, function () { paintCodes(codes, null); });

      var stats = el(doc, 'p', 'cr-stats', 'Traffic: loading…');
      card.appendChild(stats);
      if (hnd.loadTraffic) Promise.resolve(hnd.loadTraffic(slug)).then(function (t) { paintTraffic(stats, t); }, function () { stats.textContent = 'Traffic: unavailable.'; });
      card.appendChild(attendeesBlock(doc, slug, hnd));
      wrap.appendChild(card);
    });
    return wrap;
  }

  function paintCodes(list, rows) {
    var doc = list.ownerDocument;
    list.textContent = '';
    if (!Array.isArray(rows) || !rows.length) { list.appendChild(el(doc, 'li', '', 'No codes yet.')); return; }
    rows.forEach(function (r) {
      var pct = Math.max(0, parseInt(r.percent_off, 10) || 0);
      list.appendChild(el(doc, 'li', '', String(r.code || '') + ' · ' + pct + '% off · ' + (r.active ? 'on' : 'off')));
    });
  }
  function connectBar(doc, status, onConnect) {
    var known = status === 'connected' || status === 'needs_action' ? status : 'not_connected';
    var label = known === 'connected' ? 'Payouts connected' : known === 'needs_action' ? 'Payouts need action' : 'Payouts not connected';
    var bar = el(doc, 'div', 'cr-connect'); bar.setAttribute('data-connect', known);
    bar.appendChild(el(doc, 'span', 'cr-badge', label));
    if (known !== 'connected') {
      var b = el(doc, 'button', 'cr-btn', 'Connect Payouts'); b.type = 'button';
      b.addEventListener('click', function () { if (onConnect) onConnect(b); });
      bar.appendChild(b);
    }
    return bar;
  }
  function paintTraffic(node, t) {
    t = t || {};
    var n = function (v) { var x = parseInt(v, 10); return x > 0 ? x : 0; };
    node.textContent = 'Views ' + n(t.views) + ' · Clicks ' + n(t.clicks) + ' · Conversions ' + n(t.conversions);
  }

  function rowsOf(res) {
    var d = res && res.data;
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.codes)) return d.codes;
    if (d && Array.isArray(d.rows)) return d.rows;
    return [];
  }

  var ONBOARD = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/functions/v1/connect-onboard';
  function payoutState(supa, session) {
    var uid = session && session.user && session.user.id;
    if (!uid || !supa.from) return Promise.resolve('not_connected');
    return Promise.resolve(supa.from('app_users').select('payouts_enabled').eq('id', uid).maybeSingle()).then(function (q) {
      return q && q.data && q.data.payouts_enabled ? 'connected' : 'not_connected';
    }, function () { return 'not_connected'; });
  }
  function mount(host, supa) {
    if (!host || !supa || !supa.auth || !supa.rpc) return Promise.resolve(false);
    var doc = host.ownerDocument;
    return Promise.resolve(supa.auth.getSession()).then(function (s) {
      var session = s && s.data && s.data.session;
      if (!session) return false;
      return Promise.all([Promise.resolve(supa.rpc('organizer_dashboard')), payoutState(supa, session)]).then(function (both) {
        var r = both[0];
        var evs = r && !r.error && Array.isArray(r.data) ? r.data : null;
        if (!evs) return false;
        var handlers = {
          connect: both[1],
          connectPayouts: function (btn) {
            btn.disabled = true; btn.textContent = 'Opening Stripe…';
            var token = session.access_token;
            var done = function (label) { btn.disabled = false; btn.textContent = label || 'Connect Payouts'; };
            if (!token || !root.fetch) { done(); return; }
            root.fetch(ONBOARD, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } })
              .then(function (res) { return res.json(); })
              .then(function (d) {
                if (d && d.url && root.location) root.location.href = d.url;
                else done(d && d.error === 'stripe_not_configured' ? 'Payouts not configured yet' : 'Connect Payouts');
              }, function () { done(); });
          },
          saveCode: function (p) { return supa.rpc('kil_upsert_promo_code', { p_event_id: p.eventId, p_code: p.code, p_percent: p.percent, p_active: p.active }); },
          loadCodes: function (id) { return Promise.resolve(supa.rpc('kil_list_promo_codes', { p_event_id: id })).then(rowsOf); },
          loadTraffic: function (slug) { return Promise.resolve(supa.rpc('kil_event_traffic', { p_slug: slug })).then(function (res) { return (res && res.data) || {}; }); },
          loadCustomers: function (slug) { return Promise.resolve(supa.rpc('kil_event_customers', { p_slug: slug })).then(function (res) { var d = res && res.data; return Array.isArray(d) ? d : []; }); }
        };
        host.textContent = '';
        host.appendChild(render(doc, evs, handlers));
        return true;
      });
    }).catch(function () { return false; });
  }

  var api = { render: render, mount: mount, publicUrl: publicUrl, trackingUrl: trackingUrl, codeOk: codeOk, cleanUtm: cleanUtm, toCsv: toCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilCreator = api;
})(typeof window !== 'undefined' ? window : globalThis);
