/* KEEPITIL one-tap RSVP (event page). ONE tap says "I'm going": the confirmation shows at once and nothing else is required. An email (reminder) and an account are optional afterwards.
   DATA: one row in public.event_registrations per tap (event_slug, event_id, answers {rsvp:true, source:'one_tap', device:<random per-browser id>}; buyer_email and buyer_name stay empty because every
   column is nullable and the anon INSERT policy already allows it). It never blocks the UI: the confirmation does not wait for the insert, a failed insert is retried once on the next
   visit, and a device that already tapped sees "going" with no second insert. COUNTING: after the SQL in keepitil.github.io #129, get_event_social ("N going") counts distinct people: an
   email once, a bare tap once per device, and a tap that later adds an email (same device id) as ONE person. Until #129 is applied the number still counts emails only, so the page
   also bumps the badge by one locally after your own tap (a server value that arrives later is shown as server + 1 for that tap).
   "UPCOMING": the button is shown until max(starts_at + 3 h, ends_at), so a multi-day event keeps it.
   COPY: every user-facing string is in COPY below so Muse's copy replaces it without touching logic (the strings now in it are Muse's approved copy, 2026-11-25). */
(function (root) {
  'use strict';
  var COPY = {   /* Muse's approved strings (Grok 2026-11-25 5:08); change copy ONLY here */
    tap: "I'm going",
    done: "You're in - see you there.",
    doneSub: '',                      /* no upsell and no extra line under the confirmation */
    count: function (n) { return n + ' going'; },
    emailLabel: 'Email me a reminder',
    emailPlaceholder: 'you@email.com',
    emailBtn: 'Remind me',
    emailOk: 'Reminder set.',
    emailBad: 'Please enter a valid email.',
    emailFail: "Couldn't save that just now. Try again.",
    save: '',                         /* the account link is OFF: Muse's list has none (set a label here to bring it back) */
    saveHref: '/join'
  };

  var KEY = 'kil_rsvp_v1:';
  var DEVKEY = 'kil_rsvp_device_v1';
  var memDevice = null;

  function validEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim()) && String(s).length <= 254; }

  function safeStore(opt) {
    if (opt) return opt;
    try { var t = root.localStorage; t.setItem('__kil_t', '1'); t.removeItem('__kil_t'); return t; } catch (e) { return null; }
  }
  function read(store, slug) { try { var v = store && store.getItem(KEY + slug); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function write(store, slug, obj) { try { if (store) store.setItem(KEY + slug, JSON.stringify(obj)); } catch (e) { /* private mode: the page still confirms */ } }

  /* A random id kept on the device (never derived from the person): both rows of one person (the tap and the optional email follow-up) carry it, so get_event_social can count that person ONCE. */
  function deviceId(store) {
    var id = null;
    try { id = store && store.getItem(DEVKEY); } catch (e) { id = null; }
    if (id && /^[a-z0-9-]{8,64}$/.test(id)) return id;
    if (memDevice && !store) return memDevice;
    try { id = (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : null; } catch (e) { id = null; }
    if (!id) { id = ''; for (var i = 0; i < 4; i++) id += Math.random().toString(36).slice(2, 10); id = id.slice(0, 32); }
    try { if (store) store.setItem(DEVKEY, id); } catch (e) { /* private mode: this page view keeps one id in memory */ }
    memDevice = id;
    return id;
  }

  function buildRecord(ev, extra) {
    var rec = { event_slug: String(ev.slug), answers: Object.assign({ rsvp: true, source: 'one_tap' }, extra && extra.answers || {}) };
    if (extra && extra.device) rec.answers.device = String(extra.device);
    if (ev.id) rec.event_id = ev.id;
    if (extra && extra.email) rec.buyer_email = String(extra.email).trim();
    return rec;
  }

  function isPast(ev, now) {
    var start = ev && ev.startsAt ? new Date(ev.startsAt).getTime() : NaN;
    var end = ev && ev.endsAt ? new Date(ev.endsAt).getTime() : NaN;
    if (isNaN(start) && isNaN(end)) return false;                       /* no usable date: never hide on a guess */
    var cutoff = Math.max(isNaN(start) ? -Infinity : start + 3 * 60 * 60 * 1000, isNaN(end) ? -Infinity : end);
    return now.getTime() > cutoff;
  }

  function send(sb, rec) {
    try { return Promise.resolve(sb.from('event_registrations').insert(rec)).then(function (r) { return !(r && r.error); }, function () { return false; }); }
    catch (e) { return Promise.resolve(false); }
  }
  /* One hit for the event page, and a conversion after a saved RSVP. No-op unless the client exposes rpc (the tests' fake does not). */
  function recordTraffic(sb, slug, kind) {
    try {
      if (!sb || typeof sb.rpc !== 'function' || !/^[a-z0-9][a-z0-9-]{0,200}$/.test(String(slug || ''))) return;
      var params = null;
      try { params = new URLSearchParams((root.location && root.location.search) || ''); } catch (e) { params = null; }
      var pick = function (k) { return params ? String(params.get(k) || '').replace(/[\u0000-\u001f]/g, '').slice(0, 80) : ''; };
      var knd = kind || (pick('utm_source') || pick('utm_campaign') || pick('utm_content') ? 'click' : 'view');
      Promise.resolve(sb.rpc('kil_record_event_hit', {
        p_slug: String(slug), p_kind: knd, p_utm_source: pick('utm_source'), p_utm_medium: pick('utm_medium'),
        p_utm_campaign: pick('utm_campaign'), p_utm_content: pick('utm_content')
      })).catch(function () {});
    } catch (e) {}
  }

  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function mount(host, opts) {
    opts = opts || {};
    var ev = opts.ev, sb = opts.sb, doc = host && host.ownerDocument;
    if (!host || !doc || !ev || !ev.slug || !sb) return null;
    var now = opts.now || new Date();
    if (isPast(ev, now)) { host.style.display = 'none'; return null; }
    var copy = Object.assign({}, COPY, opts.copy || {});
    var going = opts.going || null;                      /* the "N going" badge element, if the page has one */
    var store = safeStore(opts.store);
    var saved = read(store, ev.slug);
    var device = deviceId(store);
    var state = { going: !!(saved && saved.going), sent: !!(saved && saved.sent), email: !!(saved && saved.email) };

    function render() {
      host.textContent = '';
      host.style.display = '';
      if (!state.going) {
        var b = el(doc, 'button', 'rsvp-tap', copy.tap); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
        if (ev.title) b.setAttribute('aria-label', copy.tap + ' to ' + ev.title);   /* starts with the visible words; names the event now that the button can sit above its title */
        b.addEventListener('click', tap);
        host.appendChild(b);
        return;
      }
      var done = el(doc, 'div', 'rsvp-done'); done.setAttribute('role', 'status');
      done.appendChild(el(doc, 'strong', '', copy.done)); if (copy.doneSub) done.appendChild(el(doc, 'span', 'rsvp-sub', copy.doneSub));
      host.appendChild(done);
      if (state.email) { host.appendChild(el(doc, 'p', 'rsvp-ok', copy.emailOk)); }
      else {
        var f = doc.createElement('form'); f.className = 'rsvp-mail'; f.noValidate = true;
        var lab = el(doc, 'label', '', copy.emailLabel); lab.setAttribute('for', 'rsvp-email');
        var inp = doc.createElement('input'); inp.type = 'email'; inp.id = 'rsvp-email'; inp.autocomplete = 'email'; inp.placeholder = copy.emailPlaceholder; inp.maxLength = 254;
        var go = el(doc, 'button', 'rsvp-go', copy.emailBtn); go.type = 'submit';
        var err = el(doc, 'div', 'rsvp-err'); err.setAttribute('role', 'alert');
        f.appendChild(lab); f.appendChild(inp); f.appendChild(go); f.appendChild(err);
        f.addEventListener('submit', function (e) {
          e.preventDefault(); err.textContent = '';
          var v = inp.value.trim();
          if (!validEmail(v)) { err.textContent = copy.emailBad; return; }
          go.disabled = true;
          send(sb, buildRecord(ev, { email: v, device: device, answers: { source: 'one_tap_followup' } })).then(function (okk) { if (okk) recordTraffic(sb, ev.slug, 'conversion');
            if (okk) { state.email = true; write(store, ev.slug, { going: 1, sent: state.sent ? 1 : 0, email: 1 }); render(); }
            else { go.disabled = false; err.textContent = copy.emailFail; }
          });
        });
        host.appendChild(f);
      }
      if (copy.save) { var a = el(doc, 'a', 'rsvp-save', copy.save); a.href = copy.saveHref; host.appendChild(a); }
    }

    /* the badge: show 'N going' (copy.count) and remember N so the local bump and a late server value agree */
    function bump() {
      if (!going) return;
      var n = parseInt(going.getAttribute('data-n'), 10); if (isNaN(n)) n = 0;
      going.setAttribute('data-bumped', '1'); going.setAttribute('data-n', String(n + 1));
      going.textContent = copy.count(n + 1); going.style.display = 'inline-flex';
    }

    function tap() {
      if (state.going) return;                         /* idempotent: a second tap never sends a second row */
      state.going = true; render(); bump();                    /* the confirmation does not wait for the network */
      write(store, ev.slug, { going: 1, sent: 0, email: 0 });
      if (typeof opts.track === 'function') { try { opts.track('rsvp_tap', ev.slug); } catch (e) { /* analytics never blocks */ } }
      send(sb, buildRecord(ev, { device: device })).then(function (okk) { if (okk) { state.sent = true; recordTraffic(sb, ev.slug, 'conversion'); write(store, ev.slug, { going: 1, sent: 1, email: state.email ? 1 : 0 }); } });
    }

    /* PHONES (<= 700 px): the flyer is taller than the first screen, so the button and the badge sit in one row right under the back button, above the flyer and the fixed bottom nav.
       Wider screens keep them in the info card. Re-placed when the width crosses the breakpoint (rotation). */
    var mq = root.matchMedia ? root.matchMedia('(max-width: 700px)') : null, anchor = host.nextElementSibling, home = host.parentNode, rowEl = null;
    function place() {
      var body = host.closest ? host.closest('.tp-body') || (rowEl && rowEl.nextElementSibling) : null;
      if (mq && mq.matches) {
        if (!body || !body.parentNode) return;
        if (!rowEl) { rowEl = el(doc, 'div', 'rsvp-row'); }
        if (rowEl.parentNode !== body.parentNode || rowEl.nextElementSibling !== body) body.parentNode.insertBefore(rowEl, body);
        rowEl.appendChild(host); if (going) rowEl.appendChild(going);
      } else if (rowEl && rowEl.parentNode) {
        if (going) home.insertBefore(going, anchor); home.insertBefore(host, anchor);
        rowEl.parentNode.removeChild(rowEl);
      }
    }
    place();
    if (mq && mq.addEventListener) mq.addEventListener('change', place);

    render();
    recordTraffic(sb, ev.slug);
    if (state.going && !state.sent) {                  /* a tap whose insert failed last time: one quiet retry */
      send(sb, buildRecord(ev, { device: device })).then(function (okk) { if (okk) { state.sent = true; recordTraffic(sb, ev.slug, 'conversion'); write(store, ev.slug, { going: 1, sent: 1, email: state.email ? 1 : 0 }); } });
    }
    return { state: state, tap: tap };
  }

  var api = { COPY: COPY, KEY: KEY, DEVKEY: DEVKEY, deviceId: deviceId, validEmail: validEmail, buildRecord: buildRecord, isPast: isPast, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilRsvp = api;
})(typeof window !== 'undefined' ? window : globalThis);
