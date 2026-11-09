/* KEEPITIL M1: the simple profile page (/member?slug=<slug>). Joe via Grok aadba32b, 2026-11-06:
   KEEPITIL is submitted as an event platform.

   PUBLIC view (anyone): name, avatar, bio, links, upcoming events and music.
   PRIVATE view (only the signed-in owner of this profile): tickets, saved events, settings, and a
   host-events dashboard.

   READ ONLY. It uses only what already exists:
     profile_meta           (public read)
     profile_content        (the 'profile_categories' row holds the artist block)
     get_profile_events()   (published events for everyone; the owner also sees drafts)
     my_profile_slug()
     get_my_tickets()       (the caller's paid tickets)
     saved_events           (row-level security: own rows only)
   Nothing here writes. Ticket QR codes are never shown on this page; a ticket links to /tickets.
   No payment or price logic: a ticket shows its tier name only.

   Pure render functions (render*, esc, safeUrl, musicLinks, upcoming) plus a loader that takes a
   Supabase client, so the same code runs on the site, in the iOS bundle, and in tests with a
   fixture client. */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** Only absolute http(s) URLs and site-relative paths survive; anything else (javascript:, data:) is dropped. */
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    // https only (no http:// links), and a site path must not start with // or /\ (browsers read /\host as //host)
    if (/^https:\/\/[^\s<>"'\\]+$/i.test(s)) return s;
    if (/^\/(?![/\\])[^\s<>"'\\]*$/.test(s)) return s;
    return '';
  }
  /** A read that failed (an error answer or a thrown network error) is not the same as an empty answer. */
  async function safe(p) { try { return await p; } catch (e) { return { data: null, error: e }; } }
  function ok(r) { return !!r && !r.error; }
  function failedNote(what) { return '<p class="m1-empty m1-failed">' + esc(what) + ' couldn\u2019t load. Check your connection and try again.</p>'; }
  function slugOf(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9-]/g, ''); }

  function fmtDate(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return '';
    try {
      return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }

  /** Published events that have not started yet, soonest first. */
  function upcoming(events, now) {
    var t = (now || new Date()).getTime();
    return (events || []).filter(function (e) {
      return e && e.status === 'published' && e.starts_at && new Date(e.starts_at).getTime() >= t;
    }).sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
  }

  /** Music links from the profile socials and the artist block; each URL once. */
  function musicLinks(meta, categories) {
    var out = [], seen = {};
    function add(label, url) { var u = safeUrl(url); if (u && !seen[u]) { seen[u] = 1; out.push({ label: label, url: u }); } }
    var s = (meta && meta.socials) || {};
    add('Spotify', s.spotify); add('SoundCloud', s.soundcloud);
    var art = categories && categories.details && categories.details.artist;
    if (art) { add('Spotify', art.spotify); add('Latest release', art.release); }
    return out;
  }

  /** Profile links (meta.links: array of {label,url} or strings) plus the non-music socials. */
  function profileLinks(meta) {
    var out = [], seen = {};
    function add(label, url) { var u = safeUrl(url); if (u && /^https?:/i.test(u) && !seen[u]) { seen[u] = 1; out.push({ label: label || u.replace(/^https?:\/\//, ''), url: u }); } }
    var links = (meta && meta.links) || [];
    if (Array.isArray(links)) links.forEach(function (l) { if (typeof l === 'string') add('', l); else if (l) add(l.label || l.title, l.url || l.href); });
    var s = (meta && meta.socials) || {};
    [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['x', 'X'], ['website', 'Website']].forEach(function (p) { add(p[1], s[p[0]]); });
    return out;
  }

  function eventCard(e, extra) {
    var href = '/event?e=' + encodeURIComponent(slugOf(e.slug));
    var where = [e.venue, e.city].filter(Boolean).join(' · ');
    var cover = safeUrl(e.cover_url);
    return '<a class="m1-ev" href="' + esc(href) + '">' +
      (cover ? '<span class="m1-ev-img" style="background-image:url(\'' + esc(cover) + '\')"></span>' : '') +
      '<span class="m1-ev-t">' + esc(e.title || 'Event') + '</span>' +
      '<span class="m1-ev-m">' + esc([fmtDate(e.starts_at), where].filter(Boolean).join(' · ')) + '</span>' +
      (extra ? '<span class="m1-ev-x">' + extra + '</span>' : '') + '</a>';
  }

  function renderPublic(d) {
    var m = d.meta || {};
    var name = m.display_name || m.handle || d.slug;
    var avatar = safeUrl(m.avatar_url);
    var ev = upcoming(d.events, d.now);
    var music = musicLinks(m, d.categories), links = profileLinks(m);
    var h = '<section class="m1-head">' +
      (avatar ? '<img class="m1-av" src="' + esc(avatar) + '" alt="">' : '<span class="m1-av m1-av-0">' + esc(String(name).charAt(0).toUpperCase()) + '</span>') +
      '<div><h1 class="m1-name">' + esc(name) + '</h1>' +
      (m.handle ? '<div class="m1-handle">@' + esc(m.handle) + '</div>' : '') +
      (m.tagline ? '<div class="m1-tag">' + esc(m.tagline) + '</div>' : '') +
      (m.location ? '<div class="m1-loc">' + esc(m.location) + '</div>' : '') + '</div></section>';
    if (m.bio) h += '<section class="m1-sec"><p class="m1-bio">' + esc(m.bio) + '</p></section>';
    if (links.length) h += '<section class="m1-sec"><h2>Links</h2><div class="m1-chips">' +
      links.map(function (l) { return '<a class="m1-chip" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>'; }).join('') + '</div></section>';
    h += '<section class="m1-sec"><h2>Upcoming events</h2>' + (d.events === null ? failedNote('Events') :
      ev.length ? '<div class="m1-evs">' + ev.map(function (e) { return eventCard(e); }).join('') + '</div>' : '<p class="m1-empty">No upcoming events.</p>') + '</section>';
    if (music.length) h += '<section class="m1-sec"><h2>Music</h2><div class="m1-chips">' +
      music.map(function (l) { return '<a class="m1-chip m1-music" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>'; }).join('') + '</div></section>';
    return h;
  }

  function renderPrivate(d) {
    var now = (d.now || new Date()).getTime();
    var tix = (d.tickets || []).filter(function (t) { return t && t.starts_at && new Date(t.starts_at).getTime() >= now - 6 * 3600e3; })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
    var saved = d.saved || [], hostedFailed = d.hosted === null, hosted = (d.hosted || []).slice().sort(function (a, b) { return new Date(b.starts_at || 0) - new Date(a.starts_at || 0); });
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
    h += '<section class="m1-sec"><h2>Host events</h2><div class="m1-chips">' +
      '<a class="m1-chip" href="/create-event">Create an event</a><a class="m1-chip" href="/dashboard">Host dashboard</a></div>' +
      (hostedFailed ? failedNote('Your events') : hosted.length ? '<div class="m1-evs">' + hosted.map(function (e) { return eventCard(e, esc(e.status === 'published' ? 'Published' : 'Draft')); }).join('') + '</div>' : '<p class="m1-empty">You have not created an event yet.</p>') + '</section>';
    h += '<section class="m1-sec"><h2>Settings</h2><div class="m1-chips"><a class="m1-chip" href="/settings">Account settings</a>' +
      '<a class="m1-chip" href="/profile?slug=' + esc(encodeURIComponent(slugOf(d.slug))) + '&amp;edit=1">Edit profile</a></div></section>';
    return h + '</div>';
  }

  function data(r) { return r && !r.error ? r.data : null; }

  /** Reads everything the page shows. owner is true only when my_profile_slug() is this profile. */
  async function load(client, slug, opts) {
    opts = opts || {};
    var s = slugOf(slug);
    var mr = await safe(client.from('profile_meta')
      .select('slug,display_name,handle,avatar_url,bio,tagline,location,links,socials,account_type').eq('slug', s).maybeSingle());
    if (!ok(mr)) return { slug: s, failed: true };   // a failed read is not "this profile does not exist"
    var meta = mr.data;
    if (!meta) return { slug: s, missing: true };
    var cr = await safe(client.from('profile_content').select('data').eq('profile_slug', s).eq('kind', 'profile_categories').limit(1));
    var cats = ok(cr) ? cr.data : null;
    var er = await safe(client.rpc('get_profile_events', { p_handle: meta.handle || s }));
    var events = ok(er) ? (er.data || []) : null;   // null = could not load, shown as such (not "no events")
    var sess = null;
    try { var g = await client.auth.getSession(); sess = g && g.data ? g.data.session : null; } catch (e) {}
    var owner = false;
    if (sess) { var mine = await safe(client.rpc('my_profile_slug')); owner = ok(mine) && !!mine.data && slugOf(mine.data) === s; }
    var out = { slug: s, meta: meta, categories: cats && cats[0] ? cats[0].data : null, events: events, owner: owner, now: opts.now };
    if (owner) {
      var tr = await safe(client.rpc('get_my_tickets'));
      out.tickets = ok(tr) ? (tr.data || []) : null;
      var sr = await safe(client.from('saved_events').select('event_slug,event_title,created_at').order('created_at', { ascending: false }).limit(50));
      out.saved = ok(sr) ? (sr.data || []) : null;
      out.hosted = events;
    }
    return out;
  }

  function render(d) {
    if (d.failed) return '<div class="m1-empty m1-failed">This profile couldn\u2019t load. Check your connection and try again.</div>';
    if (d.missing) return '<div class="m1-empty m1-missing">This profile does not exist.</div>';
    return renderPublic(d) + (d.owner ? renderPrivate(d) : '');
  }

  /** Resolve the slug (?slug=, else the signed-in member's own profile) and draw into root. */
  async function mount(rootEl, client, opts) {
    opts = opts || {};
    var slug = slugOf(opts.slug || '');
    if (!slug) {
      try { var g = await client.auth.getSession(); if (g && g.data && g.data.session) slug = slugOf(data(await client.rpc('my_profile_slug')) || ''); } catch (e) {}
    }
    if (!slug) { rootEl.innerHTML = '<div class="m1-empty">Sign in to see your profile, or open a profile link.</div>'; return null; }
    var d = await load(client, slug, opts);
    rootEl.innerHTML = render(d);
    return d;
  }

  var api = { esc: esc, safeUrl: safeUrl, slugOf: slugOf, upcoming: upcoming, musicLinks: musicLinks, profileLinks: profileLinks,
    renderPublic: renderPublic, renderPrivate: renderPrivate, render: render, load: load, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KilMember = api;
})(typeof window !== 'undefined' ? window : this);
