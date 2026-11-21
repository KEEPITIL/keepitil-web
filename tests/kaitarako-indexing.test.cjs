'use strict';

// Run without dependencies: node --test tests/kaitarako-indexing.test.cjs
// Kai Tarako web launch (2026-11-21): ONLY the app landing page is indexable and listed in the sitemap. The
// privacy, open-source notices and support pages stay noindex. The landing page keeps its locked-down CSP.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const NOINDEX = /<meta\s+name="robots"\s+content="[^"]*noindex/i;

test('landing page: indexable, still self-only CSP and no outside script', () => {
  const html = read('app/kaitarako/index.html');
  assert.doesNotMatch(html, NOINDEX);
  assert.match(html, /default-src 'self'/);
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
});

for (const page of ['app/kaitarako/privacy.html', 'app/kaitarako/licenses.html', 'app/kaitarako/support/index.html']) {
  test(`${page}: stays noindex`, () => assert.match(read(page), NOINDEX));
}

test('sitemap lists the Kai landing page and no Kai sub-page', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.includes('/app/kaitarako'));
  assert.deepEqual(locs, ['https://keepitil.com/app/kaitarako/']);
});

test('robots.txt does not block the Kai landing page', () => {
  assert.doesNotMatch(read('robots.txt'), /^Disallow:\s*\/app\/kaitarako\/?\s*$/m);
});

// Negative controls: the checks above can fail.
test('negative controls', () => {
  assert.match('<meta name="robots" content="noindex, nofollow" />', NOINDEX);
  assert.doesNotMatch('<meta name="viewport" content="width=device-width" />', NOINDEX);
  assert.match('Disallow: /app/kaitarako/', /^Disallow:\s*\/app\/kaitarako\/?\s*$/m);
});
