// Dashboard "CSV import" tab: pick a CSV file, see what was read, CHECK it (a dry run: fmw.inventory_import with p_dry_run true writes nothing), then confirm the import (all rows or none).
// The server re-checks every cell (formula guard, caps, categories by licence type); this file parses the file in the browser, drops columns the server does not accept, and shows the server's per-row errors.
// textContent only, no markup, no network of its own (ctx.rpc). Registers in window.FMW_DASHBOARD_TABS.
(function (root) {
  var MAX_BYTES = 500 * 1024, MAX_ROWS = 250;
  // header names (lower case, spaces and dashes to _) -> the column the server accepts
  var ALIAS = { title: 'title', name: 'title', item: 'title', product: 'title', category: 'category', description: 'description', brand: 'brand', strain: 'strain_type', strain_type: 'strain_type', thc: 'thc', cbd: 'cbd',
    size: 'size', price: 'price', in_stock: 'in_stock', stock: 'in_stock', moq: 'moq', lead_time: 'lead_time', leadtime: 'lead_time', kind: 'kind' };
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // RFC 4180 style: quoted fields, "" for a quote, commas and line breaks inside quotes, CRLF or LF, a leading BOM ignored
  function parseCsv(text) {
    var s = String(text == null ? '' : text).replace(/^﻿/, ''), rows = [], row = [], f = '', q = false, i = 0, c;
    for (; i < s.length; i++) {
      c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"' && f === '') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
  }
  // text -> { error } or { rows: [objects], used: [columns], ignored: [headers] }
  function read(text, copy) {
    if (String(text == null ? '' : text).length > MAX_BYTES) return { error: copy.tooBig };
    var grid = parseCsv(text);
    if (grid.length < 2) return { error: copy.empty };
    if (grid.length - 1 > MAX_ROWS) return { error: copy.tooMany };
    var map = [], used = [], ignored = [];
    grid[0].forEach(function (h, i) {
      var key = String(h).trim().toLowerCase().replace(/[\s-]+/g, '_'), col = ALIAS[key];
      if (col && used.indexOf(col) < 0) { map[i] = col; used.push(col); } else if (String(h).trim()) ignored.push(String(h).trim().slice(0, 40));
    });
    if (used.indexOf('title') < 0) return { error: copy.noTitle };
    var rows = grid.slice(1).map(function (r) { var o = {}; map.forEach(function (col, i) { if (col && r[i] != null && String(r[i]).trim() !== '') o[col] = String(r[i]); }); return o; });
    return { rows: rows, used: used, ignored: ignored };
  }
  function mount(doc, panel, ctx) {
    var C = (ctx.win && ctx.win.FMW_COPY) || root.FMW_COPY || {}, copy = C.bizDash && C.bizDash.csv;
    if (!copy) return;
    var caps = (ctx.biz && ctx.biz.caps) || {};
    panel.appendChild(el(doc, 'h2', null, copy.title));
    if (!caps.consumer_menu && !caps.wholesale) { panel.appendChild(el(doc, 'p', 'muted', copy.unavailable)); return; }
    panel.appendChild(el(doc, 'p', 'muted', copy.note)); panel.appendChild(el(doc, 'p', 'muted', copy.limits));
    var lab = el(doc, 'label', null, copy.choose), input = el(doc, 'input'); input.type = 'file'; input.accept = '.csv,text/csv'; lab.appendChild(input); panel.appendChild(lab);
    var info = el(doc, 'p'); info.setAttribute('role', 'status'); var out = el(doc, 'div', 'csv-out'); out.setAttribute('aria-live', 'polite');
    var check = el(doc, 'button', 'btn ghost', copy.checkBtn); check.type = 'button'; check.hidden = true;
    var go = el(doc, 'button', 'btn', ''); go.type = 'button'; go.hidden = true;
    panel.appendChild(info); panel.appendChild(check); panel.appendChild(go); panel.appendChild(out);
    var parsed = null;
    function reset() { out.textContent = ''; go.hidden = true; }
    function onText(text) {
      reset(); parsed = read(text, copy); check.hidden = !!parsed.error;
      if (parsed.error) { info.textContent = parsed.error; parsed = null; return; }
      info.textContent = copy.read(parsed.rows.length, parsed.used.join(', ')) + (parsed.ignored.length ? ' ' + copy.ignored(parsed.ignored.join(', ')) : '');
    }
    input.addEventListener('change', function () {
      var f = input.files && input.files[0]; if (!f) return;
      if (f.size > MAX_BYTES) { reset(); parsed = null; check.hidden = true; info.textContent = copy.tooBig; return; }
      if (typeof f.text === 'function') f.text().then(onText, function () { info.textContent = copy.fail; });
    });
    function why(r) { return r && r.status === 429 || (r && /too many imports/i.test(String(r.message || ''))) ? copy.limit : copy.fail; }
    check.addEventListener('click', function () {
      if (!parsed) return; reset(); out.appendChild(el(doc, 'p', 'muted', copy.checking));
      ctx.rpc('inventory_import', { p_rows: parsed.rows, p_dry_run: true }).then(function (r) {
        out.textContent = '';
        if (!r || !r.ok || !r.data) { out.appendChild(el(doc, 'p', 'muted', why(r))); return; }
        var d = r.data;
        if (d.ok) { out.appendChild(el(doc, 'p', null, copy.checkedOk(Number(d.rows) || parsed.rows.length))); go.textContent = copy.importBtn(parsed.rows.length); go.hidden = false; return; }
        out.appendChild(el(doc, 'p', null, copy.problems(Number(d.rows) - Number(d.valid), Number(d.rows))));
        var ul = el(doc, 'ul', 'csv-errors'); (Array.isArray(d.errors) ? d.errors : []).slice(0, 50).forEach(function (e) { ul.appendChild(el(doc, 'li', null, copy.rowErr(Number(e.row) || 0, String(e.error || '').slice(0, 160)))); });
        out.appendChild(ul);
      });
    });
    go.addEventListener('click', function () {
      if (!parsed) return; go.disabled = true; out.textContent = ''; out.appendChild(el(doc, 'p', 'muted', copy.importing));
      ctx.rpc('inventory_import', { p_rows: parsed.rows, p_dry_run: false }).then(function (r) {
        go.disabled = false; out.textContent = '';
        if (r && r.ok && r.data && r.data.ok) { out.appendChild(el(doc, 'p', null, copy.done(Number(r.data.imported) || 0))); go.hidden = true; check.hidden = true; parsed = null; input.value = ''; return; }
        out.appendChild(el(doc, 'p', 'muted', why(r)));
      });
    });
  }
  var list = root.FMW_DASHBOARD_TABS = root.FMW_DASHBOARD_TABS || [];
  list.push({ key: 'csv-import', label: function (C) { return C && C.bizDash && C.bizDash.csv ? C.bizDash.csv.tab : 'CSV import'; }, roles: ['owner', 'manager', 'editor'], mount: mount });
  var api = { parseCsv: parseCsv, read: read, mount: mount, MAX_BYTES: MAX_BYTES, MAX_ROWS: MAX_ROWS, ALIAS: ALIAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_BIZ_IMPORT = api;
})(typeof window !== 'undefined' ? window : globalThis);
