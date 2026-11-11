// 15B: camera QR decoding for browsers WITHOUT BarcodeDetector (iPhone Safari) via the vendored jsQR.
// Offline. Real door.html + real kil-door-scanner.js + the REAL vendored jsQR in jsdom; the camera is a fake video whose frames are
// generated QR images (the repo's own vendored qrcode.js encoder, the one the ticket pages use, is the independent ENCODER; jsQR only decodes).
// NEGATIVE CONTROLS are marked NC.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as adapter from './kil-door-scan-adapter.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DOOR_HTML = read('door.html');
const SCANNER_SRC = read('assets/js/kil-door-scanner.js');
const JSQR_PATH = 'assets/js/vendor/jsqr/jsQR.js';
const JSQR_SRC = read(JSQR_PATH);
const Scanner = require('./kil-door-scanner.js');
const jsQR = require('./vendor/jsqr/jsQR.js');
const qrcode = require('./vendor/qrcode.js'); // encoder only (already shipped for the ticket pages); NOT a new dependency
const ANON = /key:'([^']+)'/.exec(DOOR_HTML)[1];
const USER_TOKEN = 'user.session.access-token-FAKE';
const SESSION = { access_token: USER_TOKEN, user: { email: 'owner@example.invalid' } };
const TOKEN = '0123456789abcdef0123456789abcdef';
const OK = { ok: true, result: 'admitted', event_title: 'Doors Open', tier: 'VIP', qty: 2, checked_in_at: '2026-11-09T22:45:28-08:00' };
const tick = (n = 8) => new Promise((r) => { let i = 0; (function go() { if (++i >= n) r(); else setTimeout(go, 0); })(); });

// ---------------- QR image generation (RGBA, with scale + quiet zone) ----------------
function genQR(text, { scale = 6, quiet = 4, ec = 'M', invert = false } = {}) {
  const qr = qrcode(0, ec); qr.addData(text, 'Byte'); qr.make();
  const n = qr.getModuleCount(), side = (n + quiet * 2) * scale, data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const mx = Math.floor(x / scale) - quiet, my = Math.floor(y / scale) - quiet;
    let dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.isDark(my, mx);
    if (invert) dark = !dark;
    const v = dark ? 0 : 255, i = (y * side + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width: side, height: side };
}
/* place a (small) image in the middle of a bigger gray "camera frame", like a ticket held in front of a lens */
function inFrame(img, W, H, bg = 128) {
  const data = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = bg; data[i + 3] = 255; }
  const ox = Math.floor((W - img.width) / 2), oy = Math.floor((H - img.height) / 2);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) { const s = (y * img.width + x) * 4, d = ((y + oy) * W + x + ox) * 4; for (let k = 0; k < 4; k++) data[d + k] = img.data[s + k]; }
  return { data, width: W, height: H };
}
function blank(W, H, v = 255) { const data = new Uint8ClampedArray(W * H * 4); data.fill(v); for (let i = 3; i < data.length; i += 4) data[i] = 255; return { data, width: W, height: H }; }
function noise(W, H, seed = 12345) { // deterministic PRNG
  let s = seed >>> 0; const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const v = s >>> 24; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
  return { data, width: W, height: H };
}
const hex32 = (seed) => { let s = seed >>> 0, o = ''; for (let i = 0; i < 32; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; o += ((s >>> 16) & 15).toString(16); } return o; };

