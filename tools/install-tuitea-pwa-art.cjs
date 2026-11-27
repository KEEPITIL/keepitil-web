#!/usr/bin/env node
'use strict';
// Installs the TUITEA gold-tree PWA art into the site (Grok 2026-11-24: Muse/Echo deliver 512, maskable 512 and apple-touch 180).
//   node tools/install-tuitea-pwa-art.cjs --icon-512 <png> --maskable-512 <png> --apple-touch-180 <png> [--icon-192 <png>] [--dry-run] [--root <dir>]
// It writes app/tuitea/icon-512.png, icon-maskable-512.png, apple-touch-icon.png and icon-192.png (the manifest and the install page point at these names, so no HTML or manifest edit is needed)
// and brand/tuitea/pwa-art.json (sha256 + size of each installed file; tests/tuitea-pwa-art.test.cjs pins it). Nothing is invented: it only copies art you hand it, after checking it.
// Checks: real PNG; exact pixel size (512x512, 512x512, 180x180, 192x192); the apple-touch icon is opaque (iOS paints transparency black); the bytes are NOT the green "T" placeholder.
// --icon-192 is optional: when omitted it is made from the 512 with macOS `sips` (a plain downscale); pass your own for the best result. The maskable art must keep its picture inside the central 80% (the safe zone); a person checks that, a script cannot.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// sha256 of the green "T" placeholder files that ship today (app/tuitea/*, 2026-11-24). Installing any of them again is refused.
const GREEN_T = new Set([
  'dc5aa9b6d2d8c3103a23b69c6b5882cfd1af52b1be0b8d4e1ed1a64737fdfa6d',   // icon-192.png
  '481a22f0db9ed680831795d5fe2be1817083b0ac52110ab0822f135e1c49b338',   // icon-512.png
  '56c6aba0be4e86cf436b51fefa5e2e5fa5f4fee571751fe1a3d08ee3b46eb031',   // icon-maskable-512.png
  'e0c05b4e1f34305b192169fb9e1b81fb70e57bf2b202c369e9fadda73a0eeadd',   // apple-touch-icon.png
]);
const TARGETS = {
  'icon-512': { dest: 'app/tuitea/icon-512.png', size: 512 },
  'maskable-512': { dest: 'app/tuitea/icon-maskable-512.png', size: 512 },
  'apple-touch-180': { dest: 'app/tuitea/apple-touch-icon.png', size: 180, opaque: true },
  'icon-192': { dest: 'app/tuitea/icon-192.png', size: 192 },
};
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function pngInfo(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a || buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG file');
  const colorType = buf[25];
  const hasAlpha = colorType === 4 || colorType === 6 || buf.includes(Buffer.from('tRNS'));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), hasAlpha };
}

function check(name, buf) {
  const t = TARGETS[name]; let i;
  try { i = pngInfo(buf); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  if (i.width !== t.size || i.height !== t.size) throw new Error(`${name}: must be ${t.size}x${t.size}, got ${i.width}x${i.height}`);
  if (t.opaque && i.hasAlpha) throw new Error(`${name}: must be opaque (no alpha channel / transparency): iOS paints transparent pixels black`);
  if (GREEN_T.has(sha(buf))) throw new Error(`${name}: these are the green "T" placeholder bytes, not the gold-tree art`);
  return { ...i, bytes: buf.length, sha256: sha(buf) };
}

function parse(argv) {
  const a = { dry: false, root: path.join(__dirname, '..'), files: {} };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry-run') a.dry = true;
    else if (k === '--root') a.root = path.resolve(argv[++i]);
    else if (['--icon-512', '--maskable-512', '--apple-touch-180', '--icon-192'].includes(k)) a.files[k.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

function main(argv) {
  const a = parse(argv);
  for (const need of ['icon-512', 'maskable-512', 'apple-touch-180']) if (!a.files[need]) throw new Error(`missing --${need} <png>`);
  const bufs = {};
  for (const [name, f] of Object.entries(a.files)) { if (!fs.existsSync(f)) throw new Error(`${name}: file not found: ${f}`); bufs[name] = fs.readFileSync(f); }
  if (!bufs['icon-192']) {
    const tmp = path.join(require('node:os').tmpdir(), `tuitea-192-${process.pid}.png`);
    try { execFileSync('sips', ['-z', '192', '192', a.files['icon-512'], '--out', tmp], { stdio: 'ignore' }); bufs['icon-192'] = fs.readFileSync(tmp); fs.unlinkSync(tmp); }
    catch (e) { throw new Error('icon-192: not given, and `sips` is not available to make it from the 512: pass --icon-192 <png>'); }
  }
  const info = {};
  for (const name of Object.keys(TARGETS)) info[name] = check(name, bufs[name]);
  const pin = { note: 'Installed by tools/install-tuitea-pwa-art.cjs. tests/tuitea-pwa-art.test.cjs pins these hashes; changing the art means running the installer again.', files: {} };
  for (const [name, t] of Object.entries(TARGETS)) pin.files[t.dest] = { sha256: info[name].sha256, bytes: info[name].bytes, width: info[name].width, height: info[name].height };
  if (a.dry) { console.log('dry run OK; would write:\n' + Object.keys(pin.files).map((f) => '  ' + f).join('\n') + '\n  brand/tuitea/pwa-art.json'); return pin; }
  for (const [name, t] of Object.entries(TARGETS)) { const d = path.join(a.root, t.dest); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, bufs[name]); }
  const pd = path.join(a.root, 'brand/tuitea/pwa-art.json'); fs.mkdirSync(path.dirname(pd), { recursive: true }); fs.writeFileSync(pd, JSON.stringify(pin, null, 2) + '\n');
  console.log('installed:\n' + Object.keys(pin.files).map((f) => '  ' + f).join('\n') + '\n  brand/tuitea/pwa-art.json');
  return pin;
}

if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); } }
module.exports = { main, pngInfo, GREEN_T };
