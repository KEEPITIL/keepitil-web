// The committed app/findmyweed/sitemap.xml (a file, not built at deploy) must list every listing the pages SHOW and every city view, and nothing the
// data does not have. Uses the drop-in's own js/fmw.js (the same rule the pages use). Subset checks both ways, so a license expiring tomorrow
// does not make the test fail today.   Run: node --test assets/js/fmw-sitemap.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const APP = path.join(ROOT, 'app/findmyweed');
const F = require(path.join(APP, 'js/fmw.js'));
const data = JSON.parse(fs.readFileSync(path.join(APP, 'data/listings.json'), 'utf8'));
const xml = fs.readFileSync(path.join(APP, 'sitemap.xml'), 'utf8');
const BASE = 'https://keepitil.com/app/findmyweed/';
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
test('the sitemap lists the static pages first, then every shown listing and every city view', () => {
  assert.deepEqual(locs.slice(0, 3), [BASE, BASE + 'about.html', BASE + 'privacy.html']);
  const want = F.sitemapPaths(data, new Date()).map((p) => BASE + p), have = new Set(locs);
  assert.deepEqual(want.filter((u) => !have.has(u)), [], 'a shown listing or city is missing from sitemap.xml (regenerate it)');
});
test('and nothing the data does not have (no dead URL): every listing id and city in the file exists in listings.json', () => {
  const ids = new Set(data.listings.map((l) => l.id)), cityNames = new Set(data.listings.map((l) => String((l.address && l.address.city) || '').trim().toLowerCase().replace(/\s+/g, ' ')));
  for (const u of locs.slice(3)) {
    const q = new URL(u).searchParams;
    if (q.has('id')) assert.ok(ids.has(q.get('id')), u); else assert.ok(cityNames.has(q.get('area').replace(/^city:/, '').trim().toLowerCase().replace(/\s+/g, ' ')), u);
  }
  assert.equal(new Set(locs).size, locs.length, 'no duplicates');
  assert.ok(locs.every((u) => u.startsWith(BASE)), 'one origin and folder');
});
test('NEGATIVE CONTROL: a sitemap without the listings fails the first check', () => {
  const static3 = [BASE, BASE + 'about.html', BASE + 'privacy.html'], want = F.sitemapPaths(data, new Date()).map((p) => BASE + p);
  assert.ok(want.length > 100 && want.filter((u) => !new Set(static3).has(u)).length > 0);
});

test('the ROOT robots.txt names the app sitemap (a crawler starting at keepitil.com/robots.txt must find it), exactly once', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  assert.equal((robots.match(/^Sitemap: https:\/\/keepitil\.com\/app\/findmyweed\/sitemap\.xml$/gm) || []).length, 1);
  assert.doesNotMatch('Sitemap: https://keepitil.com/sitemap.xml\n', /findmyweed/, 'NEGATIVE CONTROL: the old two-line file does not name it');
  assert.match(robots, /^Sitemap: https:\/\/keepitil\.com\/sitemap\.xml$/m, 'the existing sitemaps stay');
});
