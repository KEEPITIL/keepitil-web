// PUBLIC EVENTS (Find My Weed only, cannabis only): the Events section of the site. Reads the public RPCs of docs/proposed/migrations/E1_events.DRAFT.sql and E2_event_rsvp.DRAFT.sql
// (fmw_public_events, fmw_public_event, fmw_event_rsvp, fmw_inquiry_ticket). DORMANT until site.json "events" is true (FMW_CONFIG.events): off, this file makes no request and draws nothing.
//   * the home rail and the county pages show a short row of UPCOMING events, hidden when there are none (nothing is invented);
//   * events.html lists them all with a "Create an event" link for organizers;
//   * an event's own page (listing.html?id=event-<uuid>) draws on the shared account template header: flyer, date, venue, 21+, the organizer, and the Free RSVP form or the organizer's outside ticket link.
// NO PAYMENT: a ticket is a free RSVP (a name + email) or a link to the organizer's own seller; this file says so and never takes anything. The RSVP answers an honest status; "you're in" shows only for 'ok'.
// Answers are untrusted JSON: ids are UUIDs, text is plain, a link is https only, a flyer is drawn only from this project's Storage host. Text goes in with textContent only; no storage.
(function (root) {
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, FLYER = /^[0-9a-f-]{36}\/flyer\/[0-9a-f-]{36}\.(jpg|webp|png)$/, EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[^\s@<>"']{2,}$/, TICKET = /^\d{1,12}\.[0-9a-f]{64}$/;
  var COPY = {
    title: 'Events', homeTitle: 'Upcoming events', all: 'All events', none: 'No upcoming events yet.', create: 'Create an event', createNote: 'Event organizers: list your event for free.',
    age: '21+', free: 'Free RSVP', link: 'Tickets at the organizer’s site', organizer: 'Hosted by', back: 'All events', missing: 'This event isn’t available.',
    flyerAlt: function (t) { return 'Flyer for ' + t; }, note: 'Cannabis is for adults 21+. Find My Weed lists events and takes no payment: the organizer checks ID at the door.',
    rsvpTitle: 'Free RSVP', rsvpName: 'Your name (optional)', rsvpEmail: 'Your email', rsvpSend: 'RSVP', rsvpSending: 'Sending…', rsvpNeedEmail: 'Enter a valid email.',
    rsvpOk: 'You’re on the list. The organizer has your name and email.', rsvpFull: 'This event is full.', rsvpClosed: 'RSVPs are closed for this event.', rsvpFail: 'Could not send your RSVP. Check your connection and try again.', rsvpLeft: function (n) { return n + ' spot' + (n === 1 ? '' : 's') + ' left'; },
    getTickets: 'Get tickets', leaves: 'Opens the organizer’s own site in a new tab. Find My Weed does not sell or handle tickets.', when: 'When', where: 'Where', about: 'About this event'
  };
  function enabled(win) { var c = win && win.FMW_CONFIG, p = c && c.authProject; return !!(c && c.events === true && p && p.url && p.anonKey && typeof win.fetch === 'function'); }
  function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function t(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n) : ''; }
  function https(u) { if (typeof u !== 'string' || u.length > 300 || /[\s<>"'`\\]/.test(u) || !/^https:\/\//i.test(u)) return ''; try { var x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password && /\.[a-z]{2,}$/i.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } }
  function clean(e) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !UUID.test(e.id) || !t(e.title, 120) || typeof e.starts_at !== 'string' || isNaN(Date.parse(e.starts_at))) return null;
    var mode = ['rsvp', 'link', 'partner'].indexOf(e.ticket_mode) >= 0 ? e.ticket_mode : 'link';
    return { id: e.id, title: t(e.title, 120), starts_at: e.starts_at, ends_at: typeof e.ends_at === 'string' && !isNaN(Date.parse(e.ends_at)) ? e.ends_at : '', venue: t(e.venue, 120), address: t(e.address, 200), city: t(e.city, 80), county: t(e.county, 60),
      description: typeof e.description === 'string' ? e.description.replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, 2000) : '', ticket_mode: mode, ticket_url: mode === 'link' ? https(e.ticket_url) : '',
      rsvp_cap: Number(e.rsvp_cap) > 0 ? Number(e.rsvp_cap) : null, rsvp_count: Number(e.rsvp_count) >= 0 && e.rsvp_count !== null ? Number(e.rsvp_count) : null, rsvp_open: e.rsvp_open === true, flyer: typeof e.flyer_path === 'string' && FLYER.test(e.flyer_path) ? e.flyer_path : '',
      age: Number(e.age_min) >= 21 ? Number(e.age_min) : 21, organizer: t(e.organizer, 120), license: typeof e.license === 'string' && /^[A-Z0-9-]{6,24}$/.test(e.license) ? e.license : '' };
  }
  function rpc(win, name, body) {
    var cfg = win.FMW_CONFIG.authProject;
    return Promise.resolve().then(function () { return win.fetch.call(win, cfg.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey }, body: JSON.stringify(body || {}) }); })
      .then(function (r) { return r && r.ok ? (typeof r.text === 'function' ? r.text() : Promise.resolve('')).then(function (x) { var d = null; try { d = x ? JSON.parse(x) : null; } catch (e) { d = null; } return { ok: true, data: d }; }, function () { return { ok: false }; }) : { ok: false }; }, function () { return { ok: false }; });
  }
  function list(win, county, limit) {
    if (!enabled(win)) return Promise.resolve([]);
    var n = Number(limit) > 0 ? Math.min(Math.floor(Number(limit)), 100) : 24;
    return rpc(win, 'fmw_public_events', { p_county: county ? String(county).slice(0, 60) : null, p_limit: n, p_offset: 0 }).then(function (r) { return r.ok && Array.isArray(r.data) ? r.data.map(clean).filter(Boolean) : []; });
  }
  function detail(win, id) {
    if (!enabled(win) || !UUID.test(String(id || ''))) return Promise.resolve(null);
    return rpc(win, 'fmw_public_event', { p_id: id }).then(function (r) { var e = r.ok ? clean(r.data) : null; return e && e.id === id ? e : null; });
  }
  function flyerUrl(win, path) {
    var b = win && win.FMW_CONFIG && win.FMW_CONFIG.authProject && String(win.FMW_CONFIG.authProject.url || '').replace(/\/$/, '');
    return b && /^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(b) && FLYER.test(String(path)) ? b + '/storage/v1/object/public/fmw-business-media/' + path : '';
  }
  // the event's own date in California (events are California events), never the viewer's zone
  function whenText(iso, withTime) { try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: withTime === false ? undefined : 'numeric', minute: withTime === false ? undefined : '2-digit' }); } catch (e) { return iso; } }
  function dateParts(iso) { try { var d = new Date(iso), m = d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short' }), day = d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', day: 'numeric' }); return { m: m.toUpperCase(), d: day }; } catch (e) { return { m: '', d: '' }; } }
  function href(opts, e) { return (opts && typeof opts.href === 'function' ? opts.href : function (x) { return 'listing.html?id=event-' + x; })(e.id); }
  // one card: a date tile (text), the name, when and where, the 21+ and ticket chips. No image on the card (keeps the home and county pages light)
  function card(doc, e, opts) {
    var li = el(doc, 'li', 'event-card'), a = el(doc, 'a', 'event-link'); a.href = href(opts, e);
    var tile = el(doc, 'span', 'event-date'); tile.setAttribute('aria-hidden', 'true'); var p = dateParts(e.starts_at); tile.appendChild(el(doc, 'span', 'event-mo', p.m)); tile.appendChild(el(doc, 'span', 'event-day', p.d)); a.appendChild(tile);
    var body = el(doc, 'span', 'event-body'); body.appendChild(el(doc, 'span', 'event-name', e.title)); body.appendChild(el(doc, 'span', 'event-when', whenText(e.starts_at)));
    var where = [e.venue, e.city].filter(Boolean).join(', '); if (where) body.appendChild(el(doc, 'span', 'event-where', where));
    var chips = el(doc, 'span', 'event-chips'); chips.appendChild(el(doc, 'span', 'event-chip', e.age + '+')); chips.appendChild(el(doc, 'span', 'event-chip', e.ticket_mode === 'rsvp' ? COPY.free : COPY.link)); body.appendChild(chips);
    a.appendChild(body); li.appendChild(a); return li;
  }
  function createLink(doc, opts) { var a = el(doc, 'a', 'btn ghost event-create', COPY.create); a.href = (opts && opts.createHref) || 'signup.html?as=organizer'; return a; }
  function section(doc, events, opts, title) {
    var sec = el(doc, 'section', 'events-row'); sec.setAttribute('data-card', 'events'); sec.appendChild(el(doc, 'h2', null, title || COPY.homeTitle));
    var ul = el(doc, 'ul', 'event-list'); events.forEach(function (e) { ul.appendChild(card(doc, e, opts)); }); sec.appendChild(ul);
    var foot = el(doc, 'p', 'events-foot'); var all = el(doc, 'a', 'seeall', COPY.all); all.href = (opts && opts.allHref) || 'events.html'; foot.appendChild(all); foot.appendChild(doc.createTextNode(' ')); foot.appendChild(createLink(doc, opts)); sec.appendChild(foot);
    return sec;
  }
  // home rail and county pages: drawn only when there is at least one real upcoming event
  function mountAuto(win, doc, opts) {
    if (!enabled(win) || !doc.body) return Promise.resolve(false);
    var page = doc.body.getAttribute('data-page'), county = doc.body.getAttribute('data-county') || '';
    if (page === 'search' && !doc.getElementById('home')) return Promise.resolve(false);
    if (page !== 'search' && !(page === 'results' && county)) return Promise.resolve(false);
    return list(win, county.replace(/\s+county$/i, ''), 8).then(function (events) {
      if (!events.length) return false;
      var sec = section(doc, events.slice(0, 6), opts, COPY.homeTitle); sec.id = 'home-events';
      var shell = doc.querySelector ? doc.querySelector('.mapshell') : null, main = doc.getElementById('home') || (doc.querySelector && doc.querySelector('main'));
      if (shell && shell.parentNode) shell.parentNode.insertBefore(sec, shell.nextSibling); else if (main) main.appendChild(sec); else return false;
      return true;
    });
  }
  // events.html: every upcoming event + the organizer CTA (also drawn when there are none, so an organizer knows where to start)
  function mountPage(win, doc, opts) {
    var box = doc.getElementById('events-live'); if (!box || !enabled(win)) return Promise.resolve(false);
    return list(win, '', 48).then(function (events) {
      var wrap = el(doc, 'div', 'events-live'); wrap.setAttribute('data-card', 'events-live');
      if (events.length) { var ul = el(doc, 'ul', 'event-list'); events.forEach(function (e) { ul.appendChild(card(doc, e, opts)); }); wrap.appendChild(ul); } else wrap.appendChild(el(doc, 'p', 'muted', COPY.none));
      var cta = el(doc, 'p', 'events-foot'); cta.appendChild(el(doc, 'span', 'muted', COPY.createNote + ' ')); cta.appendChild(createLink(doc, opts)); wrap.appendChild(cta);
      box.appendChild(wrap); return true;
    });
  }
  function rsvpForm(doc, win, e) {
    var sec = el(doc, 'section', 'card event-rsvp'); sec.setAttribute('data-card', 'event-rsvp'); sec.appendChild(el(doc, 'h2', null, COPY.rsvpTitle));
    if (e.rsvp_cap && e.rsvp_count !== null && e.rsvp_open) sec.appendChild(el(doc, 'p', 'muted', COPY.rsvpLeft(Math.max(0, e.rsvp_cap - e.rsvp_count))));
    var say = el(doc, 'p', 'muted'); say.setAttribute('role', 'status'); say.setAttribute('aria-live', 'polite');
    if (!e.rsvp_open) { sec.appendChild(el(doc, 'p', null, COPY.rsvpFull)); return sec; }
    var f = el(doc, 'form'); f.setAttribute('novalidate', 'novalidate');
    function fld(label, name, type) { var l = el(doc, 'label', 'field'), i = el(doc, 'input'); i.type = type; i.name = name; i.setAttribute('maxlength', name === 'email' ? '254' : '120'); l.appendChild(el(doc, 'span', null, label)); l.appendChild(i); f.appendChild(l); return i; }
    var nm = fld(COPY.rsvpName, 'name', 'text'), em = fld(COPY.rsvpEmail, 'email', 'email');
    var hpw = el(doc, 'div', 'sr'); hpw.setAttribute('aria-hidden', 'true'); var hp = el(doc, 'input'); hp.type = 'text'; hp.name = 'hp'; hp.setAttribute('tabindex', '-1'); hp.setAttribute('autocomplete', 'off'); hpw.appendChild(hp); f.appendChild(hpw);
    var btn = el(doc, 'button', 'btn', COPY.rsvpSend); btn.type = 'submit'; f.appendChild(btn); f.appendChild(say); sec.appendChild(f);
    var ticket = null, issued = 0;
    function getTicket() { if (ticket && Date.now() - issued < 100 * 60 * 1000) return Promise.resolve(ticket); return rpc(win, 'fmw_inquiry_ticket', {}).then(function (r) { if (r.ok && typeof r.data === 'string' && TICKET.test(r.data)) { ticket = r.data; issued = Date.now(); return ticket; } return null; }); }
    getTicket();
    var busy = false;
    f.addEventListener('submit', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault(); if (busy) return;
      var email = String(em.value || '').trim(); if (!EMAIL.test(email) || email.length > 254) { say.textContent = COPY.rsvpNeedEmail; return; }
      busy = true; btn.setAttribute('disabled', 'disabled'); btn.textContent = COPY.rsvpSending; say.textContent = '';
      var fail = function () { busy = false; btn.removeAttribute('disabled'); btn.textContent = COPY.rsvpSend; say.textContent = COPY.rsvpFail; };
      getTicket().then(function (tk) {
        if (!tk) return fail();
        var wait = Math.max(0, 3500 - (Date.now() - issued));   // the server wants a ticket at least 3 s old
        (win.setTimeout || setTimeout).call(win, function () {
          rpc(win, 'fmw_event_rsvp', { p_event: e.id, p_name: String(nm.value || '').trim().slice(0, 120), p_email: email, p_hp: String(hp.value || ''), p_ticket: tk }).then(function (r) {
            if (!r.ok || typeof r.data !== 'string') return fail();
            busy = false; btn.removeAttribute('disabled'); btn.textContent = COPY.rsvpSend;
            say.textContent = r.data === 'ok' ? COPY.rsvpOk : r.data === 'full' ? COPY.rsvpFull : r.data === 'closed' ? COPY.rsvpClosed : COPY.rsvpFail;
            if (r.data === 'ok') { nm.value = ''; em.value = ''; }
          });
        }, wait);
      });
    });
    return sec;
  }
  // the event's own page on the shared account-template header (no "unclaimed" note: an event is made by its organizer)
  function mountDetail(win, doc, box, id, opts) {
    opts = opts || {}; var A = win.FMW_ACCOUNT; if (!enabled(win) || !A || !UUID.test(String(id || '').toLowerCase())) return false;
    detail(win, String(id).toLowerCase()).then(function (e) {
      while (box.firstChild) box.removeChild(box.firstChild);
      if (!e) { box.appendChild(el(doc, 'h1', 'name', COPY.missing)); var b0 = el(doc, 'a', 'btn ghost', COPY.back); b0.href = (opts.allHref) || 'events.html'; box.appendChild(b0); if (opts.missing) opts.missing(doc); return; }
      doc.title = e.title + ' · Find My Weed';
      var art = A.build(doc, { name: e.title, category: COPY.age + ' · ' + (e.ticket_mode === 'rsvp' ? COPY.free : COPY.link), location: [e.venue, e.city].filter(Boolean).join(', '), claimed: true, theme: null }, { copy: opts.copy || root.FMW_COPY, claimHref: opts.createHref });
      if (!art) return; art.className += ' acct-event'; box.appendChild(art);
      var fl = e.flyer ? flyerUrl(win, e.flyer) : '';
      if (fl) { var im = el(doc, 'img', 'event-flyer'); im.src = fl; im.alt = COPY.flyerAlt(e.title); im.setAttribute('loading', 'lazy'); art.appendChild(im); }
      var info = el(doc, 'section', 'card event-info'); info.appendChild(el(doc, 'h2', null, COPY.when)); info.appendChild(el(doc, 'p', null, whenText(e.starts_at) + (e.ends_at ? ' – ' + whenText(e.ends_at).replace(/^[A-Za-z]{3}, [A-Za-z]{3} \d+,? ?/, '') : '')));
      var addr = [e.venue, e.address, e.city].filter(Boolean).join(', '); if (addr) { info.appendChild(el(doc, 'h2', null, COPY.where)); info.appendChild(el(doc, 'p', null, addr)); }
      if (e.description) { info.appendChild(el(doc, 'h2', null, COPY.about)); e.description.split(/\n{2,}/).slice(0, 12).forEach(function (para) { info.appendChild(el(doc, 'p', 'event-desc', para.trim())); }); }
      if (e.organizer) info.appendChild(el(doc, 'p', 'muted', COPY.organizer + ' ' + e.organizer + (e.license ? ' · ' + e.license : '')));
      art.appendChild(info);
      if (e.ticket_mode === 'rsvp') art.appendChild(rsvpForm(doc, win, e));
      else if (e.ticket_mode === 'link' && e.ticket_url) { var tc = el(doc, 'section', 'card event-tickets'); tc.setAttribute('data-card', 'event-tickets'); var ta = el(doc, 'a', 'btn', COPY.getTickets); ta.href = e.ticket_url; ta.target = '_blank'; ta.rel = 'noopener noreferrer nofollow'; ta.setAttribute('aria-label', COPY.getTickets + ': ' + e.title + ' (opens in a new tab)'); tc.appendChild(ta); tc.appendChild(el(doc, 'p', 'muted', COPY.leaves)); art.appendChild(tc); }
      art.appendChild(el(doc, 'p', 'muted', COPY.note));
    });
    return true;
  }
  function matches(id) { return /^event-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(id || '').toLowerCase()); }
  var api = { enabled: enabled, clean: clean, list: list, detail: detail, flyerUrl: flyerUrl, card: card, section: section, mountAuto: mountAuto, mountPage: mountPage, mountDetail: mountDetail, rsvpForm: rsvpForm, matches: matches, whenText: whenText, COPY: COPY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FMW_EVENTS_PUBLIC = api;
})(typeof window !== 'undefined' ? window : globalThis);
