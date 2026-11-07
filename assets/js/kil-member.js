/* KEEPITIL profile page (/member?slug=<slug>).
   Public (anyone): name or handle, avatar, bio, links, and that profile's upcoming published events.
   Private (signed-in owner only): the same page, plus an events dashboard — upcoming and past,
   drafts included — with the counts organizer_dashboard already stores (tickets sold, checked in,
   revenue). No RSVP count and no view count: events has neither column, and this page does not
   invent them.

   READ ONLY. Columns are named; book_email and event_password_hash are never selected.
     profile_meta            public identity columns only
     profile_content         the profile_categories row (music links)
     get_profile_events()    published events for everyone; the owner also sees drafts
     events.slug             only to drop a published event whose password hash is set
     my_profile_slug()
     organizer_dashboard()   the owner's own rows; anon receives none
     get_my_tickets()        the caller's paid tickets (tier name only, no QR)
     saved_events            row-level security: own rows only
   Nothing here writes, and nothing changes a price. */
(function (root) {
  'use strict';

  var META_COLS = 'slug,display_name,handle,avatar_url,bio,tagline,location,links,socials,account_type';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** Only absolute https URLs and site-relative paths survive; javascript:, data:, and protocol-relative URLs are dropped. */
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    if (/^https:\/\/[^\s<>"'\\]+$/i.test(s)) return s;
    if (/^\/(?![/\\])[^\s<>"'\\]*$/.test(s)) return s;
    return '';
  }
  async function safe(p) { try { return await p; } catch (e) { return { data: null, error: e }; } }
  function ok(r) { return !!r && !r.error; }
  function failedNote(what) { return '<p class="m1-empty m1-failed">' + esc(what) + ' couldn\u2019t load. Check your connection and try again.</p>'; }
  function slugOf(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9-]/g, ''); }

  function fmtDate(iso, tz) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return '';
    try {
      var o = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
      if (tz) o.timeZone = tz;
      return d.toLocaleString('en-US', o);
    } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }

  function locked(e) {
    return !!(e && (e.event_password_hash || e.password_protected === true));
  }

  /** Published events that have not started yet, soonest first. A password-protected row is left out. */
  function upcoming(events, now) {
    var t = (now || new Date()).getTime();
    return (events || []).filter(function (e) {
      return e && !locked(e) && e.status === 'published' && e.starts_at && new Date(e.starts_at).getTime() >= t;
    }).sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
  }

  function metric(row, key) {
    if (!row || !Object.prototype.hasOwnProperty.call(row, key) || row[key] == null || row[key] === '') return null;
    var n = Number(row[key]);
    return isFinite(n) ? n : null;
  }

  function money(cents) {
    var n = Number(cents);
    if (!isFinite(n)) return '';
    var sign = n < 0 ? '-' : '';
    return sign + '$' + (Math.abs(n) / 100).toFixed(2);
  }

  function statusLabel(status) {
    var s = String(status == null ? '' : status).trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /**
   * Owner's events split into upcoming and past. Drafts stay in whichever side their start
   * time falls on (no start time counts as upcoming). Counts are copied only from organizer_dashboard
   * rows, and only the three fields that RPC returns: sold, checked_in, revenue_cents.
   */
  function hostBoard(events, metrics, now) {
    var by = {};
    function ensure(row, withMetrics) {
      var key = slugOf(row && row.slug);
      if (!key) return;
      var cur = by[key];
      if (!cur) {
        cur = {
          slug: row.slug, title: row.title || '', status: row.status || '',
          starts_at: row.starts_at || '', tz: row.tz || '', venue: row.venue || '', city: row.city || '',
          cover_url: row.cover_url || row.cover || '',
          sold: null, checked_in: null, revenue_cents: null
        };
        by[key] = cur;
      } else {
        if (!cur.title && row.title) cur.title = row.title;
        if (!cur.status && row.status) cur.status = row.status;
        if (!cur.starts_at && row.starts_at) cur.starts_at = row.starts_at;
        if (!cur.tz && row.tz) cur.tz = row.tz;
        if (!cur.venue && row.venue) cur.venue = row.venue;
        if (!cur.city && row.city) cur.city = row.city;
        if (!cur.cover_url) cur.cover_url = row.cover_url || row.cover || '';
      }
      if (withMetrics) {
        cur.sold = metric(row, 'sold');
        cur.checked_in = metric(row, 'checked_in');
        cur.revenue_cents = metric(row, 'revenue_cents');
        if (row.status) cur.status = row.status;
      }
    }
    (events || []).forEach(function (e) { if (e) ensure(e, false); });
    if (metrics) metrics.forEach(function (m) { if (m) ensure(m, true); });
    var list = Object.keys(by).map(function (k) { return by[k]; });
    var t = (now || new Date()).getTime();
    function past(e) { return e.starts_at && new Date(e.starts_at).getTime() < t; }
    return {
      upcoming: list.filter(function (e) { return !past(e); }).sort(function (a, b) { return new Date(a.starts_at || 0) - new Date(b.starts_at || 0); }),
      past: list.filter(past).sort(function (a, b) { return new Date(b.starts_at) - new Date(a.starts_at); })
    };
  }

  function musicLinks(meta, categories) {
    var out = [], seen = {};
    function add(label, url) { var u = safeUrl(url); if (u && !seen[u]) { seen[u] = 1; out.push({ label: label, url: u }); } }
    var s = (meta && meta.socials) || {};
    add('Spotify', s.spotify); add('SoundCloud', s.soundcloud);
    var art = categories && categories.details && categories.details.artist;
    if (art) { add('Spotify', art.spotify); add('Latest release', art.release); }
    return out;
  }

  function profileLinks(meta) {
    var out = [], seen = {};
    function add(label, url) { var u = safeUrl(url); if (u && /^https:\/\//i.test(u) && !seen[u]) { seen[u] = 1; out.push({ label: label || u.replace(/^https:\/\//, ''), url: u }); } }
    var links = (meta && meta.links) || [];
    if (Array.isArray(links)) links.forEach(function (l) { if (typeof l === 'string') add('', l); else if (l) add(l.label || l.title, l.url || l.href); });
    var s = (meta && meta.socials) || {};
    [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['x', 'X'], ['website', 'Website']].forEach(function (p) { add(p[1], s[p[0]]); });
    return out;
  }

  function eventHref(e) {
    var slug = encodeURIComponent(slugOf(e.slug));
    if (e.status && e.status !== 'published') return '/create-event?e=' + slug;
    return '/event?e=' + slug;
  }

  function eventCard(e, extra) {
    var where = [e.venue, e.city].filter(Boolean).join(' · ');
    var cover = safeUrl(e.cover_url);
    return '<a class="m1-ev" href="' + esc(eventHref(e)) + '">' +
      (cover ? '<span class="m1-ev-img" style="background-image:url(\'' + esc(cover) + '\')"></span>' : '') +
      '<span class="m1-ev-t">' + esc(e.title || 'Event') + '</span>' +
      '<span class="m1-ev-m">' + esc([fmtDate(e.starts_at, e.tz), where].filter(Boolean).join(' · ')) + '</span>' +
      (extra || '') + '</a>';
  }

  function statTiles(e) {
    var tiles = [];
    if (e.sold != null) tiles.push(['Sold', String(e.sold)]);
    if (e.checked_in != null) tiles.push(['Checked in', String(e.checked_in)]);
    if (e.revenue_cents != null) tiles.push(['Revenue', money(e.revenue_cents)]);
    if (!tiles.length) return '';
    return '<span class="m1-stats">' + tiles.map(function (t) {
      return '<span class="m1-stat"><b>' + esc(t[1]) + '</b><span>' + esc(t[0]) + '</span></span>';
    }).join('') + '</span>';
  }

  function hostCard(e) {
    var badge = e.status ? '<span class="m1-badge">' + esc(statusLabel(e.status)) + '</span>' : '';
    return eventCard(e, badge + statTiles(e));
  }

  function renderPublic(d) {
    var raw = d.meta || {};
    var face = root.KilShare && root.KilShare.publicFace ? root.KilShare.publicFace(raw, { path: '/member' }) : null;
    var m = face ? {
      display_name: face.name, handle: face.handle, avatar_url: face.avatar, bio: face.bio,
      tagline: face.tagline, location: face.location, slug: face.slug || raw.slug,
      links: face.showLinks ? (raw.links || []) : [], socials: face.showLinks ? (raw.socials || {}) : {}
    } : raw;
    var name = m.display_name || m.handle || d.slug;
    var avatar = safeUrl(m.avatar_url);
    var ev = upcoming(d.events, d.now);
    var music = musicLinks(m, d.categories), links = profileLinks(m);
    var h = '<section class="m1-head">' +
      (avatar ? '<img class="m1-av" src="' + esc(avatar) + '" alt="">' : '<span class="m1-av m1-av-0">' + esc(String(name).charAt(0).toUpperCase()) + '</span>') +
      '<div><h1 class="m1-name">' + esc(name) + '</h1>' +
      (m.handle ? '<div class="m1-handle">@' + esc(m.handle) + '</div>' : '') +
      (m.tagline ? '<div class="m1-tag">' + esc(m.tagline) + '</div>' : '') +
      (m.location ? '<div class="m1-loc">' + esc(m.location) + '</div>' : '') +
      (face && face.share ? '<button type="button" class="m1-share" data-share="' + esc(face.share) + '">Share</button>' : '') +
      '</div></section>';
    if (m.bio) h += '<section class="m1-sec"><p class="m1-bio">' + esc(m.bio) + '</p></section>';
    if (links.length) h += '<section class="m1-sec"><h2>Links</h2><div class="m1-chips">' +
      links.map(function (l) { return '<a class="m1-chip" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>'; }).join('') + '</div></section>';
    h += '<section class="m1-sec"><h2>Upcoming events</h2>' + (d.events === null ? failedNote('Events') :
      ev.length ? '<div class="m1-evs">' + ev.map(function (e) { return eventCard(e); }).join('') + '</div>' : '<p class="m1-empty">No upcoming events.</p>') + '</section>';
    if (music.length) h += '<section class="m1-sec"><h2>Music</h2><div class="m1-chips">' +
      music.map(function (l) { return '<a class="m1-chip m1-music" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>'; }).join('') + '</div></section>';
    return h;
  }

  function hostList(rows, empty) {
    if (!rows.length) return '<p class="m1-empty">' + esc(empty) + '</p>';
    return '<div class="m1-evs">' + rows.map(hostCard).join('') + '</div>';
  }

  function renderPrivate(d) {
    var now = (d.now || new Date()).getTime();
    var tix = (d.tickets || []).filter(function (t) { return t && t.starts_at && new Date(t.starts_at).getTime() >= now - 6 * 3600e3; })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
    var saved = d.saved || [];
    var h = '<div class="m1-private" data-m1="private"><div class="m1-private-label">Only you can see this</div>';
    h += '<section class="m1-sec"><h2>Your tickets</h2>' + (d.tickets === null ? failedNote('Your tickets') : tix.length ? '<div class="m1-evs">' + tix.map(function (t) {
      var href = '/tickets?e=' + encodeURIComponent(slugOf(t.slug));
      return '<a class="m1-ev" href="' + esc(href) + '"><span class="m1-ev-t">' + esc(t.title || 'Event') + '</span>' +
        '<span class="m1-ev-m">' + esc([fmtDate(t.starts_at), [t.venue, t.city].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')) + '</span>' +
        '<span class="m1-ev-x">' + esc([(t.qty || 1) + ' × ' + (t.tier_name || 'ticket'), t.checked_in_at ? 'checked in' : ''].filter(Boolean).join(' · ')) + '</span></a>';
    }).join('') + '</div>' : '<p class="m1-empty">No upcoming tickets.</p>') + '</section>';
    h += '<section class="m1-sec"><h2>Saved events</h2>' + (d.saved === null ? failedNote('Saved events') : saved.length ? '<div class="m1-list">' + saved.map(function (s) {
      return '<a class="m1-row" href="' + esc('/event?e=' + encodeURIComponent(slugOf(s.event_slug))) + '">' + esc(s.event_title || s.event_slug) + '</a>';
    }).join('') + '</div>' : '<p class="m1-empty">Nothing saved yet.</p>') + '</section>';
    h += '<section class="m1-sec" data-m1="dashboard"><h2>Your events</h2><div class="m1-chips">' +
      '<a class="m1-chip" href="/create-event">Create an event</a><a class="m1-chip" href="/dashboard">Host dashboard</a></div>';
    if (d.hosted === null) h += failedNote('Your events');
    else {
      var board = hostBoard(d.hosted, d.metrics || null, d.now);
      if (d.metrics === null) h += failedNote('Event numbers');
      if (!board.upcoming.length && !board.past.length) h += '<p class="m1-empty">You have not created an event yet.</p>';
      else {
        h += '<h3 class="m1-dash-h">Upcoming</h3>' + hostList(board.upcoming, 'No upcoming events.');
        h += '<h3 class="m1-dash-h">Past</h3>' + hostList(board.past, 'No past events.');
      }
    }
    h += '</section>';
    h += '<section class="m1-sec"><h2>Settings</h2><div class="m1-chips"><a class="m1-chip" href="/settings">Account settings</a>' +
      '<a class="m1-chip" href="/profile?slug=' + esc(encodeURIComponent(slugOf(d.slug))) + '&amp;edit=1">Edit profile</a></div></section>';
    return h + '</div>';
  }

  function data(r) { return r && !r.error ? r.data : null; }

  /** Drop published events that have a password set. Selects slug only, so the hash never arrives. */
  async function hideLocked(client, events) {
    var slugs = (events || []).map(function (e) { return e && e.slug; }).filter(Boolean);
    if (!slugs.length) return events || [];
    var r = await safe(client.from('events').select('slug').in('slug', slugs).not('event_password_hash', 'is', null));
    if (!ok(r) || !Array.isArray(r.data)) return (events || []).filter(function (e) { return !locked(e); });
    var blocked = {};
    r.data.forEach(function (row) { if (row && row.slug) blocked[slugOf(row.slug)] = 1; });
    return events.filter(function (e) { return e && !blocked[slugOf(e.slug)] && !locked(e); });
  }

  /** Reads everything the page shows. owner is true only when my_profile_slug() is this profile. */
  async function load(client, slug, opts) {
    opts = opts || {};
    var s = slugOf(slug);
    var mr = await safe(client.from('profile_meta').select(META_COLS).eq('slug', s).maybeSingle());
    if (!ok(mr)) return { slug: s, failed: true };
    var meta = mr.data;
    if (!meta) return { slug: s, missing: true };
    var cr = await safe(client.from('profile_content').select('data').eq('profile_slug', s).eq('kind', 'profile_categories').limit(1));
    var cats = ok(cr) ? cr.data : null;
    var er = await safe(client.rpc('get_profile_events', { p_handle: meta.handle || s }));
    var events = ok(er) ? (er.data || []) : null;
    var sess = null;
    try { var g = await client.auth.getSession(); sess = g && g.data ? g.data.session : null; } catch (e2) {}
    var owner = false;
    if (sess) { var mine = await safe(client.rpc('my_profile_slug')); owner = ok(mine) && !!mine.data && slugOf(mine.data) === s; }
    var publicEvents = events === null ? null : await hideLocked(client, events);
    var out = { slug: s, meta: meta, categories: cats && cats[0] ? cats[0].data : null, events: publicEvents, owner: owner, now: opts.now };
    if (owner) {
      var tr = await safe(client.rpc('get_my_tickets'));
      out.tickets = ok(tr) ? (tr.data || []) : null;
      var sr = await safe(client.from('saved_events').select('event_slug,event_title,created_at').order('created_at', { ascending: false }).limit(50));
      out.saved = ok(sr) ? (sr.data || []) : null;
      out.hosted = events;
      var dr = await safe(client.rpc('organizer_dashboard'));
      out.metrics = ok(dr) ? (dr.data || []) : null;
    }
    return out;
  }

  function render(d) {
    if (d.failed) return '<div class="m1-empty m1-failed">This profile couldn\u2019t load. Check your connection and try again.</div>';
    if (d.missing) return '<div class="m1-empty m1-missing">This profile does not exist.</div>';
    var shareable = !(root.KilShare && root.KilShare.profileIsShareable) || root.KilShare.profileIsShareable(d.meta);
    var html = shareable ? renderPublic(d) : (d.owner ? '' : '<div class="m1-empty">This profile is private.</div>');
    return html + (d.owner ? renderPrivate(d) : '');
  }

  function bindShare(rootEl) {
    Array.prototype.forEach.call(rootEl.querySelectorAll('[data-share]'), function (btn) {
      btn.addEventListener('click', function () {
        var url = btn.getAttribute('data-share') || '';
        var done = function () { btn.textContent = 'Link copied'; };
        try {
          if (navigator.share) { navigator.share({ url: url }).catch(function () {}); return; }
          if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(done, done); return; }
        } catch (e) {}
        done();
      });
    });
  }

  async function mount(rootEl, client, opts) {
    opts = opts || {};
    var slug = slugOf(opts.slug || '');
    if (!slug) {
      try { var g = await client.auth.getSession(); if (g && g.data && g.data.session) slug = slugOf(data(await client.rpc('my_profile_slug')) || ''); } catch (e) {}
    }
    if (!slug) { rootEl.innerHTML = '<div class="m1-empty">Sign in to see your profile, or open a profile link.</div>'; return null; }
    var d = await load(client, slug, opts);
    rootEl.innerHTML = render(d);
    bindShare(rootEl);
    if (root.KilShare && typeof document !== 'undefined') {
      var card = d && root.KilShare.publicFace(d.meta, { path: '/member' });
      root.KilShare.applyPreview(document, card);
    }
    return d;
  }

  var api = {
    esc: esc, safeUrl: safeUrl, slugOf: slugOf, upcoming: upcoming, hostBoard: hostBoard, money: money,
    musicLinks: musicLinks, profileLinks: profileLinks, META_COLS: META_COLS,
    renderPublic: renderPublic, renderPrivate: renderPrivate, render: render, load: load, mount: mount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilMember = api;
})(typeof window !== 'undefined' ? window : this);
