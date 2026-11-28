// The Find My Weed sitemap and the shipped listings must name the same listing pages, both ways.
//   - every listing?id=<id> in app/findmyweed/sitemap.xml is a row of data/listings.json (no URL for a lapsed or removed row);
//   - every row of data/listings.json (published, not held) has its listing?id=<id> URL in the sitemap (no missing page).
// Why: sitemap.xml is a GENERATED file (find-my-weed tools/build-site.js). A drop-in that copies data/ but not the sitemap
// leaves a URL for a row that was pruned (kw #400 caught one). See docs/fmw-dropin.md.
// Each rule has a NEGATIVE CONTROL that runs the same checker on a planted bad input.
// Run: node --test assets/js/fmw-sitemap-listings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'app', 'findmyweed');
// the drop-in is built with canonicalUrl (find-my-weed site.json): its sitemap names the MATCHING findmyweedapp.com pages (listing?id=<id>), not keepitil.com
const LISTING_URL = /<loc>https:\/\/findmyweedapp\.com\/listing\?id=([^<&"]+)<\/loc>/g;

const sitemapIds = (xml) => [...xml.matchAll(LISTING_URL)].map((m) => m[1]);
const rowIds = (data) => data.listings.filter((r) => r.published !== false).map((r) => r.id);

/** Problems between the two id lists: duplicates, URLs without a row, rows without a URL. */
function problems(siteIds, dataIds) {
  const out = [];
  const seen = new Set();
  for (const id of siteIds) { if (seen.has(id)) out.push('duplicate sitemap url: ' + id); seen.add(id); }
  const rows = new Set(dataIds);
  for (const id of seen) if (!rows.has(id)) out.push('sitemap url without a listing row: ' + id);
  for (const id of rows) if (!seen.has(id)) out.push('listing row without a sitemap url: ' + id);
  return out;
}

const xml = fs.readFileSync(path.join(APP, 'sitemap.xml'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(APP, 'data', 'listings.json'), 'utf8'));

test('the sitemap and data/listings.json name the same listing pages', () => {
  const s = sitemapIds(xml), d = rowIds(data);
  assert.ok(s.length > 1000 && d.length > 1000, 'both lists are real (' + s.length + ' / ' + d.length + ')');
  assert.deepEqual(problems(s, d), []);
});

test('negative control: a planted lapsed id in the sitemap is caught', () => {
  const planted = xml.replace('</urlset>', '  <url><loc>https://findmyweedapp.com/listing?id=c10-9999999-lic</loc></url>\n</urlset>');
  assert.deepEqual(problems(sitemapIds(planted), rowIds(data)), ['sitemap url without a listing row: c10-9999999-lic']);
});

test('negative control: a listing row with no sitemap url is caught', () => {
  const first = sitemapIds(xml)[0];
  const cut = xml.split('\n').filter((l) => !l.includes('listing?id=' + first + '<')).join('\n');
  assert.deepEqual(problems(sitemapIds(cut), rowIds(data)), ['listing row without a sitemap url: ' + first]);
});

test('negative control: a duplicated sitemap url is caught', () => {
  const s = sitemapIds(xml);
  assert.deepEqual(problems([...s, s[0]], rowIds(data)), ['duplicate sitemap url: ' + s[0]]);
});

test('an unpublished row does not need a sitemap url, and one in the sitemap is caught', () => {
  const d = { listings: [{ id: 'a', published: true }, { id: 'b', published: false }] };
  assert.deepEqual(problems(['a'], rowIds(d)), []);
  assert.deepEqual(problems(['a', 'b'], rowIds(d)), ['sitemap url without a listing row: b']);
});
