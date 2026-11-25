'use strict';
// Run: node --test tests/tuitea-pwa-art.test.cjs
// The TUITEA installed-app icons (PWA manifest + apple-touch icon) must be the owner's gold-tree art, not the green "T" placeholder (Joe's every-app-branded rule; Grok 2026-11-24).
// Tests 1-3 are RED on purpose until Muse/Echo's art is installed with tools/install-tuitea-pwa-art.cjs; tests 4-9 test the installer itself with generated PNGs and are green now.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { GREEN_T } = require('../tools/install-tuitea-pwa-art.cjs');

const root = path.join(__dirname, '..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rd = (p) => fs.readFileSync(path.join(root, p));
const INSTALLED = ['app/tuitea/icon-192.png', 'app/tuitea/icon-512.png', 'app/tuitea/icon-maskable-512.png', 'app/tuitea/apple-touch-icon.png'];

// every icon file the manifest and the install page point at
function referencedIcons() {
  const m = JSON.parse(rd('app/tuitea/manifest.webmanifest').toString());
  const html = rd('app/tuitea/index.html').toString().split('</head>')[0];
  const out = new Set(m.icons.map((i) => path.posix.join('app/tuitea', i.src)));
  for (const h of html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)) out.add(h[1].replace(/^\//, ''));
  return [...out];
}

test('1. the manifest and the install page do not reference any green-T placeholder file', () => {
  const bad = referencedIcons().filter((p) => fs.existsSync(path.join(root, p)) && GREEN_T.has(sha(rd(p))));
  assert.deepEqual(bad, [], 'still the green T placeholder: install the gold-tree art with tools/install-tuitea-pwa-art.cjs');
});

test('2. the four installed icon files are not the green T placeholder', () => {
  assert.deepEqual(INSTALLED.filter((p) => GREEN_T.has(sha(rd(p)))), []);
});

test('3. once the gold-tree art is installed, brand/tuitea/pwa-art.json pins every installed file (sha256, size)', () => {
  assert.ok(fs.existsSync(path.join(root, 'brand/tuitea/pwa-art.json')), 'brand/tuitea/pwa-art.json is written by the installer');
  const pin = JSON.parse(rd('brand/tuitea/pwa-art.json').toString());
  for (const p of INSTALLED) { assert.ok(pin.files[p], p + ' is pinned'); assert.equal(sha(rd(p)), pin.files[p].sha256, p + ' changed since it was pinned'); }
});

// ---- the installer, with generated PNGs (never touches the repo: --root points at a temp dir)
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
function png(w, h, { alpha = false, seed = 1 } = {}) {
  const bpp = alpha ? 4 : 3, rows = []; for (let y = 0; y < h; y++) { const r = Buffer.alloc(1 + w * bpp); for (let x = 0; x < w; x++) { r[1 + x * bpp] = (x + seed) & 255; r[2 + x * bpp] = (y * 3 + seed) & 255; r[3 + x * bpp] = seed * 7 & 255; if (alpha) r[4 + x * bpp] = 255; } rows.push(r); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tuitea-art-'));
function run(args, cwd) { return spawnSync(process.execPath, [path.join(root, 'tools/install-tuitea-pwa-art.cjs'), ...args], { encoding: 'utf8', cwd }); }
function inputs(dir, over = {}) {
  const f = { 'icon-512': png(512, 512, { seed: 2 }), 'maskable-512': png(512, 512, { seed: 3 }), 'apple-touch-180': png(180, 180, { seed: 4 }), 'icon-192': png(192, 192, { seed: 5 }), ...over };
  const a = []; for (const [k, b] of Object.entries(f)) { const p = path.join(dir, k + '.png'); fs.writeFileSync(p, b); a.push('--' + k, p); } return a;
}

test('4. the installer copies valid gold-tree-sized art to the four site names and pins it', () => {
  const d = tmp(), site = tmp(); const r = run([...inputs(d), '--root', site]); assert.equal(r.status, 0, r.stderr);
  const pin = JSON.parse(fs.readFileSync(path.join(site, 'brand/tuitea/pwa-art.json'), 'utf8'));
  for (const p of INSTALLED) { const b = fs.readFileSync(path.join(site, p)); assert.equal(pin.files[p].sha256, sha(b)); assert.ok(!GREEN_T.has(sha(b))); }
  assert.equal(pin.files['app/tuitea/apple-touch-icon.png'].width, 180); assert.equal(pin.files['app/tuitea/icon-maskable-512.png'].height, 512);
});

test('5. NEGATIVE CONTROL: a wrong size is refused and nothing is written', () => {
  const d = tmp(), site = tmp(); const r = run([...inputs(d, { 'icon-512': png(256, 256) }), '--root', site]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /icon-512: must be 512x512, got 256x256/); assert.ok(!fs.existsSync(path.join(site, 'app')), 'nothing written');
});

test('6. NEGATIVE CONTROL: a transparent apple-touch icon is refused (iOS paints it black)', () => {
  const d = tmp(), site = tmp(); const r = run([...inputs(d, { 'apple-touch-180': png(180, 180, { alpha: true }) }), '--root', site]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /apple-touch-180: must be opaque/);
});

test('7. NEGATIVE CONTROL: the green T placeholder bytes are refused as input, and so is a non-PNG', () => {
  const d = tmp(), site = tmp(); const green = rd('app/tuitea/icon-512.png');
  if (GREEN_T.has(sha(green))) { const r = run([...inputs(d, { 'icon-512': green }), '--root', site]); assert.notEqual(r.status, 0); assert.match(r.stderr, /green "T" placeholder/); }
  const r2 = run([...inputs(d, { 'maskable-512': Buffer.from('not a png at all, just text bytes here....') }), '--root', site]); assert.notEqual(r2.status, 0); assert.match(r2.stderr, /maskable-512: not a PNG/);
});

test('8. a missing argument or file is a clear error; --dry-run checks everything and writes nothing', () => {
  const d = tmp(), site = tmp(); const a = inputs(d);
  assert.match(run(a.slice(0, 4).concat(['--root', site])).stderr, /missing --/);
  assert.match(run(['--icon-512', path.join(d, 'nope.png'), '--maskable-512', path.join(d, 'nope.png'), '--apple-touch-180', path.join(d, 'nope.png'), '--root', site]).stderr, /file not found/);
  const r = run([...a, '--dry-run', '--root', site]); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /dry run OK/); assert.ok(!fs.existsSync(path.join(site, 'app')));
});

test('9. a repeated install is byte-identical, and after installing generated art tests 1-3 style checks pass on the temp site', () => {
  const d = tmp(), s1 = tmp(), s2 = tmp(); const a = inputs(d);
  assert.equal(run([...a, '--root', s1]).status, 0); assert.equal(run([...a, '--root', s2]).status, 0);
  assert.equal(fs.readFileSync(path.join(s1, 'brand/tuitea/pwa-art.json'), 'utf8'), fs.readFileSync(path.join(s2, 'brand/tuitea/pwa-art.json'), 'utf8'));
  for (const p of INSTALLED) assert.ok(!GREEN_T.has(sha(fs.readFileSync(path.join(s1, p)))));
});
