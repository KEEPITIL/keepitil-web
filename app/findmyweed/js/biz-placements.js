// Dashboard "Placements" tab: the business's own PRIME / Featured placements and invoices, read from fmw.my_placements / fmw.my_invoices (P4_business_placements.DRAFT.sql). READ ONLY: placements
// are sold by invoice and switched on by a person at Find My Weed; there is no button here that buys, pays or edits anything. The server decides who may read (owner / manager for placements,
// the owner alone for invoices). Draws text only (textContent); no markup, no network call of its own. DORMANT until site.json "placements" is true (FMW_CONFIG.placements): the SQL must be applied first.
(function (root) {
  var KINDS = { prime: 'PRIME', featured: 'Featured' }, STATUS = { scheduled: 'Scheduled', active: 'Active', ended: 'Ended', cancelled: 'Cancelled', draft: 'Draft', sent: 'Sent', paid: 'Paid', 'void': 'Void' };
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function day(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; }
  function word(s, max) { return typeof s === 'string' ? s.replace(/[^\w .,&'()\/-]/g, '').slice(0, max || 60) : ''; }
  function money(cents, cur) { var n = Number(cents); if (!isFinite(n) || n < 0) return ''; return (cur === 'USD' ? '$' : '') + (n / 100).toFixed(2); }
  // the answers are untrusted JSON: keep only known words, dates and numbers, in a fixed shape
  function cleanPlacements(list) {
    return (Array.isArray(list) ? list : []).filter(function (p) { return p && KINDS[p.kind] && STATUS[p.status]; }).slice(0, 50).map(function (p) {
      return { kind: p.kind, status: p.status, county: word(p.county), category: word(p.category, 30), rank: Number(p.rank) >= 1 && Number(p.rank) <= 5 ? Math.floor(Number(p.rank)) : 0, start: day(p.starts_on), end: day(p.ends_on) };
    });
  }
  function cleanInvoices(list) {
    return (Array.isArray(list) ? list : []).filter(function (i) { return i && STATUS[i.status] && /^FMW-\d{4}-\d{4,6}$/.test(String(i.number)); }).slice(0, 50).map(function (i) {
      return { number: String(i.number), status: i.status, amount: money(i.amount_cents, i.currency), start: day(i.period_start), end: day(i.period_end), paid: day(i.paid_at) };
    });
  }
  function section(doc, panel, title) { panel.appendChild(el(doc, 'h3', null, title)); var ul = el(doc, 'ul', 'biz-plist'); panel.appendChild(ul); return ul; }
  function drawPlacements(doc, ul, copy, rows) {
    if (!rows.length) { ul.appendChild(el(doc, 'li', 'muted', copy.placementsNone)); return; }
    rows.forEach(function (p) {
      var li = el(doc, 'li'), where = p.county + (p.category ? ' · ' + p.category : '') + (p.kind === 'featured' && p.rank ? ' · ' + copy.slot(p.rank) : '');
      li.appendChild(el(doc, 'strong', null, KINDS[p.kind])); li.appendChild(el(doc, 'span', null, ' ' + where));
      li.appendChild(el(doc, 'span', 'muted', ' · ' + (p.start && p.end ? p.start + ' to ' + p.end : '') + ' · ' + STATUS[p.status])); ul.appendChild(li);
    });
  }
  function drawInvoices(doc, ul, copy, rows) {
    if (!rows.length) { ul.appendChild(el(doc, 'li', 'muted', copy.invoicesNone)); return; }
    rows.forEach(function (i) {
      var li = el(doc, 'li'); li.appendChild(el(doc, 'strong', null, i.number)); li.appendChild(el(doc, 'span', null, ' ' + i.amount));
      li.appendChild(el(doc, 'span', 'muted', ' · ' + (i.start && i.end ? i.start + ' to ' + i.end : '') + ' · ' + STATUS[i.status] + (i.paid ? ' ' + i.paid : ''))); ul.appendChild(li);
    });
  }
  function mount(doc, panel, ctx) {
    var C = (ctx.win && ctx.win.FMW_COPY) || root.FMW_COPY || {}, copy = C.bizDash && C.bizDash.placements;
    if (!copy) return;
    var role = ctx.biz && ctx.biz.role;
    panel.appendChild(el(doc, 'h2', null, copy.title)); panel.appendChild(el(doc, 'p', 'muted', copy.note));
    var pl = section(doc, panel, copy.placementsTitle); pl.appendChild(el(doc, 'li', 'muted', copy.loading));
    ctx.rpc('my_placements', {}).then(function (r) {
      pl.textContent = '';
      if (!r || !r.ok) { pl.appendChild(el(doc, 'li', 'muted', copy.error)); return; }
      drawPlacements(doc, pl, copy, cleanPlacements(r.data));
    });
    if (role === 'owner') {
      var inv = section(doc, panel, copy.invoicesTitle); inv.appendChild(el(doc, 'li', 'muted', copy.loading));
      ctx.rpc('my_invoices', {}).then(function (r) {
        inv.textContent = '';
        if (!r || !r.ok) { inv.appendChild(el(doc, 'li', 'muted', copy.error)); return; }
        drawInvoices(doc, inv, copy, cleanInvoices(r.data));
      });
    }
  }
  var list = root.FMW_DASHBOARD_TABS = root.FMW_DASHBOARD_TABS || [];
  if (root.FMW_CONFIG && root.FMW_CONFIG.placements === true) list.push({ key: 'placements', label: function (C) { return C && C.bizDash && C.bizDash.placements ? C.bizDash.placements.tab : 'Placements'; }, roles: ['owner', 'manager'], mount: mount });
  var api = { cleanPlacements: cleanPlacements, cleanInvoices: cleanInvoices, money: money, drawPlacements: drawPlacements, drawInvoices: drawInvoices, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_BIZ_PLACEMENTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