// ============ pure decode ============
test('GENERATED QR: raw 32-hex token and KIL- prefixed token decode to the EXACT text (several scales / error-correction levels / tokens)', () => {
  const cases = [];
  for (const tok of [TOKEN, hex32(1), hex32(2), hex32(3), 'ffffffffffffffffffffffffffffffff', '00000000000000000000000000000000']) {
    for (const text of [tok, 'KIL-' + tok]) cases.push(text);
  }
  for (const text of cases) for (const scale of [3, 4, 6, 8]) for (const ec of ['L', 'M', 'Q']) {
    const img = genQR(text, { scale, ec });
    assert.equal(Scanner.decodeFrame(img, jsQR), text, 'scale ' + scale + ' ec ' + ec + ' ' + text);
  }
});
test('GENERATED QR: the decoded text goes through the real localParse to the same token the 15A page sends', () => {
  for (const text of [TOKEN, 'KIL-' + TOKEN]) {
    const t = Scanner.decodeFrame(genQR(text), jsQR); const r = Scanner.localParse(t, adapter);
    assert.equal(r.kind, 'ok'); assert.equal(r.token, TOKEN); assert.deepEqual(r.request.args, { p_qr_token: TOKEN });
  }
});
test('decodeFrame: blank, noisy, uniform-dark and malformed frames => null, and it never throws', () => {
  for (const img of [blank(320, 240), blank(320, 240, 0), noise(320, 240), noise(640, 480, 99), { data: new Uint8ClampedArray(0), width: 0, height: 0 }, null, undefined, {}, { data: [1, 2], width: 5, height: 5 }]) {
    assert.equal(Scanner.decodeFrame(img, jsQR), null);
  }
  assert.equal(Scanner.decodeFrame(genQR(TOKEN), () => { throw new Error('boom'); }), null);
  assert.equal(Scanner.decodeFrame(genQR(TOKEN), null), null);
  assert.equal(Scanner.decodeFrame(genQR(TOKEN), () => ({ data: 42 })), null, 'a non-string result is not a code');
  assert.equal(Scanner.decodeFrame(genQR(TOKEN), () => ({ data: '' })), null, 'an empty result is not a code');
});
test("inversionAttempts is 'dontInvert' (documented choice): dark-on-light decodes, light-on-dark does not, and options are passed through", () => {
  assert.equal(Scanner.JSQR_OPTIONS.inversionAttempts, 'dontInvert');
  assert.equal(Scanner.decodeFrame(genQR(TOKEN), jsQR), TOKEN);
  assert.equal(Scanner.decodeFrame(genQR(TOKEN, { invert: true }), jsQR), null);
  let seen; Scanner.decodeFrame(genQR(TOKEN), (d, w, h, o) => { seen = { w, h, o }; return null; }); assert.deepEqual(seen.o, { inversionAttempts: 'dontInvert' });
});

// ============ page harness: real door.html, real scanner, real jsQR (delivered through the real lazy loader), fake camera frames ============
function fakeCanvasFactory(rec) {
  return () => {
    const c = { width: 0, height: 0, getContext() {
      return {
        drawImage(video, dx, dy, w, h) { rec.draws++; const f = video.__frame; if (!f) return; this.buf = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(f.width - 1, Math.floor(x * f.width / w)), sy = Math.min(f.height - 1, Math.floor(y * f.height / h)); const s = (sy * f.width + sx) * 4, d = (y * w + x) * 4; for (let k = 0; k < 4; k++) this.buf[d + k] = f.data[s + k]; } },
        getImageData(x, y, w, h) { rec.canvasSizes.push([c.width, c.height]); return { data: this.buf || new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
      };
    } };
    return c;
  };
}
async function boot({ bd, frame, real = false, loadDecoder, hidden = false } = {}) {
  const rec = { fetches: [], draws: 0, canvasSizes: [], constraints: [], tracksStopped: 0, scripts: [], errors: [] };
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => rec.errors.push(String(e.message).slice(0, 120)));
  const dom = new JSDOM(DOOR_HTML, { url: 'https://www.keepitil.com/door.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, doc = w.document;
  w.HTMLMediaElement.prototype.play = () => Promise.resolve();
  const video = doc.getElementById('cam');
  Object.defineProperty(video, 'videoWidth', { get: () => (video.__frame ? video.__frame.width : 0) });
  Object.defineProperty(video, 'videoHeight', { get: () => (video.__frame ? video.__frame.height : 0) });
  Object.defineProperty(video, 'readyState', { get: () => 4 });
  video.__frame = frame || null;
  const track = { stop() { rec.tracksStopped++; } };
  Object.defineProperty(w.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async (c) => { rec.constraints.push(c); return { getTracks: () => [track] }; } } });
  if (bd) w.BarcodeDetector = bd;
  w.fetch = (u, init) => { rec.fetches.push({ url: u, init, body: JSON.parse(init.body) }); return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(OK) }); };
  const sb = { auth: { getSession: () => Promise.resolve({ data: { session: SESSION } }), onAuthStateChange: (cb) => { rec.authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; } } };
  w.eval(SCANNER_SRC);
  const timers = []; let now = 1_000_000;
  const deps = { win: w, adapter, client: sb, navigate() {}, now: () => now, setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, createCanvas: fakeCanvasFactory(rec) };
  if (loadDecoder) deps.loadDecoder = loadDecoder;
  if (hidden) Object.defineProperty(doc, 'visibilityState', { value: 'hidden', configurable: true });
  const ctl = await w.KilDoorScanner.boot(deps);
  const jsqrScripts = () => [...doc.querySelectorAll('script')].filter((s) => /vendor\/jsqr\/jsQR\.js/.test(s.getAttribute('src') || ''));
  const step = async () => { const f = timers.shift(); if (f) f(); await tick(); };
  /* act as the browser would for the real lazy <script>: evaluate the real vendored file in the page, then fire load */
  const deliver = () => { const s = jsqrScripts().pop(); w.eval(JSQR_SRC); s.onload(); };
  const start = () => { doc.getElementById('cam-start').click(); return tick(); };
  return { w, doc, rec, ctl, video, step, start, jsqrScripts, deliver, advance: (ms) => { now += ms; }, timers };
}
const panel = (p) => p.doc.getElementById('result');
const frame1280 = (text) => inFrame(genQR(text, { scale: 5 }), 1280, 720);

