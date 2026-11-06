/* KEEPITIL M2: the simple event page (/show?e=<slug>). It follows M1 (/member): KEEPITIL is submitted as an
   event platform (Joe via Grok aadba32b, 2026-11-06).

   EVERYONE: cover, title, date and time, venue, host, genres, about, lineup, and the ticket tiers with a "Get tickets"
     button. The button goes to the existing /event page; buying is unchanged and nothing is sold here.
   A SIGNED-IN TICKET HOLDER: "You have a ticket" -> /tickets.
   THE HOST (my_profile_slug() = owner_handle): host tools (Edit event, Event dashboard) and the event's status,
     drafts included.
   A PASSWORD-PROTECTED EVENT shows no details here; it links to /event, where the password is asked.

   READ ONLY. It uses only what already exists:
     get_event_view()           (published events)
     events                     (row-level security: the host's own drafts)
     event_requires_password()
     get_event_lineup()
     ticket_tiers               (public read for published events)
     has_event_ticket()
     my_profile_slug()
   Nothing here writes. There are no payment or price changes; prices are shown as stored. */
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) {   // https only; a site path must not start with // or /\ (browsers read /\host as //host)
    var s = String(u == null ? '' : u).trim();
    if (/^https:\/\/[^\s<>"'\\]+$/i.test(s)) return s;
    if (/^\/(?![/\\])[^\s<>"'\\]*$/.test(s)) return s;
    return '';
  }
  /** A read that failed (an error answer or a thrown network error) is not the same as an empty answer. */
  async function safe(p) { try { return await p; } catch (e) { return { data: null, error: e }; } }
  function ok(r) { return !!r && !r.error; }
  function slugOf(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9-]/g, ''); }
  function fmtWhen(start, end, tz) {
    var d = start ? new Date(start) : null; if (!d || isNaN(d)) return '';
    var o = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    try { if (tz) o.timeZone = tz; var s = d.toLocaleString('en-US', o);
      var e = end ? new Date(end) : null;
      if (e && !isNaN(e)) s += ' – ' + e.toLocaleString('en-US', tz ? { hour: 'numeric', minute: '2-digit', timeZone: tz } : { hour: 'numeric', minute: '2-digit' });
      return s;
    } catch (x) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
  /** "$12.00", "Free". Display only: the price is whatever the host stored. */
  function price(cents, currency) {
    var n = Number(cents); if (!isFinite(n) || n <= 0) return 'Free';
    try { return (n / 100).toLocaleString('en-US', { style: 'currency', currency: String(currency || 'usd').toUpperCase() }); }
    catch (x) { return (n / 100).toFixed(2) + ' ' + String(currency || '').toUpperCase(); }
  }
  function tierState(t, now) {
    var n = (now || new Date()).getTime();
    if (t.qty_total != null && t.qty_sold != null && t.qty_sold >= t.qty_total) return 'Sold out';
    if (t.sales_start && new Date(t.sales_start).getTime() > n) return 'On sale ' + fmtWhen(t.sales_start);
    if (t.sales_end && new Date(t.sales_end).getTime() < n) return 'Sales ended';
    return '';
  }

  function renderPrivateEvent(slug) {
    return '<div class="m2-private"><h1 class="m2-title">Private event</h1><p>This event is password protected.</p>' +
      '<a class="m2-cta" href="' + esc('/event?e=' + encodeURIComponent(slugOf(slug))) + '">Open the event page</a></div>';
  }

  function renderEvent(d) {
    var e = d.event || {}, slug = slugOf(e.slug || d.slug), now = d.now || new Date();
    var cover = safeUrl(e.cover_url), when = fmtWhen(e.starts_at, e.ends_at, e.tz), where = [e.venue, e.city, e.state].filter(Boolean).join(' · ');
    var past = e.starts_at && new Date(e.ends_at || e.starts_at).getTime() < now.getTime();
    var h = '';
    if (cover) h += '<div class="m2-cover" style="background-image:url(\'' + esc(cover) + '\')"></div>';
    h += '<section class="m2-head">' + (d.owner && e.status !== 'published' ? '<span class="m2-badge">Draft</span>' : '') +
      (past ? '<span class="m2-badge">Past event</span>' : '') +
      '<h1 class="m2-title">' + esc(e.title || 'Event') + '</h1>' + (e.tagline ? '<div class="m2-tag">' + esc(e.tagline) + '</div>' : '') +
      (when ? '<div class="m2-when">' + esc(when) + '</div>' : '') + (where ? '<div class="m2-where">' + esc(where) + '</div>' : '') +
      (e.owner_handle ? '<a class="m2-host" href="' + esc('/member?slug=' + encodeURIComponent(slugOf(e.owner_handle))) + '">Hosted by ' + esc(e.owner_name || e.owner_handle) + '</a>' : '') +
      (e.genres ? '<div class="m2-genres">' + String(e.genres).split(/\s*,\s*/).filter(Boolean).slice(0, 8).map(function (g) { return '<span class="m2-chip">' + esc(g) + '</span>'; }).join('') + '</div>' : '') +
      '</section>';
    if (d.hasTicket && !d.owner) h += '<a class="m2-mine" href="' + esc('/tickets?e=' + encodeURIComponent(slug)) + '">You have a ticket · Show it</a>';
    if (e.description) h += '<section class="m2-sec"><h2>About</h2><p class="m2-about">' + esc(e.description) + '</p></section>';
    var lineup = d.lineup || [];
    if (d.lineup === null && e.show_lineup !== false) h += '<section class="m2-sec"><h2>Lineup</h2>' + failedNote('The lineup') + '</section>';
    if (lineup.length && e.show_lineup !== false) h += '<section class="m2-sec"><h2>Lineup</h2><div class="m2-lineup">' + lineup.map(function (a) {
      var img = safeUrl(a.image_url), inner = (img ? '<span class="m2-av" style="background-image:url(\'' + esc(img) + '\')"></span>' : '<span class="m2-av m2-av-0">' + esc(String(a.artist_name || '?').charAt(0).toUpperCase()) + '</span>') + '<span>' + esc(a.artist_name) + '</span>';
      return a.profile_slug ? '<a class="m2-artist" href="' + esc('/member?slug=' + encodeURIComponent(slugOf(a.profile_slug))) + '">' + inner + '</a>' : '<span class="m2-artist">' + inner + '</span>';
    }).join('') + '</div></section>';
    if (!past) {
      var ext = e.is_external ? safeUrl(e.source_url) : '';
      if (ext && /^https?:/i.test(ext)) {
        h += '<section class="m2-sec"><h2>Tickets</h2><a class="m2-cta" href="' + esc(ext) + '" target="_blank" rel="noopener noreferrer">Tickets on ' + esc(ext.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0]) + '</a></section>';
      } else if (d.tiers === null) {
        h += '<section class="m2-sec"><h2>Tickets</h2>' + failedNote('Ticket details') +
          '<a class="m2-cta" href="' + esc('/event?e=' + encodeURIComponent(slug)) + '">Open the event page</a></section>';
      } else if ((d.tiers || []).length) {
        h += '<section class="m2-sec"><h2>Tickets</h2><div class="m2-tiers">' + d.tiers.map(function (t) {
          var st = tierState(t, now);
          return '<div class="m2-tier' + (st ? ' m2-off' : '') + '"><span class="m2-tier-n">' + esc(t.name || 'Ticket') + '</span>' +
            '<span class="m2-tier-p">' + esc(price(t.price_cents, t.currency)) + '</span>' + (st ? '<span class="m2-tier-s">' + esc(st) + '</span>' : '') +
            (t.description ? '<span class="m2-tier-d">' + esc(t.description) + '</span>' : '') + '</div>';
        }).join('') + '</div><a class="m2-cta" href="' + esc('/event?e=' + encodeURIComponent(slug)) + '">Get tickets</a></section>';
      }
    }
    if (d.owner) h += '<section class="m2-sec m2-hostbox" data-m2="host"><h2>Host tools</h2><div class="m2-status">Status: ' + esc(e.status === 'published' ? 'Published' : 'Draft') + '</div><div class="m2-chips">' +
      '<a class="m2-chip m2-link" href="' + esc('/create-event?e=' + encodeURIComponent(slug)) + '">Edit event</a>' +
      '<a class="m2-chip m2-link" href="' + esc('/dashboard?e=' + encodeURIComponent(slug)) + '">Event dashboard</a></div></section>';
    return h;
  }

  function failedNote(what) { return '<p class="m2-failed">' + esc(what) + ' couldn\u2019t load. Check your connection and try again.</p>'; }

  function render(d) {
    if (d.failed) return '<div class="m2-empty m2-failed">This event couldn\u2019t load. Check your connection and try again.</div>';
    if (d.privateEvent) return renderPrivateEvent(d.slug);
    if (d.missing) return '<div class="m2-empty">This event does not exist or is not published.</div>';
    return renderEvent(d);
  }

  function data(r) { return r && !r.error ? r.data : null; }
  var EVENT_COLS = 'id,slug,title,tagline,description,venue,city,state,starts_at,ends_at,tz,genres,cover_url,status,show_lineup,owner_handle,source_url';

  async function load(client, slug, opts) {
    opts = opts || {}; var s = slugOf(slug);
    if (!s) return { slug: s, missing: true };
    // FAIL CLOSED: unless the server clearly answers "not protected", show nothing and read nothing else.
    var pw = await safe(client.rpc('event_requires_password', { p_slug: s }));
    if (!ok(pw) || typeof pw.data !== 'boolean') return { slug: s, failed: true };
    if (pw.data === true) return { slug: s, privateEvent: true };
    var vr = await safe(client.rpc('get_event_view', { p_slug: s }));
    if (!ok(vr)) return { slug: s, failed: true };   // a failed read is not "does not exist"
    var ev = (vr.data || [])[0] || null;
    var sess = null; try { var g = await client.auth.getSession(); sess = g && g.data ? g.data.session : null; } catch (x) {}
    var mine = null;
    if (sess) { var mr = await safe(client.rpc('my_profile_slug')); mine = ok(mr) ? mr.data : null; }
    if (!ev && mine) {   // the host's own draft is not in get_event_view; row-level security returns it to the host only
      var or_ = await safe(client.from('events').select(EVENT_COLS).eq('slug', s).maybeSingle());
      if (!ok(or_)) return { slug: s, failed: true };
      var own = or_.data;
      if (own && slugOf(own.owner_handle) === slugOf(mine)) ev = own;
    }
    if (!ev) return { slug: s, missing: true };
    var owner = !!mine && slugOf(ev.owner_handle) === slugOf(mine);
    var lr = await safe(client.rpc('get_event_lineup', { p_slug: s }));
    var lineup = ok(lr) ? (lr.data || []) : null;   // null = could not load
    var tr = ev.id != null ? await safe(client.from('ticket_tiers').select('id,name,price_cents,currency,qty_total,qty_sold,sales_start,sales_end,sort,description,show_qty').eq('event_id', ev.id).order('sort')) : { data: [], error: null };
    var tiers = ok(tr) ? (tr.data || []) : null;
    var hasTicket = false;
    if (sess && !owner) { var hr = await safe(client.rpc('has_event_ticket', { p_slug: s })); hasTicket = ok(hr) && hr.data === true; }
    return { slug: s, event: ev, lineup: lineup, tiers: tiers, owner: owner, hasTicket: hasTicket, now: opts.now };
  }

  async function mount(rootEl, client, opts) {
    opts = opts || {};
    var d = await load(client, opts.slug || '', opts);
    rootEl.innerHTML = render(d);
    return d;
  }

  var api = { esc: esc, safeUrl: safeUrl, slugOf: slugOf, price: price, tierState: tierState, render: render, renderEvent: renderEvent, load: load, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilShow = api;
})(typeof window !== 'undefined' ? window : this);
