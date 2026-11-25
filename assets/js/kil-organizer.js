/* KEEPITIL organizer view (dashboard > Events). ONE read-only view of the signed-in organizer's own events: the event (title, date, status, and the review reason while it is held),
   the RSVP count (people) and paid tickets, the Stripe Connect status as a plain link to the EXISTING flow (no money moves here), and an edit link.
   DATA: one RPC, public.get_my_organizer_events() (draft SQL in keepitil.github.io, owner-only via auth.uid()). Until that RPC exists on prod the call fails and this view renders NOTHING,
   so the dashboard keeps showing exactly what it shows today. Every string from the database is written with textContent. */
(function (root) {
  'use strict';
  var CONNECT = {
    connected: { label: 'Connected', note: 'Your payouts are set up.', link: null },
    needs_action: { label: 'Needs action', note: 'Stripe needs a little more information before payouts can start.', link: { text: 'Finish payout setup', href: '/create-event' } },
    not_connected: { label: 'Not connected', note: 'Connect Stripe to sell tickets and get paid. Free events do not need it.', link: { text: 'Set up payouts', href: '/create-event' } }
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
  function render(doc, data) {
    var wrap = el(doc, 'section', 'org-view'); wrap.setAttribute('aria-label', 'Your events');
    var events = Array.isArray(data && data.events) ? data.events : [];
    var h = el(doc, 'div', 'head2', 'Your events'); if (events.length) h.appendChild(el(doc, 'span', 'ct', String(events.length)));
    wrap.appendChild(h);

    var c = CONNECT[data && data.connect] || CONNECT.not_connected;
    var cn = el(doc, 'div', 'org-connect'); cn.setAttribute('data-connect', CONNECT[data && data.connect] ? data.connect : 'not_connected');
    cn.appendChild(el(doc, 'strong', '', 'Payouts (Stripe): ')); cn.appendChild(el(doc, 'span', 'org-connect-state', c.label)); cn.appendChild(el(doc, 'span', 'org-connect-note', ' ' + c.note));
    if (c.link) { var a = el(doc, 'a', 'org-connect-link', c.link.text); a.href = c.link.href; cn.appendChild(doc.createTextNode(' ')); cn.appendChild(a); }
    wrap.appendChild(cn);

    if (!events.length) {
      var em = el(doc, 'p', 'org-empty', 'No events yet. '); var add = el(doc, 'a', '', 'Add an event'); add.href = '/submit-event'; em.appendChild(add); wrap.appendChild(em);
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
      return Promise.resolve(supa.rpc('get_my_organizer_events')).then(function (r) {
        var d = r && r.data;
        if (!r || r.error || !d || d.error || !Array.isArray(d.events)) return false;
        host.textContent = ''; host.appendChild(render(doc, d));
        var panel = host.parentNode; if (panel && panel.classList) panel.classList.add('org-on');   /* the older "Your calendar listings" box is the same list: hidden by CSS only */
        return true;
      });
    }).catch(function () { return false; });
  }

  var api = { render: render, mount: mount, editHref: editHref, CONNECT: CONNECT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilOrganizer = api;
})(typeof window !== 'undefined' ? window : globalThis);
