'use strict';
// node --test tests/fmw-404.test.cjs
// Joe 2026-11-22 FMW QA: a missing /app/findmyweed/* address must show a "Back to Find My Weed"
// panel (still a genuine 404, no redirect). Every other unmatched path keeps the KEEPITIL panel.
// Runs the real router script from 404.html against a stub location/document.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', '404.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const router = scripts[0];

function run(pathname) {
  const attrs = {};
  const shown = [];
  const replaced = [];
  const document = {
    title: '',
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] || null },
    getElementById: (id) => ({ style: { set display(v) { shown.push([id, v]); } } }),
  };
  const ctx = {
    document,
    location: { protocol: 'https:', pathname, search: '', hash: '', replace: (u) => replaced.push(u) },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  };
  vm.runInNewContext(router, ctx);
  vm.runInNewContext(scripts[1], ctx);
  return { attrs, shown, replaced, title: document.title };
}

test('missing FMW page shows the Find My Weed panel and does not redirect', () => {
  const r = run('/app/findmyweed/no-such-page');
  assert.deepEqual(r.replaced, []);
  assert.deepEqual(r.shown, [['fmwfourohfour', 'flex']]);
  assert.match(r.title, /Find My Weed/);
});

test('the FMW panel links back to the Find My Weed home', () => {
  const panel = html.match(/<div class="wrap" id="fmwfourohfour"[\s\S]*?<\/div>/)[0];
  assert.match(panel, /href="\/app\/findmyweed\/"[^>]*>Back to Find My Weed</);
});

test('other missing paths keep the KEEPITIL panel', () => {
  for (const p of ['/no-such-page', '/app/tuitea/nope', '/app/nope']) {
    const r = run(p);
    assert.deepEqual(r.shown, [['fourohfour', 'flex']], p);
    assert.equal(r.attrs['data-fmw'], undefined, p);
  }
});

test('clean URLs still route', () => {
  assert.deepEqual(run('/profile/someone').replaced, ['/profile?slug=someone']);
});
