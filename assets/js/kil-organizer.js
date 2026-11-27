/* KEEPITIL organizer view (dashboard > Events). ONE read-only view of the signed-in organizer's own events: the event (title, date, status, and the review reason while it is held),
   the RSVP count (people) and paid tickets, the Stripe Connect status as a plain link to the EXISTING flow (no money moves here), and an edit link.
   WHO SEES WHAT: every signed-in creator can edit their own hosted events at /create-event. Community calendar listings still edit at /submit-event. The Stripe payout line stays on admin accounts until Connect self-serve is mounted for everyone.
   DATA: one RPC, public.get_my_organizer_events() (draft SQL in keepitil.github.io, owner-only via auth.uid()). Until that RPC exists on prod the call fails and this view renders NOTHING,
   so the dashboard keeps showing exactly what it shows today. Every string from the database is written with textContent. */
(function (root) {
  'use strict';
  var CONNECT = {
    connected: { label: 'Connected', note: 'Your payouts are set up.', link: null },
    needs_action: { label: 'Needs action', note: 'Stripe needs a little more information before payouts can start.', link: { text: 'Finish payout setup', href: '/create-event' } },
    not_connected: { label: 'Not connected', note: 'Connect Stripe to sell tickets and get paid. Free events do not need it.', link: { text: 'Set up payouts', href: '/create-event' } }
  };
  /* CREATE & EARN status (Muse 04:49 via Kode 5:25): three plain facts from existing records, no fee or upsell words. "Pool-eligible" has no rule or record anywhere yet,
     so it is NOT computed: the line below is a fixed placeholder (TODO(Muse): rule + wording). */
  var CE = {
    feature: { not_submitted: 'Feature: not submitted', in_review: 'Feature: submitted, in review', live: 'Feature: live' },
    featureLink: { text: 'Submit your feature', href: '/connect' },
    eventLive: 'Event: live', eventNotLive: 'Event: not live yet', eventNone: 'Event: no events yet',
    pool: 'Community pool: details soon'   /* TODO(Muse) */
  };
  var STATUS = { published: 'Live', review: 'In review', draft: 'Draft', rejected: 'Not approved', archived: 'Archived', cancelled: 'Cancelled', past: 'Past' };

  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function slugOk(s) { return /^[a-z0-9][a-z0-9-]{0,200}$/.test(String(s || '')); }

  function editHref(e) {
    if (String(e.source || '') === 'community' && e.id != null) return '/submit-event?edit=' + encodeURIComponent(String(e.id));
    return slugOk(e.slug) ? '/create-event?e=' + encodeURIComponent(e.slug) : null;
  }
  function when(iso) {
    try { return iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'; } catch (x) { return ''; }
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* data = { connect, events:[...] }  ->  a DOM node (pure: no network, no globals) */
  function render(doc, data, opts) {
    var admin = !!(opts && opts.admin === true);
    var wrap = el(doc, 'section', 'org-view'); wrap.setAttribute('aria-label', 'Your events');
    var events = Array.isArray(data && data.events) ? data.events : [];
    var h = el(doc, 'div', 'head2', 'Your events'); if (events.length) h.appendChild(el(doc, 'span', 'ct', String(events.length)));
    wrap.appendChild(h);

    if (admin) {   /* payout status + the link to the existing flow: team accounts only */
      var c = CONNECT[data && data.connect] || CONNECT.not_connected;
      var cn = el(doc, 'div', 'org-connect'); cn.setAttribute('data-connect', CONNECT[data && data.connect] ? data.connect : 'not_connected');
      cn.appendChild(el(doc, 'strong', '', 'Payouts (Stripe): ')); cn.appendChild(el(doc, 'span', 'org-connect-state', c.label)); cn.appendChild(el(doc, 'span', 'org-connect-note', ' ' + c.note));
      if (c.link) { var a = el(doc, 'a', 'org-connect-link', c.link.text); a.href = c.link.href; cn.appendChild(doc.createTextNode(' ')); cn.appendChild(a); }
      wrap.appendChild(cn);
      var fp = el(doc, 'p', 'org-fees', ''); var fl = el(doc, 'a', 'org-fees-link', 'Fees, payouts and rules'); fl.href = '/organizer-fees'; fp.appendChild(fl); wrap.appendChild(fp);
    }

    var ce = data && data.create_earn;
    if (ce && CE.feature[ce.feature]) {
      var box = el(doc, 'ul', 'org-ce'); box.setAttribute('aria-label', 'Create and Earn status');
      var li1 = el(doc, 'li', 'org-ce-feature', CE.feature[ce.feature]); li1.setAttribute('data-feature', ce.feature);
      if (ce.feature === 'not_submitted') { var fa = el(doc, 'a', 'org-ce-link', CE.featureLink.text); fa.href = CE.featureLink.href; li1.appendChild(doc.createTextNode(' ')); li1.appendChild(fa); }
      box.appendChild(li1);
      var evText = ce.event_live === true ? CE.eventLive : events.length ? CE.eventNotLive : CE.eventNone;
      box.appendChild(el(doc, 'li', 'org-ce-event', evText));
      box.appendChild(el(doc, 'li', 'org-ce-pool', CE.pool));
      wrap.appendChild(box);
    }
    if (!events.length) {
      var em = el(doc, 'p', 'org-empty', 'No events yet. '); var add = el(doc, 'a', '', 'Create an event'); add.href = '/create-event'; em.appendChild(add); wrap.appendChild(em);
      return wrap;
    }
    events.forEach(function (e) {
      var st = String(e.status || 'review').toLowerCase();
      var row = el(doc, 'div', 'ev org-ev'); row.setAttribute('data-event', String(e.id));
      var main = el(doc, 'div', 'ev-main');
      var top = el(doc, 'div', 'ev-top');
      var title = el(doc, 'span', 'ev-title', e.title || 'Untitled');
      if (st === 'published' && slugOk(e.slug)) { title = el(doc, 'a', 'ev-title', e.title || 'Untitled'); title.href = '/event?e=' + encodeURIComponent(e.slug); }
      top.appendChild(title); top.appendChild(el(doc, 'span', 'ev-badge ' + st.replace(/[^a-z]/g, ''), STATUS[st] || st));
      main.appendChild(top);
      main.appendChild(el(doc, 'div', 'ev-meta', when(e.starts_at) + (e.venue ? ' · ' + e.venue : '') + (e.city ? ' · ' + e.city : '')));
      if (st === 'review' && e.review_reason) main.appendChild(el(doc, 'div', 'org-reason', 'Held for review: ' + e.review_reason));
      var counts = el(doc, 'div', 'org-counts');
      counts.appendChild(el(doc, 'span', 'org-rsvp', plural(Math.max(0, parseInt(e.rsvp_count, 10) || 0), 'person going', 'people going')));
      var paid = Math.max(0, parseInt(e.paid_tickets, 10) || 0);
      if (paid > 0) counts.appendChild(el(doc, 'span', 'org-paid', plural(paid, 'ticket sold', 'tickets sold')));
      main.appendChild(counts);
      var acts = el(doc, 'div', 'ev-acts'), eh = editHref(e);
      if (eh) { var ed = el(doc, 'a', 'org-edit', 'Edit'); ed.href = eh; acts.appendChild(ed); }
      main.appendChild(acts); row.appendChild(main); wrap.appendChild(row);
    });
    return wrap;
  }

  /* mount(host, supa): renders only when the user is signed in AND the RPC answers with an events array; anything else leaves the page exactly as it was */
  function mount(host, supa) {
    if (!host || !supa || !supa.auth || !supa.rpc) return Promise.resolve(false);
    var doc = host.ownerDocument;
    return Promise.resolve(supa.auth.getSession()).then(function (s) {
      if (!(s && s.data && s.data.session)) return false;
      /* is_admin: true only for a real true; an error, a throw or anything else = not an admin (the safe side: no /create-event links) */
      var adminP = Promise.resolve().then(function () { return supa.rpc('is_admin'); }).then(function (r) { return !!(r && !r.error && r.data === true); }, function () { return false; });
      return Promise.all([Promise.resolve(supa.rpc('get_my_organizer_events')), adminP]).then(function (both) {
        var r = both[0], admin = both[1], d = r && r.data;
        if (!r || r.error || !d || d.error || !Array.isArray(d.events)) return false;
        host.textContent = ''; host.appendChild(render(doc, d, { admin: admin }));
        var panel = host.parentNode; if (panel && panel.classList) panel.classList.add('org-on');   /* the older "Your calendar listings" box is the same list: hidden by CSS only */
        return true;
      });
    }).catch(function () { return false; });
  }

  var api = { render: render, mount: mount, editHref: editHref, CONNECT: CONNECT, CE: CE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilOrganizer = api;
})(typeof window !== 'undefined' ? window : globalThis);
