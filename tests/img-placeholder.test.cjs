'use strict';
// Run: node --test tests/img-placeholder.test.cjs
// Grok 2026-11-24: images.ra.co answers 403, so imported thumbnails were broken-image icons (10 on /profile?slug=groove-trooper, 1 on the home page). An <img> that points at ANOTHER
// host and fails to load is swapped once for our own placeholder (keepitil-shell.js). Same-site and data: images are never touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'keepitil-shell.js'), 'utf8');
const PH = '/assets/images/event-placeholder.svg';
function block(src) { const a = src.indexOf('/* BROKEN OUTSIDE PICTURES'); const b = src.indexOf('/* Customer feedback widget'); assert.ok(a > 0 && b > a, 'the block exists'); return src.slice(a, b); }

function env(images = []) {
  const listeners = {}, onload = [];
  const document = { readyState: 'complete', images, addEventListener: (t, fn, cap) => { listeners[t] = { fn, cap }; } };
  const win = { addEventListener: (t, fn) => onload.push(fn) };
  const ctx = vm.createContext({ document, window: win, location: { href: 'https://keepitil.com/profile?slug=x', host: 'keepitil.com' }, URL, setTimeout: (f) => f() });
  return { ctx, listeners, document };
}
const img = (src, o = {}) => { const attrs = { src, srcset: o.srcset || null }; const classes = new Set(); return { tagName: 'IMG', get src() { return attrs.src; }, set src(v) { attrs.src = v; }, currentSrc: src, complete: !!o.complete, naturalWidth: o.w || 0, getAttribute: (k) => attrs[k] || null, removeAttribute: (k) => { attrs[k] = null; }, classList: { add: (c) => classes.add(c), has: (c) => classes.has(c) } }; };

test('an outside image that fails is swapped once for the placeholder; same-site and data: images are left alone', () => {
  const e = env(); vm.runInContext(block(shell), e.ctx);
  assert.equal(e.listeners.error.cap, true, 'capture-phase: sees every image, including ones added later');
  const ra = img('https://images.ra.co/abc.jpg', { srcset: 'x 2x' }); e.listeners.error.fn({ target: ra });
  assert.equal(ra.src, PH); assert.equal(ra.getAttribute('srcset'), null); assert.ok(ra.classList.has('kil-img-ph'));
  e.listeners.error.fn({ target: ra }); assert.equal(ra.src, PH, 'no loop if the placeholder itself fails (it is same-site)');
  // NEXUS2 on ra.co event pages: the page's own render sets the outside address back after the swap; that must be swapped AGAIN (a "swapped once" flag left #ev-flyer broken)
  ra.src = 'https://images.ra.co/abc.jpg'; e.listeners.error.fn({ target: ra }); assert.equal(ra.src, PH, 're-set to the outside address, then failing again: swapped again');
  for (let i = 0; i < 5; i++) { ra.src = 'https://images.ra.co/abc.jpg'; e.listeners.error.fn({ target: ra }); assert.equal(ra.src, PH, 'every time (' + i + ')'); }
  const own = img('https://keepitil.com/assets/x.jpg'), rel = img('/assets/y.jpg'), data = img('data:image/png;base64,AAAA'), notImg = { tagName: 'DIV' };
  for (const x of [own, rel, data]) { const before = x.src; e.listeners.error.fn({ target: x }); assert.equal(x.src, before); }
  assert.doesNotThrow(() => e.listeners.error.fn({ target: notImg })); assert.doesNotThrow(() => e.listeners.error.fn({}));
});

test('NEGATIVE CONTROL: with a "swapped once" flag, an image the page sets back to the outside address stays broken (the bug NEXUS2 found)', () => {
  const flagged = shell.replace("if(!img || img.tagName !== 'IMG') return;", "if(!img || img.tagName !== 'IMG' || img.__kilPh) return;").replace("img.removeAttribute('srcset'); img.src = PH;", "img.__kilPh = 1; img.removeAttribute('srcset'); img.src = PH;");
  assert.notEqual(flagged, shell);
  const e = env(); vm.runInContext(block(flagged), e.ctx); const ra = img('https://images.ra.co/abc.jpg');
  e.listeners.error.fn({ target: ra }); assert.equal(ra.src, PH); ra.src = 'https://images.ra.co/abc.jpg'; e.listeners.error.fn({ target: ra });
  assert.equal(ra.src, 'https://images.ra.co/abc.jpg', 'the flagged version leaves it broken: the real code does not');
});

test('the sweep after load catches outside images that already failed; working images, SVGs, same-site and not-yet-loaded ones are skipped', () => {
  const dead = img('https://images.ra.co/dead.jpg', { complete: true, w: 0 }), ok = img('https://seatgeekimages.com/ok.jpg', { complete: true, w: 300 }), lazy = img('https://images.ra.co/lazy.jpg', { complete: false }),
    svg = img('https://cdn.example.com/logo.svg', { complete: true, w: 0 }), own = img('/assets/z.png', { complete: true, w: 0 });
  const e = env([dead, ok, lazy, svg, own]); vm.runInContext(block(shell), e.ctx);
  assert.equal(dead.src, PH); for (const x of [ok, lazy, svg, own]) assert.notEqual(x.src, PH);
});

test('NEGATIVE CONTROL: without the "other host" check the same-site image would be swapped (the test above catches it)', () => {
  const broken = shell.replace("u.host !== location.host", 'true');
  assert.notEqual(broken, shell);
  const e = env(); vm.runInContext(block(broken), e.ctx); const own = img('https://keepitil.com/assets/x.jpg'); e.listeners.error.fn({ target: own }); assert.equal(own.src, PH);
});

test('the placeholder exists, is a self-contained SVG (no script, no external reference), and is small', () => {
  const f = path.join(root, 'assets/images/event-placeholder.svg'); const t = fs.readFileSync(f, 'utf8');
  assert.match(t, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/); assert.doesNotMatch(t, /<script|onload=|href=|xlink:|url\((?!#)|http:\/\/(?!www\.w3\.org)|https:\/\//i);
  assert.ok(fs.statSync(f).size < 2048); assert.match(shell, /assets\/images\/event-placeholder\.svg/);
});
