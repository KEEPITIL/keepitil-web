// Dashboard "Stats" tab: 7 / 30 / 90-day first-party counts from fmw.my_stats (views, website / phone / directions clicks, inquiries). The server decides who may read it (an active
// owner, manager or editor of an approved, live business). This file only draws the answer: text and <progress> bars, textContent only, no markup, no chart library, nothing sent anywhere.
// It registers itself in window.FMW_DASHBOARD_TABS; js/dashboard.js adds the tab to its nav and calls mount().
(function (root) {
  var KEYS = ['views', 'website', 'phone', 'directions', 'inquiries'];
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function num(v) { var n = Number(v); return isFinite(n) && n >= 0 ? Math.floor(n) : 0; }
  // the answer is untrusted JSON: keep only what is a number / a date string, in a fixed shape
  function clean(data) {
    if (!data || typeof data !== 'object') return null;
    var daily = Array.isArray(data.daily) ? data.daily.filter(function (d) { return d && typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day); }).map(function (d) {
      var o = { day: d.day }; KEYS.forEach(function (k) { o[k] = num(d[k]); }); return o; }) : [];
    var t = data.totals && typeof data.totals === 'object' ? data.totals : {}, totals = {};
    KEYS.forEach(function (k) { totals[k] = num(t[k]); });
    return { days: num(data.days), totals: totals, daily: daily };
  }
  function shortDay(s) { var p = s.split('-'); return p[1] + '/' + p[2]; }
  // draw one answer into `box` (cleared first)
  function draw(doc, box, copy, data) {
    box.textContent = '';
    var d = clean(data);
    if (!d) { box.appendChild(el(doc, 'p', 'muted', copy.error)); return false; }
    box.appendChild(el(doc, 'h3', null, copy.range(d.days)));
    var tiles = el(doc, 'ul', 'stat-tiles');
    KEYS.forEach(function (k) { var li = el(doc, 'li', 'stat-tile'); li.appendChild(el(doc, 'span', 'stat-n', String(d.totals[k]))); li.appendChild(el(doc, 'span', 'stat-l', copy[k])); tiles.appendChild(li); });
    box.appendChild(tiles);
    var total = KEYS.reduce(function (s, k) { return s + d.totals[k]; }, 0);
    if (!total) { box.appendChild(el(doc, 'p', 'muted', copy.none)); return true; }
    box.appendChild(el(doc, 'h3', null, copy.perDay + ' · ' + copy.views));
    var max = d.daily.reduce(function (m, r) { return Math.max(m, r.views); }, 0) || 1, ul = el(doc, 'ul', 'stat-days');
    d.daily.forEach(function (r) {
      var li = el(doc, 'li'), p = el(doc, 'progress'); p.max = max; p.value = r.views; p.setAttribute('aria-label', copy.dayRow(shortDay(r.day), r.views));
      li.appendChild(el(doc, 'span', 'stat-day', shortDay(r.day))); li.appendChild(p); li.appendChild(el(doc, 'span', 'stat-count', String(r.views))); ul.appendChild(li);
    });
    box.appendChild(ul);
    return true;
  }
  function mount(doc, panel, ctx) {
    var C = (ctx.win && ctx.win.FMW_COPY) || root.FMW_COPY || {}, copy = C.bizDash && C.bizDash.stats;
    if (!copy) return;
    panel.appendChild(el(doc, 'h2', null, copy.title)); panel.appendChild(el(doc, 'p', 'muted', copy.note));
    var bar = el(doc, 'div', 'stat-range'); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', copy.rangeLabel);
    var out = el(doc, 'div', 'stat-out'); out.setAttribute('aria-live', 'polite');
    panel.appendChild(bar); panel.appendChild(out);
    var buttons = [];
    function load(n) {
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-days') === String(n) ? 'true' : 'false'); });
      out.textContent = ''; out.appendChild(el(doc, 'p', 'muted', copy.loading));
      ctx.rpc('my_stats', { p_days: n }).then(function (r) {
        if (!r || !r.ok) { out.textContent = ''; out.appendChild(el(doc, 'p', 'muted', copy.error)); var b = el(doc, 'button', 'btn ghost', copy.retry); b.type = 'button'; b.addEventListener('click', function () { load(n); }); out.appendChild(b); return; }
        draw(doc, out, copy, r.data);
      });
    }
    copy.ranges.forEach(function (n) {
      var b = el(doc, 'button', 'btn ghost', copy.range(n)); b.type = 'button'; b.setAttribute('data-days', String(n)); b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { load(n); }); bar.appendChild(b); buttons.push(b);
    });
    load(copy.ranges[0]);
  }
  // DORMANT until site.json "bizStats" is true (FMW_CONFIG.bizStats): the my_stats SQL (P3_business_stats.DRAFT.sql) and the tracking fix (#316) must be applied first; off, no tab is registered
  var list = root.FMW_DASHBOARD_TABS = root.FMW_DASHBOARD_TABS || [];
  if (root.FMW_CONFIG && root.FMW_CONFIG.bizStats === true) list.push({ key: 'stats', label: function (C) { return C && C.bizDash && C.bizDash.stats ? C.bizDash.stats.tab : 'Stats'; }, roles: ['owner', 'manager', 'editor'], mount: mount });
  var api = { clean: clean, draw: draw, mount: mount, KEYS: KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_BIZ_STATS = api;
})(typeof window !== 'undefined' ? window : globalThis);
