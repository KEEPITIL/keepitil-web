import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const D = require('./kil-discover.js');
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const PAGES = {
  'discover/index.html': 'https://keepitil.com/discover/',
  'discover/los-angeles/index.html': 'https://keepitil.com/discover/los-angeles/',
  'discover/los-angeles/this-weekend/index.html': 'https://keepitil.com/discover/los-angeles/this-weekend/',
  'discover/los-angeles/techno/index.html': 'https://keepitil.com/discover/los-angeles/techno/',
  'discover/rave-outfits/index.html': 'https://keepitil.com/discover/rave-outfits/'
};

function htmlFiles() {
  return Object.keys(PAGES).map(function (rel) { return { rel: rel, html: readFileSync(join(root, rel), 'utf8') }; });
}

const NOW = new Date('2026-11-07T00:31:00Z'); /* Fri Nov 6, 2026, 4:31 PM Pacific */
const TZ = 'America/Los_Angeles';

test('weekend window is Fri 00:00 through Sun 23:59:59.999 Pacific', function () {
  var w = D.weekendBounds(NOW, TZ);
  assert.equal(w.start.toISOString(), '2026-11-06T08:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-11-09T07:59:59.999Z');
  var sun = D.weekendBounds(new Date('2026-11-09T06:00:00Z'), TZ); /* Sun Nov 8, 10 PM PT */
  assert.equal(sun.start.toISOString(), '2026-11-06T08:00:00.000Z');
  var mon = D.weekendBounds(new Date('2026-11-09T18:00:00Z'), TZ); /* Mon Nov 9, 10 AM PT */
  assert.equal(mon.start.toISOString(), '2026-11-13T08:00:00.000Z');
  assert.equal(mon.end.toISOString(), '2026-11-16T07:59:59.999Z');
});

test('weekend window follows Pacific DST', function () {
  /* Sunday March 8, 2026 is after the 2 AM switch. Friday March 6 is still PST. */
  var w = D.weekendBounds(new Date('2026-03-06T20:00:00Z'), TZ);
  assert.equal(w.start.toISOString(), '2026-03-06T08:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-03-09T06:59:59.999Z');
});

test('genre map: techno, house, tech house dual-tag, and non-matches', function () {
  assert.deepEqual(D.genreTags('techno').sort(), ['techno']);
  assert.deepEqual(D.genreTags('house electronica').sort(), ['house']);
  assert.deepEqual(D.genreTags('Tech-House').sort(), ['house', 'techno']);
  assert.deepEqual(D.genreTags('industrial techno').sort(), ['techno']);
  assert.deepEqual(D.genreTags('ebm industrial').sort(), []);
  assert.deepEqual(D.genreTags('').sort(), []);
  assert.deepEqual(D.genreTags('trance').sort(), []);
});

test('Los Angeles slug, LA alias, and Long Beach stays separate', function () {
  assert.equal(D.citySlug('Los Angeles'), 'los-angeles');
  assert.equal(D.eventCitySlug({ city: 'LA', state: 'CA' }), 'los-angeles');
  assert.equal(D.eventCitySlug({ city: 'Long Beach', state: 'CA' }), 'long-beach');
  assert.equal(D.eventCitySlug({ city: 'LA', state: 'LA' }), 'la');
});

test('LA weekend keeps a Friday-night row and drops Long Beach, past, hidden, and protected rows', function () {
  var rows = [
    { title: 'LED presents DENNETT', slug: 'dennett', city: 'Los Angeles', state: 'CA', venue: 'Exchange LA', starts_at: '2026-11-07T05:00:00Z', tz: TZ, genres: '', status: 'published', show_on_explore: true, source_url: 'https://tickets.example/dennett' },
    { title: 'Eli Brown', slug: 'eli', city: 'Los Angeles', state: 'CA', venue: 'City Market', starts_at: '2026-11-15T05:00:00Z', tz: TZ, genres: 'techno', status: 'published', show_on_explore: true },
    { title: 'Dreamstate', slug: 'ds', city: 'Long Beach', state: 'CA', venue: 'Arena', starts_at: '2026-11-07T05:00:00Z', tz: TZ, status: 'published' },
    { title: 'Already started', slug: 'past', city: 'Los Angeles', state: 'CA', starts_at: '2026-11-06T20:00:00Z', status: 'published' },
    { title: 'Hidden', slug: 'hid', city: 'Los Angeles', state: 'CA', starts_at: '2026-11-07T06:00:00Z', status: 'published', show_on_explore: false },
    { title: 'Draft', slug: 'dr', city: 'Los Angeles', state: 'CA', starts_at: '2026-11-07T06:00:00Z', status: 'draft' },
    { title: 'Secret', slug: 'sec', city: 'Los Angeles', state: 'CA', starts_at: '2026-11-07T06:00:00Z', status: 'published', event_password_hash: 'not-a-real-hash' }
  ];
  var part = D.prepare(rows, { now: NOW, tz: TZ, city: 'los-angeles', state: 'CA' });
  assert.deepEqual(part.weekend.map(function (e) { return e.slug; }), ['dennett']);
  assert.deepEqual(part.upcoming.map(function (e) { return e.slug; }), ['eli']);
  var html = D.renderLists({ failed: false, view: 'weekend', cityName: 'Los Angeles', tz: TZ, weekend: part.weekend, upcoming: part.upcoming, later: part.later });
  assert.match(html, /LED presents DENNETT/);
  assert.match(html, /Eli Brown/);
  assert.doesNotMatch(html, /Dreamstate|Already started|Hidden|Draft|Secret|not-a-real-hash/);
  assert.match(html, /href="\/event\?e=dennett"/);
  assert.match(html, /https:\/\/tickets\.example\/dennett/);
});

