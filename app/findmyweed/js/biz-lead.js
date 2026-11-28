// Find My Weed "List your licensed business" page (for-business.html): a Leafly-style sign-up page in our own words and brand.
// - ALWAYS draws the hero and the FAQ. The form (the "I am a..." tiles + the fields) is behind site.json "bizLeads" (default false): while off, the page
//   shows an honest "opening soon, email us" panel and makes NO request. The SQL it needs (docs/proposed/migrations/W11_business_leads.DRAFT.sql) is NOT applied.
// - With the flag on, a valid form is sent once to the public RPC fmw_submit_business_lead on the configured authProject (anon key, never a secret). Nothing else is sent, stored in the
//   browser, or put in a URL. The page never redirects: the thank-you replaces the form in place.
// - The license lookup is a read of the shipped listing files (data/listings-index.json + data/listings-names.json): it answers ONLY { name, county } for a number we list. Never an owner, an
//   address, a phone or an email.
// Text goes in with textContent only. The pure rules are exported for node tests (tests/biz-lead.test.js).
(function (root) {
  'use strict';
  var CP = typeof require === 'function' && typeof module !== 'undefined' ? require('./biz-lead-copy.js') : root.FMW_BIZ_COPY;

  var TYPES = ['storefront', 'delivery', 'cultivation', 'manufacturing', 'distribution', 'microbusiness', 'lab', 'event', 'brand', 'other'];
  var ACTIVE = ['yes-number', 'yes-no-number', 'not-yet', 'no'];
  var TILE_TYPE = { storefront: 'storefront', delivery: 'delivery', brand: 'brand' };   // the picker's tile -> the dropdown's value
  var MAX = { first: 60, last: 60, company: 120, email: 254, goal: 1000 };

  // A state license number as the record writes it (the same shape js/signup.js accepts), e.g. C10-0000123-LIC.
  function licenseShape(s) { var t = String(s == null ? '' : s).trim().toUpperCase(); return /^[A-Z]{1,4}\d{0,2}-\d{7}-LIC$/.test(t) || /^CCL\d{2}-\d{7}$/.test(t) || /^DCC-\d{8}$/.test(t); }
  // The DCC number prefixes we expect per type (retail C10, retail delivery C9 or C10, microbusiness C12, distribution C11 or C13, testing lab C8, event organizer C6).
  // Cultivation and manufacturing numbers come from other state offices and brands/other can be anything, so those only get the shape check.
  var PREFIX = { storefront: ['C10'], delivery: ['C9', 'C10'], microbusiness: ['C12'], distribution: ['C11', 'C13'], lab: ['C8'], event: ['C6'] };
  // -> { ok: false } for a bad shape; { ok: true, license, typeMatch } for a good one (typeMatch false = the prefix is not one we expect for that type: a note, never a block)
  function licenseCheck(type, raw) {
    var s = String(raw == null ? '' : raw).trim().toUpperCase();
    if (!licenseShape(s)) return { ok: false };
    var want = PREFIX[type], pre = s.split('-')[0];
    return { ok: true, license: s, typeMatch: !want || want.indexOf(pre) >= 0 };
  }
  function emailOk(s) { s = String(s == null ? '' : s).trim(); return s.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s); }
  function zipOk(s) { return /^9[0-6]\d{3}$/.test(String(s == null ? '' : s).trim()); }   // California ZIP codes run 90000 to 96199
  // a US number: 10 digits, or 1 + 10; spaces, dots, dashes and brackets allowed.
  // phoneIssue: '' when it is a working NANP number, else 'required' | 'phone' (not 10 digits) | 'phoneNanp'
  // (10 digits, but the area code or exchange starts with 0 or 1, or it is a reserved 555-0100 number).
  function phoneDigits(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s || !/^\+?1?[0-9 ().-]+$/.test(s)) return null;
    var d = s.replace(/[^0-9]/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d.length === 10 ? d : null;
  }
  function phoneIssue(raw) {
    if (!trim(raw)) return 'required';
    var d = phoneDigits(raw);
    if (!d) return 'phone';
    var area = d.slice(0, 3), exch = d.slice(3, 6);
    if (area.charAt(0) < '2' || exch.charAt(0) < '2' || (area === '555' && exch.slice(0, 2) === '01')) return 'phoneNanp';
    return '';
  }
  function cleanPhone(raw) { var d = phoneDigits(raw); return d && !phoneIssue(raw) ? '+1' + d : null; }
  // The ticket the server signed: 'ok' inside 3s–2h, 'fast' before that, 'expired' after, 'bad' if it is not a ticket.
  // The server drops a fast or expired ticket with the same 204 as a real send, so the page must not treat those as received.
  var TICKET_MIN_S = 3, TICKET_MAX_S = 7200;
  function ticketKind(ticket, nowMs) {
    var m = /^([0-9]{1,12})\.[0-9a-f]{64}$/.exec(String(ticket || ''));
    if (!m) return 'bad';
    var age = Math.floor(Number(nowMs) / 1000) - Number(m[1]);
    if (age < TICKET_MIN_S) return 'fast';
    if (age > TICKET_MAX_S) return 'expired';
    return 'ok';
  }
  function trim(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  // values: the raw form. -> { ok, errors: { field: 'required' | 'email' | ... }, payload } (payload only when ok)
  function validate(v) {
    v = v || {};
    var e = {}, p = {};
    ['first', 'last', 'company'].forEach(function (k) { p[k] = trim(v[k]); if (!p[k] || p[k].length > MAX[k]) e[k] = 'required'; });
    p.email = trim(v.email).toLowerCase(); if (!p.email) e.email = 'required'; else if (!emailOk(p.email)) e.email = 'email';
    p.zip = trim(v.zip); if (!p.zip) e.zip = 'required'; else if (!zipOk(p.zip)) e.zip = 'zip';
    var whyPhone = phoneIssue(v.phone); if (whyPhone) e.phone = whyPhone; else p.phone = cleanPhone(v.phone);
    p.type = TYPES.indexOf(v.type) >= 0 ? v.type : ''; if (!p.type) e.type = 'required';
    p.active = ACTIVE.indexOf(v.active) >= 0 ? v.active : ''; if (!p.active) e.active = 'required';
    var lic = trim(v.license);
    if (lic) { var c = licenseCheck(p.type, lic); if (!c.ok) e.license = 'license'; else p.license = c.license; }
    else if (p.active === 'yes-number') e.license = 'licenseNeeded';
    p.goal = String(v.goal == null ? '' : v.goal).trim(); if (!p.goal || p.goal.length > MAX.goal) e.goal = 'required';
    if (v.consent !== true) e.consent = 'consent';
    p.confirmed = v.confirmed === true && !!p.license;   // "that is my business" on a number we found
    var ok = Object.keys(e).length === 0;
    return { ok: ok, errors: e, payload: ok ? p : null };
  }

  // The lookup: ONLY { name, county } (or null). Reads the two shipped files; nothing else about a listing is ever read into the page.
  function lookup(fetchFn, license) {
    var s = String(license == null ? '' : license).trim().toUpperCase();
    if (!licenseShape(s)) return Promise.resolve(null);
    var id = s.toLowerCase();
    function get(u) { return fetchFn(u).then(function (r) { if (!r || !r.ok) throw new Error('load'); return r.json(); }); }
    return Promise.all([get('data/listings-index.json'), get('data/listings-names.json')]).then(function (a) {
      var row = null, nm = null;
      (a[0].listings || []).forEach(function (r) { if (!row && String(r.license || '').toUpperCase() === s) row = r; });
      (a[1].names || []).forEach(function (r) { if (!nm && r[0] === id) nm = r[1]; });
      return row && nm && typeof row.county === 'string' ? { name: String(nm), county: String(row.county) } : null;
    }, function () { return null; });
  }
  // "BLUE MOUNTAIN COLLECTIVE, INC." -> "Blue Mountain Collective, Inc." is NOT attempted: the name is shown as the record has it.

  // The request the server receives: exactly these keys, nothing else.
  // The bot check (W11b_lead_botcheck.DRAFT.sql): a hidden "leave empty" field (p_hp) and a SERVER-signed ticket (p_ticket) fetched when the form is drawn. The server drops a request, silently
  // (the same 204), when the field is filled or the ticket is missing, forged, younger than 3 seconds or older than 2 hours. A person is never caught by it: the page waits until the ticket is
  // 3.5 seconds old before it sends (MIN_WAIT_MS), and fetches a fresh ticket when the old one is over 90 minutes old.
  var MIN_WAIT_MS = 3500, MAX_AGE_MS = 90 * 60 * 1000;
  function body(p, ticket, hp) {
    return { p_first: p.first, p_last: p.last, p_email: p.email, p_company: p.company, p_zip: p.zip, p_phone: p.phone, p_type: p.type, p_license: p.license || null,
      p_license_confirmed: p.confirmed === true, p_active: p.active, p_goal: p.goal, p_consent: true, p_hp: String(hp == null ? '' : hp), p_ticket: ticket == null ? null : String(ticket) };
  }
  function rpc(win, name, payload, wantJson) {
    var cfg = (win.FMW_CONFIG && win.FMW_CONFIG.authProject) || null;
    if (!cfg || !cfg.url || !cfg.anonKey || typeof win.fetch !== 'function') return Promise.resolve({ ok: false });
    return win.fetch(cfg.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey }, body: JSON.stringify(payload) })
      .then(function (r) { return r && r.ok ? (wantJson ? r.json().then(function (j) { return { ok: true, data: j }; }, function () { return { ok: true }; }) : { ok: true }) : { ok: false }; }, function () { return { ok: false }; });
  }
  // -> Promise of { value, at } (at = this device's clock when it arrived) or null
  function fetchTicket(win) { return rpc(win, 'fmw_lead_ticket', {}, true).then(function (r) { return r.ok && typeof r.data === 'string' && /^[0-9]+\.[0-9a-f]{64}$/.test(r.data) ? { value: r.data, at: Date.now() } : null; }); }
  function submit(win, payload, ticket, hp) {
    return rpc(win, 'fmw_submit_business_lead', body(payload, ticket, hp)).then(function (r) { return { ok: r.ok }; });
  }

  // ------------------------------------------------------------------------------------------------ the page
  function app(doc, win) {
    var box = doc.getElementById('biz-lead');
    if (!box) return null;
    var CFG = win.FMW_CONFIG || {}, on = CFG.bizLeads === true, claims = CFG.accounts === true && CFG.claims === true;
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function icon(d) { var s = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); var p = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); s.appendChild(p); return s; }

    // hero
    var hero = el('section', 'biz-hero'); hero.setAttribute('aria-labelledby', 'biz-title');
    var h1 = el('h1', 'name', CP.hero.title); h1.id = 'biz-title'; h1.setAttribute('tabindex', '-1');
    hero.appendChild(h1); hero.appendChild(el('p', null, CP.hero.body));
    var cta = el('a', 'btn', CP.hero.cta); cta.href = '#biz-start'; hero.appendChild(cta);
    box.appendChild(hero);

    var start = el('div', 'biz-start'); start.id = 'biz-start'; start.setAttribute('tabindex', '-1'); box.appendChild(start);
    if (on) buildForm(start); else buildSoon(start);
    buildFaq(box);

    function buildSoon(into) {
      var s = el('section', 'state info'); s.setAttribute('data-state', 'coming-soon'); s.setAttribute('aria-labelledby', 'biz-soon');
      var h = el('h2', null, CP.soon.title); h.id = 'biz-soon'; s.appendChild(h); s.appendChild(el('p', null, CP.soon.body));
      var a = el('a', 'btn', CP.soon.mail); a.href = CP.soon.mailto; s.appendChild(a);
      if (claims) { var b = el('a', 'btn ghost', CP.soon.account); b.href = 'signup?as=business'; s.appendChild(b); }
      into.appendChild(s);
    }

    function buildFaq(into) {
      var s = el('section', 'biz-faq'); s.setAttribute('aria-labelledby', 'biz-faq-t');
      var h = el('h2', null, CP.faq.title); h.id = 'biz-faq-t'; s.appendChild(h);
      CP.faq.items.forEach(function (it) { var d = el('details'); d.appendChild(el('summary', null, it.q)); d.appendChild(el('p', null, it.a)); s.appendChild(d); });
      into.appendChild(s);
    }

    function buildForm(into) {
      var F = CP.form, state = { confirmed: false, found: null };
      // the "I am a..." picker: three tiles, single choice (radio inputs, so the keyboard and screen readers work), preselecting the dropdown
      var pick = el('fieldset', 'biz-pick'); pick.appendChild(el('legend', null, CP.pick.title)); pick.appendChild(el('p', 'hint', CP.pick.hint));
      var grid = el('div', 'biz-tiles');
      CP.pick.tiles.forEach(function (t) {
        var l = el('label', 'biz-tile'); var r = el('input'); r.type = 'radio'; r.name = 'iam'; r.value = t.id;
        l.appendChild(r); l.appendChild(icon(t.icon)); l.appendChild(el('span', 'biz-tile-name', t.label)); l.appendChild(el('span', 'hint', t.body)); grid.appendChild(l);
      });
      pick.appendChild(grid); into.appendChild(pick);

      var f = el('form', 'signup-form biz-form'); f.setAttribute('method', 'post'); f.setAttribute('novalidate', '');
      var h = el('h2', null, F.title); h.id = 'biz-form-t'; f.setAttribute('aria-labelledby', 'biz-form-t'); f.appendChild(h); f.appendChild(el('p', 'hint', F.required));
      var summary = el('p', 'form-error'); summary.setAttribute('role', 'alert'); summary.hidden = true; f.appendChild(summary);
      var inputs = {}, msgs = {};
      function field(key, label, node, hint, wide) {
        var l = el('div', 'field' + (wide ? ' wide' : '')), id = 'biz-' + key;
        var lab = el('label', null, label + (key === 'license' ? '' : ' *')); lab.setAttribute('for', id); l.appendChild(lab);
        node.id = id; node.name = key; inputs[key] = node; l.appendChild(node);
        if (hint) { var hh = el('span', 'hint', hint); hh.id = id + '-h'; l.appendChild(hh); }
        var m = el('span', 'form-error'); m.id = id + '-e'; m.hidden = true; msgs[key] = m; l.appendChild(m);
        node.setAttribute('aria-describedby', (hint ? id + '-h ' : '') + id + '-e');
        return l;
      }
      function inp(type, auto, max) { var i = el('input'); i.type = type; if (auto) i.setAttribute('autocomplete', auto); if (max) i.maxLength = max; return i; }
      var cols = el('div', 'biz-cols');
      cols.appendChild(field('first', F.first, inp('text', 'given-name', MAX.first)));
      cols.appendChild(field('last', F.last, inp('text', 'family-name', MAX.last)));
      var em = inp('email', 'email', MAX.email); cols.appendChild(field('email', F.email, em));
      cols.appendChild(field('company', F.company, inp('text', 'organization', MAX.company)));
      var zip = inp('text', 'postal-code', 5); zip.setAttribute('inputmode', 'numeric'); cols.appendChild(field('zip', F.zip, zip));
      cols.appendChild(field('phone', F.phone, inp('tel', 'tel', 20)));
      var sel = el('select'); var o0 = el('option', null, F.typePick); o0.value = ''; sel.appendChild(o0);
      CP.types.forEach(function (t) { var o = el('option', null, t.label); o.value = t.id; sel.appendChild(o); });
      cols.appendChild(field('type', F.type, sel));
      var lic = inp('text', null, 20); lic.setAttribute('autocapitalize', 'characters'); lic.setAttribute('spellcheck', 'false'); cols.appendChild(field('license', F.license, lic, F.licenseHint));
      f.appendChild(cols);

      // the lookup answer sits right under the license field (a polite live region)
      var found = el('div', 'biz-found'); found.setAttribute('role', 'status'); found.setAttribute('aria-live', 'polite'); f.appendChild(found);

      var act = el('fieldset', 'biz-radios'); var lg = el('legend', null, F.active + ' *'); act.appendChild(lg);
      CP.active.forEach(function (o) { var l = el('label', 'check'); var r = el('input'); r.type = 'radio'; r.name = 'active'; r.value = o.id; l.appendChild(r); l.appendChild(el('span', null, ' ' + o.label)); act.appendChild(l); });
      var am = el('span', 'form-error'); am.id = 'biz-active-e'; am.hidden = true; msgs.active = am; act.appendChild(am); act.setAttribute('aria-describedby', 'biz-active-e'); f.appendChild(act);

      var ta = el('textarea'); ta.rows = 4; ta.maxLength = MAX.goal; f.appendChild(field('goal', F.goal, ta, F.goalHint, true));

      var cw = el('div', 'field wide'); var cl = el('label', 'check'); var cb = el('input'); cb.type = 'checkbox'; cb.id = 'biz-consent'; cb.name = 'consent'; inputs.consent = cb;
      cl.appendChild(cb); var cs = el('span'); cs.appendChild(doc.createTextNode(F.consentPre));
      var pa = el('a', null, F.privacy); pa.href = 'privacy'; cs.appendChild(pa); cs.appendChild(doc.createTextNode(F.consentPost + ' *')); cl.appendChild(cs);
      cw.appendChild(cl); var cm = el('span', 'form-error'); cm.id = 'biz-consent-e'; cm.hidden = true; msgs.consent = cm; cw.appendChild(cm); cb.setAttribute('aria-describedby', 'biz-consent-e biz-consent-line');
      var line = el('p', 'hint', F.consentLine); line.id = 'biz-consent-line'; cw.appendChild(line); f.appendChild(cw);

      // the bot check's hidden field: off-screen (CSS .biz-hp), skipped by Tab and screen readers, never sent unless something fills it
      var hpw = el('div', 'biz-hp'); hpw.setAttribute('aria-hidden', 'true');
      var hpl = el('label', null, F.hpLabel); hpl.setAttribute('for', 'biz-website'); var hp = el('input'); hp.type = 'text'; hp.id = 'biz-website'; hp.name = 'website'; hp.setAttribute('tabindex', '-1'); hp.setAttribute('autocomplete', 'off');
      hpw.appendChild(hpl); hpw.appendChild(hp); f.appendChild(hpw);
      var tk = null;   // the server's ticket for this form, { value, at }
      function ensureTicket() { if (tk && Date.now() - tk.at < MAX_AGE_MS) return Promise.resolve(tk); return fetchTicket(win).then(function (t) { if (t) tk = t; return t; }); }
      ensureTicket();   // fetched as the form is drawn, so it is old enough by the time a person has filled the fields
      var send = el('button', 'btn', F.submit); send.type = 'submit'; f.appendChild(send);
      into.appendChild(f);

      function values() {
        var a = f.querySelector('input[name=active]:checked');
        return { first: inputs.first.value, last: inputs.last.value, email: inputs.email.value, company: inputs.company.value, zip: inputs.zip.value, phone: inputs.phone.value, type: inputs.type.value,
          license: inputs.license.value, active: a ? a.value : '', goal: inputs.goal.value, consent: cb.checked, confirmed: state.confirmed };
      }
      function showErrors(errs) {
        var first = null;
        Object.keys(msgs).forEach(function (k) {
          var m = msgs[k], key = errs[k], node = inputs[k];
          m.hidden = !key; m.textContent = key ? CP.errors[key] : '';
          if (node && node.setAttribute) { if (key) { node.setAttribute('aria-invalid', 'true'); if (!first) first = node; } else node.removeAttribute('aria-invalid'); }
          if (k === 'active' && key && !first) first = f.querySelector('input[name=active]');
        });
        summary.hidden = !first; summary.textContent = first ? CP.errors.summary : '';
        return first;
      }
      // picker -> dropdown (and the dropdown keeps working on its own)
      grid.addEventListener('change', function (ev) { var t = ev.target; if (t && t.name === 'iam') { sel.value = TILE_TYPE[t.value] || ''; checkLicense(); if (f.scrollIntoView) f.scrollIntoView({ block: 'start' }); } });
      function checkLicense() {
        while (found.firstChild) found.removeChild(found.firstChild);
        state.confirmed = false; state.found = null;
        var raw = trim(inputs.license.value);
        if (!raw) return;
        var c = licenseCheck(sel.value, raw);
        if (!c.ok) return;   // the shape error shows on submit; no lookup for a malformed number
        if (!c.typeMatch) found.appendChild(el('p', 'hint', CP.lookup.typeNote));
        lookup(win.fetch.bind(win), c.license).then(function (hit) {
          if (inputs.license.value.trim().toUpperCase() !== c.license) return;   // the field changed while we looked
          if (!hit) { found.appendChild(el('p', 'hint', CP.lookup.notFound)); return; }
          state.found = hit;
          var box2 = el('div', 'state info'); box2.setAttribute('data-state', 'license-found'); box2.appendChild(el('p', null, CP.lookup.found(hit.name, hit.county)));
          var yes = el('button', 'btn', CP.lookup.confirm); yes.type = 'button'; yes.setAttribute('aria-pressed', 'false');
          var no = el('button', 'btn ghost', CP.lookup.notMine); no.type = 'button';
          yes.addEventListener('click', function () { state.confirmed = true; yes.setAttribute('aria-pressed', 'true'); });
          no.addEventListener('click', function () { state.confirmed = false; yes.setAttribute('aria-pressed', 'false'); });
          box2.appendChild(yes); box2.appendChild(no); found.appendChild(box2);
        });
      }
      inputs.license.addEventListener('change', checkLicense); sel.addEventListener('change', checkLicense);
      function failSend(reason) {
        send.disabled = false; send.textContent = F.submit; summary.hidden = false;
        summary.textContent = reason === 'expired' ? CP.errors.ticketExpired : reason === 'fast' ? CP.errors.ticketFast : CP.errors.failed;
        if (summary.scrollIntoView) summary.scrollIntoView({ block: 'center' });
      }
      // Wait until the ticket is old enough by both clocks (when it arrived, and the time the server stamped into it),
      // then send. A fast or expired ticket is not sent: the server would answer 204 and drop it, and this page would
      // otherwise say thank you for a request it never kept.
      function sendReady(t, payload, refreshed) {
        var kind = ticketKind(t.value, Date.now());
        if (kind === 'expired' || kind === 'bad') {
          tk = null;
          if (refreshed || kind === 'bad') return Promise.resolve({ ok: false, reason: kind === 'expired' ? 'expired' : 'ticket' });
          return fetchTicket(win).then(function (n) { if (!n) return { ok: false, reason: 'expired' }; tk = n; return sendReady(n, payload, true); });
        }
        var wait = Math.max(0, MIN_WAIT_MS - (Date.now() - t.at));
        var ts = Number(String(t.value).split('.')[0]);
        if (kind === 'fast' && isFinite(ts)) wait = Math.max(wait, (ts + TICKET_MIN_S + 1) * 1000 - Date.now());
        if (wait > 15000) return Promise.resolve({ ok: false, reason: 'fast' });
        return new Promise(function (go) { (win.setTimeout || setTimeout)(go, wait); }).then(function () {
          var nowKind = ticketKind(t.value, Date.now());
          if (nowKind !== 'ok') return { ok: false, reason: nowKind === 'expired' ? 'expired' : 'fast' };
          return submit(win, payload, t.value, hp.value).then(function (res) { return res && res.ok ? { ok: true } : { ok: false, reason: 'failed' }; });
        });
      }
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var r = validate(values()), first = showErrors(r.errors);
        if (!r.ok) { if (first && first.focus) first.focus(); return; }
        send.disabled = true; send.textContent = F.sending;
        ensureTicket().then(function (t) {
          if (!t) return { ok: false, reason: 'ticket' };
          return sendReady(t, r.payload, false);
        }).then(function (res) {
          if (res && res.ok) { thanks(into); return; }
          failSend(res && res.reason);
        });
      });
    }

    function thanks(into) {
      while (into.firstChild) into.removeChild(into.firstChild);
      var s = el('section', 'state info'); s.setAttribute('data-state', 'sent'); s.setAttribute('role', 'status'); s.setAttribute('tabindex', '-1');
      s.appendChild(el('h2', null, CP.done.title)); s.appendChild(el('p', null, CP.done.body));
      if (claims) { s.appendChild(el('p', null, CP.done.next)); var a = el('a', 'btn', CP.done.cta); a.href = 'signup?as=business'; s.appendChild(a); }
      var h = el('a', 'btn ghost', CP.done.home); h.href = './'; s.appendChild(h);
      into.appendChild(s); if (s.focus) s.focus();
    }
    return { box: box };
  }

  var api = { TYPES: TYPES, ACTIVE: ACTIVE, TILE_TYPE: TILE_TYPE, licenseShape: licenseShape, licenseCheck: licenseCheck, emailOk: emailOk, zipOk: zipOk, cleanPhone: cleanPhone, phoneIssue: phoneIssue, ticketKind: ticketKind, MIN_WAIT_MS: MIN_WAIT_MS, fetchTicket: fetchTicket, validate: validate, lookup: lookup, body: body, submit: submit, app: app };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document && root.document.getElementById) { var run = function () { app(root.document, root); }; if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', run); else run(); }
})(typeof window !== 'undefined' ? window : globalThis);
