// Dashboard "Events" tab: an organizer creates, publishes, edits and cancels EVENTS (Posh-style flow, Find My Weed only, cannabis only).
// Built against docs/proposed/migrations/E1_events.DRAFT.sql (fmw.my_events, fmw.save_my_event, fmw.cancel_my_event). DORMANT until site.json "bizEvents" is true (FMW_CONFIG.bizEvents): the SQL must be applied first.
// NO PAYMENT, ever: a ticket is a Free RSVP or the organizer's OWN outside ticket link (https). Nothing here takes, stores or forwards a card or bank value (a test pins that). A third mode, "Ticketing partner", exists only
// as a slot: the server says whether a cannabis-approved processor is configured (my_events().partner); until it does, that choice is not drawn.
// 21+ is always on and is not a field. WHO may create events is decided in ONE place on each side: canCreate(biz) here (the license capability) and fmw.events_allowed in SQL; the tab is shown only when it says yes.
// The SERVER validates everything again. Text goes in with textContent only; no markup, no storage.
(function (root) {
  var COPY = {
    tab: 'Events', title: 'Your events', note: 'Create an event, save it as a draft, then publish it when it is ready. Every event is 21 and over.',
    none: 'No events yet.', create: 'Create an event', loading: 'Loading…', loadFail: 'Could not load this right now. Try again in a moment.', notAllowed: 'Events are for event organizer licenses.', readOnly: 'Only an owner or manager can create or change events.',
    fTitle: 'Event name', fDate: 'Date', fStart: 'Starts', fEnd: 'Ends (optional)', fVenue: 'Venue name', fAddress: 'Street address', fCity: 'City', fCounty: 'County', fDesc: 'About the event', fFlyer: 'Flyer image (optional)',
    flyerHint: 'JPEG, PNG or WebP. Large photos are shrunk to fit for you.', age: '21 and over. This is always on for cannabis events.',
    tickets: 'Tickets', modeRsvp: 'Free RSVP', modeLink: 'Outside ticket link', modePartner: 'Ticketing partner', linkLabel: 'Your ticket link (https)',
    linkHint: 'Paste the page where your tickets are offered (for example your PromoTix or EventHi page). Find My Weed sends people there; it does not handle tickets or take any payment.', capLabel: 'RSVP limit (optional)',
    saveDraft: 'Save draft', publish: 'Publish', edit: 'Edit', cancelEv: 'Cancel event', confirmCancel: 'Confirm cancel', back: 'Back to events',
    saved: 'Saved.', published: 'Published.', cancelled: 'Cancelled.', saveFail: 'Could not save. Check the form and try again.', flyerFail: 'The flyer could not be uploaded. You can save without it or try again.',
    statusDraft: 'Draft', statusLive: 'Live', statusCancelled: 'Cancelled', badFlyer: 'The flyer must be a JPEG, PNG or WebP image.',
    errTitle: 'Enter the event name.', errDate: 'Choose the date and start time.', errPast: 'The start must be in the future.', errEnd: 'The end must be after the start and within 7 days.', errVenue: 'Enter the venue and the city to publish.',
    errLink: 'Enter your ticket link, starting with https://.', errCap: 'The RSVP limit must be a number from 1 to 5000.', errDesc: 'The description is up to 2000 characters of plain text.'
  };
  var MAX_FLYER = 5 * 1024 * 1024, MAX_RAW = 40 * 1024 * 1024;   // MAX_FLYER is what the server accepts (after the browser shrinks the photo); MAX_RAW is the most we will try to shrink
  // THE capability check (one function): an approved business whose license caps say events. The server enforces the same rule (fmw.events_allowed); change both together.
  function canCreate(biz) { return !!(biz && biz.caps && biz.caps.events === true); }
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function t(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, n) : ''; }
  function cleanEvents(list) {
    return (Array.isArray(list) ? list : []).filter(function (e) { return e && typeof e.id === 'string' && /^[0-9a-f-]{36}$/.test(e.id) && typeof e.title === 'string'; }).slice(0, 100).map(function (e) {
      return { id: e.id, title: t(e.title, 120), starts_at: typeof e.starts_at === 'string' ? e.starts_at : '', ends_at: typeof e.ends_at === 'string' ? e.ends_at : '', venue: t(e.venue, 120), address: t(e.address, 200), city: t(e.city, 80), county: t(e.county, 60),
        description: t(e.description, 2000), ticket_mode: ['rsvp', 'link', 'partner'].indexOf(e.ticket_mode) >= 0 ? e.ticket_mode : 'link', ticket_url: typeof e.ticket_url === 'string' ? e.ticket_url : '', rsvp_cap: Number(e.rsvp_cap) > 0 ? Number(e.rsvp_cap) : null,
        flyer_path: typeof e.flyer_path === 'string' ? e.flyer_path : '', status: ['draft', 'live', 'cancelled'].indexOf(e.status) >= 0 ? e.status : 'draft' };
    });
  }
  // A date + a time typed in California (the events are California events) as the exact instant (ISO, UTC): the zone's offset is read from Intl, so daylight saving is right.
  function laToIso(date, time, win) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '')), h = /^(\d{2}):(\d{2})$/.exec(String(time || '')); if (!m || !h) return '';
    var y = +m[1], mo = +m[2], d = +m[3], hh = +h[1], mm = +h[2]; if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return '';
    var Dt = (win && win.Date) || Date, guess = Dt.UTC(y, mo - 1, d, hh, mm);
    function off(ms) {   // minutes the Los Angeles wall clock is ahead of UTC at that instant
      var p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Dt(ms)), o = {};
      p.forEach(function (x) { o[x.type] = x.value; }); return (Dt.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute) - ms) / 60000;
    }
    var ms = guess - off(guess) * 60000; ms = guess - off(ms) * 60000;
    return new Dt(ms).toISOString();
  }
  // the form's values -> { error } or { args } (the save_my_event arguments); the server checks every rule again
  function build(v, status, now, win) {
    var title = String(v.title || '').trim(); if (!title || title.length > 120) return { error: 'errTitle' };
    var start = laToIso(v.date, v.start, win); if (!start) return { error: 'errDate' };
    var nowMs = (now || new Date()).getTime(); if (!v.id && new Date(start).getTime() < nowMs) return { error: 'errPast' };
    var end = null; if (v.end) { if (v.end === v.start) return { error: 'errEnd' }; end = laToIso(v.date, v.end, win); if (!end) return { error: 'errDate' }; if (new Date(end).getTime() <= new Date(start).getTime()) end = laToIso(addDay(v.date), v.end, win); if (new Date(end).getTime() <= new Date(start).getTime() || new Date(end).getTime() > new Date(start).getTime() + 7 * 864e5) return { error: 'errEnd' }; }
    var venue = String(v.venue || '').trim(), city = String(v.city || '').trim(); if (status === 'live' && (!venue || !city)) return { error: 'errVenue' };
    var mode = ['rsvp', 'link', 'partner'].indexOf(v.mode) >= 0 ? v.mode : 'link', url = String(v.url || '').trim();
    if (mode === 'link' && !/^https:\/\/[^\s<>"']+$/i.test(url)) return { error: 'errLink' };
    var cap = null; if (mode === 'rsvp' && String(v.cap || '').trim() !== '') { cap = Number(v.cap); if (!(cap >= 1 && cap <= 5000) || Math.floor(cap) !== cap) return { error: 'errCap' }; }
    var desc = String(v.desc || '').trim(); if (desc.length > 2000) return { error: 'errDesc' };
    return { args: { p_id: v.id || null, p_title: title, p_starts_at: start, p_ends_at: end, p_venue: venue || null, p_address: String(v.address || '').trim() || null, p_city: city || null, p_county: String(v.county || '').trim() || null,
      p_description: desc || null, p_ticket_mode: mode, p_ticket_url: mode === 'link' ? url : null, p_rsvp_cap: cap, p_flyer_path: v.flyer || null, p_status: status } };
  }
  function addDay(date) { var d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  function whenText(iso) {
    try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso; }
  }
  function parts(iso) {   // an ISO instant -> the California date + HH:MM for the edit form
    try { var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)), o = {}; p.forEach(function (x) { o[x.type] = x.value; });
      return { date: o.year + '-' + o.month + '-' + o.day, time: o.hour + ':' + o.minute }; } catch (e) { return { date: '', time: '' }; }
  }
  function checkFlyer(f) { return !!(f && /\.(jpe?g|png|webp)$/i.test(String(f.name || '')) && f.size > 0 && f.size <= MAX_RAW); }
  function mount(doc, panel, ctx) {
    var role = ctx.biz && ctx.biz.role, canEdit = role === 'owner' || role === 'manager';
    panel.appendChild(el(doc, 'h2', null, COPY.title)); panel.appendChild(el(doc, 'p', 'muted', COPY.note));
    var box = el(doc, 'div'), say = el(doc, 'p', 'muted'); say.setAttribute('role', 'status'); say.setAttribute('aria-live', 'polite'); panel.appendChild(box); panel.appendChild(say);
    var data = { partner: false, events: [] };
    function load() {
      box.textContent = ''; box.appendChild(el(doc, 'p', 'muted', COPY.loading));
      ctx.rpc('my_events', {}).then(function (r) {
        box.textContent = '';
        if (!r || !r.ok || !r.data) { box.appendChild(el(doc, 'p', 'muted', COPY.loadFail)); return; }
        if (r.data.allowed !== true) { box.appendChild(el(doc, 'p', 'muted', COPY.notAllowed)); return; }
        data = { partner: r.data.partner === true, events: cleanEvents(r.data.events) }; list();
      });
    }
    function list() {
      box.textContent = '';
      if (canEdit) { var nb = el(doc, 'button', 'btn', COPY.create); nb.type = 'button'; nb.setAttribute('data-act', 'event-new'); nb.addEventListener('click', function () { form(null); }); box.appendChild(nb); } else box.appendChild(el(doc, 'p', 'muted', COPY.readOnly));
      if (!data.events.length) { box.appendChild(el(doc, 'p', 'muted', COPY.none)); return; }
      var ul = el(doc, 'ul', 'biz-plist');
      data.events.forEach(function (e) {
        var li = el(doc, 'li'); li.appendChild(el(doc, 'strong', null, e.title)); li.appendChild(el(doc, 'span', 'muted', ' · ' + whenText(e.starts_at) + (e.city ? ' · ' + e.city : '') + ' · ' + COPY[e.status === 'live' ? 'statusLive' : e.status === 'cancelled' ? 'statusCancelled' : 'statusDraft'] + ' '));
        if (canEdit && e.status !== 'cancelled') {
          var eb = el(doc, 'button', 'btn ghost', COPY.edit); eb.type = 'button'; eb.setAttribute('aria-label', COPY.edit + ': ' + e.title); eb.addEventListener('click', function () { form(e); });
          var cb = el(doc, 'button', 'btn ghost', COPY.cancelEv), armed = false; cb.type = 'button'; cb.setAttribute('aria-label', COPY.cancelEv + ': ' + e.title);
          cb.addEventListener('click', function () { if (!armed) { armed = true; cb.textContent = COPY.confirmCancel; return; } ctx.rpc('cancel_my_event', { p_id: e.id }).then(function (r) { say.textContent = r && r.ok ? COPY.cancelled : COPY.saveFail; load(); }); });
          li.appendChild(eb); li.appendChild(cb);
        }
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    function field(label, ctl, hint) { var l = el(doc, 'label', 'field'); l.appendChild(el(doc, 'span', null, label)); l.appendChild(ctl); if (hint) l.appendChild(el(doc, 'span', 'hint', hint)); return l; }
    function inp(type, name, max) { var i = el(doc, 'input'); i.type = type; i.name = name; if (max) i.setAttribute('maxlength', String(max)); return i; }
    function form(ev) {
      box.textContent = ''; say.textContent = '';
      var s = ev ? parts(ev.starts_at) : { date: '', time: '' }, en = ev && ev.ends_at ? parts(ev.ends_at) : { time: '' };
      var f = el(doc, 'form', 'biz-event-form'), err = el(doc, 'p', 'form-error'); err.setAttribute('role', 'alert');
      var title = inp('text', 'title', 120), date = inp('date', 'date'), start = inp('time', 'start'), end = inp('time', 'end'), venue = inp('text', 'venue', 120), address = inp('text', 'address', 200), city = inp('text', 'city', 80), county = inp('text', 'county', 60);
      var desc = el(doc, 'textarea'); desc.name = 'desc'; desc.setAttribute('maxlength', '2000'); var flyer = inp('file', 'flyer'); flyer.setAttribute('accept', 'image/jpeg,image/png,image/webp');
      title.value = ev ? ev.title : ''; date.value = s.date; start.value = s.time; end.value = en.time || ''; venue.value = ev ? ev.venue : ''; address.value = ev ? ev.address : ''; city.value = ev ? ev.city : ''; county.value = ev ? ev.county : ''; desc.value = ev ? ev.description : '';
      [field(COPY.fTitle, title), field(COPY.fDate, date), field(COPY.fStart, start), field(COPY.fEnd, end), field(COPY.fVenue, venue), field(COPY.fAddress, address), field(COPY.fCity, city), field(COPY.fCounty, county), field(COPY.fDesc, desc)].forEach(function (n) { f.appendChild(n); });
      f.appendChild(el(doc, 'p', 'event-age', COPY.age)); f.appendChild(field(COPY.fFlyer, flyer, COPY.flyerHint));
      var fs = el(doc, 'fieldset', 'event-tickets'); fs.appendChild(el(doc, 'legend', null, COPY.tickets));
      var modes = [['rsvp', COPY.modeRsvp], ['link', COPY.modeLink]]; if (data.partner) modes.push(['partner', COPY.modePartner]);
      var cur = ev ? ev.ticket_mode : 'link', radios = {};
      modes.forEach(function (m) { var r = inp('radio', 'mode'); r.value = m[0]; r.checked = cur === m[0]; radios[m[0]] = r; var l = el(doc, 'label', 'chip'); l.appendChild(r); l.appendChild(el(doc, 'span', null, m[1])); fs.appendChild(l); });
      var url = inp('url', 'url', 300), cap = inp('number', 'cap'); url.value = ev ? ev.ticket_url : ''; cap.value = ev && ev.rsvp_cap ? String(ev.rsvp_cap) : '';
      var urlF = field(COPY.linkLabel, url, COPY.linkHint), capF = field(COPY.capLabel, cap); fs.appendChild(urlF); fs.appendChild(capF); f.appendChild(fs);
      function sync() { var m = value(); urlF.hidden = m !== 'link'; capF.hidden = m !== 'rsvp'; }
      function value() { return Object.keys(radios).filter(function (k) { return radios[k].checked; })[0] || 'link'; }
      Object.keys(radios).forEach(function (k) { radios[k].addEventListener('change', sync); }); sync(); f.appendChild(err);
      var save = el(doc, 'button', 'btn ghost', COPY.saveDraft), pub = el(doc, 'button', 'btn', COPY.publish), back = el(doc, 'button', 'btn ghost', COPY.back); [save, pub, back].forEach(function (b) { b.type = 'button'; f.appendChild(b); });
      save.setAttribute('data-act', 'event-draft'); pub.setAttribute('data-act', 'event-publish'); back.addEventListener('click', load);
      function go(status) {
        err.textContent = '';
        var b = build({ id: ev && ev.id, title: title.value, date: date.value, start: start.value, end: end.value, venue: venue.value, address: address.value, city: city.value, county: county.value, desc: desc.value, mode: value(), url: url.value, cap: cap.value, flyer: ev && ev.flyer_path }, status, new Date(), ctx.win);
        if (b.error) { err.textContent = COPY[b.error]; return; }
        var fl = flyer.files && flyer.files[0]; if (fl && !checkFlyer(fl)) { err.textContent = COPY.badFlyer; return; }
        [save, pub].forEach(function (x) { x.setAttribute('disabled', 'disabled'); });
        var send = function () { return ctx.rpc('save_my_event', b.args).then(function (r) { [save, pub].forEach(function (x) { x.removeAttribute('disabled'); }); if (r && r.ok) { say.textContent = status === 'live' ? COPY.published : COPY.saved; load(); } else err.textContent = COPY.saveFail; }); };
        if (!fl) return send();
        upload(ctx, fl).then(function (r) { var path = r.path; if (!path) { [save, pub].forEach(function (x) { x.removeAttribute('disabled'); }); err.textContent = COPY.flyerFail + ' ' + (ctx.win.FMW_UPLOAD_IMAGE ? ctx.win.FMW_UPLOAD_IMAGE.messageFor(r.error) : ''); return; } b.args.p_flyer_path = path; send(); });
      }
      save.addEventListener('click', function () { go('draft'); }); pub.addEventListener('click', function () { go('live'); });
      box.appendChild(f);
    }
    load();
  }
  // the flyer goes through the same upload function as the other photos (category "flyer"); the answer's path is kept only if it has the flyer shape
  // resolves { path } on success or { error: code } (type, size, dimension, quota, not-allowed, signin, network, other); the photo is shrunk in the browser first (js/upload-image.js)
  function upload(ctx, file) {
    var cfg = ctx.win.FMW_CONFIG && ctx.win.FMW_CONFIG.authProject, f = ctx.win.fetch, U = ctx.win.FMW_UPLOAD_IMAGE; if (!cfg || !cfg.url || !ctx.token || typeof f !== 'function') return Promise.resolve({ error: 'other' });
    return (U ? U.prepare(ctx.win, file, 'flyer') : Promise.resolve({ file: file })).then(function (p) {
      if (p.error) return { error: p.error };
      var fd = new ctx.win.FormData(); fd.append('file', p.file); fd.append('category', 'flyer');
      return Promise.resolve().then(function () { return f.call(ctx.win, cfg.url + '/functions/v1/fmw-upload-media', { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + ctx.token }, body: fd }); })
        .then(function (r) {
          if (!(r && r.ok && r.json)) return U ? U.outcome(r).then(function (o) { return { error: o.error || 'other' }; }) : { error: 'other' };
          return r.json().then(function (j) { var pa = j && (j.path || (j.media && j.media.path)); return typeof pa === 'string' && /^[0-9a-f-]{36}\/flyer\/[0-9a-f-]{36}\.(jpg|webp|png)$/.test(pa) ? { path: pa } : { error: 'other' }; }, function () { return { error: 'other' }; });
        }, function () { return { error: 'network' }; });
    });
  }
  var list = root.FMW_DASHBOARD_TABS = root.FMW_DASHBOARD_TABS || [];
  if (root.FMW_CONFIG && root.FMW_CONFIG.bizEvents === true) list.push({ key: 'events', label: COPY.tab, roles: ['owner', 'manager', 'editor'], when: canCreate, mount: mount });
  var api = { mount: mount, COPY: COPY, canCreate: canCreate, cleanEvents: cleanEvents, laToIso: laToIso, build: build, checkFlyer: checkFlyer, parts: parts, MAX_FLYER: MAX_FLYER, MAX_RAW: MAX_RAW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_BIZ_EVENTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