test('techno filter keeps techno and tech house, not bare house or a blank genre', function () {
  var rows = [
    { title: 'Eli Brown', slug: 'eli', city: 'Los Angeles', state: 'CA', venue: 'City Market', starts_at: '2026-11-15T05:00:00Z', genres: 'techno', status: 'published' },
    { title: 'Tech House Night', slug: 'th', city: 'Los Angeles', state: 'CA', venue: 'Room', starts_at: '2026-11-16T05:00:00Z', genres: 'tech house', status: 'published' },
    { title: 'Midnight Lovers', slug: 'ml', city: 'Los Angeles', state: 'CA', venue: 'Room', starts_at: '2026-11-16T06:00:00Z', genres: 'house electronica', status: 'published' },
    { title: 'Untitled genre', slug: 'ug', city: 'Los Angeles', state: 'CA', venue: 'Room', starts_at: '2026-11-16T07:00:00Z', genres: '', status: 'published' }
  ];
  var part = D.prepare(rows, { now: NOW, tz: TZ, city: 'los-angeles', state: 'CA', genre: 'techno' });
  var slugs = part.weekend.concat(part.upcoming, part.later).map(function (e) { return e.slug; });
  assert.deepEqual(slugs, ['eli', 'th']);
});

test('ticket-variant rows at one venue collapse, and the event title wins', function () {
  var rows = [
    { title: 'Dreamstate SoCal - 2 Day Pass (18+)', slug: 'pass', city: 'Long Beach', state: 'CA', venue: 'Long Beach Arena', starts_at: '2026-11-20T11:30:00Z', tz: TZ, source_url: 'https://tickets.example/pass', status: 'published' },
    { title: 'Dreamstate SoCal - Friday (18+)', slug: 'fri', city: 'Long Beach', state: 'CA', venue: 'Long Beach Arena', starts_at: '2026-11-20T11:30:00Z', tz: TZ, source_url: 'https://tickets.example/fri', status: 'published' }
  ];
  var part = D.prepare(rows, { now: NOW, tz: TZ, city: 'long-beach', state: 'CA' });
  var all = part.weekend.concat(part.upcoming, part.later);
  assert.equal(all.length, 1);
  assert.equal(all[0].slug, 'fri');
  assert.equal(all[0].also.length, 1);
  assert.match(all[0].also[0].title, /2 Day Pass/);
});

