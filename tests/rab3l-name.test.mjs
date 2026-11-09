import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = readFileSync(new URL('../article/artist/rab3l/index.html', import.meta.url), 'utf8');
test('RAB3L article uses "Ricardo / RAB3L" and no longer prints the legal name', () => {
  assert.ok(!/Mentado|Bryan/.test(s));
  assert.ok(s.includes('<strong>Ricardo / RAB3L</strong> has been'));
  assert.match(s, /"about":\{"@type":"Person","name":"Ricardo \/ RAB3L","alternateName":"RAB3L"/);
  assert.equal((s.match(/name="description" content="Ricardo \/ RAB3L has been/g) || []).length, 1);
});
test('JSON-LD blocks still parse', () => {
  for (const m of s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
});
