/*
 * a11y found by the axe runs while migrating inline handlers: kode/app.html (contrast x2, no main / h1, 37 nodes outside landmarks) and organizers/dashboard.html
 * (no main / h1, content outside landmarks). Landmarks + one h1 per visible view, and AA contrast for the two colours.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const K = readFileSync(join(root, 'kode/app.html'), 'utf8'), O = readFileSync(join(root, 'organizers/dashboard.html'), 'utf8');
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const count = (h, re) => (h.match(re) || []).length;

test('kode/app.html: the two flagged colours read at 4.5:1 on white, and the old ones did not (NEGATIVE CONTROL)', () => {
  const del = /\.post \.acts \.del\{border-color:var\(--danger\);color:(#[0-9a-f]{6})\}/i.exec(K)[1];
  const upload = /<label for="media_file"[^>]*color:(#[0-9a-f]{6});border:1\.5px dashed/i.exec(K)[1];
  assert.ok(ratio(del, '#ffffff') >= 4.5, 'delete ' + ratio(del, '#ffffff').toFixed(2)); assert.ok(ratio(upload, '#ffffff') >= 4.5, 'upload label ' + ratio(upload, '#ffffff').toFixed(2));
  assert.ok(ratio('#e5484d', '#ffffff') < 4.5); assert.ok(ratio('#2ee6ff', '#ffffff') < 4.5);
});
test('kode/app.html: one <main> around every view, a <header> for the top bar, an h1 for the queue view (the auth and handle views have their own)', () => {
  assert.equal(count(K, /<main\b/g), 1); assert.equal(count(K, /<\/main>/g), 1); assert.equal(count(K, /<header class="topbar">/g), 1); assert.equal(count(K, /<\/header>/g), 1);
  assert.ok(K.indexOf('<main class="wrap">') < K.indexOf('id="view-auth"') && K.indexOf('id="view-loading"') < K.indexOf('</main>'));
  assert.match(K, /<div class="view" id="view-app">\s*<h1 class="sr-only">Your post queue<\/h1>/); assert.match(K, /<h1>Your queue is waiting<\/h1>/); assert.match(K, /<h1>Claim your handle<\/h1>/);
  assert.match(K, /\.sr-only\{position:absolute;width:1px;height:1px/);
});
test('organizers/dashboard.html: a <main> in the sign-in screen and in the dashboard, a header, a labelled nav, an h1 in each', () => {
  assert.equal(count(O, /<main\b/g), 2); assert.equal(count(O, /<\/main>/g), 2);
  assert.match(O, /<main class="auth-box">/); assert.match(O, /<h1 style="[^"]*">Organizer Portal<\/h1>/); assert.match(O, /<main class="main-panel">\s*<h1 class="sr-only">Organizer dashboard<\/h1>/);
  assert.equal(count(O, /<header class="top-bar">/g), 1); assert.equal(count(O, /<\/header>/g), 1); assert.equal(count(O, /<nav class="sidebar" aria-label="Dashboard sections">/g), 1); assert.equal(count(O, /<\/nav>/g), 1);
  assert.match(O, /\.sr-only\{position:absolute;width:1px;height:1px/);
});
test('the converted containers are balanced: every <div> opened inside the dashboard screen is still closed (the wrapper tags changed, not the nesting)', () => {
  for (const [name, h] of [['kode', K], ['organizers', O]]) {
    const body = h.slice(h.indexOf('<body'), h.indexOf('<script src="https://cdn.jsdelivr.net/npm/@supabase'));
    const open = count(body.replace(/<!--[\s\S]*?-->/g, ''), /<div\b/g), close = count(body.replace(/<!--[\s\S]*?-->/g, ''), /<\/div>/g);
    assert.equal(open, close, name + ' div balance');
  }
});
