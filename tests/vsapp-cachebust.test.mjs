import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('/create loads vs-app.js with the 2026-11-20 cache-bust so browsers fetch the Season 0 copy removal', () => {
  const s = readFileSync(new URL('../create/index.html', import.meta.url), 'utf8');
  assert.equal((s.match(/vs-app\.js\?v=20261120a/g) || []).length, 1);
  assert.ok(!/vs-app\.js\?v=20260912a/.test(s));
  assert.ok(!/vs-app\.js\?v=20261109a/.test(s));
});
