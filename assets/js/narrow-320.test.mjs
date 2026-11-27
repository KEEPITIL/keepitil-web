// 320 px sweep (iPhone SE class): the profile stats row ("N feed / N followers / N likes") ran 35 px past the screen, and /kode/'s feature cards were 7 px too wide (a bare 1fr grid column).   node --test assets/js/narrow-320.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire as __cr } from 'node:module';
const __assemble = __cr(import.meta.url)('../../tests/helpers/event-assembled.cjs').assemble;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
test('the profile stats row wraps instead of running off a narrow screen', () => {
  const h = __assemble(read('profile.html')); assert.match(h, /<div id="pfStatsRow" style="display:flex;flex-wrap:wrap;gap:6px 24px;font-size:\.96rem">/);
  assert.doesNotMatch(h, /<div id="pfStatsRow" style="display:flex;gap:24px/, 'NEGATIVE CONTROL: the nowrap row is gone');
});
test('/kode/: the one-column feature grid is minmax(0,1fr) and its children may shrink', () => {
  const h = read('kode/index.html'), m = /@media\(max-width:820px\)\{\.feature\{([^}]*)\}\.feature>\*\{min-width:0\}/.exec(h);
  assert.ok(m, 'rule present'); assert.match(m[1], /grid-template-columns:minmax\(0,1fr\)/); assert.doesNotMatch(m[1], /grid-template-columns:1fr[;}]/);
});
