// Web 100% checklist item 10 (a11y), re-checked live with axe 4.10 in real Chrome on 2026-11-25: the labels, the headings, the main landmark and the contrast that still failed.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const __A = require("./helpers/event-assembled.cjs").assemble;
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hasLabelFor = (html, id) => new RegExp('<label[^>]*\\bfor="' + id + '"').test(html);
const count = (html, re) => (html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').match(re) || []).length;

test('venue: the booking Room and Date fields are labelled (label for=), the old unlabelled markup would fail (NEGATIVE CONTROL)', () => {
  const v = R('venue.html'); assert.ok(hasLabelFor(v, 'bRoom') && hasLabelFor(v, 'bDate'));
  const old = '<div><label>Room</label><select id="bRoom"></select></div><div><label>Preferred date</label><input type="date" id="bDate"/></div>';
  assert.ok(!hasLabelFor(old, 'bRoom') && !hasLabelFor(old, 'bDate'));
});
test('create-event and tickets: exactly one <main>, and a heading level 1 in every view (gate, empty, form / ticket)', () => {
  const c = R('create-event.html'), t = R('tickets.html');
  for (const [n, h] of [['create-event', c], ['tickets', t]]) assert.equal(count(h, /<main\b/g), 1, n + ': one main');
  assert.match(c, /<h1>Log in to create an event<\/h1>/); assert.match(c, /<form id="form"[^>]*>\s*<h1 class="vh">Create an event<\/h1>/); assert.doesNotMatch(c, /<h2>Log in to create an event<\/h2>/);
  assert.match(t, /<h1>Log in to see your ticket<\/h1>/); assert.match(t, /<h1>No tickets yet<\/h1>/); assert.match(t, /'<h1>'\+esc\(e\.title/);
  assert.doesNotMatch(t.replace(/<!--[\s\S]*?-->/g, ''), /<h2>(Log in to see your ticket|No tickets yet)<\/h2>/);
});
test('submit-event and venue: one <main> now (landmark-one-main)', () => { for (const f of ['submit-event.html', 'venue.html']) assert.equal(count(R(f), /<main\b/g), 1, f); });
test('discover: the "Submit an event" link is styled for the dark page (contrast >= 4.5) instead of the browser default #0000ee (2.1, NEGATIVE CONTROL)', () => {
  const css = R('assets/css/discover.css'); const m = css.match(/\.disc-note a\{color:(#[0-9a-f]{6})/i); assert.ok(m, 'the rule exists');
  assert.ok(ratio(m[1], '#0a0a0f') >= 4.5, 'contrast ' + ratio(m[1], '#0a0a0f').toFixed(2));
  assert.ok(ratio('#0000ee', '#0a0a0f') < 3, 'the old default was ' + ratio('#0000ee', '#0a0a0f').toFixed(2));
});
test('profile: html has the same dark background the fixed backdrop falls back to, so a checker (and a slow image) never sees white under the light text', () => {
  const p = __A(R('profile.html')); const h = p.match(/\nhtml\{background:(#[0-9a-f]{6});\}/i); assert.ok(h, 'html background rule'); const fb = p.match(/body::before\{[^}]*\) center center\/cover no-repeat (#[0-9a-f]{6})/i);
  assert.ok(fb && fb[1].toLowerCase() === h[1].toLowerCase(), 'same colour as the backdrop fallback'); assert.ok(ratio('#f0f0f0', h[1]) >= 12, 'text on it is readable');
  assert.ok(ratio('#f0f0f0', '#ffffff') < 1.2, 'on white (what the checker saw) it was 1.13');
});
