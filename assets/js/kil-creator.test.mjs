// Creator promote panel. Run: node --test assets/js/kil-creator.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const C = require('./kil-creator.js');
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const mk = () => new JSDOM('<!doctype html><div id="creator-tools"></div>').window.document;
const EV = { event_id: 9, slug: 'big-night', title: 'Big Night' };

test('public and promoter links stay on keepitil and encode the promoter', () => {
  assert.equal(C.publicUrl('big-night'), 'https://keepitil.com/event?e=big-night');
  const u = new URL(C.trackingUrl('big-night', { source: 'ig', medium: 'social', campaign: 'fri', promoter: 'ray' }));
  assert.equal(u.origin + u.pathname, 'https://keepitil.com/event');
  assert.equal(u.searchParams.get('e'), 'big-night');
  assert.equal(u.searchParams.get('utm_content'), 'ray');
  assert.equal(u.searchParams.get('utm_source'), 'ig');
  assert.equal(C.trackingUrl('big-night', { promoter: 'a<b>' }).includes('<'), false);
});

test('render: title, link, and code fields are text; a hostile title is not HTML', () => {
  const doc = mk();
  const n = C.render(doc, [Object.assign({}, EV, { title: '<img src=x onerror=alert(1)>' })]);
  assert.equal(n.querySelector('img'), null);
  assert.ok(n.querySelector('.cr-title').textContent.includes('<img'));
  assert.equal(n.querySelector('.cr-link').getAttribute('href'), 'https://keepitil.com/event?e=big-night');
  assert.equal(n.querySelectorAll('button').length >= 2, true);
  const src = readFileSync(join(root, 'assets/js/kil-creator.js'), 'utf8');
  assert.doesNotMatch(src, /innerHTML|onclick|onchange|onsubmit/);
});

test('render: a bad slug gets no link', () => {
  const doc = mk();
  const n = C.render(doc, [{ event_id: 1, slug: '../x', title: 'Nope' }]);
  assert.equal(n.querySelector('a'), null);
  assert.match(n.querySelector('.cr-note').textContent, /no public link/);
});

test('code shape: letters, numbers, underscore, hyphen; 2 to 24', () => {
  assert.equal(C.codeOk('EARLY'), true);
  assert.equal(C.codeOk('A'), false);
  assert.equal(C.codeOk('has space'), false);
  assert.equal(C.codeOk('<script>'), false);
});

test('dashboard mounts the promote panel inside the events tab', () => {
  const h = readFileSync(join(root, 'dashboard.html'), 'utf8');
  assert.match(h, /id="creator-tools"/);
  assert.match(h, /kil-creator\.js/);
  assert.match(h, /KilCreator\.mount\(document\.getElementById\('creator-tools'\), supa\)/);
});

test('promo migration is owner-only and the hit beacon is not a reader', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20261127171000_creator_promo.sql'), 'utf8');
  assert.match(sql, /kil_row_owned\(p_event_id\)/);
  assert.match(sql, /kil_row_owned\(v_id\)/);
  assert.match(sql, /revoke all on public\.event_promo_codes from public, anon, authenticated/);
  assert.match(sql, /revoke all on public\.event_link_hits from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.kil_record_event_hit\(text, text, text, text, text, text\) to anon, authenticated/);
  assert.doesNotMatch(sql, /grant select on public\.event_promo_codes/);
  assert.doesNotMatch(sql, /grant select on public\.event_link_hits/);
});
