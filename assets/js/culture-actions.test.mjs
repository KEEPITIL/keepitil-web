/*
 * CSP migration, culture/index.html: the 16 inline on*= handlers became delegated actions (assets/js/kil-actions.js). The dispatcher is tested in profile-actions.test.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(dir, '../../culture/index.html'), 'utf8');
const EXPECTED = {"click:__culCloseWall": 1, "click:culBell": 1, "click:culSection": 4, "click:setCulContentType": 6, "click:setCulType": 2, "click:toggleCulGear": 1, "click:toggleFeedDD": 1};
const used = {};
for (const m of PAGE.matchAll(/\sdata-(click|change|input|keydown|over|out)="(\w+)"/g)) used[m[1] + ':' + m[2]] = (used[m[1] + ':' + m[2]] || 0) + 1;

test('all 16 delegated handlers are in the page, exactly as many per event:action as the inline handlers they replaced', () => {
  assert.deepEqual(used, EXPECTED);
  assert.equal(Object.values(used).reduce((a, b) => a + b, 0), 16);
});

test('every action is allowed and defined as a function; the allow list has no dead entries; kil-actions.js loads first', () => {
  const allow = JSON.parse(PAGE.match(/KilActions\.allow\((\[[^\]]*\])\)/)[1]);
  const names = [...new Set(Object.keys(used).map((k) => k.split(':')[1]))].sort();
  assert.deepEqual([...allow].sort(), names);
  for (const n of names) assert.match(PAGE, new RegExp('function ' + n + '\\(|(?:var|let|const) ' + n + '\\s*=|window\\.' + n + '\\s*='), n + ' is defined');
  assert.ok(PAGE.indexOf('/assets/js/kil-actions.js') > 0 && PAGE.indexOf('/assets/js/kil-actions.js') < PAGE.indexOf('KilActions.allow('));
});

test('static arguments of the delegated actions are JSON in data-a (the page has its own unrelated data-a="copy|prof|report" buttons) ("$el" stands for the element, "$e" for the event)', () => {
  for (const m of PAGE.matchAll(/data-(?:click|change|input|keydown|over|out)="\w+" data-a="([^"]*)"/g)) {
    const arr = JSON.parse(m[1].replace(/&quot;/g, '"'));
    assert.ok(Array.isArray(arr) && arr.length >= 1, m[1]);
  }
});

const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => { assert.ok(INLINE.test('<button onclick="x()">')); assert.equal(INLINE.test('<button data-click="x">'), false); });
test('culture/index.html has no inline on*= handler attribute left', () => {
  const t = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...t.matchAll(new RegExp(INLINE.source, 'gi'))].map((m) => m[0]), []);
});

import vm from 'node:vm';
test('the two toggles that used event.stopPropagation() keep it as data-stop (other document click listeners, e.g. the outside-click closers, do not see the click)', () => {
  for (const fn of ['toggleFeedDD', 'toggleCulGear']) assert.match(PAGE, new RegExp('data-click="' + fn + '" data-a="\\[&quot;\\$e&quot;\\]" data-stop'));
  assert.ok(PAGE.indexOf('/assets/js/kil-actions.js') < PAGE.indexOf("document.addEventListener('click', function(e){"), 'dispatcher is registered before the page document listeners');
});
test('culBell clicks the notification bell when there is one, otherwise sends the visitor to /apply (the old inline statement)', () => {
  const src = PAGE.slice(PAGE.indexOf('function culBell('), PAGE.indexOf('if(window.KilActions) KilActions.allow('));
  let clicks = 0; const ctx = vm.createContext({ document: { querySelector: (s) => (s === '.kiln-bell' ? { click: () => clicks++ } : null) }, location: {} });
  vm.runInContext(src, ctx); ctx.culBell(); assert.equal(clicks, 1); assert.equal(ctx.location.href, undefined);
  const c2 = vm.createContext({ document: { querySelector: () => null }, location: {} }); vm.runInContext(src, c2); c2.culBell(); assert.equal(c2.location.href, '/apply');
});
