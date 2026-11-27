/* Creator controls on /dashboard: public link, UTM/promoter link, promo codes, and traffic counts.
   Strings from the database are written with textContent. Buttons use addEventListener, never inline handlers.
   RPCs: kil_list_promo_codes, kil_upsert_promo_code, kil_event_traffic (owner-only; see the promo migration). */
(function (root) {
  'use strict';
  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function slugOk(s) { return /^[a-z0-9][a-z0-9-]{0,200}$/.test(String(s || '')); }
  function cleanUtm(v) { return String(v || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80); }
  function codeOk(v) { return /^[A-Z0-9_-]{2,24}$/.test(String(v || '')); }

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

  function mount(host, supa) {
    if (!host || !supa || !supa.auth || !supa.rpc) return Promise.resolve(false);
    var doc = host.ownerDocument;
    return Promise.resolve(supa.auth.getSession()).then(function (s) {
      if (!(s && s.data && s.data.session)) return false;
      return Promise.resolve(supa.rpc('organizer_dashboard')).then(function (r) {
        var evs = r && !r.error && Array.isArray(r.data) ? r.data : null;
        if (!evs) return false;
        var handlers = {
          saveCode: function (p) { return supa.rpc('kil_upsert_promo_code', { p_event_id: p.eventId, p_code: p.code, p_percent: p.percent, p_active: p.active }); },
          loadCodes: function (id) { return Promise.resolve(supa.rpc('kil_list_promo_codes', { p_event_id: id })).then(rowsOf); },
          loadTraffic: function (slug) { return Promise.resolve(supa.rpc('kil_event_traffic', { p_slug: slug })).then(function (res) { return (res && res.data) || {}; }); }
        };
        host.textContent = '';
        host.appendChild(render(doc, evs, handlers));
        return true;
      });
    }).catch(function () { return false; });
  }

  var api = { render: render, mount: mount, publicUrl: publicUrl, trackingUrl: trackingUrl, codeOk: codeOk, cleanUtm: cleanUtm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilCreator = api;
})(typeof window !== 'undefined' ? window : globalThis);
