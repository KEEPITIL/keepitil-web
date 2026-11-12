import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('/create loads vs-app.js with the 2026-11-11 cache-bust so browsers fetch the #165 mobile fixes', () => {
  const s = readFileSync(new URL('../create/index.html', import.meta.url), 'utf8');
  assert.equal((s.match(/vs-app\.js\?v=20261111b/g) || []).length, 1);
  assert.ok(!/vs-app\.js\?v=(20260912a|20261109a)/.test(s));
});
