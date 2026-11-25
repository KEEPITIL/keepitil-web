// Web 100% checklist gap 11: /radio-tuner/ (internal tuning panel, no login) must not be in the published artifact, but must stay in the repo.
// NEGATIVE CONTROLS: the same check FAILS with the exclude file minus the radio-tuner line, and unrelated pages stay published.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExcludes, isExcluded } from '../../scripts/pages-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEXT = fs.readFileSync(path.join(ROOT, '.github/pages-exclude.txt'), 'utf8');

test('radio-tuner/ is excluded from the Pages artifact and still exists in the repo', () => {
  const rules = parseExcludes(TEXT);
  assert.equal(isExcluded('radio-tuner/index.html', rules), true);
  assert.ok(fs.existsSync(path.join(ROOT, 'radio-tuner/index.html')), 'the tool stays in the repo');
});
test('negative control: without the radio-tuner line the page would be published', () => {
  const without = TEXT.split('\n').filter((l) => l.trim() !== 'radio-tuner/').join('\n');
  assert.equal(isExcluded('radio-tuner/index.html', parseExcludes(without)), false);
});
test('negative control: the real radio and home pages are not excluded', () => {
  const rules = parseExcludes(TEXT);
  for (const f of ['index.html', 'radio/index.html', 'discover/index.html', 'assets/js/keepitil-radio.js']) assert.equal(isExcluded(f, rules), false, f);
});
test('robots.txt keeps the Disallow line for /radio-tuner/', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'), /^Disallow: \/radio-tuner\/$/m);
});
