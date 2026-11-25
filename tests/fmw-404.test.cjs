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

function run(pathname, extra) {
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
  if (extra && extra.fetch) { ctx.fetch = extra.fetch; document.open = () => extra.log.push('open'); document.write = (h) => extra.log.push(['write', h]); document.close = () => extra.log.push('close'); }
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
  const panel = html.match(/<main class="wrap" id="fmwfourohfour"[\s\S]*?<\/main>/)[0];
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

// live-shots finding (axe landmark-one-main): each 404 panel is a <main>, so the page has a main landmark. NEGATIVE CONTROL below.
test('both 404 panels are <main> landmarks', () => {
  const h = fs.readFileSync(require('path').join(__dirname, '..', '404.html'), 'utf8');
  assert.equal((h.match(/<main class="wrap" id="(fmwfourohfour|fourohfour)"/g) || []).length, 2);
  assert.equal((h.match(/<\/main>/g) || []).length, 2);
  assert.doesNotMatch(h.replace(/<main class="wrap"/g, ''), /<div class="wrap" id="(fmw)?fourohfour"/);
  const old = h.replace(/<main class="wrap"/g, '<div class="wrap"');
  assert.notEqual((old.match(/<main class="wrap" id=/g) || []).length, 2, 'the pre-fix markup has no main');
});

test('the FMW 404 uses the Find My Weed LIGHT palette and wordmark, scoped so every other 404 stays KEEPITIL dark', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '404.html'), 'utf8');
  assert.match(html, /html\[data-fmw\],html\[data-fmw\] body\{background:#eef6ee;color:#0d1f14\}/);
  assert.match(html, /<div class="fmw-logo">Find <span>My<\/span> Weed<\/div>/);
  assert.match(html, /class="fmw-back" href="\/app\/findmyweed\/">Back to Find My Weed/);
  assert.match(html, /html,body\{margin:0;height:100%;background:#0a0a0f;color:#eef;/, 'the default page is still the KEEPITIL dark one');
  const rules = html.slice(html.indexOf('/* Find My Weed 404'), html.indexOf('</style>', html.indexOf('/* Find My Weed 404')));
  for (const sel of rules.split('\n').filter((l) => /^[^\/\s]/.test(l)).map((l) => l.split('{')[0])) assert.match(sel, /data-fmw|fmwfourohfour/, 'every palette rule is scoped to the FMW 404: ' + sel);
});

test('a missing FMW page renders Find My Weed\'s OWN 404 page in place (title, header, menu); the address stays; every other path never fetches it', async () => {
  const fmw404 = fs.readFileSync(path.join(__dirname, '..', 'app', 'findmyweed', '404.html'), 'utf8');
  assert.match(fmw404, /<title>[^<]*Find My Weed<\/title>/); assert.match(fmw404, /<header class="top">/); assert.match(fmw404, /id="menu-btn"/); assert.match(fmw404, /data-page="notfound"/);
  const calls = [], log = [];
  const fetchStub = async (u, o) => { calls.push([u, o]); return { ok: true, text: async () => fmw404 }; };
  const r = run('/app/findmyweed/no-such-page.html', { fetch: fetchStub, log });
  await new Promise((res) => setImmediate(res));
  assert.deepEqual(r.replaced, [], 'no redirect: the address stays');
  assert.deepEqual(calls.map((c) => c[0]), ['/app/findmyweed/404.html'], 'it fetches the FMW 404 page, same origin, no-store');
  assert.deepEqual(log.map((x) => (Array.isArray(x) ? x[0] : x)), ['open', 'write', 'close']);
  assert.equal(log[1][1], fmw404, 'the whole FMW page is what gets rendered');
  // NEGATIVE CONTROLS: other paths never fetch it; a failed or non-404 answer leaves the panel; no fetch support leaves the panel
  const other = []; const c2 = [], l2 = [];
  run('/some/other/missing', { fetch: async (u) => { other.push(u); return { ok: true, text: async () => fmw404 }; }, log: l2 }); await new Promise((res) => setImmediate(res));
  assert.deepEqual(other, [], 'the KEEPITIL 404 elsewhere is untouched'); assert.deepEqual(l2, []);
  const bad = []; run('/app/findmyweed/x', { fetch: async () => ({ ok: false, text: async () => '' }), log: bad }); await new Promise((res) => setImmediate(res)); assert.deepEqual(bad, [], 'a failed fetch leaves the panel');
  const wrong = []; run('/app/findmyweed/x', { fetch: async () => ({ ok: true, text: async () => '<html>not it</html>' }), log: wrong }); await new Promise((res) => setImmediate(res)); assert.deepEqual(wrong, [], 'an answer that is not the FMW 404 page is never written');
  const none = run('/app/findmyweed/x'); assert.deepEqual(none.shown, [['fmwfourohfour', 'flex']], 'without fetch the panel is shown as before'); assert.ok(c2.length === 0);
});
