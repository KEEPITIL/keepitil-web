/*
 * CSP migration, venue.html: the 14 inline on*= handlers (11 actions + 3 image fallbacks) became delegated actions (assets/js/kil-actions.js) and
 * delegated image fallbacks (assets/js/kil-img-fallback.js). The dispatcher itself is tested in profile-actions.test.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire as __cr } from 'node:module';
const __assemble = __cr(import.meta.url)('../../tests/helpers/event-assembled.cjs').assemble;

const dir = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(dir, '../..', rel), 'utf8');
const PAGE = __assemble(read('venue.html'));

const EXPECTED = { 'click:askV': 1, 'click:claim': 1, 'click:loadGallery': 1, 'click:scrollToAsk': 1, 'click:scrollToBook': 2, 'click:submitBooking': 1, 'click:submitReview': 1, 'click:vAskFromEl': 1, 'click:vToggleOpen': 1, 'keydown:vAskEnter': 1 };
const used = {};
for (const m of PAGE.matchAll(/\sdata-(click|change|input|keydown|over|out)="(\w+)"/g)) used[m[1] + ':' + m[2]] = (used[m[1] + ':' + m[2]] || 0) + 1;

test('all 11 delegated actions are in the page, exactly as many per event:action as the inline handlers they replaced', () => {
  assert.deepEqual(used, EXPECTED);
  assert.equal(Object.values(used).reduce((a, b) => a + b, 0), 11);
});

test('every action used in markup is allowed and defined as a function; the allow list has no dead entries', () => {
  const allow = JSON.parse(PAGE.match(/KilActions\.allow\((\[[^\]]*\])\)/)[1]);
  const names = [...new Set(Object.keys(used).map((k) => k.split(':')[1]))].sort();
  assert.deepEqual([...allow].sort(), names);
  for (const n of names) assert.match(PAGE, new RegExp('function ' + n + '\\('), n + ' is defined');
});

test('kil-actions.js and kil-img-fallback.js load before the page script', () => {
  const a = PAGE.indexOf('/assets/js/kil-actions.js'), f = PAGE.indexOf('/assets/js/kil-img-fallback.js'), inline = PAGE.indexOf('<script>');   // PAGE is assembled: the first inline script is the (formerly external) page script
  assert.ok(a > 0 && f > 0 && a < inline && f < inline);
});

const helperSrc = PAGE.slice(PAGE.indexOf('function vAskFromEl('), PAGE.indexOf('if(window.KilActions) KilActions.allow('));
test('vAskFromEl asks with the clicked suggestion text; vAskEnter asks only on Enter; vToggleOpen toggles .open', () => {
  const asked = []; const ctx = vm.createContext({ askVQ: (q) => asked.push(['vq', q]), askV: () => asked.push(['v']) });
  vm.runInContext(helperSrc, ctx);
  ctx.vAskFromEl({ textContent: 'Can I tour first?' }); assert.deepEqual(asked, [['vq', 'Can I tour first?']]);
  asked.length = 0; ctx.vAskEnter({ key: 'a' }); assert.deepEqual(asked, []); ctx.vAskEnter({ key: 'Enter' }); assert.deepEqual(asked, [['v']]);
  const cls = new Set(); ctx.vToggleOpen({ classList: { toggle: (c) => (cls.has(c) ? cls.delete(c) : cls.add(c)) } }); assert.ok(cls.has('open')); ctx.vToggleOpen({ classList: { toggle: (c) => (cls.has(c) ? cls.delete(c) : cls.add(c)) } }); assert.ok(!cls.has('open'));
});

test('the gallery filter argument is JSON, attribute-escaped: a hostile filter key round-trips and cannot leave the attribute', () => {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  assert.match(PAGE, /data-click="loadGallery" data-a="'\+esc\(JSON\.stringify\(\[f\[0\]\]\)\)\+'"/);
  const evil = '"><img src=x onerror=alert(1)>\'`', ctx = vm.createContext({ esc, JSON, f: [evil, 'x'] });
  const arr = vm.runInContext('[f[0]]', ctx), html = '<b data-a="' + esc(JSON.stringify(arr)) + '">';
  assert.equal((html.match(/"/g) || []).length, 2); assert.equal(/<img/.test(html), false);
});

/* image fallback modes */
function fbEnv() {
  const listeners = []; const doc = { readyState: 'complete', addEventListener(t, f) { if (t === 'error') listeners.push(f); }, querySelectorAll: () => [] };
  const ctx = vm.createContext({ window: {}, document: doc, parseFloat, String }); vm.runInContext(read('assets/js/kil-img-fallback.js'), ctx);
  const card = (cls) => ({ cls, style: {} });
  const img = (attrs, ancestors = []) => { const el = { tagName: 'IMG', style: {}, getAttribute: (k) => (k in attrs ? attrs[k] : null), closest: (sel) => ancestors.find((a) => '.' + a.cls === sel) || null }; return el; };
  return { fire: (t) => listeners.forEach((f) => f({ target: t })), img, card };
}
test('image fallback: hide-closest hides the matching ancestor only, for a plain class selector only', () => {
  const e = fbEnv(), g = e.card('gcard'), other = e.card('other');
  const a = e.img({ 'data-fb': 'hide-closest', 'data-fb-sel': '.gcard' }, [other, g]); e.fire(a); assert.equal(g.style.display, 'none'); assert.equal(other.style.display, undefined);
  for (const bad of ['#id', '.a .b', 'div', '.a,.b', '.gcard > img', '[x]', '', 'x']) { const g2 = e.card('gcard'); const i = e.img({ 'data-fb': 'hide-closest', 'data-fb-sel': bad }, [g2]); e.fire(i); assert.equal(g2.style.display, undefined, 'refuses selector ' + bad); }
  const none = e.img({ 'data-fb': 'hide-closest', 'data-fb-sel': '.gcard' }, []); e.fire(none);   // no ancestor: no throw
});
test('the three former onerror handlers use hide x2 and hide-closest .gcard', () => {
  const modes = [...PAGE.matchAll(/\sdata-fb="([\w-]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(modes, ['hide', 'hide', 'hide-closest']);
  assert.match(PAGE, /data-fb="hide-closest" data-fb-sel="\.gcard"/);
});

const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => { assert.ok(INLINE.test('<button onclick="x()">')); assert.equal(INLINE.test('<button data-click="x">'), false); });
test('venue.html has no inline on*= handler attribute left', () => {
  const t = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...t.matchAll(new RegExp(INLINE.source, 'gi'))].map((m) => m[0]), []);
});
