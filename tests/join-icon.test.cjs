'use strict';
// Run: node --test tests/join-icon.test.cjs
// Joe 2026-11-21: TUITEA invites use ONLY the TUITEA icon and backgrounds. The join page (keepitil.com/join/, where an invite link lands when the app does not catch it) shows
// the TUITEA GOLD TREE icon (app/tuitea/invite/tuitea_icon_256.png), never the green "T" placeholder (app/tuitea/icon-192.png) or the leaf icon.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'join/index.html'), 'utf8');
const GOLD = 'https://keepitil.com/app/tuitea/invite/tuitea_icon_256.png';
const GOLD_SHA = 'e18ce0e608410296b8ef98a0f186b59971c136f323d3d0810ba4d76e703628e4';
const PLACEHOLDER_T = /\/app\/tuitea\/(icon-192|icon-512|icon-maskable-512|apple-touch-icon)\.png/;

function iconUrls(html) {
  return {
    favicon: (html.match(/<link rel="icon" href="([^"]+)"/) || [])[1],
    touch: (html.match(/<link rel="apple-touch-icon" href="([^"]+)"/) || [])[1],
    img: (html.match(/<img class="icon" src="([^"]+)"/) || [])[1],
  };
}

test('the join page icon, favicon and apple-touch icon are the TUITEA gold tree', () => {
  const u = iconUrls(page);
  assert.equal(u.img, GOLD); assert.equal(u.favicon, GOLD); assert.equal(u.touch, GOLD);
});

test('no placeholder "T" icon URL is left anywhere on the join page', () => {
  assert.doesNotMatch(page, PLACEHOLDER_T);
});

test('the icon file is pinned: the 256x256 gold tree PNG, byte for byte (changing the art needs the owner and this hash)', () => {
  const f = path.join(root, 'app/tuitea/invite/tuitea_icon_256.png'); const b = fs.readFileSync(f);
  assert.equal(crypto.createHash('sha256').update(b).digest('hex'), GOLD_SHA);
  assert.equal(b.readUInt32BE(16), 256); assert.equal(b.readUInt32BE(20), 256);   // PNG IHDR width, height
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('NEGATIVE CONTROL: the old page (placeholder T icon) is caught by the same checks', () => {
  const old = page.split(GOLD).join('https://keepitil.com/app/tuitea/icon-192.png');
  assert.notEqual(iconUrls(old).img, GOLD); assert.match(old, PLACEHOLDER_T);
  const wrongFile = Buffer.from('not the gold tree'); assert.notEqual(crypto.createHash('sha256').update(wrongFile).digest('hex'), GOLD_SHA);
});
