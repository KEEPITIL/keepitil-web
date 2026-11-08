/* KEEPITIL M4: "My tickets" overview (/my-tickets). Same pattern as M1 /member, M2 /show and M3 /browse.

   For the SIGNED-IN member only: their paid tickets, grouped Upcoming (soonest first) and Past (latest first).
   Each card shows the event, its date and time in the EVENT's own time zone, venue and city, quantity and tier,
   and "Checked in" when it was scanned. Each opens the existing ticket wallet (/tickets?e=<slug>), which is
   the one place that shows the QR code. Signed out: a sign-in prompt, and nothing is read.

   READ ONLY:
     get_my_tickets()   (SECURITY DEFINER; the caller's own paid orders)
     events             (slug,tz only, for the time zone; public read for published events)
   Never drawn: the QR token, prices or anything payment-related. No checkout change.
   A failed read is shown as a failure, never as "no tickets". */
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) {   // https only; a site path must not start with // or /\ (browsers read /\host as //host)
    var s = String(u == null ? '' : u).trim();
    if (/^https:\/\/[^\s<>"'\\]+$/i.test(s)) return s;
    if (/^\/(?![/\\])[^\s<>"'\\]*$/.test(s)) return s;
    return '';
  }
  function slugOf(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9-]/g, ''); }
  async function safe(p) { try { return await p; } catch (e) { return { data: null, error: e }; } }
  function ok(r) { return !!r && !r.error; }

  function when(iso, tz) {
    var d = iso ? new Date(iso) : null; if (!d || isNaN(d)) return '';
    try {
      var o = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, t = { hour: 'numeric', minute: '2-digit' };
      if (tz) { o.timeZone = tz; t.timeZone = tz; }
      return d.toLocaleDateString('en-US', o) + ' · ' + d.toLocaleTimeString('en-US', t);
    } catch (x) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }

  /** Upcoming = has not ended (start + 6 h grace, as M1 does), soonest first. Past = the rest, latest first. */
  function split(tickets, now) {
    var t = (now || new Date()).getTime(), up = [], past = [];
    (tickets || []).forEach(function (x) {
      var s = x && x.starts_at ? new Date(x.starts_at).getTime() : NaN;
      (isNaN(s) || s >= t - 6 * 3600e3 ? up : past).push(x);
    });
    up.sort(function (a, b) { return new Date(a.starts_at || 0) - new Date(b.starts_at || 0); });
    past.sort(function (a, b) { return new Date(b.starts_at || 0) - new Date(a.starts_at || 0); });
    return { upcoming: up, past: past };
  }

  function card(x, tzBySlug) {
    var slug = slugOf(x.slug), href = '/tickets?e=' + encodeURIComponent(slug), cover = safeUrl(x.cover_url);
    var qty = Math.max(1, parseInt(x.qty, 10) || 1);
    return '<a class="m4-card" href="' + esc(href) + '">' +
      (cover ? '<span class="m4-cover" style="background-image:url(\'' + esc(cover) + '\')"></span>' : '<span class="m4-cover m4-cover-0">' + esc(String(x.title || '?').charAt(0).toUpperCase()) + '</span>') +
      '<span class="m4-body"><span class="m4-title">' + esc(x.title || 'Event') + '</span>' +
      '<span class="m4-when">' + esc(when(x.starts_at, tzBySlug[slug])) + '</span>' +
      '<span class="m4-where">' + esc([x.venue, x.city].filter(Boolean).join(' · ')) + '</span>' +
      '<span class="m4-meta">' + esc(qty + ' × ' + (x.tier_name || 'Ticket')) +
        (x.checked_in_at ? ' <span class="m4-in">Checked in</span>' : '') + '</span></span>' +
      '<span class="m4-go" aria-hidden="true">›</span></a>';
  }

  function render(d) {
    if (d.signedOut) return '<div class="m4-gate"><h2>Log in to see your tickets</h2><p>Your tickets live in your KEEPITIL account.</p>' +
      '<a class="m4-cta" href="/apply?next=%2Fmy-tickets">Log in / Join</a></div>';
    if (d.failed) return '<p class="m4-empty m4-failed">Your tickets couldn\u2019t load. Check your connection and try again.</p>';
    var g = split(d.tickets, d.now), tz = d.tz || {};
    if (!g.upcoming.length && !g.past.length) return '<div class="m4-gate"><h2>No tickets yet</h2><p>When you get a ticket, it shows up here.</p>' +
      '<a class="m4-cta" href="/browse">Find events</a></div>';
    var h = d.partial ? '<p class="m4-note">Event time zones couldn\u2019t load; times are shown in your own time zone.</p>' : '';
    h += '<section class="m4-sec"><h2>Upcoming</h2>' + (g.upcoming.length ? g.upcoming.map(function (x) { return card(x, tz); }).join('') : '<p class="m4-empty">No upcoming tickets.</p>') + '</section>';
    if (g.past.length) h += '<section class="m4-sec m4-past"><h2>Past</h2>' + g.past.map(function (x) { return card(x, tz); }).join('') + '</section>';
    return h;
  }

  async function load(client, opts) {
    opts = opts || {};
    var sess = null;
    try { var g = await client.auth.getSession(); sess = g && g.data ? g.data.session : null; } catch (e) {}
    if (!sess) return { signedOut: true };
    var tr = await safe(client.rpc('get_my_tickets'));
    if (!ok(tr)) return { failed: true };
    var tickets = (tr.data || []).filter(function (x) { return x && (x.status == null || x.status === 'paid'); });
    var slugs = tickets.map(function (x) { return slugOf(x.slug); }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var tz = {}, partial = false;
    if (slugs.length) {
      var er = await safe(client.from('events').select('slug,tz').in('slug', slugs));
      if (ok(er)) (er.data || []).forEach(function (e) { if (e && e.tz) tz[slugOf(e.slug)] = e.tz; }); else partial = true;
    }
    return { tickets: tickets, tz: tz, partial: partial, now: opts.now };
  }

  async function mount(rootEl, client, opts) { var d = await load(client, opts); rootEl.innerHTML = render(d); return d; }

  var api = { esc: esc, safeUrl: safeUrl, slugOf: slugOf, when: when, split: split, render: render, load: load, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilMyTickets = api;
})(typeof window !== 'undefined' ? window : this);
