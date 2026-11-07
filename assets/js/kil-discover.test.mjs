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
  assert.deepEqual(calls.find(function (c) { return c[0] === 'is'; }).slice(1), ['event_password_hash', null]);
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
      else if (name === 'index.html') acc.push(p.slice(root.length + 1));
    });
  }
  var found = [];
  walk(join(root, 'discover'), found);
  assert.deepEqual(found.sort(), Object.keys(PAGES).sort());
});
