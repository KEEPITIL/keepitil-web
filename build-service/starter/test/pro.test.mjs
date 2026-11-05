import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, checkImages, checkPackage, ld, slug, LIMITS } from '../build.mjs';
import { stats } from '../tools/log-stats.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'pro');
const site = JSON.parse(readFileSync(path.join(dir, 'site.json'), 'utf8'));
const pages = render(site);
const ldBlocks = (h) => [...h.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('Pro stays inside its limits: up to 12 pages and 30 images, clean image checks', () => {
  assert.equal(site.package, 'pro');
  assert.ok(Object.keys(pages).length <= LIMITS.pro.pages, `${Object.keys(pages).length} pages`);
  assert.deepEqual(checkPackage(site, pages), []);
  assert.deepEqual(checkImages(site, dir), []);
});
test('Pro includes everything Standard has, plus news, posts and the extra form page', () => {
  for (const f of ['index.html', 'about.html', 'services.html', 'gallery.html', 'events.html', 'faq.html', 'contact.html', 'news.html', 'quote.html']) assert.ok(pages[f], f);
  assert.equal(Object.keys(pages).filter((f) => f.startsWith('post-')).length, site.news.items.length);
});
test('two forms, both posting to the client-contact function with the site id and distinct sources', () => {
  const c = pages['contact.html'], q = pages['quote.html'];
  for (const h of [c, q]) { assert.match(h, /name="site" value="juniper-tide"/); assert.match(h, /name="website"/); assert.match(h, /name="elapsed_ms"/); }
  assert.match(c, /value="pro-sample-contact"/); assert.match(q, /value="pro-sample-booking"/);
  assert.match(q, /placeholder="Date and time:/);
});
test('structured data: LocalBusiness, Event, FAQPage and Article are valid JSON with the right types', () => {
  assert.equal(ldBlocks(pages['index.html'])[0]['@type'], 'Restaurant');
  assert.equal(ldBlocks(pages['index.html'])[0].address.addressLocality, 'Harbourtown');
  const ev = ldBlocks(pages['events.html'])[0]['@graph']; assert.equal(ev.length, 2); assert.equal(ev[0]['@type'], 'Event'); assert.match(ev[0].startDate, /^2026-12-12/);
  assert.equal(ldBlocks(pages['faq.html'])[0].mainEntity.length, site.faq.items.length);
  assert.equal(ldBlocks(pages['post-winter-menu.html'])[0]['@type'], 'Article');
});
test('structured data cannot be broken out of by content', () => {
  const out = ld({ a: '</script><script>alert(1)</script>' });
  assert.equal((out.match(/<\/script>/g) || []).length, 1);
  assert.doesNotMatch(out, /<script>alert/);
});
test('no structured data when there is nothing to describe', () => {
  const plain = render(JSON.parse(readFileSync(path.join(root, 'site.json'), 'utf8')));
  for (const h of Object.values(plain)) assert.doesNotMatch(h, /ld\+json/);
  assert.equal(ld({}), ''); assert.equal(ld({ '@graph': [] }), '');
});
test('home blocks, compact density and news links come from site.json', () => {
  assert.match(pages['index.html'], /class="block"/); assert.match(pages['index.html'], /href="post-winter-menu\.html"/);
  assert.match(pages['index.html'], /data-density="compact"/);
  assert.equal(slug('We are hiring: a line cook!'), 'we-are-hiring-a-line-cook');
});
test('limit check fails when a site goes over its package', () => {
  const over = { ...site, package: 'standard' };
  assert.match(checkPackage(over, pages)[0], /over the standard limit of 7/);
});
test('no third-party requests; scripts only for the forms and structured data', () => {
  for (const [f, h] of Object.entries(pages)) {
    assert.doesNotMatch(h, /<script[^>]*\bsrc=/i, f);
    assert.doesNotMatch(h, /(src|href)="https?:\/\/(?!example\.com)/i, f);
    const rest = h.replace(/<script type="application\/ld\+json">[^<]*<\/script>/g, '');
    if (!['contact.html', 'quote.html'].includes(f)) assert.doesNotMatch(rest, /<script/i, f);
  }
});
test('log stats: counts page views and visitors, skips bots, assets, errors and POSTs, keeps no IPs', () => {
  const log = [
    '1.1.1.1 - - [05/Nov/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 5000 "https://www.google.com/" "Mozilla/5.0 Safari"',
    '1.1.1.1 - - [05/Nov/2026:10:01:00 +0000] "GET /menu.html HTTP/1.1" 200 4000 "-" "Mozilla/5.0 Safari"',
    '2.2.2.2 - - [05/Nov/2026:11:00:00 +0000] "GET /index.html HTTP/1.1" 200 5000 "https://example.org/x" "Mozilla/5.0 Chrome"',
    '3.3.3.3 - - [05/Nov/2026:11:30:00 +0000] "GET / HTTP/1.1" 200 5000 "-" "Googlebot/2.1"',
    '1.1.1.1 - - [05/Nov/2026:10:02:00 +0000] "GET /images/hero.svg HTTP/1.1" 200 900 "-" "Mozilla/5.0 Safari"',
    '1.1.1.1 - - [05/Nov/2026:10:03:00 +0000] "GET /missing.html HTTP/1.1" 404 100 "-" "Mozilla/5.0 Safari"',
    '1.1.1.1 - - [05/Nov/2026:10:04:00 +0000] "POST /contact.html HTTP/1.1" 200 100 "-" "Mozilla/5.0 Safari"',
  ].join('\n');
  const r = stats(log);
  assert.equal(r.views, 3); assert.equal(r.pages['/index.html'], 2); assert.equal(r.pages['/menu.html'], 1);
  assert.deepEqual(r.days['2026-11-05'], { views: 3, visitors: 2 });
  assert.deepEqual(r.refs, { 'www.google.com': 1, 'example.org': 1 });
  assert.doesNotMatch(JSON.stringify(r), /\d+\.\d+\.\d+\.\d+/);
});