test('FULL CHAIN, BarcodeDetector missing: lazy jsQR load -> generated-QR frames -> exactly one RPC with the stripped token and the user bearer', async () => {
  for (const text of [TOKEN, 'KIL-' + TOKEN]) {
    const p = await boot({ frame: blank(1280, 720) });
    assert.equal(p.jsqrScripts().length, 0, 'nothing is loaded before the camera starts');
    assert.equal(p.w.jsQR, undefined);
    await p.start();
    assert.equal(p.jsqrScripts().length, 1, 'jsQR is requested only now, because BarcodeDetector is missing');
    assert.equal(p.jsqrScripts()[0].getAttribute('src'), '/assets/js/vendor/jsqr/jsQR.js?v=1.4.0', 'same-origin, relative');
    p.deliver(); await tick();
    assert.equal(p.ctl.camera.running, true); assert.equal(p.ctl.camera.mode, 'jsqr'); assert.equal(p.doc.getElementById('cam').hidden, false);
    await p.step(); assert.equal(p.rec.fetches.length, 0, 'a blank frame sends nothing');
    p.video.__frame = frame1280(text);
    await p.step();
    assert.equal(p.rec.fetches.length, 1);
    const f = p.rec.fetches[0];
    assert.equal(f.url, 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/event_checkin_scan');
    assert.equal(f.init.headers.Authorization, 'Bearer ' + USER_TOKEN); assert.equal(f.init.headers.apikey, ANON);
    assert.deepEqual(f.body, { p_qr_token: TOKEN });
    assert.equal(panel(p).getAttribute('data-code'), 'admitted');
    assert.ok(p.rec.canvasSizes.every(([w]) => w <= 640), 'frames are downscaled to <= 640px wide before decoding: ' + JSON.stringify(p.rec.canvasSizes[0]));
    assert.deepEqual(p.rec.canvasSizes[0], [640, 360]);
  }
});
test('a small frame (<= 640px) is not upscaled or distorted, and a scan still decodes', async () => {
  const p = await boot({ frame: inFrame(genQR(TOKEN, { scale: 4 }), 480, 360) });
  await p.start(); p.deliver(); await tick(); await p.step();
  assert.deepEqual(p.rec.canvasSizes[0], [480, 360]); assert.equal(p.rec.fetches.length, 1);
});
test('throttle + pause: ~9 fps timer, no frames read while the result is on screen or while the tab is hidden; Scan next resumes; same ticket still debounced', async () => {
  const p = await boot({ frame: frame1280(TOKEN) });
  await p.start(); p.deliver(); await tick();
  await p.step(); assert.equal(p.rec.fetches.length, 1);
  const d = p.rec.draws; await p.step(); await p.step(); await p.step();
  assert.equal(p.rec.draws, d, 'result is on screen: the loop ticks but reads no frame'); assert.equal(p.rec.fetches.length, 1);
  p.doc.getElementById('next').click(); await tick();
  await p.step(); assert.ok(p.rec.draws > d, 'resumed'); assert.equal(p.rec.fetches.length, 1, 'same ticket within the window is debounced');
  p.advance(Scanner.DEBOUNCE_MS + 1); await p.step(); assert.equal(p.rec.fetches.length, 2, 'after the window the server is asked again');
  // hidden tab: isHidden() true => no frame reads (the page also stops the stream on hidden, this is the belt to those braces)
  const h = await boot({ frame: frame1280(TOKEN), hidden: true });
  await h.start(); h.deliver(); await tick(); await h.step(); await h.step();
  assert.equal(h.rec.draws, 0); assert.equal(h.rec.fetches.length, 0);
});
test('timer interval is ~110ms (about 9 fps)', async () => {
  const ms = []; const dom = new JSDOM(DOOR_HTML, { url: 'https://www.keepitil.com/door.html', runScripts: 'dangerously' });
  const w = dom.window; w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.eval(SCANNER_SRC);
  const cam = w.KilDoorScanner.createCamera({ navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } }, onCode() {}, loadDecoder: async () => () => null, createCanvas: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) }) }), setTimeout: (fn, t) => { ms.push(t); return 1; }, clearTimeout() {} });
  const v = w.document.createElement('video'); await cam.start(v); assert.deepEqual(ms, [110]); cam.stop();
});
test('NEGATIVE: a blank frame and a noisy frame through the full chain decode to nothing and NOTHING is sent', async () => {
  for (const f of [blank(1280, 720), blank(1280, 720, 0), noise(1280, 720)]) {
    const p = await boot({ frame: f }); await p.start(); p.deliver(); await tick();
    for (let i = 0; i < 4; i++) await p.step();
    assert.equal(p.rec.fetches.length, 0); assert.equal(panel(p).getAttribute('data-code'), 'idle'); assert.ok(p.rec.draws >= 4, 'frames really were processed');
  }
});
test('NEGATIVE: a QR holding a URL, garbage text, spaces, or an oversize payload is refused locally ("Not a KEEPITIL ticket") and NEVER sent', async () => {
  for (const text of ['https://keepitil.com/t/' + TOKEN, 'http://x.example/?c=' + TOKEN, 'hello world', TOKEN + ' ' + TOKEN, 'x'.repeat(129), 'BEGIN:VCARD\nFN:Jo']) {
    const p = await boot({ frame: inFrame(genQR(text, { scale: 4 }), 640, 480) }); await p.start(); p.deliver(); await tick(); await p.step();
    assert.equal(p.rec.fetches.length, 0, text.slice(0, 20)); assert.equal(panel(p).getAttribute('data-code'), 'invalid', text.slice(0, 20));
    assert.ok(!p.doc.documentElement.outerHTML.includes(TOKEN), 'the payload is never echoed into the page');
  }
});
test('BarcodeDetector present with qr_code: the jsQR path is NOT loaded (no script element, no window.jsQR, loader never called); native detection is used', async () => {
  class BD { static async getSupportedFormats() { return ['qr_code', 'ean_13']; } async detect() { return [{ rawValue: 'KIL-' + TOKEN }]; } }
  let asked = 0;
  const p = await boot({ bd: BD, frame: blank(1280, 720), loadDecoder: () => { asked++; return Promise.reject(new Error('must not load')); } });
  await p.start(); assert.equal(p.ctl.camera.running, true); assert.equal(p.ctl.camera.mode, 'native');
  await p.step(); assert.equal(p.rec.fetches.length, 1); assert.equal(p.rec.fetches[0].body.p_qr_token, TOKEN);
  assert.equal(asked, 0); assert.equal(p.jsqrScripts().length, 0); assert.equal(p.w.jsQR, undefined); assert.equal(p.rec.draws, 0, 'no canvas frames on the native path');
  // same with the REAL loader (no loadDecoder override)
  const q = await boot({ bd: BD, frame: blank(1280, 720) }); await q.start(); await q.step();
  assert.equal(q.jsqrScripts().length, 0); assert.equal(q.w.jsQR, undefined);
});
test('BarcodeDetector present but without qr_code (or whose getSupportedFormats throws): the jsQR path IS loaded', async () => {
  class NoQr { static async getSupportedFormats() { return ['ean_13']; } }
  class Throws { static async getSupportedFormats() { throw new Error('nope'); } }
  for (const bd of [NoQr, Throws]) { const p = await boot({ bd, frame: blank(640, 480) }); await p.start(); assert.equal(p.jsqrScripts().length, 1); p.deliver(); await tick(); assert.equal(p.ctl.camera.mode, 'jsqr'); }
});
test('decoder load failure (real loader onerror, or script ran but no jsQR): clear message, stream stopped, camera not running, manual entry works; a later retry loads again', async () => {
  const p = await boot({ frame: blank(640, 480) });
  await p.start(); p.jsqrScripts()[0].onerror(); await tick();
  assert.ok(/QR reader couldn't load/.test(p.doc.getElementById('cam-msg').textContent), p.doc.getElementById('cam-msg').textContent);
  assert.equal(p.ctl.camera.running, false); assert.equal(p.rec.tracksStopped, 1); assert.equal(p.doc.getElementById('cam').srcObject, null);
  p.doc.getElementById('code').value = TOKEN; p.doc.getElementById('manual').dispatchEvent(new p.w.Event('submit', { cancelable: true })); await tick();
  assert.equal(panel(p).getAttribute('data-code'), 'admitted'); assert.equal(p.rec.fetches.length, 1);
  await p.start(); assert.equal(p.jsqrScripts().length, 2, 'a failed load is not cached: the second attempt requests it again');
  p.deliver(); await tick(); assert.equal(p.ctl.camera.running, true);
  const q = await boot({ frame: blank(640, 480) }); await q.start(); q.jsqrScripts()[0].onload(); await tick();   // loaded but did not define jsQR
  assert.equal(q.ctl.camera.running, false); assert.ok(/QR reader couldn't load/.test(q.doc.getElementById('cam-msg').textContent));
});
test('camera stream (jsQR mode) is stopped on pagehide, hidden, Stop and sign-out; the offscreen canvas is never attached to the page', async () => {
  for (const how of ['pagehide', 'hidden', 'stop', 'signout']) {
    const p = await boot({ frame: blank(640, 480) }); await p.start(); p.deliver(); await tick(); assert.equal(p.ctl.camera.running, true);
    if (how === 'pagehide') p.w.dispatchEvent(new p.w.Event('pagehide'));
    if (how === 'hidden') { Object.defineProperty(p.doc, 'visibilityState', { value: 'hidden', configurable: true }); p.doc.dispatchEvent(new p.w.Event('visibilitychange')); }
    if (how === 'stop') p.doc.getElementById('cam-stop').click();
    if (how === 'signout') p.rec.authCb('SIGNED_OUT');
    assert.equal(p.rec.tracksStopped, 1, how); assert.equal(p.ctl.camera.running, false);
    assert.equal(p.doc.querySelectorAll('canvas').length, 0);
  }
});
test('iPhone Safari requirements: <video> has playsinline + muted in the markup and set again at start; getUserMedia asks for the rear camera (ideal), no audio', async () => {
  assert.match(DOOR_HTML, /<video id="cam" playsinline muted hidden/);
  const p = await boot({ frame: blank(640, 480) }); await p.start();
  const v = p.doc.getElementById('cam'); assert.equal(v.hasAttribute('playsinline'), true); assert.equal(v.hasAttribute('muted'), true); assert.equal(v.muted, true);
  const c = p.rec.constraints[0]; assert.equal(c.audio, false); assert.equal(JSON.stringify(c.video.facingMode), '{"ideal":"environment"}');
  assert.equal(p.doc.getElementById('cam-start').disabled, false, 'Start is enabled on a browser that has getUserMedia but no BarcodeDetector');
});

// ============ supply chain: the vendored library is exactly the audited bytes ============
const VENDOR_README = read('assets/js/vendor/jsqr/README.md');
const RECORDED = /SHA-256 of jsQR\.js: ([0-9a-f]{64})/.exec(VENDOR_README)[1];
const PINNED = 'bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859'; // second, independent record (npm jsqr@1.4.0 dist/jsQR.js)
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
function verifyVendored(file) { const h = sha(readFileSync(file)); return h === RECORDED && h === PINNED; }
test('vendored jsQR: SHA-256 equals the checksum recorded in its README and the pin in this test', () => {
  assert.equal(RECORDED, PINNED, 'README and test agree');
  assert.equal(sha(readFileSync(join(ROOT, JSQR_PATH))), PINNED);
  assert.equal(verifyVendored(join(ROOT, JSQR_PATH)), true);
});
test('NC: ONE flipped byte, an appended comment, or a CRLF conversion of the vendored file FAILS the checksum', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsqr-nc-')), orig = readFileSync(join(ROOT, JSQR_PATH));
  const flipped = Buffer.from(orig); flipped[1000] ^= 1; writeFileSync(join(dir, 'a.js'), flipped);
  writeFileSync(join(dir, 'b.js'), Buffer.concat([orig, Buffer.from('\n//x')]));
  writeFileSync(join(dir, 'c.js'), orig.toString('utf8').replace(/\n/g, '\r\n'));
  for (const f of ['a.js', 'b.js', 'c.js']) assert.equal(verifyVendored(join(dir, f)), false, f);
});
test('vendored jsQR provenance files: Apache-2.0 LICENSE text, README names package, exact version, source, publish date, tarball integrity', () => {
  const lic = read('assets/js/vendor/jsqr/LICENSE'); assert.match(lic, /Apache License\s+Version 2\.0, January 2004/); assert.match(lic, /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/);
  assert.equal(sha(readFileSync(join(ROOT, 'assets/js/vendor/jsqr/LICENSE'))), 'c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08');
  for (const re of [/jsqr/i, /1\.4\.0/, /2021-04-24/, /Apache-2\.0/, /sha512-dxLob7q65Xg2DvstYkRpkYtmKm2sPJ9oFhrhmudT1dZvNFFTlroai3AWSpLey\/w5vMcLBXRgOJsbXpdN9HzU\/A==/, /8efb8d0a7cc6863cb6d95116b9069123ce9eb2d1/, /github\.com\/cozmo\/jsQR/, /registry\.npmjs\.org\/jsqr\/-\/jsqr-1\.4\.0\.tgz/]) assert.match(VENDOR_README, re);
});
test('vendored jsQR is pure computation: no network, storage or DOM access in the file; it is a classic script (defines window.jsQR), not a module', () => {
  for (const bad of ['XMLHttpRequest', 'fetch(', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'sendBeacon', 'eval(', 'new Function', 'importScripts']) assert.equal(JSQR_SRC.includes(bad), false, bad);
  assert.doesNotMatch(JSQR_SRC, /^\s*(import|export)\s/m);
  const dom = new JSDOM('<!doctype html><p>x', { runScripts: 'outside-only' }); dom.window.eval(JSQR_SRC); assert.equal(typeof dom.window.jsQR, 'function');
});
test('wiring: the only reference to the library is the lazy loader (door.html has no <script> for it), same-origin, no CDN/off-origin URL in the scanner script', () => {
  assert.ok(!/jsqr/i.test(DOOR_HTML.replace(/<!--[\s\S]*?-->/g, '')), 'door.html does not load jsQR eagerly');
  assert.equal(Scanner.JSQR_SRC.startsWith('/assets/js/vendor/jsqr/'), true);
  assert.ok(!/https?:\/\//.test(SCANNER_SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'no absolute URL in the scanner code');
  assert.ok(!/innerHTML\s*=|document\.write|eval\(|new Function/.test(SCANNER_SRC.replace(/\/\*[\s\S]*?\*\//g, '')));
});
