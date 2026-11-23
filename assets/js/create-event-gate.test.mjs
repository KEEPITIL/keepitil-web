// /create-event is team-only (non-admins are sent to /submit-event). Its signed-out gate said
// "Free members can list events" with no way to do so from there (QA 2026-11-22, KEEPITIL 1.0
// plan section 1). The gate must point free members at /submit-event.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function gateOf(html) {
  const m = html.match(/<div class="gate" id="gate"[^>]*>([\s\S]*?)<\/div>/);
  return m ? m[1] : '';
}
export function gateOk(html) {
  const g = gateOf(html);
  return !!g && /<a\b[^>]*href="\/submit-event"/.test(g);
}

test('negative controls', () => {
  assert.equal(gateOk('<div class="gate" id="gate"><p>Free members can list events.</p><a href="/apply">x</a></div>'), false);
  assert.equal(gateOk('<div class="gate" id="gate"><p>Use <a href="/submit-event">Add your event</a>.</p></div>'), true);
  assert.equal(gateOk('<p><a href="/submit-event">x</a></p>'), false, 'a link outside the gate does not count');
});

test('create-event signed-out gate sends free members to /submit-event', () => {
  const html = fs.readFileSync(path.join(ROOT, 'create-event.html'), 'utf8');
  assert.ok(gateOf(html), 'gate block not found');
  assert.equal(gateOk(html), true);
});
