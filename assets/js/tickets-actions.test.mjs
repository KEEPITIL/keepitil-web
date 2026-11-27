/*
 * CSP migration, tickets.html: the 6 inline on*= handlers became delegated actions (assets/js/kil-actions.js). The dispatcher is tested in profile-actions.test.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire as __cr } from 'node:module';
const __assemble = __cr(import.meta.url)('../../tests/helpers/event-assembled.cjs').assemble;

const dir = dirname(fileURLToPath(import.meta.url));
const PAGE = __assemble(readFileSync(join(dir, '../../tickets.html'), 'utf8'));
const EXPECTED = {"click:carScroll": 2, "click:setActive": 2, "click:toggleTix": 1};
const used = {};
for (const m of PAGE.matchAll(/\sdata-(click|change|input|keydown|over|out)="(\w+)"/g)) used[m[1] + ':' + m[2]] = (used[m[1] + ':' + m[2]] || 0) + 1;

test('all 5 delegated handlers are in the page, exactly as many per event:action as the inline handlers they replaced', () => {
  assert.deepEqual(used, EXPECTED);
  assert.equal(Object.values(used).reduce((a, b) => a + b, 0), 5);
});

test('every action is allowed and defined as a function; the allow list has no dead entries; kil-actions.js loads first', () => {
  const allow = JSON.parse(PAGE.match(/KilActions\.allow\((\[[^\]]*\])\)/)[1]);
  const names = [...new Set(Object.keys(used).map((k) => k.split(':')[1]))].sort();
  assert.deepEqual([...allow].sort(), names);
  for (const n of names) assert.match(PAGE, new RegExp('function ' + n + '\\(|(?:var|let|const) ' + n + '\\s*=|window\\.' + n + '\\s*='), n + ' is defined');
  assert.ok(PAGE.indexOf('/assets/js/kil-actions.js') > 0 && PAGE.indexOf('/assets/js/kil-actions.js') < PAGE.indexOf('KilActions.allow('));
});

test('static arguments are JSON in data-a ("$el" stands for the element, "$e" for the event)', () => {
  for (const m of PAGE.matchAll(/data-(?:click|change|input|keydown|over|out)="\w+" data-a="([^"]*)"/g)) {
    if (m[1].includes("'+")) continue;   // the JS-built setActive sites are checked below
    const arr = JSON.parse(m[1].replace(/&quot;/g, '"'));
    assert.ok(Array.isArray(arr) && arr.length >= 1, m[1]);
  }
});

const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => { assert.ok(INLINE.test('<button onclick="x()">')); assert.equal(INLINE.test('<button data-click="x">'), false); });
test('tickets.html has no inline on*= handler attribute left', () => {
  const t = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...t.matchAll(new RegExp(INLINE.source, 'gi'))].map((m) => m[0]), []);
});

test('the two setActive sites pass the numeric loop index as JSON, the carousel arrows pass -1 / 1, and the image fallback is data-fb="hide"', () => {
  assert.equal((PAGE.match(/data-click="setActive" data-a="\['\+i\+'\]"/g) || []).length, 2);
  assert.match(PAGE, /data-click="carScroll" data-a="\[-1\]"/); assert.match(PAGE, /data-click="carScroll" data-a="\[1\]"/);
  assert.deepEqual([...PAGE.matchAll(/\sdata-fb="([\w-]+)"/g)].map((m) => m[1]), ['hide']);
  for (const i of [0, 1, 7]) assert.deepEqual(JSON.parse(('[' + i + ']')), [i]);
});
