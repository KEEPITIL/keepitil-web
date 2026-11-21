// Guard: the cancelled "Season 0" competition must not be advertised by the site.
//
// keepitil.com is served with .nojekyll, so every tracked file not excluded by
// .github/pages-exclude.txt is public. This test scans exactly that served set:
//   1. no served .html file contains "Season 0" or "Finale Voting Pass";
//   2. no served .js/.mjs file renders a "Finale Voting Pass" label;
//   3. NEGATIVE CONTROL: the same scanner, pointed at a synthetic tree holding the copy this
//      change removed (the about.html line and the vs-app.js pass line), DOES report it, and an
//      excluded path holding the same text is NOT reported.
// Season 0's headline, description and rules live on the vs_competitions row (id 82), not in
// this repo; they leave the site when that row stops being listed by vs_open_competitions().
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExcludes, isExcluded, walk } from '../../scripts/pages-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RULES = parseExcludes(fs.readFileSync(path.join(ROOT, '.github/pages-exclude.txt'), 'utf8'));

const HTML_BANNED = [/season[\s -]*0(?![0-9])/i, /season&nbsp;0(?![0-9])/i, /finale\s+voting\s+pass/i];
const JS_BANNED = [/finale\s+voting\s+pass/i];

function scan(root, rules) {
  const hits = [];
  for (const rel of walk(root, ['node_modules'])) {
    if (isExcluded(rel, rules)) continue;
    const banned = /\.html?$/i.test(rel) ? HTML_BANNED : /\.m?js$/i.test(rel) && !/\.test\.m?js$/i.test(rel) ? JS_BANNED : null;
    if (!banned) continue;
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const re of banned) if (re.test(text)) hits.push(`${rel}: ${re}`);
  }
  return hits;
}

test('no served HTML mentions Season 0 or the Finale Voting Pass', () => {
  const hits = scan(ROOT, RULES).filter((h) => /\.html?:/i.test(h));
  assert.deepEqual(hits, []);
});

test('no served script renders a Finale Voting Pass label', () => {
  const hits = scan(ROOT, RULES).filter((h) => /\.m?js:/i.test(h));
  assert.deepEqual(hits, []);
});

test('the scan covers the pages that carried the copy', () => {
  const served = walk(ROOT, ['node_modules']).filter((r) => !isExcluded(r, RULES));
  for (const f of ['about.html', 'create/index.html', 'vs-app.js']) assert.ok(served.includes(f), f + ' is served');
});

test('NEGATIVE CONTROL: the scanner reports the removed copy and skips excluded paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no-season0-'));
  try {
    fs.writeFileSync(path.join(tmp, 'about.html'),
      '<li>Live events and competitions, including Original Song Season 0</li>');
    fs.writeFileSync(path.join(tmp, 'vs-app.js'),
      "x += '<p><b>Finale Voting Pass.</b> '+h(sc.finale_pass_note)+'</p>';");
    fs.writeFileSync(path.join(tmp, 'clean.html'), '<p>Season 01 and Season 10 are other things.</p>');
    fs.mkdirSync(path.join(tmp, 'private'));
    fs.writeFileSync(path.join(tmp, 'private', 'old.html'), '<p>Season 0</p>');
    const hits = scan(tmp, parseExcludes('private/\n'));
    assert.equal(hits.filter((h) => h.startsWith('about.html:')).length, 1);
    assert.equal(hits.filter((h) => h.startsWith('vs-app.js:')).length, 1);
    assert.equal(hits.filter((h) => h.startsWith('clean.html:')).length, 0);
    assert.equal(hits.filter((h) => h.startsWith('private/')).length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
