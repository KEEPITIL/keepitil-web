// sitemap-events.xml is generated (keepitil.github.io .github/internal/scripts/build-sitemaps.mjs),
// but keepitil-web serves whatever copy is committed here. QA 2026-11-22: the public copy listed
// 255 events while the calendar had 10 upcoming; every sampled URL rendered "Not found — event".
// These checks keep the committed file well-formed and self-consistent. Freshness against the
// live calendar is a network check and lives in the QA harness, not in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function check(xml) {
  const bad = [];
  const declared = Number((xml.match(/(\d+) event\(s\)/) || [])[1]);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!Number.isFinite(declared)) bad.push('no generator header');
  else if (declared !== locs.length) bad.push(`header says ${declared}, file has ${locs.length}`);
  for (const l of locs) if (!/^https:\/\/keepitil\.com\/event\?e=[a-z0-9-]+$/.test(l)) bad.push('bad loc ' + l);
  if (new Set(locs).size !== locs.length) bad.push('duplicate locs');
  const sorted = [...locs].sort();
  if (sorted.join() !== locs.join()) bad.push('locs not sorted by slug');
  return bad;
}

test('negative controls', () => {
  const ok = '<!-- 2 event(s). --><url><loc>https://keepitil.com/event?e=a</loc></url><url><loc>https://keepitil.com/event?e=b</loc></url>';
  assert.deepEqual(check(ok), []);
  assert.ok(check(ok.replace('2 event', '3 event')).length, 'count mismatch');
  assert.ok(check(ok.replace('e=b', 'e=a')).length, 'duplicate');
  assert.ok(check(ok.replace('e=a<', 'e=z<')).length, 'unsorted');
  assert.ok(check(ok.replace('event?e=a', 'event.html?e=a')).length, 'bad loc');
});

test('committed sitemap-events.xml is consistent', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap-events.xml'), 'utf8');
  assert.deepEqual(check(xml), []);
});
