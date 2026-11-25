/* KEEPITIL one-tap RSVP (event page). ONE tap says "I'm going": the confirmation shows at once and nothing else is required. An email (reminder) and an account are optional afterwards.
   DATA: one row in public.event_registrations per tap (event_slug, event_id, answers {rsvp:true, source:'one_tap'}; buyer_email and buyer_name stay empty because every column
   is nullable and the anon INSERT policy already allows it). It never blocks the UI: the confirmation does not wait for the insert, a failed insert is retried once on the next
   visit, and a device that already tapped sees "going" with no second insert. NOTE: get_event_social ("N going") counts distinct EMAILS only, so a bare tap is not in that number
   until its SQL is changed (a separate DRAFT, not part of this file); an RSVP with the optional email is counted today.
   COPY: every user-facing string is in COPY below so Muse's copy replaces it without touching logic. */
(function (root) {
  'use strict';
  var COPY = {   /* TODO(Muse): final copy */
    tap: 'I’m going',
    done: 'You’re going ✓',
    doneSub: 'You’re on the list. That’s it, nothing else to do.',
    emailLabel: 'Want a reminder? Add your email (optional)',
    emailPlaceholder: 'you@email.com',
    emailBtn: 'Remind me',
    emailOk: 'Done. We’ll remind you before it starts.',
    emailBad: 'Please enter a valid email.',
    emailFail: 'Couldn’t save that just now. Try again.',
    save: 'Save this event to your account',
    saveHref: '/join'
  };
  var KEY = 'kil_rsvp_v1:';

  function validEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim()) && String(s).length <= 254; }

  function safeStore(opt) {
    if (opt) return opt;
    try { var t = root.localStorage; t.setItem('__kil_t', '1'); t.removeItem('__kil_t'); return t; } catch (e) { return null; }
  }
  function read(store, slug) { try { var v = store && store.getItem(KEY + slug); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function write(store, slug, obj) { try { if (store) store.setItem(KEY + slug, JSON.stringify(obj)); } catch (e) { /* private mode: the page still confirms */ } }

  function buildRecord(ev, extra) {
    var rec = { event_slug: String(ev.slug), answers: Object.assign({ rsvp: true, source: 'one_tap' }, extra && extra.answers || {}) };
    if (ev.id) rec.event_id = ev.id;
    if (extra && extra.email) rec.buyer_email = String(extra.email).trim();
    return rec;
  }

  function isPast(ev, now) {
    var t = ev && ev.startsAt ? new Date(ev.startsAt).getTime() : NaN;
    return !isNaN(t) && t < now.getTime() - 3 * 60 * 60 * 1000;   /* still "tonight" until 3 h after the start */
  }

  function send(sb, rec) {
    try { return Promise.resolve(sb.from('event_registrations').insert(rec)).then(function (r) { return !(r && r.error); }, function () { return false; }); }
    catch (e) { return Promise.resolve(false); }
  }

  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function mount(host, opts) {
    opts = opts || {};
    var ev = opts.ev, sb = opts.sb, doc = host && host.ownerDocument;
    if (!host || !doc || !ev || !ev.slug || !sb) return null;
    var now = opts.now || new Date();
    if (isPast(ev, now)) { host.style.display = 'none'; return null; }
    var copy = Object.assign({}, COPY, opts.copy || {});
    var store = safeStore(opts.store);
    var saved = read(store, ev.slug);
    var state = { going: !!(saved && saved.going), sent: !!(saved && saved.sent), email: !!(saved && saved.email) };

    function render() {
      host.textContent = '';
      host.style.display = '';
      if (!state.going) {
        var b = el(doc, 'button', 'rsvp-tap', copy.tap); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', tap);
        host.appendChild(b);
        return;
      }
      var done = el(doc, 'div', 'rsvp-done'); done.setAttribute('role', 'status');
      done.appendChild(el(doc, 'strong', '', copy.done)); done.appendChild(el(doc, 'span', 'rsvp-sub', copy.doneSub));
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
          send(sb, buildRecord(ev, { email: v, answers: { source: 'one_tap_followup' } })).then(function (okk) {
            if (okk) { state.email = true; write(store, ev.slug, { going: 1, sent: state.sent ? 1 : 0, email: 1 }); render(); }
            else { go.disabled = false; err.textContent = copy.emailFail; }
          });
        });
        host.appendChild(f);
      }
      var a = el(doc, 'a', 'rsvp-save', copy.save); a.href = copy.saveHref; host.appendChild(a);
    }

    function tap() {
      if (state.going) return;                         /* idempotent: a second tap never sends a second row */
      state.going = true; render();                    /* the confirmation does not wait for the network */
      write(store, ev.slug, { going: 1, sent: 0, email: 0 });
      if (typeof opts.track === 'function') { try { opts.track('rsvp_tap', ev.slug); } catch (e) { /* analytics never blocks */ } }
      send(sb, buildRecord(ev)).then(function (okk) { if (okk) { state.sent = true; write(store, ev.slug, { going: 1, sent: 1, email: state.email ? 1 : 0 }); } });
    }

    render();
    if (state.going && !state.sent) {                  /* a tap whose insert failed last time: one quiet retry */
      send(sb, buildRecord(ev)).then(function (okk) { if (okk) { state.sent = true; write(store, ev.slug, { going: 1, sent: 1, email: state.email ? 1 : 0 }); } });
    }
    return { state: state, tap: tap };
  }

  var api = { COPY: COPY, KEY: KEY, validEmail: validEmail, buildRecord: buildRecord, isPast: isPast, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilRsvp = api;
})(typeof window !== 'undefined' ? window : globalThis);
