// Pinch-zoom stays on (Joe's decision): no non-game page may lock zoom in its viewport meta.
// Games (games/), the Flutter apps (app/, apps/) are out of scope until Joe decides about game screens;
// games/kmob/ and app/tuitea/ are never edited from this repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const OUT_OF_SCOPE = /^(games|app|apps)\//;
const LOCK = /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0+)?\s*(,|$)/i;

const pages = execSync('git ls-files "*.html"', { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !OUT_OF_SCOPE.test(f));

test('the scan sees the site pages', () => {
  assert.ok(pages.length > 50, `only ${pages.length} pages found`);
  assert.ok(pages.includes('index.html'));
});

test('no non-game page sets user-scalable=no or maximum-scale=1', () => {
  const offenders = [];
  for (const f of pages) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<meta\s+name=["']viewport["']\s+content=["']([^"']*)["']/gi)) {
      if (LOCK.test(m[1])) offenders.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [], 'these pages block pinch-zoom');
});

test('the pattern really catches the locks it is meant to (guards against a weak test)', () => {
  for (const bad of ['width=device-width,maximum-scale=1', 'user-scalable=no', 'user-scalable=no.0', 'maximum-scale=1.0, user-scalable=0'])
    assert.match(bad, LOCK, bad);
  for (const ok of ['width=device-width,initial-scale=1,viewport-fit=cover', 'maximum-scale=5'])
    assert.doesNotMatch(ok, LOCK, ok);
});
