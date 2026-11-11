// Static "What's new" pages: committed output is current, carries no active content, and only KMOB and KBeats have one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, render, GAMES } from '../../scripts/build-whats-new.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('committed pages match changelog.json (not stale)', () => assert.deepEqual(build({ check: true }), []));

test('no script, form, input or iframe in the output', () => {
  for (const g of Object.keys(GAMES)) {
    const html = fs.readFileSync(path.join(ROOT, 'games', g, 'whats-new', 'index.html'), 'utf8').toLowerCase();
    for (const bad of ['<script', '<form', '<input', '<iframe', '<button', 'localstorage', 'document.cookie', 'fonts.googleapis']) assert.ok(!html.includes(bad), `${g}: ${bad}`);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${g}: one h1`);
  }
});

test('changelog text is escaped, never rendered as HTML (negative control)', () => {
  const html = render('kmob', [{ date: '2026-11-11', title: '<script>x</script>', items: ['<form><input></form> & "q"'] }]);
  assert.ok(!html.includes('<script>x') && !html.includes('<form>') && !html.includes('<input>'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;') && html.includes('&amp; &quot;q&quot;'));
});

test('coming-soon games have no What\'s new page', () => {
  for (const g of ['13', 'kwars', 'kwars1', 'pokasnap']) assert.ok(!fs.existsSync(path.join(ROOT, 'games', g, 'whats-new')), g);
});

test('both pages are in the sitemap', () => {
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  for (const g of Object.keys(GAMES)) assert.ok(sm.includes(`<loc>https://keepitil.com/games/${g}/whats-new/</loc>`), g);
});
