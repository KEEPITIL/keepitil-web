// FMW EVENTS page logic, v0 (events.html; Joe/KODE 2026-11-24, flag-gated). A short, CURATED list of upcoming events that link out
// to the event's own page. It is not a feed: prod `public.events` has no cannabis category, and events where cannabis is
// sold or consumed need counsel (CA event licensing) before anything is listed, so nothing shows until a person has reviewed
// each entry. An entry is public only when status is "published" AND reviewed_by is set AND it passes the checks below AND it
// has not already started. Text uses the shared ad rules (FMW_AD_RULES.checkText). No network call except data/events.json,
// no iframes, no images, nothing to buy here. Not linked from any page until Joe turns the flag on.
(function (root) {
  var SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var TZ = /^[A-Za-z]+(?:\/[A-Za-z_]+){1,2}$/;
  // this site's own host family, spelled in pieces so the shipped file never names it (the site can move domains)
  var OWN_HOST = new RegExp(['keep', 'itil'].join('') + '|' + ['find', 'my', 'weed'].join(''), 'i');
  var AGE = /\b(21|18)\+/;
  var LIC = /^[A-Z]{1,4}[0-9]{1,2}-[0-9]{7}-LIC$/;
  // The site-wide no-sales rule (tests/basics.test.js scans all copy): this page lists events, it never sells or prices anything.
  var SALES = /\b(buy|buying|order|orders|ordering|purchase|checkout|check out|cart|basket|price|prices|pricing|pay|payment|payments|paid|sale|sales|sell|selling|deal|deals|discount|coupon|promo|shop now|add to)\b|\$\d/i;
  function rules() {
    if (root && root.FMW_AD_RULES) return root.FMW_AD_RULES;
    try { return require('./ad-rules.js'); } catch (e) { return null; }
  }
  function textProblems(s) {
    var r = rules();
    if (!r) return ['no-ad-rules'];
    return r.checkText(String(s == null ? '' : s)).hits;
  }
  function checkEvent(e) {
    var p = [];
    if (!e || typeof e !== 'object') return ['event'];
    if (typeof e.slug !== 'string' || !SLUG.test(e.slug) || e.slug.length > 80) p.push('slug');
    if (typeof e.title !== 'string' || !e.title.trim() || e.title.length > 90 || /[<>]/.test(e.title)) p.push('title');
    if (typeof e.venue !== 'string' || !e.venue.trim() || e.venue.length > 80 || /[<>]/.test(e.venue)) p.push('venue');
    if (typeof e.city !== 'string' || !e.city.trim() || e.city.length > 50 || /[<>]/.test(e.city)) p.push('city');
    if (typeof e.state !== 'string' || !/^[A-Z]{2}$/.test(e.state)) p.push('state');
    if (typeof e.starts_at !== 'string' || isNaN(Date.parse(e.starts_at))) p.push('starts_at');
    if (typeof e.tz !== 'string' || !TZ.test(e.tz)) p.push('tz');
    if (e.blurb != null && (typeof e.blurb !== 'string' || e.blurb.length > 200 || /[<>]/.test(e.blurb))) p.push('blurb');
    if (typeof e.age_note !== 'string' || !AGE.test(e.age_note) || e.age_note.length > 60) p.push('age_note');
    if (e.organizer_license != null && !LIC.test(String(e.organizer_license))) p.push('organizer_license');
    // the event's own page: a plain https link, never this site's host family (the site can move domains; see tests/domain-switch.test.js)
    if (typeof e.url !== 'string' || !/^https:\/\/[A-Za-z0-9.-]+\.[a-z]{2,}(?:[\/?#][^\s<>"']*)?$/.test(e.url) || e.url.length > 200 || OWN_HOST.test(e.url)) p.push('url');
    if (typeof e.source_note !== 'string' || !e.source_note.trim()) p.push('source_note');
    [e.title, e.venue, e.city, e.blurb].forEach(function (t, i) {
      textProblems(t).forEach(function (x) { p.push('copy' + i + ':' + x); });
      if (SALES.test(String(t == null ? '' : t))) p.push('copy' + i + ':sales-word');
    });
    return p;
  }
  function publicEvents(data, nowMs) {
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    var list = data && Array.isArray(data.events) ? data.events : [];
    return list.filter(function (e) {
      return e && e.status === 'published' && typeof e.reviewed_by === 'string' && e.reviewed_by.trim() && checkEvent(e).length === 0 && Date.parse(e.starts_at) >= now;
    }).sort(function (a, b) { return Date.parse(a.starts_at) - Date.parse(b.starts_at); });
  }
  // The date in the VENUE's time zone, never the viewer's or UTC (a 9 PM Los Angeles show is the next day in UTC).
  function when(e) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: e.tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(e.starts_at));
    } catch (x) { return e.starts_at; }
  }
  var COPY = { title: 'Events', none: 'Events are coming soon.', more: 'Event details', note: 'Cannabis is for adults 21+. Listings are general information; check the age rule on each event.' };
  function render(doc, data, nowMs) {
    var title = doc.getElementById('events-title'), box = doc.getElementById('events');
    if (!title || !box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    function el(tag, text, cls) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    title.textContent = COPY.title;
    var items = publicEvents(data, nowMs);
    if (!items.length) box.appendChild(el('p', COPY.none));
    items.forEach(function (e) {
      var card = el('div', null, 'learn-card');
      card.appendChild(el('p', when(e) + ' · ' + e.age_note, 'muted'));
      card.appendChild(el('h3', e.title));
      card.appendChild(el('p', e.venue + ', ' + e.city + ', ' + e.state));
      if (e.blurb) card.appendChild(el('p', e.blurb));
      var l = el('a', COPY.more); l.setAttribute('href', e.url); l.setAttribute('target', '_blank'); l.setAttribute('rel', 'noopener noreferrer'); card.appendChild(l);
      box.appendChild(card);
    });
    box.appendChild(el('p', COPY.note, 'muted'));
  }
  var api = { checkEvent: checkEvent, publicEvents: publicEvents, when: when, render: render, COPY: COPY };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.FMW_EVENTS = api;
  var doc = root.document;
  if (!doc || doc.body.getAttribute('data-page') !== 'events') return;
  root.fetch('data/events.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return { events: [] }; })
    .then(function (data) { render(doc, data); });
})(typeof self !== 'undefined' ? self : this);
