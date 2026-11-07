/* KEEPITIL Discover directory (/discover/…).
   Crawlable city pages. The homepage stays the interactive explorer.

   DATA — read only, on each visit, never baked into the HTML.
   Supabase project ovmqtzjfpzrbzrlkxwgw, anon key already used by the homepage.
   public.events: status = published, starts_at >= now, show_on_explore is null or
   true, and event_password_hash IS NULL. The hash is a filter only. It is not
   selected (anon can read that column; these pages must not).
   public.city_geo: city, state, county, tz. There is no slug column; slugs are
   derived (Los Angeles → los-angeles). A city value of "LA" with state CA is
   treated as los-angeles.
   Ticket links come from events.source_url. public.ticketing_links is readable
   and empty, and the anon role has no URL column on it, so it is not queried.
   Cards open the live event page /event?e=<slug> (the page /show in #84 also
   sends people to). /show and /browse (#84, #86) are not linked: they are not
   on the site yet. This file does not sell anything and does not change a price.

   WEEKEND WINDOW
   "This weekend" is Friday 00:00:00.000 through Sunday 23:59:59.999 in the city
   time zone (city_geo.tz, else the page fallback, America/Los_Angeles here).
   Monday–Thursday uses the upcoming Friday–Sunday. Friday–Sunday uses the
   weekend already in progress. starts_at >= now still drops a night that has
   already started, so a stale Friday does not stay up on Saturday.
   "Next 30 days" is the following 30 days, excluding events already listed
   under this weekend. Anything later that is still published and upcoming is
   listed under "Further ahead" — real rows are not dropped and not invented.
   There is no daily static rebuild. GitHub Pages has no cron here. Sitemap
   lastmod is the day the template shipped. The list itself is computed at view time.

   GENRE NORMALIZATION
   events.genres is free text. Live rows are space-separated ("house electronica",
   "ebm industrial") and often blank. Commas, slashes, and hyphens are separators
   too, so "tech-house" and "tech house" are the same phrase.
   Phrases are matched before leftover tokens:
     tech house                         → house AND techno
       (dual-tag: a tech-house night belongs on both genre pages)
     deep / progressive / acid / afro / melodic / organic / bass / hard house → house
     hard / melodic / minimal / industrial / hypnotic / peak time / raw techno → techno
     a bare "house" or "techno" token   → that tag
   ebm, industrial (without techno), trance, electronica, drum and bass, dubstep,
   and anything else are NOT house or techno. A blank genre is not guessed.
   Only techno has a page in this set. The house rules exist so the dual-tag is
   one map when a house URL is added later.

   City pages are a shell plus this script. An empty answer and a failed request
   are different. Neither one invents an event.
*/
(function (root) {
  'use strict';

  var SUPA_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  /* Same anon key the homepage already ships. Not a new credential. */
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';

  /* Explicit columns. event_password_hash is intentionally absent. */
  var EVENT_COLUMNS = 'id,slug,title,venue,city,state,county,starts_at,ends_at,tz,genres,cover_url,source_url,show_on_explore';
  var EVENT_LIMIT = 200;
  var EXPLORE_OR = 'show_on_explore.is.null,show_on_explore.eq.true';

  /* Mirrors the homepage ticket-product test so SeatGeek day-pass rows collapse. */
  var TICKET_PRODUCT = /\b(ga|vip|general admission|early bird|presale|upgrade|meet (and|&) greet|(\d+\s*)?day pass|weekend pass|friday pass|saturday pass|sunday pass|3 day|2 day|\d\s*day)\b/i;

  /* Longer phrases first. "tech house" must be claimed before the bare tokens. */
  var GENRE_PHRASES = [
    ['tech house', ['house', 'techno']],
    ['deep house', ['house']],
    ['progressive house', ['house']],
    ['acid house', ['house']],
    ['afro house', ['house']],
    ['melodic house', ['house']],
    ['organic house', ['house']],
    ['bass house', ['house']],
    ['hard house', ['house']],
    ['hard techno', ['techno']],
    ['melodic techno', ['techno']],
    ['minimal techno', ['techno']],
    ['industrial techno', ['techno']],
    ['hypnotic techno', ['techno']],
    ['peak time techno', ['techno']],
    ['raw techno', ['techno']]
  ];

  var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    if (/^https:\/\/[^\s<>"'\\]+$/i.test(s)) return s;
    return '';
  }

  function citySlug(name) {
    return String(name == null ? '' : name)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function eventCitySlug(e) {
    var s = citySlug(e && e.city);
    if (s === 'la' && String((e && e.state) || '').toUpperCase() === 'CA') return 'los-angeles';
    return s;
  }

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function genreTags(raw) {
    var s = String(raw == null ? '' : raw).toLowerCase().replace(/[-_/|,+]+/g, ' ').replace(/\s+/g, ' ').trim();
    var tags = {};
    GENRE_PHRASES.forEach(function (pair) {
      var phrase = pair[0];
      if (!phrase || s.indexOf(phrase) === -1) return;
      pair[1].forEach(function (t) { tags[t] = 1; });
      s = s.split(phrase).join(' ');
    });
    s.split(' ').forEach(function (tok) {
      if (tok === 'house' || tok === 'techno') tags[tok] = 1;
    });
    return Object.keys(tags);
  }

  function genreLabels(raw) {
    var s = String(raw == null ? '' : raw).toLowerCase().replace(/[/|,+]+/g, ' ').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return [];
    var labels = [];
    GENRE_PHRASES.forEach(function (pair) {
      var phrase = pair[0];
      if (s.indexOf(phrase) === -1) return;
      labels.push(phrase);
      s = s.split(phrase).join(' ');
    });
    s.split(' ').forEach(function (tok) {
      if (tok && tok !== 'and' && labels.indexOf(tok) === -1) labels.push(tok);
    });
    return labels.slice(0, 6);
  }

  function safeTz(tz, fallback) {
    var want = tz || fallback || 'America/Los_Angeles';
    try {
      Intl.DateTimeFormat('en-US', { timeZone: want }).format(0);
      return want;
    } catch (e) {
      return fallback || 'America/Los_Angeles';
    }
  }

  function zonedParts(date, tz) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    var out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0, weekday: '' };
    fmt.formatToParts(date).forEach(function (p) {
      if (p.type === 'literal') return;
      if (p.type === 'weekday') out.weekday = p.value;
      else out[p.type] = parseInt(p.value, 10);
    });
    /* Some engines report midnight as hour 24 on the previous calendar day. */
    if (out.hour === 24) {
      out.hour = 0;
      var rolled = new Date(Date.UTC(out.year, out.month - 1, out.day + 1));
      out.year = rolled.getUTCFullYear();
      out.month = rolled.getUTCMonth() + 1;
      out.day = rolled.getUTCDate();
    }
    return out;
  }

  function tzOffsetMs(date, tz) {
    var p = zonedParts(date, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
  }

  /** UTC instant whose wall clock in tz is the given civil time. Two passes cover DST. */
  function zonedTimeToUtc(y, m, d, h, mi, s, tz) {
    var naive = Date.UTC(y, m - 1, d, h, mi, s);
    var corrected = naive - tzOffsetMs(new Date(naive), tz);
    return new Date(naive - tzOffsetMs(new Date(corrected), tz));
  }

  function addDays(y, m, d, n) {
    var dt = new Date(Date.UTC(y, m - 1, d + n));
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
  }

  function weekendBounds(now, tz) {
    tz = safeTz(tz);
    now = now instanceof Date ? now : new Date(now);
    var p = zonedParts(now, tz);
    var wd = WD[p.weekday];
    if (wd == null) wd = 5;
    var delta = wd === 5 ? 0 : wd === 6 ? -1 : wd === 0 ? -2 : (5 - wd);
    var fri = addDays(p.year, p.month, p.day, delta);
    var sun = addDays(fri.year, fri.month, fri.day, 2);
    var start = zonedTimeToUtc(fri.year, fri.month, fri.day, 0, 0, 0, tz);
    var end = zonedTimeToUtc(sun.year, sun.month, sun.day, 23, 59, 59, tz);
    end = new Date(end.getTime() + 999);
    return { start: start, end: end, tz: tz };
  }

  function localDateKey(iso, tz) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = zonedParts(d, safeTz(tz));
    return p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0');
  }

  function titleStem(title) {
    var cut = String(title || '').split(' - ')[0];
    cut = cut.replace(/\s*\((?:1[0-9]|2[0-9])\+\)\s*$/, '');
    return norm(cut);
  }

  function isProduct(title) { return TICKET_PRODUCT.test(String(title || '')); }

  function betterRow(a, b) {
    var ap = isProduct(a.title), bp = isProduct(b.title);
    if (ap !== bp) return ap ? b : a;
    return String(a.title || '').length <= String(b.title || '').length ? a : b;
  }

  function copyRow(e) {
    var o = {};
    Object.keys(e || {}).forEach(function (k) {
      if (k === 'event_password_hash') return;
      o[k] = e[k];
    });
    o.also = [];
    return o;
  }

  function pushAlso(keep, drop) {
    var url = safeUrl(drop.source_url);
    var title = drop.title || 'Tickets';
    if (keep.also.some(function (x) { return x.title === title && x.url === url; })) return;
    if (url && url === safeUrl(keep.source_url) && title === keep.title) return;
    keep.also.push({ title: title, url: url });
  }

  function dedupe(events, tz) {
    var groups = Object.create(null);
    var order = [];
    (events || []).forEach(function (e, i) {
      var row = copyRow(e);
      var venue = norm(row.venue);
      var stem = titleStem(row.title);
      var day = localDateKey(row.starts_at, row.tz || tz);
      var key = (venue && stem && day) ? (day + '|' + venue + '|' + stem) : ('solo|' + i);
      var hit = groups[key];
      if (!hit) {
        groups[key] = row;
        order.push(key);
        return;
      }
      var keep = betterRow(hit, row);
      var drop = keep === hit ? row : hit;
      if (keep !== hit) {
        keep.also = (hit.also || []).slice();
        groups[key] = keep;
      }
      (drop.also || []).forEach(function (extra) { pushAlso(groups[key], extra); });
      pushAlso(groups[key], drop);
    });
    return order.map(function (k) { return groups[k]; });
  }

  function matchesCity(e, slug, state) {
    if (!slug) return true;
    if (eventCitySlug(e) !== slug) return false;
    if (state && e.state && String(e.state).toUpperCase() !== String(state).toUpperCase()) return false;
    return true;
  }

  /**
   * Published, upcoming, on explore, not password-protected, then city + genre.
   * Password-protected rows are dropped if a hash is present on the object.
   * The live query already excludes them without returning the hash.
   */
  function prepare(events, opts) {
    opts = opts || {};
    var now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
    var tz = safeTz(opts.tz, opts.fallbackTz);
    var nowMs = now.getTime();
    var list = (events || []).filter(function (e) {
      if (!e || !e.starts_at || e.event_password_hash) return false;
      if (e.status && e.status !== 'published') return false;
      if (e.show_on_explore === false) return false;
      var t = new Date(e.starts_at).getTime();
      if (isNaN(t) || t < nowMs) return false;
      if (!matchesCity(e, opts.city, opts.state)) return false;
      if (opts.genre && genreTags(e.genres).indexOf(opts.genre) === -1) return false;
      return true;
    });
    list = dedupe(list, tz);
    list.sort(function (a, b) { return String(a.starts_at).localeCompare(String(b.starts_at)); });
    var bounds = weekendBounds(now, tz);
    var end30 = nowMs + 30 * 24 * 60 * 60 * 1000;
    var weekend = [], upcoming = [], later = [];
    list.forEach(function (e) {
      var t = new Date(e.starts_at).getTime();
      if (t >= bounds.start.getTime() && t <= bounds.end.getTime()) weekend.push(e);
      else if (t < end30) upcoming.push(e);
      else later.push(e);
    });
    return { weekend: weekend, upcoming: upcoming, later: later, bounds: bounds, tz: tz, now: now };
  }

  function tzFromGeo(geos, cityName, state, fallback) {
    var want = citySlug(cityName);
    var hit = null;
    (geos || []).some(function (g) {
      if (!g || citySlug(g.city) !== want) return false;
      if (state && g.state && String(g.state).toUpperCase() !== String(state).toUpperCase()) return false;
      hit = g;
      return true;
    });
    return safeTz(hit && hit.tz, fallback || 'America/Los_Angeles');
  }

  function whenLabel(e, tz) {
    var d = e && e.starts_at ? new Date(e.starts_at) : null;
    if (!d || isNaN(d.getTime())) return '';
    var zone = safeTz(e.tz || tz);
    try {
      var day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
      var time = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(d);
      return day + ' · ' + time;
    } catch (err) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function formatUpdated(now, tz) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: safeTz(tz), month: 'short', day: 'numeric', year: 'numeric' }).format(now);
    } catch (e) {
      return '';
    }
  }

  function description(n, opts) {
    opts = opts || {};
    var date = formatUpdated(opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now()), opts.tz);
    var city = opts.cityName || 'this city';
    var updated = date ? (' Updated ' + date + '.') : '';
    if (opts.view === 'weekend') {
      if (n < 1) return 'No published events this weekend in ' + city + '.' + updated;
      return n + ' electronic / rave ' + (n === 1 ? 'event' : 'events') + ' this weekend in ' + city + '.' + updated;
    }
    var what = opts.genreLabel ? (String(opts.genreLabel).toLowerCase() + ' ') : 'electronic / rave ';
    if (n < 1) return 'No published upcoming ' + what + 'events in ' + city + '.' + updated;
    return n + ' upcoming ' + what + (n === 1 ? 'event' : 'events') + ' in ' + city + '.' + updated;
  }

  function eventHref(e) {
    var slug = String((e && e.slug) || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    return slug ? ('/event?e=' + encodeURIComponent(slug)) : '';
  }

  function card(e, tz) {
    var href = eventHref(e);
    var ticket = safeUrl(e.source_url);
    var title = e.title || 'Event';
    var when = whenLabel(e, tz);
    var where = [e.venue, e.city].filter(Boolean).join(' · ');
    var labels = genreLabels(e.genres);
    var cover = safeUrl(e.cover_url);
    var mediaInner = cover
      ? '<img src="' + esc(cover) + '" alt="" loading="lazy" decoding="async">'
      : '<span class="disc-dow">' + esc(when ? when.split(' · ')[0] : 'Night') + '</span>';
    var media = href
      ? '<a class="disc-media" href="' + esc(href) + '" tabindex="-1" aria-hidden="true">' + mediaInner + '</a>'
      : '<div class="disc-media">' + mediaInner + '</div>';
    var titleHtml = href ? '<a href="' + esc(href) + '">' + esc(title) + '</a>' : esc(title);
    var actions = '';
    if (ticket) {
      actions = '<p class="disc-actions"><a class="disc-tix" href="' + esc(ticket) + '" target="_blank" rel="noopener noreferrer">Tickets</a></p>';
    } else if (href) {
      actions = '<p class="disc-actions"><a class="disc-tix" href="' + esc(href) + '">Event page</a></p>';
    }
    var also = (e.also || []).filter(function (x) { return x && x.title; });
    var alsoHtml = also.length
      ? '<p class="disc-also">Also listed: ' + also.map(function (x) {
          return x.url
            ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title) + '</a>'
            : esc(x.title);
        }).join(', ') + '</p>'
      : '';
    return '<article class="disc-card" data-slug="' + esc(String(e.slug || '')) + '">' + media +
      '<div class="disc-body">' +
      (when ? '<time datetime="' + esc(e.starts_at) + '">' + esc(when) + '</time>' : '') +
      '<h3>' + titleHtml + '</h3>' +
      (where ? '<p class="disc-where">' + esc(where) + '</p>' : '') +
      (labels.length ? '<p class="disc-genres">' + labels.map(function (g) { return '<span class="disc-chip">' + esc(g) + '</span>'; }).join('') + '</p>' : '') +
      actions + alsoHtml +
      '</div></article>';
  }

  function section(title, events, tz, emptyHtml) {
    var count = events.length ? '<p class="disc-seccount">' + events.length + (events.length === 1 ? ' event' : ' events') + '</p>' : '';
    var body = events.length
      ? '<div class="disc-grid">' + events.map(function (e) { return card(e, tz); }).join('') + '</div>'
      : (emptyHtml || '');
    if (!body) return '';
    return '<section class="disc-sec"><h2>' + esc(title) + '</h2>' + count + body + '</section>';
  }

  function emptyBlock(state) {
    var city = esc(state.cityName || 'this city');
    if (state.genre) {
      var label = esc(state.genreLabel || state.genre);
      var back = esc(state.cityHref || '/discover/');
      return '<div class="disc-empty"><p class="disc-empty-t">No published ' + label.toLowerCase() + ' events in ' + city + ' right now.</p>' +
        '<p>Nights with no genre, or a different one, are not added here to fill the page. The <a href="' + back + '">' + city + ' calendar</a> lists every published event. <a href="/submit-event">Submit an event</a> if one is missing.</p></div>';
    }
    return '<div class="disc-empty"><p class="disc-empty-t">We&#39;re refreshing listings for ' + city + ' — <a href="/submit-event">submit an event</a>.</p>' +
      '<p>No published upcoming events. This page does not add placeholder listings.</p></div>';
  }

  function renderLists(state) {
    state = state || {};
    if (state.failed) {
      return '<div class="disc-empty disc-failed" role="alert"><p class="disc-empty-t">Events couldn&#39;t load.</p>' +
        '<p>Check your connection and try again. Nothing is filled in while the list is down.</p>' +
        '<button type="button" class="disc-retry">Try again</button></div>';
    }
    var weekend = state.weekend || [];
    var upcoming = state.upcoming || [];
    var later = state.later || [];
    var total = weekend.length + upcoming.length + later.length;
    if (!total) return emptyBlock(state);
    var tz = state.tz;
    var html = '';
    if (state.view === 'weekend' || weekend.length) {
      html += section('This weekend', weekend, tz, state.view === 'weekend'
        ? '<p class="disc-note">No published events in ' + esc(state.cityName || 'this city') + ' this weekend (Friday 12:00 AM through Sunday 11:59 PM, ' + esc(tz || '') + ').</p>'
        : '');
    }
    if (upcoming.length) html += section('Next 30 days', upcoming, tz, '');
    if (later.length) html += section('Further ahead', later, tz, '');
    if (state.truncated) html += '<p class="disc-note">Showing the first ' + EVENT_LIMIT + ' published upcoming events.</p>';
    return html;
  }

  function usState(s) {
    return /^(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)$/.test(String(s || '').toUpperCase());
  }

  function eventNode(e) {
    if (!e || !e.title || !e.starts_at || isNaN(new Date(e.starts_at).getTime())) return null;
    var href = eventHref(e);
    var page = href ? ('https://keepitil.com' + href) : '';
    var ticket = safeUrl(e.source_url);
    var image = safeUrl(e.cover_url);
    var locName = e.venue || e.city || '';
    if (!locName) return null;
    var address = { '@type': 'PostalAddress' };
    if (e.city) address.addressLocality = e.city;
    if (e.state) address.addressRegion = e.state;
    if (usState(e.state)) address.addressCountry = 'US';
    var node = {
      '@type': 'Event',
      name: e.title,
      startDate: e.starts_at,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: locName, address: address }
    };
    if (e.ends_at && !isNaN(new Date(e.ends_at).getTime())) node.endDate = e.ends_at;
    if (page) node.url = page;
    else if (ticket) node.url = ticket;
    if (image) node.image = image;
    if (ticket) node.offers = { '@type': 'Offer', url: ticket, availability: 'https://schema.org/InStock' };
    return node;
  }

  function itemList(events, pageUrl, name) {
    var items = [];
    (events || []).forEach(function (e) {
      var node = eventNode(e);
      if (!node) return;
      items.push({ '@type': 'ListItem', position: items.length + 1, item: node });
    });
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: name || 'Events',
      url: pageUrl || undefined,
      numberOfItems: items.length,
      itemListElement: items
    };
  }

  function amazonHref(query) {
    return 'https://www.amazon.com/s?k=' + encodeURIComponent(query) + '&tag=tuitea09-20';
  }

  function merchHref(content) {
    return 'https://www.illestratedlifestyle.com/collections/all-merch?utm_source=keepitil&utm_medium=site&utm_campaign=discover-seo&utm_content=' + encodeURIComponent(content || 'discover');
  }

  function flat(part) {
    return (part.weekend || []).concat(part.upcoming || [], part.later || []);
  }

  function buildEventsQuery(client, nowIso) {
    return client.from('events').select(EVENT_COLUMNS)
      .eq('status', 'published')
      .gte('starts_at', nowIso)
      .is('event_password_hash', null)
      .or(EXPLORE_OR)
      .order('starts_at', { ascending: true })
      .limit(EVENT_LIMIT);
  }

  async function safe(p) { try { return await p; } catch (e) { return { data: null, error: e }; } }
  function ok(r) { return !!r && !r.error; }

  async function load(client, cfg, now) {
    now = now || new Date();
    var ev = await safe(buildEventsQuery(client, now.toISOString()));
    if (!ok(ev)) return { failed: true, now: now };
    var geo = await safe(client.from('city_geo').select('city,state,county,tz'));
    var geos = ok(geo) ? (geo.data || []) : [];
    var tz = tzFromGeo(geos, cfg.cityName, cfg.state, cfg.fallbackTz || 'America/Los_Angeles');
    var part = prepare(ev.data || [], {
      now: now, tz: tz, city: cfg.city, state: cfg.state, genre: cfg.genre || ''
    });
    return {
      failed: false,
      now: now,
      tz: tz,
      part: part,
      truncated: (ev.data || []).length >= EVENT_LIMIT
    };
  }

  function eventsForSchema(cfg, part) {
    if (!part) return [];
    /* The weekend page's ItemList is only the Friday–Sunday rows. Later nights
       stay in the HTML, but they are not labeled as this weekend in the schema. */
    if (cfg.view === 'weekend') return part.weekend || [];
    return flat(part);
  }

  function schemaName(cfg) {
    if (cfg.view === 'weekend') return 'Raves this weekend in ' + cfg.cityName;
    if (cfg.genreLabel) return cfg.genreLabel + ' events in ' + cfg.cityName;
    return 'Electronic events in ' + cfg.cityName;
  }

  function countLine(part, cfg) {
    var all = flat(part);
    var n = all.length;
    var city = cfg.cityName || 'this city';
    if (cfg.view === 'weekend') {
      var w = part.weekend.length;
      return w + (w === 1 ? ' event' : ' events') + ' this weekend. ' + n + ' published upcoming in ' + city + '.';
    }
    var noun = n === 1 ? 'event' : 'events';
    var line = n + ' published upcoming ' + noun;
    if (cfg.genreLabel) line += ' tagged ' + cfg.genreLabel.toLowerCase();
    line += ' in ' + city + '.';
    line += part.weekend.length
      ? (' ' + part.weekend.length + ' this weekend.')
      : ' None of them fall this weekend.';
    return line;
  }

  function draw(rootEl, cfg, result, pageUrl) {
    var state = { failed: result.failed, view: cfg.view, cityName: cfg.cityName, genre: cfg.genre, genreLabel: cfg.genreLabel, cityHref: cfg.cityHref, tz: result.tz, truncated: result.truncated };
    if (!result.failed && result.part) {
      state.weekend = result.part.weekend;
      state.upcoming = result.part.upcoming;
      state.later = result.part.later;
      state.tz = result.part.tz;
    }
    rootEl.innerHTML = renderLists(state);
    var count = root.document.getElementById('disc-count');
    var meta = root.document.querySelector('meta[name="description"]');
    if (result.failed) {
      if (count) count.textContent = 'The event list didn\u2019t load.';
      return;
    }
    var all = flat(result.part);
    var listed = eventsForSchema(cfg, result.part);
    var n = cfg.view === 'weekend' ? result.part.weekend.length : all.length;
    var text = description(n, { now: result.now, tz: result.tz, cityName: cfg.cityName, view: cfg.view, genreLabel: cfg.genreLabel });
    if (count) count.textContent = countLine(result.part, cfg);
    if (meta) meta.setAttribute('content', text);
    var prev = root.document.getElementById('disc-jsonld');
    if (prev) prev.remove();
    if (!listed.length) return;
    var s = root.document.createElement('script');
    s.id = 'disc-jsonld';
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(itemList(listed, pageUrl, schemaName(cfg))).replace(/</g, '\\u003c');
    root.document.head.appendChild(s);
  }

  function mount(rootEl, cfg) {
    if (!rootEl || !cfg) return;
    var pageUrl = '';
    try {
      var link = root.document.querySelector('link[rel="canonical"]');
      pageUrl = link && link.href ? link.href : '';
    } catch (e) {}
    var run = async function () {
      rootEl.innerHTML = '<p class="disc-loading">Loading published events\u2026</p>';
      if (!root.supabase || !root.supabase.createClient) {
        draw(rootEl, cfg, { failed: true }, pageUrl);
        return;
      }
      var client;
      try { client = root.supabase.createClient(SUPA_URL, SUPA_KEY); }
      catch (e) { draw(rootEl, cfg, { failed: true }, pageUrl); return; }
      var result = await load(client, cfg, new Date());
      draw(rootEl, cfg, result, pageUrl);
    };
    if (!rootEl.__discBound) {
      rootEl.__discBound = true;
      rootEl.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('.disc-retry') : null;
        if (b) run();
      });
    }
    return run();
  }

  function boot() {
    var cfg = root.KIL_DISCOVER;
    if (!cfg || cfg.kind === 'static') return;
    var el = root.document && root.document.getElementById('disc-lists');
    if (!el) return;
    mount(el, cfg);
  }

  if (typeof root.document !== 'undefined') {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  var api = {
    EVENT_COLUMNS: EVENT_COLUMNS,
    EXPLORE_OR: EXPLORE_OR,
    EVENT_LIMIT: EVENT_LIMIT,
    esc: esc,
    safeUrl: safeUrl,
    citySlug: citySlug,
    eventCitySlug: eventCitySlug,
    genreTags: genreTags,
    genreLabels: genreLabels,
    weekendBounds: weekendBounds,
    prepare: prepare,
    dedupe: dedupe,
    description: description,
    renderLists: renderLists,
    itemList: itemList,
    eventsForSchema: eventsForSchema,
    countLine: countLine,
    amazonHref: amazonHref,
    merchHref: merchHref,
    buildEventsQuery: buildEventsQuery,
    tzFromGeo: tzFromGeo,
    load: load,
    mount: mount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KilDiscover = api;
})(typeof window !== 'undefined' ? window : globalThis);
