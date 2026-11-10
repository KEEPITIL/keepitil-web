import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('/create loads vs-app.js with the 2026-11-09 cache-bust so browsers fetch the slug-link fix', () => {
  const s = readFileSync(new URL('../create/index.html', import.meta.url), 'utf8');
  assert.equal((s.match(/vs-app\.js\?v=20261109a/g) || []).length, 1);
  assert.ok(!/vs-app\.js\?v=20260912a/.test(s));
});
