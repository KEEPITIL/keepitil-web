// Live axe sweep (keepitil.com, 390 px): these pages had no <main> landmark (landmark-one-main + region), /games/ skipped a heading level (h1 -> h3), and /app/ had 11 px captions at 4.1:1 and its tab bar outside any landmark.
// Run: node --test assets/js/a11y-landmarks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const mains = (h) => (h.match(/<main\b/gi) || []).length;

test('exactly one <main> landmark on the community guidelines, dashboard, games hub and app hub pages (the /apps/ page is #454), each holding the page content', () => {
  for (const [f, marker] of [['community-guidelines.html', '<h1>Community Guidelines</h1>'], ['dashboard.html', '<h1><b>Dashboard</b></h1>'], ['games/index.html', 'id="hubtitle"'], ['app/index.html', 'id="panel-today"']]) {
    const h = read(f); assert.equal(mains(h), 1, f + ': one main'); assert.equal((h.match(/<\/main>/gi) || []).length, 1, f + ': closed once');
    const inside = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(h)[1]; assert.ok(inside.includes(marker), f + ': the page content is inside main (' + marker + ')');
  }
  // NEGATIVE CONTROL: the page as it was (no main) is caught
  assert.equal(mains(read('community-guidelines.html').replace(/<\/?main\b[^>]*>/gi, '')), 0);
});
test('the games hub: the featured card heading no longer skips a level (h1 then level 2), with no visual change', () => {
  const h = read('games/index.html'); assert.match(h, /<h3 id="g-kmob" aria-level="2">/);
  assert.match(h, /\.feature h3\{font-size:clamp/, 'the styling still targets the same element');
  assert.doesNotMatch(h.replace(' aria-level="2"', ''), /<h3 id="g-kmob" aria-level/, 'NEGATIVE CONTROL: only that one heading carries the override');
});
test('the apps hub /app/: captions are readable (not the 4.1:1 muted grey) and the section tabs sit in a labelled navigation landmark', () => {
  const h = read('app/index.html');
  assert.match(h, /\.row \.cap\{color:var\(--dim\)/); assert.doesNotMatch(h, /\.row \.cap\{color:var\(--mute\)/);
  const ratio = (a, b) => { const L = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }; const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const dim = /--dim:(#[0-9a-f]{6})/i.exec(h)[1], bg = '#0e1117'; assert.ok(ratio(dim, bg) >= 4.5, 'dim on the page background: ' + ratio(dim, bg).toFixed(2)); assert.ok(ratio('#6c7686', bg) < 4.5, 'NEGATIVE CONTROL: the old grey fails');
  assert.match(h, /<nav class="seg-wrap" aria-label="Sections">[\s\S]*?role="tablist"[\s\S]*?<\/nav>/);
});
