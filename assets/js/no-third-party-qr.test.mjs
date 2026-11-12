/* 21B: the wallet / ticket QR is drawn by the repo's own shipped qrcode.js (no third-party QR image host), and nothing in any shipped page can reintroduce one.
   - Repo-wide scan of every shipped text file for a third-party QR/chart image host (negative control: a synthetic page containing the old api.qrserver.com URL MUST be flagged).
   - jsdom: the REAL drawing code of /tickets and /profile is lifted out of the page source and run against the real qrcode.js + kil-ticket-qr.js. /tickets draws "KIL-<token>", /profile draws the raw token
     (each page keeps its current payload; the hardened door accepts both). The recorded payload is compared to the token, and the result is a local data: URL.
   NC = negative control. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const TOKEN = '0123456789abcdef0123456789abcdef';

// third-party QR / chart-image generators (host or path), case-insensitive
export const THIRD_PARTY_QR = /qrserver\.com|api\.qrserver|chart\.googleapis\.com\/chart|chart\.apis\.google\.com|quickchart\.io|goqr\.me|api\.qrcode-monkey|qrcode-monkey\.com|qr-code-generator\.com|zxing\.org\/w\/chart|qrickit\.com|api\.qrcode\.tec-it|barcode\.tec-it\.com|image-charts\.com/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'db', 'supabase', 'tests', 'scripts']);
const TEXT_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.json', '.webmanifest', '.svg', '.xml', '.txt']);
export function scanTree(dir, base = dir, hits = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name); const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) scanTree(p, base, hits); continue; }
    if (!TEXT_EXT.has(extname(name).toLowerCase()) || /\.test\.(m|c)?js$/.test(name)) continue;
    if (st.size > 3_000_000) continue;
    const m = readFileSync(p, 'utf8').match(THIRD_PARTY_QR);
    if (m) hits.push(relative(base, p) + ': ' + m[0]);
  }
  return hits;
}

test('no shipped page or script references a third-party QR / chart image host', () => {
  const hits = scanTree(ROOT);
  assert.deepEqual(hits, [], 'third-party QR host found in shipped files');
});

test('NC: the scanner flags the old api.qrserver.com wallet URL when it is re-added', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'qrnc-')); mkdirSync(join(tmp, 'assets'));
  writeFileSync(join(tmp, 'tickets.html'), `<script>var qr='https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data='+encodeURIComponent('KIL-'+tok);</script>`);
  writeFileSync(join(tmp, 'assets', 'x.js'), `img.src = "https://chart.googleapis.com/chart?cht=qr&chl=" + t;`);
  const hits = scanTree(tmp);
  assert.equal(hits.length, 2, JSON.stringify(hits));
  assert.match(hits.join('|'), /qrserver/); assert.match(hits.join('|'), /chart\.googleapis/);
});

// ---- jsdom: lift the page's own drawing code and run it
function lift(html, re, what) { const m = html.match(re); assert.ok(m, 'cannot find the QR drawing code in ' + what); return m[0]; }
function drawWith(snippet, varName) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  const w = dom.window; const recorded = [];
  w.eval(readFileSync(join(ROOT, 'assets/js/vendor/qrcode.js'), 'utf8').replace(/\(function \(factory\)[\s\S]*$/, '') + '\nwindow.__qrcode = qrcode;');
  w.eval(read('assets/js/kil-ticket-qr.js'));
  w.qrcode = function (type, level) { const q = w.__qrcode(type, level); const add = q.addData; q.addData = (d, m) => { recorded.push(d); return add(d, m); }; return q; };
  w.eval(`var ${varName}={qr_token:${JSON.stringify(TOKEN)}}; ${snippet}; window.__qr = qr; window.__door = door;`);
  return { recorded, qr: w.__qr, door: w.__door };
}
const TICKETS_RE = /var door=KilTicketQr\.payload\(e\.qr_token,\{prefix:true\}\);\s*var qr='';\s*if\(door\)\{[^}]*\}/;
const PROFILE_RE = /var door=KilTicketQr\.payload\(t\.qr_token\);\s*var qr='';\s*if\(door\)\{[^}]*\}/;

test('/tickets draws KIL-<token> locally (data: URL, no network host)', () => {
  const html = read('tickets.html');
  const r = drawWith(lift(html, TICKETS_RE, 'tickets.html'), 'e');
  assert.deepEqual(r.recorded, ['KIL-' + TOKEN]);
  assert.equal(r.door, 'KIL-' + TOKEN);
  assert.match(r.qr, /^data:image\/gif;base64,/); assert.equal(THIRD_PARTY_QR.test(r.qr), false);
  assert.match(html, /\/assets\/js\/vendor\/qrcode\.js/);
});
test('/profile draws the raw token locally (data: URL, no network host)', () => {
  const html = read('profile.html');
  const r = drawWith(lift(html, PROFILE_RE, 'profile.html'), 't');
  assert.deepEqual(r.recorded, [TOKEN]);
  assert.equal(r.door, TOKEN);
  assert.match(r.qr, /^data:image\/gif;base64,/);
  assert.match(html, /\/assets\/js\/vendor\/qrcode\.js/);
});
test('both payloads are accepted by the door contract (check_in_ticket strips KIL-, event_checkin_scan hardened accepts both)', () => {
  const KQ = require('./kil-ticket-qr.js');
  assert.equal(KQ.checkInTicket('KIL-' + TOKEN), TOKEN); assert.equal(KQ.checkInTicket(TOKEN), TOKEN);
});
test('NC: a non-token (an order id) is never drawn: the page code yields an empty payload, not a QR of the id', () => {
  const html = read('tickets.html');
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }); const w = dom.window;
  w.eval(read('assets/js/kil-ticket-qr.js'));
  assert.equal(w.KilTicketQr.payload('42', { prefix: true }), ''); assert.equal(w.KilTicketQr.payload('not-hex'), '');
  assert.equal(/order_id/.test(html), false);
});
test('NC: re-adding the third-party URL to the drawing code would be caught (page source with the old line fails the scan regex)', () => {
  const html = read('tickets.html').replace(/qr=qrDraw\.createDataURL\(6,0\);/, "qr='https://api.qrserver.com/v1/create-qr-code/?data='+encodeURIComponent(door);");
  assert.notEqual(html, read('tickets.html')); assert.equal(THIRD_PARTY_QR.test(html), true);
});
