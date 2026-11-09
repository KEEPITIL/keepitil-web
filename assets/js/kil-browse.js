/* KEEPITIL M3: event discovery (/browse). It follows M1 (/member) and M2 (/show). KEEPITIL is submitted as an
   event platform (Joe via Grok aadba32b, 2026-11-06).

   Upcoming published events, soonest first, each with its date and time in the EVENT's own time zone, venue and
   city, host chip (-> /member), lineup chips (-> /member when the artist has a profile), genre chips and a
   display-only "From $X". Every card opens /show. Filters: city and genre, kept in the URL (?city=&genre=).

   READ ONLY: four bulk reads, no per-event calls, nothing written.
     events          published, not started, shown on explore, NOT password-protected (the readable
                     password_protected flag; the hash itself is not readable by API roles)
     event_lineup    public read
     profile_meta    public read; host display names only
     ticket_tiers    public read for published events; the lowest price still on sale, display only
   No checkout, payment or price change. */
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
  function key(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function genresOf(e) { return String(e.genres || '').split(/\s*,\s*/).map(function (g) { return g.trim(); }).filter(Boolean); }

  /** "Sat, Nov 14 · 10:00 PM" in the event's own time zone (what the venue's clock will say). */
  function when(e) {
    var d = e.starts_at ? new Date(e.starts_at) : null; if (!d || isNaN(d)) return '';
    try {
      var o = { weekday: 'short', month: 'short', day: 'numeric' }, t = { hour: 'numeric', minute: '2-digit' };
      if (e.tz) { o.timeZone = e.tz; t.timeZone = e.tz; }
      return d.toLocaleDateString('en-US', o) + ' · ' + d.toLocaleTimeString('en-US', t);
    } catch (x) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
  function money(cents, currency) {
    try { return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: String(currency || 'usd').toUpperCase() }); }
    catch (x) { return (cents / 100).toFixed(2); }
  }
  /** Display only: the lowest price among tiers not sold out. "Free" when that is 0; '' when nothing is on sale. */
  function fromPrice(tiers) {
    var open = (tiers || []).filter(function (t) { return !(t.qty_total != null && t.qty_sold != null && t.qty_sold >= t.qty_total); });
    if (!open.length) return '';
    open.sort(function (a, b) { return (a.price_cents || 0) - (b.price_cents || 0); });
    var t = open[0]; return !(t.price_cents > 0) ? 'Free' : 'From ' + money(t.price_cents, t.currency);
  }

  /** Cities and genres present in the loaded events, for the filter controls. */
  function facets(events) {
    var c = {}, g = {};
    (events || []).forEach(function (e) {
      if (e.city) c[key(e.city)] = c[key(e.city)] || e.city;
      genresOf(e).forEach(function (x) { g[key(x)] = g[key(x)] || x; });
    });
    var sort = function (o) { return Object.keys(o).sort().map(function (k) { return { key: k, label: o[k] }; }); };
    return { cities: sort(c), genres: sort(g) };
  }
  function applyFilters(events, f) {
    f = f || {}; var c = key(f.city), g = key(f.genre);
    return (events || []).filter(function (e) {
      return (!c || key(e.city) === c) && (!g || genresOf(e).some(function (x) { return key(x) === g; }));
    });
  }

  function card(e, d) {
    var href = '/show?e=' + encodeURIComponent(slugOf(e.slug)), cover = safeUrl(e.cover_url);
    var host = e.owner_handle ? (d.hosts[slugOf(e.owner_handle)] || e.owner_handle) : '';
    var hostHasProfile = !!(e.owner_handle && d.hostProfiles && d.hostProfiles[slugOf(e.owner_handle)]);   // no profile_meta row = plain text, never a dead link
    var lineup = (d.lineups[e.id] || []).slice(0, 4), more = (d.lineups[e.id] || []).length - lineup.length;
    var price = fromPrice(d.tiers[e.id]);
    return '<article class="m3-card">' +
      (cover ? '<a class="m3-cover" href="' + esc(href) + '" style="background-image:url(\'' + esc(cover) + '\')" aria-hidden="true" tabindex="-1"></a>' : '') +
      '<div class="m3-body"><div class="m3-when">' + esc(when(e)) + '</div>' +
      '<h2 class="m3-title"><a href="' + esc(href) + '">' + esc(e.title || 'Event') + '</a></h2>' +
      '<div class="m3-where">' + esc([e.venue, e.city].filter(Boolean).join(' · ')) + '</div>' +
      ((host || lineup.length) ? '<div class="m3-chips">' +
        (host ? (hostHasProfile ? '<a class="m3-chip m3-host" href="' + esc('/member?slug=' + encodeURIComponent(slugOf(e.owner_handle))) + '">' + esc(host) + '</a>' : '<span class="m3-chip m3-host">' + esc(host) + '</span>') : '') +
        lineup.map(function (a) { return a.profile_slug
          ? '<a class="m3-chip m3-artist" href="' + esc('/member?slug=' + encodeURIComponent(slugOf(a.profile_slug))) + '">' + esc(a.artist_name) + '</a>'
          : '<span class="m3-chip m3-artist">' + esc(a.artist_name) + '</span>'; }).join('') +
        (more > 0 ? '<span class="m3-chip m3-more">+' + more + '</span>' : '') +
      '</div>' : '') +
      (genresOf(e).length ? '<div class="m3-genres">' + esc(genresOf(e).slice(0, 4).join(' · ')) + '</div>' : '') +
      (price ? '<div class="m3-price">' + esc(price) + '</div>' : '') +
      '</div></article>';
  }

  function renderFilters(d, f) {
    var fc = facets(d.events), c = key(f.city), g = key(f.genre);
    var opt = function (list, cur, all) { return '<option value="">' + esc(all) + '</option>' + list.map(function (x) { return '<option value="' + esc(x.key) + '"' + (x.key === cur ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join(''); };
    return '<form class="m3-filters" role="search" onsubmit="return false">' +
      '<label><span>City</span><select name="city" data-m3="city">' + opt(fc.cities, c, 'All cities') + '</select></label>' +
      '<label><span>Genre</span><select name="genre" data-m3="genre">' + opt(fc.genres, g, 'All genres') + '</select></label></form>';
  }

  function render(d, f) {
    f = f || {};
    if (d.failed) return '<p class="m3-empty m3-failed">Events couldn\u2019t load. Check your connection and try again.</p>';
    var list = applyFilters(d.events, f);
    var h = renderFilters(d, f);
    if (!d.events.length) return h + '<p class="m3-empty">No upcoming events yet.</p>';
    if (!list.length) return h + '<p class="m3-empty">No upcoming events match these filters.</p>';
    if (d.partial) h += '<p class="m3-note">Some event details couldn\u2019t load (lineups, prices or hosts). Try again later.</p>';
    return h + '<div class="m3-count">' + list.length + ' upcoming ' + (list.length === 1 ? 'event' : 'events') + '</div><div class="m3-list">' + list.map(function (e) { return card(e, d); }).join('') + '</div>';
  }

  function data(r) { return r && !r.error ? r.data : null; }
  var COLS = 'id,slug,title,venue,city,state,starts_at,ends_at,tz,genres,cover_url,owner_handle';

  async function load(client, opts) {
    opts = opts || {}; var now = (opts.now || new Date()).toISOString();
    var er = await safe(client.from('events').select(COLS).eq('status', 'published').gte('starts_at', now)
      .eq('password_protected', false).or('show_on_explore.is.null,show_on_explore.eq.true')
      .order('starts_at', { ascending: true }).limit(opts.limit || 60));
    if (!ok(er)) return { failed: true, events: [], lineups: {}, tiers: {}, hosts: {}, hostProfiles: {} };   // not "no upcoming events"
    var events = er.data || [], partial = false;
    var got = function (r) { if (ok(r)) return r.data || []; partial = true; return []; };
    var ids = events.map(function (e) { return e.id; }).filter(function (x) { return x != null; });
    var hostSlugs = events.map(function (e) { return slugOf(e.owner_handle); }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    var lineups = {}, tiers = {}, hosts = {}, hostProfiles = {};
    if (ids.length) {
      got(await safe(client.from('event_lineup').select('event_id,artist_name,profile_slug,sort').in('event_id', ids).order('sort', { ascending: true })))
        .forEach(function (l) { (lineups[l.event_id] = lineups[l.event_id] || []).push(l); });
      got(await safe(client.from('ticket_tiers').select('event_id,price_cents,currency,qty_total,qty_sold').in('event_id', ids)))
        .forEach(function (t) { (tiers[t.event_id] = tiers[t.event_id] || []).push(t); });
    }
    if (hostSlugs.length) {
      got(await safe(client.from('profile_meta').select('slug,display_name').in('slug', hostSlugs)))
        .forEach(function (p) { hostProfiles[slugOf(p.slug)] = true; if (p.display_name) hosts[slugOf(p.slug)] = p.display_name; });
    }
    return { events: events, lineups: lineups, tiers: tiers, hosts: hosts, hostProfiles: hostProfiles, partial: partial };
  }

  /** Load once, render, and re-render on filter change; the filters are mirrored into the URL. */
  async function mount(rootEl, client, opts) {
    opts = opts || {};
    var f = { city: opts.city || '', genre: opts.genre || '' };
    var d = await load(client, opts);
    var draw = function () {
      rootEl.innerHTML = render(d, f);
      Array.prototype.forEach.call(rootEl.querySelectorAll('select[data-m3]'), function (s) {
        s.addEventListener('change', function () {
          f[s.getAttribute('data-m3')] = s.value;
          try { var u = new URL(location.href); ['city', 'genre'].forEach(function (k) { if (f[k]) u.searchParams.set(k, f[k]); else u.searchParams.delete(k); }); history.replaceState(null, '', u.pathname + u.search); } catch (x) {}
          draw();
        });
      });
    };
    draw();
    return d;
  }

  var api = { esc: esc, safeUrl: safeUrl, slugOf: slugOf, when: when, fromPrice: fromPrice, facets: facets, applyFilters: applyFilters, render: render, load: load, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilBrowse = api;
})(typeof window !== 'undefined' ? window : this);