test('empty city state is honest and a failed load is not that state', function () {
  var empty = D.renderLists({ failed: false, view: 'hub', cityName: 'Los Angeles', tz: TZ, weekend: [], upcoming: [], later: [] });
  assert.match(empty, /We&#39;re refreshing listings for Los Angeles/);
  assert.match(empty, /href="\/submit-event"/);
  assert.doesNotMatch(empty, /<h3/);
  var failed = D.renderLists({ failed: true, view: 'hub', cityName: 'Los Angeles', weekend: [], upcoming: [], later: [] });
  assert.match(failed, /couldn&#39;t load/);
  assert.doesNotMatch(failed, /refreshing listings/);
  var genre = D.renderLists({ failed: false, view: 'genre', genre: 'techno', genreLabel: 'Techno', cityName: 'Los Angeles', cityHref: '/discover/los-angeles/', tz: TZ, weekend: [], upcoming: [], later: [] });
  assert.match(genre, /No published techno events in Los Angeles/);
  assert.doesNotMatch(genre, /refreshing listings/);
});

test('the weekend schema list is only the Friday–Sunday rows', function () {
  var part = {
    weekend: [{ title: 'Tonight', slug: 'tonight' }],
    upcoming: [{ title: 'Next week', slug: 'next' }],
    later: []
  };
  assert.deepEqual(D.eventsForSchema({ view: 'weekend' }, part).map(function (e) { return e.slug; }), ['tonight']);
  assert.equal(D.eventsForSchema({ view: 'hub' }, part).length, 2);
  assert.match(D.countLine(part, { view: 'weekend', cityName: 'Los Angeles' }), /^1 event this weekend\. 2 published upcoming/);
});

test('titles are escaped and JSON-LD lists only the rows it was given, with no price', function () {
  var html = D.renderLists({
    failed: false, view: 'hub', cityName: 'Los Angeles', tz: TZ,
    weekend: [{ title: '<img src=x onerror=alert(1)>', slug: 'ok', city: 'Los Angeles', state: 'CA', venue: 'Room', starts_at: '2026-11-07T05:00:00Z', source_url: 'javascript:alert(1)', cover_url: 'http://insecure.example/a.jpg' }],
    upcoming: [], later: []
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /insecure\.example/);
  var list = D.itemList([
    { title: 'Eli Brown', slug: 'eli', city: 'Los Angeles', state: 'CA', venue: 'City Market', starts_at: '2026-11-15T05:00:00Z', ends_at: '2026-11-15T12:00:00Z', source_url: 'https://tickets.example/eli', cover_url: 'https://img.example/eli.jpg' }
  ], 'https://keepitil.com/discover/los-angeles/techno/', 'Techno events in Los Angeles');
  assert.equal(list.numberOfItems, 1);
  assert.equal(list.itemListElement[0].item['@type'], 'Event');
  assert.equal(list.itemListElement[0].item.name, 'Eli Brown');
  assert.equal(list.itemListElement[0].item.startDate, '2026-11-15T05:00:00Z');
  assert.equal(list.itemListElement[0].item.location.address.addressLocality, 'Los Angeles');
  assert.equal(list.itemListElement[0].item.offers.url, 'https://tickets.example/eli');
  assert.equal(list.itemListElement[0].item.offers.price, undefined);
  assert.equal(list.itemListElement[0].item.url, 'https://keepitil.com/event?e=eli');
  assert.equal(D.itemList([], 'https://keepitil.com/discover/los-angeles/').numberOfItems, 0);
});

test('the events query selects explicit columns and filters the password hash without reading it', function () {
  assert.equal(D.EVENT_COLUMNS.split(',').indexOf('event_password_hash'), -1);
  assert.doesNotMatch(D.EVENT_COLUMNS, /\*/);
  var calls = [];
  function chain() {
    var c = {};
    ['select', 'eq', 'gte', 'is', 'or', 'order', 'limit'].forEach(function (m) {
      c[m] = function () { calls.push([m].concat([].slice.call(arguments))); return c; };
    });
    return c;
  }
  var client = { from: function (t) { calls.push(['from', t]); return chain(); } };
  D.buildEventsQuery(client, '2026-11-07T00:31:00.000Z');
  assert.deepEqual(calls[0], ['from', 'events']);
  assert.equal(calls[1][1], D.EVENT_COLUMNS);
  assert.deepEqual(calls.find(function (c) { return c[0] === 'eq'; }).slice(1), ['status', 'published']);
  assert.deepEqual(calls.filter(function (c) { return c[0] === 'eq'; })[1].slice(1), ['password_protected', false]);
  assert.equal(calls.some(function (c) { return c[0] === 'is'; }), false, 'no filter on the unreadable hash column');
  assert.equal(JSON.stringify(calls).indexOf('event_password_hash'), -1);
  assert.equal(calls.find(function (c) { return c[0] === 'or'; })[1], D.EXPLORE_OR);
  var src = readFileSync(join(root, 'assets/js/kil-discover.js'), 'utf8');
  assert.doesNotMatch(src, /select\(\s*['"`]\*/);
});

test('directory pages are real files with unique titles, canonicals, and live partner links only', function () {
  var titles = [];
  htmlFiles().forEach(function (f) {
    var title = (f.html.match(/<title>([^<]*)<\/title>/) || [])[1];
    assert.ok(title, f.rel + ' title');
    assert.ok(title.length <= 60, title + ' is ' + title.length + ' chars');
    titles.push(title);
    assert.equal((f.html.match(/<h1/g) || []).length, 1, f.rel);
    assert.match(f.html, new RegExp('rel="canonical" href="' + PAGES[f.rel].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
    assert.match(f.html, /BreadcrumbList/);
    assert.match(f.html, /tag=tuitea09-20/);
    assert.doesNotMatch(f.html, /tag=tuitea-20(?!9)/);
    assert.match(f.html, /utm_campaign=discover-seo/);
    assert.match(f.html, /illestratedlifestyle\.com\/collections\/all-merch/);
    assert.doesNotMatch(f.html, /tickpick|iheartraves|freedom rave|freedomrave|ca-pub-|adsbygoogle|lorem ipsum|Sample Event|placeholder event/i);
    assert.doesNotMatch(f.html, /las-vegas/);
    assert.doesNotMatch(f.html, /\/discover\/los-angeles\/house/);
  });
  assert.equal(new Set(titles).size, titles.length);
  var events = htmlFiles().filter(function (f) { return /los-angeles/.test(f.rel); });
  events.forEach(function (f) {
    assert.match(f.html, /11538316/);
    assert.match(f.html, /S-referral-mp9itc5j-wb9dbt/);
    assert.match(f.html, /id="disc-lists"/);
    assert.match(f.html, /\/assets\/js\/kil-discover\.js/);
    assert.match(f.html, /\/submit-event/);
  });
  var outfits = htmlFiles().find(function (f) { return f.rel.indexOf('rave-outfits') !== -1; }).html;
  assert.match(outfits, /No events on this page/);
  assert.doesNotMatch(outfits, /disc-card|kil-discover\.js/);
  assert.match(outfits, /11538316/);
});

test('sitemap lists the directory and robots still allows /discover/', function () {
  var map = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  Object.keys(PAGES).forEach(function (rel) {
    assert.match(map, new RegExp(PAGES[rel].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  assert.match(map, /discover\/los-angeles\/this-weekend\/<\/loc><lastmod>[^<]+<\/lastmod><changefreq>daily/);
  assert.match(map, /discover\/rave-outfits\/<\/loc><lastmod>[^<]+<\/lastmod><changefreq>weekly/);
  var robots = readFileSync(join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /Allow:\s*\//);
  assert.doesNotMatch(robots, /Disallow:\s*\/discover/);
  /* No stray directory pages beyond the five in this set. */
  function walk(dir, acc) {
    readdirSync(dir).forEach(function (name) {
      var p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, acc);
      else if (name === 'index.html') acc.push(p.slice(root.length + 1).replace(/\\/g, '/')); // forward slashes on Windows too
    });
  }
  var found = [];
  walk(join(root, 'discover'), found);
  assert.deepEqual(found.sort(), Object.keys(PAGES).sort());
});

/* ---- /discover/ index: every city with a published upcoming event is listed (root cause of "17 published, 0 on /discover": only Los Angeles had a page) ---- */
const PUB = (city, state, extra) => Object.assign({ city: city, state: state, status: 'published' }, extra || {});

test('cityList: every city that has a published upcoming event is listed with its count, Long Beach and Oakland included, LA alias folded into Los Angeles', function () {
  var rows = [PUB('Long Beach', 'CA'), PUB('Long Beach', 'CA'), PUB('Oakland', 'CA'), PUB('Las Vegas', 'NV'), PUB('LA', 'CA'), PUB('Los Angeles', 'CA'), PUB('San Diego', 'CA')];
  var list = D.cityList(rows);
  assert.deepEqual(list.map(function (c) { return c.name + '|' + c.state + '|' + c.n; }),
    ['Long Beach|CA|2', 'Los Angeles|CA|2', 'Las Vegas|NV|1', 'Oakland|CA|1', 'San Diego|CA|1']);
  assert.equal(list.find(function (c) { return c.name === 'Los Angeles'; }).href, '/discover/los-angeles/');
  assert.equal(list.find(function (c) { return c.name === 'Long Beach'; }).href, '#city=Long%20Beach&state=CA');
  assert.equal(list.find(function (c) { return c.name === 'Las Vegas'; }).href, '#city=Las%20Vegas&state=NV');
});

test('cityList negative controls: drafts, hidden-from-explore, password-protected and city-less rows add nothing; a city whose only row is hidden does not appear', function () {
  var rows = [PUB('Reno', 'NV', { status: 'draft' }), PUB('Fresno', 'CA', { show_on_explore: false }), PUB('Boise', 'ID', { password_protected: true }),
    { city: '', state: 'CA', status: 'published' }, { city: null, state: 'CA' }, null, PUB('Tempe', 'AZ')];
  assert.deepEqual(D.cityList(rows).map(function (c) { return c.name; }), ['Tempe']);
  assert.deepEqual(D.cityList([]), []);
});

test('renderCities: escapes names, links LA to its page and others to #city=..., empty is empty, failed is an alert with a retry', function () {
  var html = D.renderCities(D.cityList([PUB('<img src=x onerror=alert(1)>', 'CA'), PUB('Long Beach', 'CA')]));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<a href="#city=Long%20Beach&amp;state=CA">Long Beach, CA · 1 event<\/a>/);
  assert.equal(D.renderCities([]), '');
  assert.match(D.renderCities(null, { failed: true }), /role="alert"[\s\S]*disc-retry/);
  assert.match(D.renderCities([{ name: 'X', state: '', n: 3, href: '#city=X' }], { truncated: true }), /first 6000 published upcoming events/);
});

test('parseCityHash accepts plain city names only', function () {
  assert.deepEqual(D.parseCityHash('#city=Long%20Beach&state=CA'), { city: 'Long Beach', state: 'CA' });
  assert.deepEqual(D.parseCityHash('#city=St.%20Petersburg&state=fl'), { city: 'St. Petersburg', state: 'FL' });
  assert.deepEqual(D.parseCityHash('#city=Oakland'), { city: 'Oakland', state: '' });
  ['', '#', '#city=', '#city=%3Cscript%3E', '#city=a', '#city=Oakland&state=CAL', '#city=Oakland&x=1', '#state=CA', '#city=%E0%A4%A', '#city=Oak"land', '#city=' + 'a'.repeat(61)].forEach(function (h) {
    assert.equal(D.parseCityHash(h), null, h);
  });
});

test('queries: the cities query reads the de-dup columns with the same filters, a stable order and a range; the events query adds an exact-city filter only when asked', function () {
  var calls = [];
  function chain() { var c = {}; ['select', 'eq', 'gte', 'or', 'order', 'limit', 'range', 'in'].forEach(function (m) { c[m] = function () { calls.push([m].concat([].slice.call(arguments))); return c; }; }); return c; }
  var client = { from: function (t) { calls.push(['from', t]); return chain(); } };
  D.buildCitiesQuery(client, '2026-11-25T00:00:00.000Z');
  assert.deepEqual(calls[0], ['from', 'events']);
  assert.equal(calls[1][1], D.CITY_COLUMNS); assert.doesNotMatch(D.CITY_COLUMNS, /event_password_hash|\*/);
  assert.deepEqual(calls.filter(function (c) { return c[0] === 'eq'; }).map(function (c) { return c.slice(1); }), [['status', 'published'], ['password_protected', false]]);
  assert.equal(calls.find(function (c) { return c[0] === 'or'; })[1], D.EXPLORE_OR);
  assert.deepEqual(calls.find(function (c) { return c[0] === 'order'; }).slice(1), ['id', { ascending: true }]);
  assert.deepEqual(calls.find(function (c) { return c[0] === 'range'; }).slice(1), [0, 999]);
  assert.equal(JSON.stringify(calls).indexOf('event_password_hash'), -1);
  calls.length = 0; D.buildEventsQuery(client, '2026-11-25T00:00:00.000Z');
  assert.equal(calls.some(function (c) { return c[0] === 'eq' && c[1] === 'city'; }), false, 'no city filter unless asked (the existing city pages are unchanged)');
  calls.length = 0; D.buildEventsQuery(client, '2026-11-25T00:00:00.000Z', 'Long Beach');
  assert.deepEqual(calls.find(function (c) { return c[0] === 'eq' && c[1] === 'city'; }).slice(1), ['city', 'Long Beach']);
});

/* ---- counts match what the city shows (after de-duplication) and the list is complete past one API page ---- */
const SG = (city, title, venue, startsAt, extra) => Object.assign({ city: city, state: 'CA', status: 'published', title: title, venue: venue, starts_at: startsAt, tz: 'America/Los_Angeles' }, extra || {});

test('cityList counts AFTER the city view de-duplication: the same show at one venue on one local day is ONE event (Long Beach 13 rows -> what the city page lists)', function () {
  var rows = [SG('Long Beach', 'Zombie Apocalypse 18 - 2 Day Pass', 'Convention Center', '2026-12-05T20:00:00Z'), SG('Long Beach', 'Zombie Apocalypse 18 - VIP', 'Convention Center', '2026-12-05T21:00:00Z'),
    SG('Long Beach', 'Other Night', 'Convention Center', '2026-12-05T20:00:00Z')];
  assert.equal(D.cityList(rows)[0].n, 2);
  /* the same rows through the city view's own prepare() list the same number */
  var shown = D.prepare(rows, { now: new Date('2026-11-25T00:00:00Z'), tz: 'America/Los_Angeles', city: 'long-beach', state: 'CA' });
  assert.equal(shown.weekend.length + shown.upcoming.length + shown.later.length, D.cityList(rows)[0].n);
});

test('cityList de-dup negative controls: another venue, another day or another title is NOT collapsed; cities are counted separately', function () {
  var rows = [SG('Oakland', 'Show A', 'Venue 1', '2026-12-05T20:00:00Z'), SG('Oakland', 'Show A', 'Venue 2', '2026-12-05T20:00:00Z'), SG('Oakland', 'Show A', 'Venue 1', '2026-12-06T20:00:00Z'),
    SG('Oakland', 'Show B', 'Venue 1', '2026-12-05T20:00:00Z'), SG('San Jose', 'Show A', 'Venue 1', '2026-12-05T20:00:00Z')];
  var l = D.cityList(rows);
  assert.equal(l.find(function (c) { return c.name === 'Oakland'; }).n, 4);
  assert.equal(l.find(function (c) { return c.name === 'San Jose'; }).n, 1);
});

test('loadCityRows reads page after page until a short page, in a stable range order, and flags truncation only at the cap', async function () {
  function mkClient(total) {
    var calls = [];
    return { calls: calls, from: function () { var c = { _r: null }; ['select', 'eq', 'gte', 'or', 'order'].forEach(function (m) { c[m] = function () { return c; }; });
      c.range = function (a, b) { calls.push([a, b]); var n = Math.max(0, Math.min(b + 1, total) - a); return Promise.resolve({ data: Array.from({ length: n }, function (_, i) { return { id: a + i, city: 'X' }; }), error: null }); };
      return c; } };
  }
  var a = mkClient(2300); var r = await D.loadCityRows(a, 'now'); assert.equal(r.rows.length, 2300); assert.equal(r.truncated, false); assert.equal(r.failed, false);
  assert.deepEqual(a.calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(new Set(r.rows.map(function (x) { return x.id; })).size, 2300, 'no row repeated or skipped');
  var b = mkClient(2000); var rb = await D.loadCityRows(b, 'now'); assert.equal(rb.rows.length, 2000); assert.equal(b.calls.length, 3, 'a full last page means one more (empty) page is read');
  var cap = mkClient(99999); var rc = await D.loadCityRows(cap, 'now'); assert.equal(rc.rows.length, D.CITY_ROWS_LIMIT); assert.equal(rc.truncated, true); assert.equal(cap.calls.length, 6);
  var bad = { from: function () { var c = {}; ['select', 'eq', 'gte', 'or', 'order'].forEach(function (m) { c[m] = function () { return c; }; }); c.range = function () { return Promise.resolve({ data: null, error: { message: 'boom' } }); }; return c; } };
  var rf = await D.loadCityRows(bad, 'now'); assert.equal(rf.failed, true); assert.deepEqual(rf.rows, []);
});

test('/discover/ index page wires the cities list and still links Los Angeles; the pages that exist are unchanged', function () {
  var h = readFileSync(join(root, 'discover/index.html'), 'utf8');
  assert.match(h, /id="disc-cities"/); assert.match(h, /id="disc-lists"/); assert.match(h, /id="disc-count"/);
  assert.match(h, /"kind":"cities"/);
  assert.match(h, /\/assets\/js\/vendor\/supabase-js\.min\.js/); assert.match(h, /\/assets\/js\/kil-discover\.js/);
  assert.match(h, /href="\/discover\/los-angeles\/"/);
  assert.equal((h.match(/<h1/g) || []).length, 1);
});

test('every Los Angeles page asks for Los Angeles rows only, so its list never depends on how many events other cities have (it showed 50 of 51 once other cities were added)', function () {
  ['discover/los-angeles/index.html', 'discover/los-angeles/this-weekend/index.html', 'discover/los-angeles/techno/index.html'].forEach(function (rel) {
    var h = readFileSync(join(root, rel), 'utf8');
    assert.match(h, /"cityExact":\["Los Angeles","LA"\]/, rel);
  });
  var calls = [];
  function chain() { var c = {}; ['select', 'eq', 'gte', 'or', 'order', 'limit', 'in'].forEach(function (m) { c[m] = function () { calls.push([m].concat([].slice.call(arguments))); return c; }; }); return c; }
  var client = { from: function () { return chain(); } };
  D.buildEventsQuery(client, '2026-11-25T00:00:00.000Z', ['Los Angeles', 'LA']);
  assert.deepEqual(calls.find(function (c) { return c[0] === 'in'; }).slice(1), ['city', ['Los Angeles', 'LA']]);
  assert.equal(calls.some(function (c) { return c[0] === 'eq' && c[1] === 'city'; }), false);
  calls.length = 0; D.buildEventsQuery(client, '2026-11-25T00:00:00.000Z', []);   /* NEGATIVE CONTROL: an empty list means no filter, not "no rows" */
  assert.equal(calls.some(function (c) { return c[0] === 'in' || (c[0] === 'eq' && c[1] === 'city'); }), false);
});

test('cityList de-duplicates each city in ITS OWN timezone (tzFromGeo, like the city view): same venue + title either side of LOCAL midnight in Austin is TWO, and the chip equals the city view (NEGATIVE CONTROL: the LA-timezone version counts 1)', function () {
  var mk = function (city, state, startsAt) { return { city: city, state: state, status: 'published', title: 'Night Owl', venue: 'The Club', starts_at: startsAt }; };   /* no row tz, so the city timezone decides */
  var rows = [mk('Austin', 'TX', '2026-12-06T05:30:00Z'), mk('Austin', 'TX', '2026-12-06T07:30:00Z')];   /* 23:30 Dec 5 and 01:30 Dec 6 in Chicago time; both Dec 5 in Los Angeles */
  var geos = [{ city: 'Austin', state: 'TX', tz: 'America/Chicago' }];
  var chip = D.cityList(rows, 'America/Los_Angeles', geos)[0].n;
  var view = D.prepare(rows, { now: new Date('2026-11-25T00:00:00Z'), tz: D.tzFromGeo(geos, 'Austin', 'TX', 'America/Los_Angeles'), city: 'austin', state: 'TX' });
  assert.equal(view.weekend.length + view.upcoming.length + view.later.length, 2, 'the city view lists two nights');
  assert.equal(chip, 2, 'the chip equals the city view');
  assert.equal(D.cityList(rows, 'America/Los_Angeles', [])[0].n, 1, 'NEGATIVE CONTROL: without the city timezone (the old LA-for-everyone behaviour) the two nights collapse to one');
  assert.equal(D.cityList(rows)[0].n, 1, 'NEGATIVE CONTROL: the old two-argument call is the LA version too');
  /* a Pacific city is unchanged, and an unknown city falls back to the LA timezone */
  assert.equal(D.cityList([mk('Oakland', 'CA', '2026-12-06T05:30:00Z'), mk('Oakland', 'CA', '2026-12-06T07:30:00Z')], 'America/Los_Angeles', geos)[0].n, 1);
});

/* ---- /discover/ index: city_geo is fetched ONCE, in parallel with the city rows, and city views reuse it ---- */
function fakeSupabase(opts) {
  var log = [];
  var client = { from: function (table) {
    var q = { _t: table, _calls: [] };
    ['select', 'eq', 'gte', 'or', 'order', 'range', 'in', 'neq', 'limit'].forEach(function (m) { q[m] = function () { q._calls.push(m); return q; }; });
    q.then = function (res, rej) {
      log.push(table);
      if (table === 'city_geo' && opts.geoNever) return new Promise(function () {});   /* supabase-js is stuck retrying: never settles */
      var out = table === 'city_geo' ? (opts.geoFails ? { data: null, error: new Error('geo down') } : { data: opts.geos || [], error: null }) : (opts.rowsFail ? { data: null, error: new Error('events down') } : { data: opts.rows || [], error: null });
      return Promise.resolve(opts.delay ? new Promise(function (r) { setTimeout(r, opts.delay); }) : null).then(function () { log.push(table + ':done'); return out; }).then(res, rej);
    };
    return q;
  } };
  return { client: client, log: log };
}
async function mountWith(opts, hash) {
  var f = fakeSupabase(opts);
  var el = function () { return { innerHTML: '', textContent: '', style: { minHeight: '100vh' }, addEventListener: function () {}, __discBound: false }; };
  var cities = el(), lists = el();
  var saved = { document: globalThis.document, supabase: globalThis.supabase, location: globalThis.location };
  globalThis.document = { getElementById: function () { return el(); }, querySelector: function () { return null; }, createElement: function () { return { setAttribute: function () {} }; }, readyState: 'complete' };
  globalThis.supabase = { createClient: function () { return f.client; } };
  globalThis.location = { hash: hash || '' };
  try { await D.mountCities(cities, lists, { kind: 'cities', fallbackTz: 'America/Los_Angeles', geoTimeoutMs: opts.geoTimeoutMs }); }
  finally { globalThis.document = saved.document; globalThis.supabase = saved.supabase; globalThis.location = saved.location; }
  return { f: f, cities: cities, lists: lists };
}
var AUS = function (t, extra) { return Object.assign({ id: 'a' + t, city: 'Austin', state: 'TX', title: 'Night Owl', venue: 'The Club', starts_at: t, tz: null }, extra || {}); };

test('index: 1 events request + 1 city_geo request, and city_geo is requested in parallel (before the events request settles)', async function () {
  var rows = [AUS('2027-12-06T05:30:00Z'), AUS('2027-12-06T07:30:00Z')];
  var r = await mountWith({ rows: rows, geos: [{ city: 'Austin', state: 'TX', tz: 'America/Chicago' }], delay: 5 }, '');
  var started = r.f.log.filter(function (x) { return !/:done$/.test(x); });
  assert.deepEqual(started.slice().sort(), ['city_geo', 'events']);
  assert.ok(r.f.log.indexOf('city_geo') < r.f.log.indexOf('events:done'), 'city_geo was requested before the events request finished (parallel)');
  assert.match(r.cities.innerHTML, /Austin/);
  /* NEGATIVE CONTROL: the old sequential order would have started city_geo only after events:done */
  assert.ok(!(r.f.log.indexOf('events:done') >= 0 && r.f.log.indexOf('events:done') < r.f.log.indexOf('city_geo')));
});

test('opening a city adds NO city_geo request: the index copy is reused (NEGATIVE CONTROL: load() without known geos does fetch city_geo)', async function () {
  var rows = [AUS('2027-12-06T05:30:00Z'), AUS('2027-12-06T07:30:00Z')];
  var r = await mountWith({ rows: rows, geos: [{ city: 'Austin', state: 'TX', tz: 'America/Chicago' }] }, '#city=Austin&state=TX');
  var geoReqs = r.f.log.filter(function (x) { return x === 'city_geo'; }).length, evReqs = r.f.log.filter(function (x) { return x === 'events'; }).length;
  assert.equal(geoReqs, 1, 'exactly one city_geo request for index + city view');
  assert.equal(evReqs, 2, 'index rows + the city view rows');
  var f2 = fakeSupabase({ rows: rows, geos: [] });
  await D.load(f2.client, { city: 'austin', cityName: 'Austin', state: 'TX', cityExact: 'Austin', fallbackTz: 'America/Los_Angeles' }, new Date('2026-11-25T00:00:00Z'));
  assert.equal(f2.log.filter(function (x) { return x === 'city_geo'; }).length, 1, 'control: with no known geos load() fetches city_geo itself');
  var f3 = fakeSupabase({ rows: rows, geos: [] });
  await D.load(f3.client, { city: 'austin', cityName: 'Austin', state: 'TX', cityExact: 'Austin', fallbackTz: 'America/Los_Angeles' }, new Date('2026-11-25T00:00:00Z'), []);
  assert.equal(f3.log.filter(function (x) { return x === 'city_geo'; }).length, 0, 'with known geos it does not');
});

test('city_geo failing: the index still paints and the fallback stays the LA timezone; the city view does not retry city_geo', async function () {
  var rows = [AUS('2027-12-06T05:30:00Z'), AUS('2027-12-06T07:30:00Z')];
  var r = await mountWith({ rows: rows, geoFails: true }, '#city=Austin&state=TX');
  assert.match(r.cities.innerHTML, /Austin/);
  assert.equal(r.f.log.filter(function (x) { return x === 'city_geo'; }).length, 1);
  assert.equal(D.cityList(rows, 'America/Los_Angeles', [])[0].n, 1, 'LA fallback (both nights are one LA day)');
});

test('city_geo that never answers does not hold the paint: the index paints after the city_geo timeout with the LA fallback (NEGATIVE CONTROL: waiting on it, as before, never settles)', async function () {
  assert.equal(D.GEO_TIMEOUT_MS, 1500, 'the default is 1.5 s');
  var rows = [AUS('2027-12-06T05:30:00Z'), AUS('2027-12-06T07:30:00Z')];
  var t0 = Date.now();
  var r = await mountWith({ rows: rows, geoNever: true, geoTimeoutMs: 60 }, '');
  var took = Date.now() - t0;
  assert.ok(took >= 50 && took < 600, 'painted after about the timeout, took ' + took + ' ms');
  assert.match(r.cities.innerHTML, /Austin/, 'the chips rendered');
  assert.equal(r.f.log.filter(function (x) { return x === 'city_geo'; }).length, 1);
  assert.equal(D.cityList(rows, 'America/Los_Angeles', [])[0].n, 1, 'with no geos the LA fallback decides (both nights are one LA day)');
  /* NEGATIVE CONTROL: the pre-change behaviour (await the raw city_geo promise inside Promise.all) never settles against the same client */
  var f = fakeSupabase({ rows: rows, geoNever: true });
  var old = Promise.all([Promise.resolve(1), f.client.from('city_geo').select('x')]).then(function () { return 'settled'; });
  var verdict = await Promise.race([old, new Promise(function (r) { setTimeout(function () { r('still waiting'); }, 250); })]);
  assert.equal(verdict, 'still waiting');
});

test('a city view opened directly (no index geos) also gives up on a stuck city_geo and keeps the LA timezone', async function () {
  var rows = [AUS('2027-12-06T05:30:00Z')];
  var f = fakeSupabase({ rows: rows, geoNever: true });
  var t0 = Date.now();
  var res = await D.load(f.client, { city: 'austin', cityName: 'Austin', state: 'TX', cityExact: 'Austin', fallbackTz: 'America/Los_Angeles', geoTimeoutMs: 60 }, new Date('2026-11-25T00:00:00Z'));
  assert.ok(Date.now() - t0 < 600);
  assert.equal(res.failed, false); assert.equal(res.tz, 'America/Los_Angeles');
});

test('a city_geo that answers in time is still used (the timeout only cuts off a stuck one)', async function () {
  var rows = [AUS('2027-12-06T05:30:00Z'), AUS('2027-12-06T07:30:00Z')];
  var r = await mountWith({ rows: rows, geos: [{ city: 'Austin', state: 'TX', tz: 'America/Chicago' }], delay: 10, geoTimeoutMs: 400 }, '');
  assert.match(r.cities.innerHTML, /Austin/);
  assert.match(r.cities.innerHTML, /Austin, TX · 2 events/, 'the chip count uses the Chicago timezone (2 nights)');
});

test('CLS reserve: the screen reserved for the list (.disc-reserve) is given back as soon as the list is drawn (min-height 0), on success, on a failed load and for the city view; settle() is null-safe (NEGATIVE CONTROL: before the draw the element still holds its reserve)', async function () {
  var rows = [AUS('2027-12-06T05:30:00Z')];
  var r = await mountWith({ rows: rows, geos: [] }, '#city=Austin&state=TX');
  assert.equal(r.cities.style.minHeight, '0', 'cities list settled'); assert.equal(r.lists.style.minHeight, '0', 'city view settled');
  var f = { style: { minHeight: '100vh' } }; assert.equal(f.style.minHeight, '100vh', 'control: untouched until settle()'); D.settle(f); assert.equal(f.style.minHeight, '0');
  D.settle(null); D.settle({});   /* no throw */
  var failed = await mountWith({ rows: [], geos: [], geoFails: true, rowsFail: true }, '');
  assert.equal(failed.cities.style.minHeight, '0', 'a failed or empty load collapses too (no blank screen)');
});

/* ---- ordering on /discover/ is a pure read of date and locality: no ranking layer (Grok / Muse) ---- */
var ORDER_FLAGS = { featured: true, sponsored: true, paid: true, boost: 99, rank: 1, priority: 1, promoted: true, score: 100, weight: 100 };
test('event order is by starts_at only: ranking-looking fields on the rows change nothing (NEGATIVE CONTROL: a comparator that honoured them would reorder)', function () {
  var base = function (id, t) { return { id: id, slug: id, title: 'Show ' + id, venue: 'V' + id, city: 'Long Beach', state: 'CA', status: 'published', starts_at: t, tz: 'America/Los_Angeles' }; };
  var rows = [base('c', '2027-03-03T20:00:00Z'), base('a', '2027-01-01T20:00:00Z'), base('b', '2027-02-02T20:00:00Z')];
  var plain = D.prepare(rows, { now: new Date('2026-11-25T00:00:00Z'), tz: 'America/Los_Angeles', city: 'long-beach', state: 'CA' });
  var flagged = D.prepare(rows.map(function (r, i) { return Object.assign({}, r, ORDER_FLAGS, i === 0 ? { featured: true } : {}); }), { now: new Date('2026-11-25T00:00:00Z'), tz: 'America/Los_Angeles', city: 'long-beach', state: 'CA' });
  var ids = function (p) { return p.weekend.concat(p.upcoming, p.later).map(function (e) { return e.id; }); };
  assert.deepEqual(ids(plain), ['a', 'b', 'c'], 'chronological'); assert.deepEqual(ids(flagged), ids(plain), 'flags change nothing');
  var rankAware = rows.map(function (r, i) { return Object.assign({}, r, i === 0 ? ORDER_FLAGS : {}); }).sort(function (x, y) { return (y.featured ? 1 : 0) - (x.featured ? 1 : 0); });
  assert.equal(rankAware[0].id, 'c', 'control: a rank-aware sort WOULD put the flagged late event first, so the test can tell');
});
test('city order is event count (descending) then name: no paid or rank field exists in the query or the sort', function () {
  var mk = function (c, n) { var a = []; for (var i = 0; i < n; i++) a.push({ city: c, state: 'CA', status: 'published', title: 'T' + c + i, venue: 'V' + c + i, starts_at: '2027-01-0' + (1 + i) + 'T20:00:00Z', tz: 'America/Los_Angeles' }); return a; };
  var rows = [].concat(mk('Oakland', 1), mk('Long Beach', 3), mk('Anaheim', 1)).map(function (r) { return Object.assign({}, r, ORDER_FLAGS); });
  assert.deepEqual(D.cityList(rows).map(function (c) { return c.name + ':' + c.n; }), ['Long Beach:3', 'Anaheim:1', 'Oakland:1']);
  var src = readFileSync(new URL('./kil-discover.js', import.meta.url), 'utf8');
  assert.match(src, /list\.sort\(function \(a, b\) \{ return String\(a\.starts_at\)\.localeCompare\(String\(b\.starts_at\)\); \}\);/);
  assert.match(src, /\.sort\(function \(a, b\) \{ return b\.n - a\.n \|\| a\.name\.localeCompare\(b\.name\); \}\)/);
  assert.equal((src.match(/\.sort\(/g) || []).length, 2, 'exactly these two sorts exist in the file');
  var cols = (src.match(/var EVENT_COLUMNS = '([^']*)'/) || [])[1] + ',' + (src.match(/var CITY_COLUMNS = '([^']*)'/) || [])[1];
  assert.doesNotMatch(cols, /feature|sponsor|paid|boost|rank|priorit|promo|score|weight|pin/i, 'the queries select no ranking, paid or placement column');
  assert.match(src, /\.order\('starts_at', \{ ascending: true \}\)/);
});
