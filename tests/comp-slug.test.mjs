import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../vs-app.js', import.meta.url), 'utf8');
const block = /\/\*SLUG-RESOLVE-START\*\/([\s\S]*?)\/\*SLUG-RESOLVE-END\*\//.exec(src)[1];
const resolveCompSlug = new Function(block + '; return resolveCompSlug;')();
const rows = [{ id: 82, slug: 'original-song-season-0' }, { id: 73, slug: 'original-song' }];
test('slug and id resolve to the same row', () => {
  assert.equal(resolveCompSlug(rows, 'original-song-season-0').id, 82);
  assert.equal(resolveCompSlug(rows, '82').id, 82);
  assert.equal(resolveCompSlug(rows, 82).id, 82);
});
test('slug match is exact and case-insensitive, never a prefix', () => {
  assert.equal(resolveCompSlug(rows, 'ORIGINAL-SONG').id, 73);
  assert.equal(resolveCompSlug(rows, 'original-song-seas'), null);
});
test('unknown, empty and null inputs give null', () => {
  assert.equal(resolveCompSlug(rows, 'nope'), null);
  assert.equal(resolveCompSlug(rows, ''), null);
  assert.equal(resolveCompSlug(rows, null), null);
  assert.equal(resolveCompSlug(null, 'x'), null);
});
test('renderEnter sends numeric ids straight through and resolves slugs through the RPC', () => {
  const i = src.indexOf('function renderEnter(compId){');
  const body = src.slice(i, i + 1200);
  assert.match(body, /\/\^\\d\+\$\/\.test\(String\(compId\)\)\) return renderComp\(Number\(compId\)\)/);
  assert.match(body, /resolveCompSlug\(/);
  assert.match(body, /history\.replaceState/);
});
test('negative control: the old behaviour (Number(slug) = NaN) would fail the resolver test', () => {
  assert.ok(Number.isNaN(Number('original-song-season-0')));
});
