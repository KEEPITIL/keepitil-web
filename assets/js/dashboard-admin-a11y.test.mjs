// Signed-in QA (mocked-Supabase harness, axe at 360 / 390 / 1280, /dashboard?admin=1): the team-only panels had unlabeled selects and textareas, an active filter pill at 3.41:1 and a skipped heading level in Chat.
// Run: node --test assets/js/dashboard-admin-a11y.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const h = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('the admin selects and textareas have accessible names', () => {
  assert.match(h, /<select data-change="dashSocPlatform" data-a="\[&quot;\$el&quot;\]" aria-label="Platform"/);
  assert.match(h, /<select id="agentPick" aria-label="Agent to chat with"/);
  for (const id of ['kAgent', 'kShort', 'kFull']) { assert.match(h, new RegExp('<label for="' + id + '">')); assert.ok(h.includes('id="' + id + '"')); }
});
test('the active social filter pill reads at 4.5:1 (dark text on the accent), and the old white text did not (NEGATIVE CONTROL)', () => {
  const accent = /--accent:(#[0-9a-f]{6})/i.exec(h)[1];
  assert.match(h, /background:var\(--accent\);border-color:var\(--accent\);color:#0c0d1a/);
  assert.ok(ratio('#0c0d1a', accent) >= 4.5, 'dark on accent ' + ratio('#0c0d1a', accent).toFixed(2)); assert.ok(ratio('#ffffff', accent) < 4.5, 'white on accent ' + ratio('#ffffff', accent).toFixed(2));
});
test('the two Chat boxes are level-2 headings under the page h1', () => {
  assert.match(h, /<h3 aria-level="2">Chat with an agent<\/h3>/); assert.match(h, /<h3 aria-level="2">Crew group — activity \+ messages<\/h3>/);
});
