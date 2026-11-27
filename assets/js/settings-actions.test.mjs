/*
 * CSP migration, settings.html: the 10 inline on*= handlers became delegated actions (assets/js/kil-actions.js). The dispatcher is tested in profile-actions.test.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(dir, '../../settings.html'), 'utf8');
const EXPECTED = { 'click:delClose': 1, 'click:delGo': 1, 'click:delOpen': 1, 'click:doLogout': 1, 'click:exportMyData': 1, 'click:goProfile': 1, 'click:saveEmail': 1, 'click:savePass': 1, 'click:setShowAnyway': 1, 'input:delSync': 1 };
const used = {};
for (const m of PAGE.matchAll(/\sdata-(click|change|input|keydown|over|out)="(\w+)"/g)) used[m[1] + ':' + m[2]] = (used[m[1] + ':' + m[2]] || 0) + 1;

test('all 10 handlers are in the page as data-click / data-input, one per former inline handler', () => assert.deepEqual(used, EXPECTED));

test('every action is allowed and defined as a function; the allow list has no dead entries; the script loads first', () => {
  const allow = JSON.parse(PAGE.match(/KilActions\.allow\((\[[^\]]*\])\)/)[1]);
  const names = [...new Set(Object.keys(used).map((k) => k.split(':')[1]))].sort();
  assert.deepEqual([...allow].sort(), names);
  for (const n of names) assert.match(PAGE, new RegExp('function ' + n + '\\(|(?:var|let|const) ' + n + '\\s*='), n + ' is defined');
  assert.ok(PAGE.indexOf('/assets/js/kil-actions.js') > 0 && PAGE.indexOf('/assets/js/kil-actions.js') < PAGE.indexOf('<script>\nfunction') || PAGE.indexOf('/assets/js/kil-actions.js') < PAGE.indexOf('KilActions.allow('));
});

test('setShowAnyway keeps the old "return false": it shows the theme view and prevents the link navigation', () => {
  const src = PAGE.slice(PAGE.indexOf('function setShowAnyway('), PAGE.indexOf('if(window.KilActions) KilActions.allow('));
  const log = []; const ctx = vm.createContext({ showAnyway: () => log.push('show') }); vm.runInContext(src, ctx);
  let prevented = 0; ctx.setShowAnyway({ preventDefault: () => prevented++ });
  assert.deepEqual(log, ['show']); assert.equal(prevented, 1);
  assert.match(PAGE, /<a class="btn" href="#" data-click="setShowAnyway" data-a="\[&quot;\$e&quot;\]">Adjust theme only/);
});

const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => { assert.ok(INLINE.test('<button onclick="x()">')); assert.equal(INLINE.test('<button data-click="x">'), false); });
test('settings.html has no inline on*= handler attribute left', () => {
  const t = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...t.matchAll(new RegExp(INLINE.source, 'gi'))].map((m) => m[0]), []);
});
