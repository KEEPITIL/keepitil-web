// Signed-in QA with a local mocked-Supabase harness (axe at 360 / 390 / 1280): /create-event (new and edit) had unlabeled fields, two aria-labels on plain divs, a default-blue Terms link on the dark page (2.06:1) and a skipped heading level.
// Run: node --test assets/js/create-event-a11y.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const h = fs.readFileSync(path.join(ROOT, 'create-event.html'), 'utf8');

test('every form control the harness flagged now has an accessible name', () => {
  assert.match(h, /<label for="starts_at">Starts \*<\/label><input id="starts_at"/);
  assert.match(h, /<label for="ends_at" style="display:flex;align-items:center;gap:8px">Ends/);
  assert.match(h, /<label for="title_font">Title font<\/label>\s*<select id="title_font">/);
  assert.match(h, /<label for="accent_color">Accent color<\/label>\s*<input id="accent_color"/);
  assert.match(h, /<span class="tzlab" id="orgLab">Hosting as<\/span><select id="orgSel" aria-labelledby="orgLab">/);
  assert.match(h, /<input class="t-start" type="datetime-local" step="900" aria-label="Sales start \(optional\)"\/>/);
  assert.match(h, /<input class="t-end" type="datetime-local" step="900" aria-label="Sales end \(optional\)"\/>/);
  // every label[for] points at an id that exists (no dangling association)
  for (const m of h.matchAll(/<label for="([^"]+)"/g)) assert.ok(h.includes('id="' + m[1] + '"'), 'label for=' + m[1]);
});
test('the two inline editors are textboxes (an aria-label is not allowed on a plain div); the summary is multi-line', () => {
  assert.match(h, /<div id="title-inline" contenteditable="true" role="textbox" spellcheck="false" aria-label="Event name">/);
  assert.match(h, /<div id="summary-inline" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" aria-label="Short summary">/);
  assert.doesNotMatch(h, /<div id="(?:title|summary)-inline" contenteditable="true" spellcheck/, 'NEGATIVE CONTROL: the old role-less form is gone');
});
test('the Terms link no longer uses the browser default blue on the dark page; the h1 is followed by an h2 before the h3 cards', () => {
  assert.match(h, /\.hint a\{color:inherit;font-weight:700;text-decoration:underline\}/);
  assert.match(h, /<h1 class="vh">Create an event<\/h1>\s*<h2 class="vh">Your event<\/h2>/);
});
