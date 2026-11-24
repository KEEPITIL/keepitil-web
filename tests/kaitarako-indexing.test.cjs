'use strict';

// Run without dependencies: node --test tests/kaitarako-indexing.test.cjs
// Kai Tarako on the web, OPTION A (2026-11-21): Echo has not ruled on indexing a kids' app page, so EVERY Kai page
// stays noindex and the sitemap lists none of them. Making the landing page indexable later is a 1-line change
// (remove its robots meta + add one sitemap line) and must flip these tests on purpose.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const NOINDEX = /<meta\s+name="robots"\s+content="[^"]*noindex/i;

for (const page of ['app/kaitarako/index.html', 'app/kaitarako/privacy.html', 'app/kaitarako/licenses.html', 'app/kaitarako/support/index.html']) {
  test(`${page}: noindex until Echo rules`, () => assert.match(read(page), NOINDEX));
}

test('landing page keeps its self-only CSP and loads no outside script', () => {
  const html = read('app/kaitarako/index.html');
  assert.match(html, /default-src 'self'/);
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
});

test('sitemap lists no Kai Tarako page', () => {
  assert.doesNotMatch(read('sitemap.xml'), /app\/kaitarako/);
});

test('web privacy page matches the app: ages 1-7, US spelling, bundled-recordings speech statement', () => {
  const html = read('app/kaitarako/privacy.html');
  for (const s of ['made for children ages 1&ndash;7', 'last practiced', 'picture and color', 'Spoken words are short recordings that come inside the app', 'right the first time']) {
    assert.ok(html.includes(s), s);
  }
  for (const s of ['5 and under', 'practised', 'colour', 'built-in voices only']) assert.ok(!html.includes(s), s);
});

// Negative controls: the checks above can fail.
test('negative controls', () => {
  assert.match('<meta name="robots" content="noindex, nofollow" />', NOINDEX);
  assert.doesNotMatch('<meta name="viewport" content="width=device-width" />', NOINDEX);
  assert.match('<url><loc>https://keepitil.com/app/kaitarako/</loc></url>', /app\/kaitarako/);
});
