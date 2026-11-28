// Dashboard "Capabilities" tab: what the business does (a fixed list per licence type, ticked by the owner) and, for a TESTING LABORATORY only, its certificates of analysis (COA PDFs).
// Built against the P1 draft RPCs (docs/proposed/migrations/P1_business_capabilities_coa.DRAFT.sql: fmw.my_capabilities, fmw.set_my_capabilities, fmw.coa_list) and the fmw-upload-media edge function
// (category "coa" upload, actions coa_url and coa_delete). DORMANT until site.json "bizCapabilities" is true (FMW_CONFIG.bizCapabilities): the SQL and the edge function must be applied / deployed first.
// The SERVER decides everything: which slugs are allowed for the licence type, who may save, whether the business is a testing lab (the "family" it answers), the 5 MB / PDF / 50-file limits.
// This file only shows the server's answer, never shows a COA control to anyone else, and checks the file (.pdf name, <= 5 MB, "%PDF-" first bytes) BEFORE sending it so a wrong file fails fast.
// A COA is private: the only way to open one is a short-lived signed link the edge function mints for this business (forced download); the link is used only if it is https on the project's own host.
// Text goes in with textContent only; no markup, no storage.
(function (root) {
  var MAX_BYTES = 5 * 1024 * 1024;
  var COPY = {
    tab: 'Capabilities', title: 'What your business does',
    note: 'Tick what applies to your license. These are facts about your business, not claims about any product.',
    none: 'There are no options for your license type.', save: 'Save', saved: 'Saved.', saveFail: 'Could not save. Try again.', readOnly: 'Only an owner or manager can change this.',
    loading: 'Loading…', loadFail: 'Could not load this right now. Try again in a moment.',
    coaTitle: 'Certificates of analysis',
    coaNote: 'PDF only, 5 MB or smaller, up to 50. These are private: only your team can open them here, through a short-lived download link. They are not shown on your public listing.',
    coaFile: 'Certificate (PDF)', coaName: 'Product or batch name (optional)', coaLot: 'Lot number (optional)', coaDate: 'Date tested (optional)', coaUpload: 'Upload certificate', coaUploading: 'Uploading…',
    coaNone: 'No certificates yet.', coaOpen: 'Download', coaRemove: 'Remove', coaConfirm: 'Confirm remove', coaRemoved: 'Removed.', coaUploaded: 'Uploaded.',
    coaPick: 'Choose a PDF file first.', coaNotPdf: 'That is not a PDF. Choose a PDF file.', coaBig: 'That file is over 5 MB.',
    coaTooMany: 'You have reached the limit of 50 certificates. Remove one first.', coaNotAllowed: 'This account cannot upload certificates.', coaFail: 'Could not upload. Try again.',
    coaOpenFail: 'Could not open it. Try again.', coaRemoveFail: 'Could not remove it. Try again.'
  };
  var LABELS = {
    outdoor: 'Outdoor', indoor: 'Indoor', 'mixed-light': 'Mixed light', nursery: 'Nursery', processing: 'Processing',
    'extraction-volatile': 'Extraction (volatile solvents)', 'extraction-nonvolatile': 'Extraction (non-volatile)', infusion: 'Infusion', 'packaging-labeling': 'Packaging and labeling', edibles: 'Edibles', topicals: 'Topicals', 'vape-cartridges': 'Vape cartridges',
    'transport-only': 'Transport only', distribution: 'Distribution', storage: 'Storage',
    potency: 'Potency', pesticides: 'Pesticides', 'heavy-metals': 'Heavy metals', microbials: 'Microbials', 'residual-solvents': 'Residual solvents', mycotoxins: 'Mycotoxins', terpenes: 'Terpenes', 'moisture-water-activity': 'Moisture and water activity', 'foreign-material': 'Foreign material',
    cultivation: 'Cultivation', manufacturing: 'Manufacturing', retail: 'Retail',
    ticketed: 'Ticketed', 'free-entry': 'Free entry', '21-plus': '21 and over', 'medical-friendly': 'Medical patients welcome',
    delivery: 'Delivery', pickup: 'Pickup', curbside: 'Curbside', medical: 'Medical', recreational: 'Recreational', accessible: 'Wheelchair accessible'
  };
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function label(slug) { return LABELS[slug] || String(slug).replace(/-/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); }
  // the answers are untrusted JSON: a slug list is kept only when each item is a short lowercase slug
  function slugs(list) { return (Array.isArray(list) ? list : []).filter(function (s) { return typeof s === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 40; }).slice(0, 30); }
  function cleanCaps(d) { return d && typeof d === 'object' ? { family: typeof d.family === 'string' ? d.family : '', allowed: slugs(d.allowed), selected: slugs(d.selected) } : null; }
  function cleanCoa(list) {
    return (Array.isArray(list) ? list : []).filter(function (r) { return r && typeof r.id === 'string' && /^[0-9a-f-]{36}$/.test(r.id); }).slice(0, 50).map(function (r) {
      var t = function (v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : ''; };
      return { id: r.id, title: t(r.title, 120), lot: t(r.lot, 60), tested: typeof r.tested_on === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.tested_on) ? r.tested_on.slice(0, 10) : '', bytes: Number(r.bytes) > 0 ? Number(r.bytes) : 0 };
    });
  }
  // a file is a PDF only if its name says so, it is within the cap, AND its first bytes are "%PDF-" (the edge function checks the bytes again)
  function checkFile(file) {
    if (!file) return Promise.resolve('coaPick');
    if (!/\.pdf$/i.test(String(file.name || ''))) return Promise.resolve('coaNotPdf');
    if (!(file.size > 0)) return Promise.resolve('coaNotPdf');
    if (file.size > MAX_BYTES) return Promise.resolve('coaBig');
    if (!file.slice || typeof file.slice !== 'function') return Promise.resolve('coaNotPdf');
    return Promise.resolve(file.slice(0, 5).arrayBuffer()).then(function (buf) {
      var b = new Uint8Array(buf); return b.length === 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d ? '' : 'coaNotPdf';
    }, function () { return 'coaNotPdf'; });
  }
  function edge(ctx, init) {
    var win = ctx.win, cfg = win.FMW_CONFIG && win.FMW_CONFIG.authProject, f = win.fetch;
    if (!cfg || !cfg.url || !cfg.anonKey || !ctx.token || typeof f !== 'function') return Promise.resolve({ ok: false });
    var headers = Object.assign({ apikey: cfg.anonKey, Authorization: 'Bearer ' + ctx.token }, init.json ? { 'Content-Type': 'application/json' } : {});
    return Promise.resolve().then(function () { return f.call(win, cfg.url + '/functions/v1/fmw-upload-media', { method: 'POST', headers: headers, body: init.json ? JSON.stringify(init.json) : init.form }); })
      .then(function (r) { return (r && typeof r.json === 'function' ? r.json() : Promise.resolve(null)).then(function (j) { return { ok: !!(r && r.ok && j && j.ok === true), status: r && r.status, data: j }; }, function () { return { ok: false, status: r && r.status }; }); },
        function () { return { ok: false }; });
  }
  function signedOk(ctx, u) {
    var cfg = ctx.win.FMW_CONFIG && ctx.win.FMW_CONFIG.authProject;
    try { var a = new URL(String(u)), b = new URL(cfg.url); return a.protocol === 'https:' && a.host === b.host && !a.username && !a.password; } catch (e) { return false; }
  }
  function mount(doc, panel, ctx) {
    var role = ctx.biz && ctx.biz.role, canEdit = role === 'owner' || role === 'manager';
    panel.appendChild(el(doc, 'h2', null, COPY.title)); panel.appendChild(el(doc, 'p', 'muted', COPY.note));
    var box = el(doc, 'div'), say = el(doc, 'p', 'muted'); say.setAttribute('role', 'status'); say.setAttribute('aria-live', 'polite');
    panel.appendChild(box); panel.appendChild(say);
    box.appendChild(el(doc, 'p', 'muted', COPY.loading));
    ctx.rpc('my_capabilities', {}).then(function (r) {
      box.textContent = '';
      var c = r && r.ok ? cleanCaps(r.data) : null;
      if (!c) { box.appendChild(el(doc, 'p', 'muted', COPY.loadFail)); return; }
      drawCaps(doc, box, say, ctx, c, canEdit);
      if (c.family === 'testing') drawCoa(doc, panel, say, ctx);   // the SERVER's answer decides: only a testing laboratory ever sees the certificate controls
    });
  }
  function drawCaps(doc, box, say, ctx, c, canEdit) {
    if (!c.allowed.length) { box.appendChild(el(doc, 'p', 'muted', COPY.none)); return; }
    var fs = el(doc, 'fieldset'), boxes = [];
    c.allowed.forEach(function (s) {
      var lab = el(doc, 'label', 'check'), cb = el(doc, 'input'); cb.type = 'checkbox'; cb.setAttribute('data-slug', s); cb.checked = c.selected.indexOf(s) >= 0; if (!canEdit) cb.setAttribute('disabled', 'disabled');
      lab.appendChild(cb); lab.appendChild(el(doc, 'span', null, ' ' + label(s))); fs.appendChild(lab); boxes.push(cb);
    });
    box.appendChild(fs);
    if (!canEdit) { box.appendChild(el(doc, 'p', 'muted', COPY.readOnly)); return; }
    var btn = el(doc, 'button', 'btn', COPY.save); btn.type = 'button'; box.appendChild(btn);
    btn.addEventListener('click', function () {
      var pick = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.getAttribute('data-slug'); });
      btn.setAttribute('disabled', 'disabled'); say.textContent = '';
      ctx.rpc('set_my_capabilities', { p_slugs: pick }).then(function (r) { btn.removeAttribute('disabled'); say.textContent = r && r.ok ? COPY.saved : COPY.saveFail; });
    });
  }
  function drawCoa(doc, panel, say, ctx) {
    panel.appendChild(el(doc, 'h3', null, COPY.coaTitle)); panel.appendChild(el(doc, 'p', 'muted', COPY.coaNote));
    var list = el(doc, 'ul', 'biz-plist'), form = el(doc, 'div');
    var file = el(doc, 'input'); file.type = 'file'; file.setAttribute('accept', 'application/pdf,.pdf'); file.setAttribute('data-act', 'coa-file');
    var fl = el(doc, 'label', null, COPY.coaFile); fl.appendChild(file);
    var title = el(doc, 'input'); title.type = 'text'; title.setAttribute('maxlength', '120'); title.setAttribute('data-act', 'coa-title'); var tl = el(doc, 'label', null, COPY.coaName); tl.appendChild(title);
    var lot = el(doc, 'input'); lot.type = 'text'; lot.setAttribute('maxlength', '60'); lot.setAttribute('data-act', 'coa-lot'); var ll = el(doc, 'label', null, COPY.coaLot); ll.appendChild(lot);
    var day = el(doc, 'input'); day.type = 'date'; day.setAttribute('data-act', 'coa-date'); var dl = el(doc, 'label', null, COPY.coaDate); dl.appendChild(day);
    var up = el(doc, 'button', 'btn', COPY.coaUpload); up.type = 'button'; up.setAttribute('data-act', 'coa-upload');
    [fl, tl, ll, dl, up].forEach(function (n) { form.appendChild(n); }); panel.appendChild(form); panel.appendChild(list);
    function refresh() {
      list.textContent = ''; list.appendChild(el(doc, 'li', 'muted', COPY.loading));
      ctx.rpc('coa_list', {}).then(function (r) {
        list.textContent = '';
        if (!r || !r.ok) { list.appendChild(el(doc, 'li', 'muted', COPY.loadFail)); return; }
        var rows = cleanCoa(r.data); if (!rows.length) { list.appendChild(el(doc, 'li', 'muted', COPY.coaNone)); return; }
        rows.forEach(function (row) {
          var li = el(doc, 'li'); li.appendChild(el(doc, 'strong', null, row.title || 'Certificate'));
          li.appendChild(el(doc, 'span', 'muted', (row.lot ? ' · Lot ' + row.lot : '') + (row.tested ? ' · Tested ' + row.tested : '') + (row.bytes ? ' · ' + Math.max(1, Math.round(row.bytes / 1024)) + ' KB' : '') + ' '));
          var open = el(doc, 'button', 'btn ghost', COPY.coaOpen); open.type = 'button'; open.setAttribute('aria-label', COPY.coaOpen + ': ' + (row.title || 'certificate'));
          var rm = el(doc, 'button', 'btn ghost', COPY.coaRemove); rm.type = 'button'; rm.setAttribute('aria-label', COPY.coaRemove + ': ' + (row.title || 'certificate'));
          open.addEventListener('click', function () {
            say.textContent = '';
            edge(ctx, { json: { action: 'coa_url', id: row.id } }).then(function (e) {
              var u = e.ok && e.data && e.data.url;
              if (!u || !signedOk(ctx, u)) { say.textContent = COPY.coaOpenFail; return; }
              var a = el(doc, 'a'); a.href = u; a.setAttribute('rel', 'noopener noreferrer'); a.setAttribute('download', 'certificate-of-analysis.pdf'); if (typeof a.click === 'function') a.click();
            });
          });
          var armed = false;
          rm.addEventListener('click', function () {
            if (!armed) { armed = true; rm.textContent = COPY.coaConfirm; return; }
            edge(ctx, { json: { action: 'coa_delete', id: row.id } }).then(function (e) { say.textContent = e.ok ? COPY.coaRemoved : COPY.coaRemoveFail; refresh(); });
          });
          li.appendChild(open); li.appendChild(rm); list.appendChild(li);
        });
      });
    }
    var busy = false;
    up.addEventListener('click', function () {
      if (busy) return;
      var f = file.files && file.files[0]; say.textContent = '';
      checkFile(f).then(function (bad) {
        if (bad) { say.textContent = COPY[bad]; return; }
        busy = true; up.setAttribute('disabled', 'disabled'); up.textContent = COPY.coaUploading;
        var fd = new ctx.win.FormData(); fd.append('file', f); fd.append('category', 'coa'); fd.append('title', title.value || ''); fd.append('lot', lot.value || ''); fd.append('tested_on', day.value || '');
        edge(ctx, { form: fd }).then(function (e) {
          busy = false; up.removeAttribute('disabled'); up.textContent = COPY.coaUpload;
          if (e.ok) { say.textContent = COPY.coaUploaded; title.value = ''; lot.value = ''; day.value = ''; file.value = ''; refresh(); return; }
          var code = e.data && e.data.error;
          say.textContent = code === 'quota' ? COPY.coaTooMany : code === 'size' ? COPY.coaBig : code === 'type' ? COPY.coaNotPdf : (e.status === 403 || code === 'not-allowed') ? COPY.coaNotAllowed : COPY.coaFail;
        });
      });
    });
    refresh();
  }
  var list = root.FMW_DASHBOARD_TABS = root.FMW_DASHBOARD_TABS || [];
  if (root.FMW_CONFIG && root.FMW_CONFIG.bizCapabilities === true) list.push({ key: 'capabilities', label: COPY.tab, roles: ['owner', 'manager', 'editor'], mount: mount });
  var api = { mount: mount, COPY: COPY, label: label, cleanCaps: cleanCaps, cleanCoa: cleanCoa, checkFile: checkFile, signedOk: signedOk, MAX_BYTES: MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_BIZ_CAPS = api;
})(typeof window !== 'undefined' ? window : globalThis);
