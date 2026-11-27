/*
 * CSP migration, kode/app.html: the 13 inline on*= handlers (12 actions + 1 image fallback) became delegated actions (assets/js/kil-actions.js) and a delegated
 * image fallback (assets/js/kil-img-fallback.js). The dispatcher is tested in profile-actions.test.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(dir, '../../kode/app.html'), 'utf8');
const EXPECTED = { 'click:connectSocial': 1, 'click:copyCaption': 1, 'click:delPost': 2, 'click:disconnectSocial': 1, 'click:kodeOpenMedia': 1, 'click:kodeOpenPlatform': 1, 'click:markPublished': 2, 'click:retryPost': 1, 'click:signOut': 1, 'click:syncVendor': 1 };
const used = {};
for (const m of PAGE.matchAll(/\sdata-(click|change|input|keydown|over|out)="(\w+)"/g)) used[m[1] + ':' + m[2]] = (used[m[1] + ':' + m[2]] || 0) + 1;

test('all 12 actions are in the page, exactly as many per action as the inline handlers they replaced', () => {
  assert.deepEqual(used, EXPECTED);
  assert.equal(Object.values(used).reduce((a, b) => a + b, 0), 12);
});

test('every action is allowed and defined as a function; the allow list has no dead entries; the scripts load before the page script', () => {
  const allow = JSON.parse(PAGE.match(/KilActions\.allow\((\[[^\]]*\])\)/)[1]);
  const names = [...new Set(Object.keys(used).map((k) => k.split(':')[1]))].sort();
  assert.deepEqual([...allow].sort(), names);
  for (const n of names) assert.match(PAGE, new RegExp('function ' + n + '\\(|window\\.' + n + '\\s*='), n + ' is defined / exposed');
  assert.ok(PAGE.indexOf('/assets/js/kil-actions.js') > 0 && PAGE.indexOf('/assets/js/kil-img-fallback.js') > 0);
  assert.ok(PAGE.indexOf('/assets/js/kil-actions.js') < PAGE.indexOf('const SUPABASE_URL'));
});

test('ids and keys are passed as JSON data, attribute-escaped: a hostile id or platform key cannot leave the attribute', () => {
  const sites = [...PAGE.matchAll(/data-a="\$\{escapeHtml\(JSON\.stringify\((\[[^\]]*\])\)\)\}"/g)].map((m) => m[1]);
  assert.equal(sites.length, (PAGE.match(/data-a="\$\{escapeHtml\(JSON\.stringify\(/g) || []).length);
  assert.ok(sites.length >= 9);
  const escSrc = PAGE.slice(PAGE.indexOf('function escapeHtml('), PAGE.indexOf('\n', PAGE.indexOf('function escapeHtml(')));
  const evil = '"><img src=x onerror=alert(1)>\'`';
  for (const expr of sites) {
    const ctx = vm.createContext({ p: { id: evil, key: evil, platform: evil }, JSON, String, RegExp }); vm.runInContext(escSrc, ctx);
    const html = '<b data-a="' + vm.runInContext('escapeHtml(JSON.stringify(' + expr + '))', ctx) + '">';
    assert.equal((html.match(/"/g) || []).length, 2, expr); assert.equal(/<img/.test(html), false, expr);
    const raw = html.match(/data-a="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.deepEqual(JSON.parse(raw), [evil]);
  }
});

const helperSrc = PAGE.slice(PAGE.indexOf('function kodeOpenMedia('), PAGE.indexOf('window.signOut = signOut;'));
function helpers(open) { const ctx = vm.createContext({ window: { open }, OPEN_LINK: { x: 'https://x.com/compose', linkedin: 'https://www.linkedin.com/feed/' }, Object }); vm.runInContext(helperSrc, ctx); return ctx; }
test('kodeOpenMedia opens the data-url in a new noopener tab', () => {
  const calls = []; const ctx = helpers((...a) => calls.push(a)); ctx.kodeOpenMedia({ dataset: { url: 'https://cdn.example/a.png' } });
  assert.deepEqual(calls.map((c) => Array.from(c)), [['https://cdn.example/a.png', '_blank', 'noopener,noreferrer']]);
});
test('kodeOpenPlatform opens the platform link; an unknown or inherited key opens nothing (the old OPEN_LINK[key] lookup would have opened "[object Object]")', () => {
  const calls = []; const ctx = helpers((...a) => calls.push(a));
  ctx.kodeOpenPlatform('x'); ctx.kodeOpenPlatform('linkedin');
  for (const bad of ['__proto__', 'constructor', 'toString', 'nope', '', 'hasOwnProperty']) ctx.kodeOpenPlatform(bad);
  assert.deepEqual(calls.map((c) => c[0]), ['https://x.com/compose', 'https://www.linkedin.com/feed/']);
});

test('the media thumbnail onerror became data-fb="hide-parent"', () => {
  assert.deepEqual([...PAGE.matchAll(/\sdata-fb="([\w-]+)"/g)].map((m) => m[1]), ['hide-parent']);
});

const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => { assert.ok(INLINE.test('<button onclick="x()">')); assert.equal(INLINE.test('<button data-click="x">'), false); });
test('kode/app.html has no inline on*= handler attribute left', () => {
  const t = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...t.matchAll(new RegExp(INLINE.source, 'gi'))].map((m) => m[0]), []);
});
