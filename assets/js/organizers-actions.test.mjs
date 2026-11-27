/*
 * CSP migration, organizers/dashboard.html: the 22 inline on*= handlers became delegated actions (assets/js/kil-actions.js). The dispatcher is tested in profile-actions.test.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(dir, '../../organizers/dashboard.html'), 'utf8');
const EXPECTED = {"click:addTier": 1, "click:doLogin": 1, "click:doLogout": 1, "click:doReset": 1, "click:doSignup": 1, "click:removeTier": 2, "click:saveProfile": 1, "click:showLogin": 1, "click:showReset": 1, "click:showTab": 9, "click:submitEvent": 1, "click:switchAuthTab": 2};
const used = {};
for (const m of PAGE.matchAll(/\sdata-(click|change|input|keydown|over|out)="(\w+)"/g)) used[m[1] + ':' + m[2]] = (used[m[1] + ':' + m[2]] || 0) + 1;

test('all 22 delegated handlers are in the page, exactly as many per event:action as the inline handlers they replaced', () => {
  assert.deepEqual(used, EXPECTED);
  assert.equal(Object.values(used).reduce((a, b) => a + b, 0), 22);
});

test('every action is allowed and defined as a function; the allow list has no dead entries; kil-actions.js loads first', () => {
  const allow = JSON.parse(PAGE.match(/KilActions\.allow\((\[[^\]]*\])\)/)[1]);
  const names = [...new Set(Object.keys(used).map((k) => k.split(':')[1]))].sort();
  assert.deepEqual([...allow].sort(), names);
  for (const n of names) assert.match(PAGE, new RegExp('function ' + n + '\\(|(?:var|let|const) ' + n + '\\s*=|window\\.' + n + '\\s*='), n + ' is defined');
  assert.ok(PAGE.indexOf('/assets/js/kil-actions.js') > 0 && PAGE.indexOf('/assets/js/kil-actions.js') < PAGE.indexOf('KilActions.allow('));
});

test('static arguments are JSON in data-a ("$el" stands for the element, "$e" for the event)', () => {
  for (const m of PAGE.matchAll(/data-a="([^"]*)"/g)) {
    const arr = JSON.parse(m[1].replace(/&quot;/g, '"'));
    assert.ok(Array.isArray(arr) && arr.length >= 1, m[1]);
  }
});

const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => { assert.ok(INLINE.test('<button onclick="x()">')); assert.equal(INLINE.test('<button data-click="x">'), false); });
test('organizers/dashboard.html has no inline on*= handler attribute left', () => {
  const t = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...t.matchAll(new RegExp(INLINE.source, 'gi'))].map((m) => m[0]), []);
});
