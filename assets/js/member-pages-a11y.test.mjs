// Signed-in QA (mocked-Supabase harness, 360 / 390 / 1280): /submit-event had three unlabeled controls and a skipped heading level; /settings at 360 px had its whole panel 24 px wider than the screen (clipped by overflow-x:hidden): the grid column was `1fr`, so the nowrap tab strip stretched it.
// Run: node --test assets/js/member-pages-a11y.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire as __cr } from 'node:module';
const __assemble = __cr(import.meta.url)('../../tests/helpers/event-assembled.cjs').assemble;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
test('/submit-event: Date, Duration and Start time are labelled; the Recent and Search card titles are level 2', () => {
  const h = __assemble(read('submit-event.html'));
  for (const [id, text] of [['date', 'Date \\*'], ['days', 'Duration'], ['time', 'Start time']]) { assert.match(h, new RegExp('<label for="' + id + '">' + text + '</label>')); assert.ok(h.includes('id="' + id + '"')); }
  assert.match(h, /<h3 aria-level="2">📋 Recent<\/h3>/); assert.match(h, /<h3 aria-level="2">🔎 Search<\/h3>/);
  assert.doesNotMatch(h, /<label>Date \*<\/label>/, 'NEGATIVE CONTROL: the unassociated label is gone');
});
test('/settings: the one-column phone layout uses minmax(0,1fr) so the scrolling tab strip cannot stretch the page past the screen (NEGATIVE CONTROL: a bare 1fr does)', () => {
  const h = __assemble(read('settings.html')), m = /@media\(max-width:760px\)\{([\s\S]*?)\n\}/.exec(h)[1];
  assert.match(m, /\.cols\{grid-template-columns:minmax\(0,1fr\)/); assert.doesNotMatch(m, /\.cols\{grid-template-columns:1fr[;}]/);
  assert.match(m, /\.snav\{[^}]*overflow-x:auto/, 'the strip scrolls inside its own box');
});
