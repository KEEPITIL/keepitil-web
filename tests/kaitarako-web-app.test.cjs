// node --test tests/kaitarako-web-app.test.cjs
// KAI web parity (option B): app/kaitarako/ serves the same build as the iPhone app (kai-tarako repo, v1 tip).
// Its service worker replaces the old one, removes ONLY Kai Tarako's old caches (the old cached art included),
// and never touches other KEEPITIL apps' caches or requests outside its own scope.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'app', 'kaitarako');
const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

test('the web app is present and is the v1 build', () => {
  assert.match(html, /<div id="root">/);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /connect-src 'self'[;"]/); // no backend configured until launch
  assert.ok(fs.existsSync(path.join(dir, 'manifest.webmanifest')));
});

test('worker: removes only old kai-tarako-* caches, stays in its own scope, works offline (ignoreVary)', () => {
  assert.match(sw, /k\.startsWith\('kai-tarako-'\) && k !== CACHE/);
  assert.match(sw, /req\.url\.startsWith\(self\.registration\.scope\)/);
  assert.match(sw, /ignoreVary: true/);
  assert.doesNotMatch(sw, /caches\.delete\(k\)\)\)\)\.then\(\(\) => self\.registration\.unregister/);
});

test('every file the worker precaches exists', () => {
  const list = JSON.parse(/const PRECACHE = (\[[^\]]*\]);/.exec(sw)[1]);
  for (const f of list) {
    const p = f === './' ? 'index.html' : f.replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(dir, p)), f);
  }
});

test('no photo-style Kai art and no trackers in the shipped files', () => {
  const walk = (d) => fs.readdirSync(d).flatMap((f) => (fs.statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
  const files = walk(dir);
  assert.ok(!files.some((f) => /\.(jpe?g|webp)$/i.test(f)), 'no raster photo-style art');
  for (const f of files.filter((x) => /\.(js|html|css)$/.test(x))) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /googletagmanager|google-analytics|fbq\(|mixpanel|segment\.io|hotjar/i, f);
  }
});
