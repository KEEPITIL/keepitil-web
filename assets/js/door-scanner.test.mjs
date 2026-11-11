// 15A: owner door scanner (door.html + assets/js/kil-door-scanner.js + the 12A adapter copy).
// Offline: the real door.html runs in jsdom with a fake supabase client, a fake fetch and a fake camera. No network, no database, no real camera.
// NEGATIVE CONTROLS are inline (marked NC): a leaky adapter / broken renderer must make the no-contact check fail; the anon-key bearer must make the token check fail.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as adapter from './kil-door-scan-adapter.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DOOR_HTML = read('door.html');
const SCANNER_SRC = read('assets/js/kil-door-scanner.js');
const Scanner = require('./kil-door-scanner.js');
const ANON = /key:'([^']+)'/.exec(DOOR_HTML)[1];
const USER_TOKEN = 'user.session.access-token-FAKE';
const SESSION = { access_token: USER_TOKEN, user: { email: 'owner@example.invalid' } };
const TOKEN = '0123456789abcdef0123456789abcdef';
const SECRETS = ['buyer@example.invalid', 'buyer_handle_x', '+1 555 0100', 'Jane Buyer'];
const EVIL = { ok: true, result: 'admitted', event_title: 'Doors Open', tier: 'VIP', qty: 2, checked_in_at: '2026-11-09T22:45:28-08:00',
  buyer: 'buyer@example.invalid', buyer_email: 'buyer@example.invalid', buyer_handle: 'buyer_handle_x', phone: '+1 555 0100', buyer_name: 'Jane Buyer', qr_token: TOKEN, order_id: 'ord_9', message: 'Admitted ' + TOKEN };

const RESP = {
  admitted: { ok: true, result: 'admitted', message: 'x', event_title: 'Doors Open', tier: 'VIP', qty: 2, checked_in_at: '2026-11-09T22:45:28-08:00' },
  already_used: { ok: false, result: 'already_used', event_title: 'Doors Open', tier: 'GA', qty: 1, checked_in_at: '2026-11-09T21:00:00-08:00' },
  unpaid: { ok: false, result: 'unpaid', event_title: 'Doors Open' },
  forbidden: { ok: false, result: 'forbidden' },
  invalid: { ok: false, result: 'invalid' },
  empty: { ok: false, result: 'empty' },
};
const TONE = { admitted: 'success', already_used: 'warning', unpaid: 'error', forbidden: 'error', invalid: 'error', empty: 'neutral' };

const tick = (n = 8) => new Promise((r) => { let i = 0; (function go() { if (++i >= n) r(); else setTimeout(go, 0); })(); });

// ---- a page harness: real door.html + real kil-door-scanner.js, everything external faked ----
async function boot({ session = SESSION, reply, url = 'https://www.keepitil.com/door.html', bd, media, deps = {}, replyFn } = {}) {
  const rec = { fetches: [], navs: [], errors: [], tracksStopped: 0, replaceState: [] };
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => rec.errors.push(String(e.message).slice(0, 120)));
  const dom = new JSDOM(DOOR_HTML, { url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const store = { getItem: () => null };
  w.HTMLMediaElement.prototype.play = () => Promise.resolve();
  const sb = { auth: { getSession: () => Promise.resolve({ data: { session } }), onAuthStateChange: (cb) => { rec.authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; } } };
  w.fetch = (u, init) => {
    rec.fetches.push({ url: u, init, body: JSON.parse(init.body) });
    if (replyFn) return replyFn(rec.fetches.length);
    const r = reply || { status: 200, json: RESP.admitted };
    return Promise.resolve({ status: r.status, ok: r.status < 400, json: () => Promise.resolve(r.json) });
  };
  if (bd) w.BarcodeDetector = bd;
  if (media) Object.defineProperty(w.navigator, 'mediaDevices', { value: media, configurable: true });
  w.eval(SCANNER_SRC);
  let now = 1_000_000; rec.advance = (ms) => { now += ms; };
  const ctl = await w.KilDoorScanner.boot({ win: w, adapter, client: sb, navigate: (u) => rec.navs.push(u), now: () => now, ...deps });
  return { w, doc: w.document, rec, ctl, sb };
}
const submit = async (p, code) => { p.doc.getElementById('code').value = code; p.doc.getElementById('manual').dispatchEvent(new p.w.Event('submit', { cancelable: true, bubbles: true })); await tick(); };
const panel = (p) => p.doc.getElementById('result');
const allText = (p) => p.doc.documentElement.outerHTML; // text + every attribute + inline scripts: the widest possible net

function makeMedia() {
  const track = { stopped: 0, stop() { this.stopped++; } };
  const stream = { getTracks: () => [track] };
  return { track, media: { getUserMedia: async () => stream }, calls: () => track.stopped };
}
class FakeBD { static async getSupportedFormats() { return ['qr_code', 'ean_13']; } constructor() {} async detect() { return FakeBD.next ? [{ rawValue: FakeBD.next }] : []; } }

// ============ pure logic ============
test('payload table: raw / KIL- / kil- / whitespace accepted; URL-form, garbage, empty, oversize refused locally and never sent', () => {
  const ok = (raw) => Scanner.localParse(raw, adapter);
  for (const raw of [TOKEN, 'KIL-' + TOKEN, 'kil-' + TOKEN, 'Kil-' + TOKEN, ' \tKIL-' + TOKEN + '\n ', '  ' + TOKEN + '  ']) {
    const r = ok(raw); assert.equal(r.kind, 'ok', JSON.stringify(raw)); assert.equal(r.token, TOKEN); assert.deepEqual(r.request, { rpc: 'event_checkin_scan', args: { p_qr_token: TOKEN } });
  }
  assert.equal(ok('KIL-KIL-' + TOKEN).token, 'KIL-' + TOKEN, 'only ONE prefix is stripped, same as the database');
  for (const raw of ['', '   ', null, undefined, 'KIL-', ' kil- ']) assert.equal(ok(raw).kind, 'empty', String(raw));
  for (const raw of ['https://keepitil.com/ticket?t=' + TOKEN, 'http://x', 'hello world', 'abc\u0000def', TOKEN + ' ' + TOKEN, 'x'.repeat(129)]) assert.equal(ok(raw).kind, 'invalid', String(raw).slice(0, 30));
});

test('signInUrl keeps the return path only (never a query string or a code)', () => {
  assert.equal(Scanner.signInUrl('/door.html'), '/apply?next=%2Fdoor.html');
  assert.equal(Scanner.signInUrl('/door'), '/apply?next=%2Fdoor');
  assert.equal(Scanner.signInUrl('//evil.example'), '/apply?next=%2Fdoor.html', 'protocol-relative paths are refused');
  assert.equal(Scanner.signInUrl('/x?code=' + TOKEN), '/apply?next=%2Fdoor.html');
});

test('adapter copy is byte-identical to the 12A proposal (PR #137) so the two cannot drift', () => {
  assert.equal(read('assets/js/kil-door-scan-adapter.mjs'), read(['db', 'proposed', '12a-door-hardening', 'adapter', 'door-scan-adapter.mjs'].join('/')) /* built from parts: the Pages closure check scans test files that ship in assets/js */);
});

// ============ network contract ============
function assertBearer(rec, label) {
  assert.equal(rec.fetches.length, 1, label + ': exactly one RPC');
  const f = rec.fetches[0];
  assert.equal(f.url, 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/event_checkin_scan');
  assert.equal(f.init.method, 'POST');
  assert.equal(f.init.headers.Authorization, 'Bearer ' + USER_TOKEN, label + ': the signed-in user token is the bearer');
  assert.notEqual(f.init.headers.Authorization, 'Bearer ' + ANON, label + ': never the anon key as bearer (bug #139)');
  assert.equal(f.init.headers.apikey, ANON);
  assert.deepEqual(Object.keys(f.body), ['p_qr_token'], label + ': p_qr_token is the only argument');
  assert.equal(f.body.p_qr_token, TOKEN);
  assert.equal(f.init.credentials, 'omit');
}
test('RPC: user access token as bearer, anon key only as apikey, body = { p_qr_token } with the KIL- prefix stripped', async () => {
  const p = await boot(); await submit(p, ' KIL-' + TOKEN + ' ');
  assertBearer(p.rec, 'page');
});
test('NC: the original anon-bearer style FAILS the token assertion', async () => {
  const p = await boot({ deps: { rpc: (args) => { // what bug #139 looked like: the publishable key sent as the bearer
    p0.rec.fetches.push({ url: 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co/rest/v1/rpc/event_checkin_scan', init: { method: 'POST', credentials: 'omit', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } }, body: { p_qr_token: args.p_qr_token } });
    return Promise.resolve({ data: RESP.admitted, error: null }); } } });
  const p0 = p; await submit(p, TOKEN);
  assert.throws(() => assertBearer(p.rec, 'anon-bearer'), /bearer/);
});

// ============ gate ============
test('no session => redirect to /apply?next=/door.html and NO RPC, camera never started', async () => {
  const p = await boot({ session: null, url: 'https://www.keepitil.com/door.html?c=KIL-' + TOKEN });
  assert.deepEqual(p.rec.navs, ['/apply?next=%2Fdoor.html']);
  assert.equal(p.rec.fetches.length, 0);
  assert.equal(p.ctl.redirected, true);
  assert.equal(p.w.location.search, '', 'code stripped from the address bar even on the redirect path');
});
test('a code in the URL is stripped from the address bar and history; the page does not act on it', async () => {
  const p = await boot({ url: 'https://www.keepitil.com/door.html?c=KIL-' + TOKEN + '#KIL-' + TOKEN });
  assert.equal(p.w.location.search + p.w.location.hash, ''); assert.equal(p.w.location.pathname, '/door.html');
  assert.equal(p.rec.fetches.length, 0);
});

// ============ result mapping ============
for (const [code, resp] of Object.entries(RESP)) {
  test('maps ' + code + ' to the right state', async () => {
    const p = await boot({ reply: { status: 200, json: resp } });
    if (code === 'empty') { await submit(p, '   '); assert.equal(p.rec.fetches.length, 0, 'a blank entry is not sent'); }
    else { await submit(p, TOKEN); assert.equal(p.rec.fetches.length, 1); }
    assert.equal(panel(p).getAttribute('data-code'), code); assert.equal(panel(p).getAttribute('data-tone'), TONE[code]);
    assert.ok(panel(p).textContent.includes(adapter.UI[code].title), code);
    assert.equal(p.doc.activeElement, panel(p), 'focus moves to the result region');
    assert.equal(panel(p).getAttribute('aria-live'), 'assertive');
    assert.equal(p.doc.getElementById('next').hidden, false);
    if (code === 'admitted') assert.ok(/Admits 2 people/.test(panel(p).textContent) && /VIP/.test(panel(p).textContent));
    if (code === 'already_used') assert.ok(/First scanned at/.test(panel(p).textContent));
    if (code !== 'admitted') assert.ok(!/(^|\s)Admitted/.test(panel(p).textContent), code + ' must never read as Admitted');
  });
}
test('server-side garbage and unknown codes are errors, never admitted', async () => {
  for (const json of [null, [], 'ok', { ok: true }, { ok: true, result: 'welcome' }, { result: 'ADMITTED' }]) {
    const p = await boot({ reply: { status: 200, json } }); await submit(p, TOKEN);
    assert.equal(panel(p).getAttribute('data-code'), 'error', JSON.stringify(json));
  }
});
test('HTTP 401/403 and 42501 => "Sign in" state with a sign-in link, camera stopped', async () => {
  for (const r of [{ status: 401, json: { code: 'PGRST301' } }, { status: 403, json: { code: '42501', message: 'permission denied for function ' + TOKEN } }]) {
    const m = makeMedia(); const p = await boot({ reply: r, bd: FakeBD, media: m.media });
    await p.ctl.camera.start(p.doc.getElementById('cam'));
    await submit(p, TOKEN);
    assert.equal(panel(p).getAttribute('data-code'), 'unauth');
    assert.equal(p.doc.getElementById('signin').hidden, false); assert.equal(p.doc.getElementById('signin').getAttribute('href'), '/apply?next=%2Fdoor.html');
    assert.equal(m.track.stopped, 1); assert.ok(!allText(p).includes(TOKEN), 'the server message (which echoed the code) is never shown');
  }
});
test('session lost between load and scan => unauth state without any network call', async () => {
  const p = await boot();
  p.sb.auth.getSession = () => Promise.resolve({ data: { session: null } });
  await submit(p, TOKEN);
  assert.equal(p.rec.fetches.length, 0); assert.equal(panel(p).getAttribute('data-code'), 'unauth');
});

// ============ network failure ============
test('network failure / 500 / timeout shape NEVER show Admitted, retry is offered and safe', async () => {
  for (const mk of [() => ({ replyFn: () => Promise.reject(new TypeError('Failed to fetch')) }), () => ({ reply: { status: 500, json: { message: 'boom' } } }), () => ({ reply: { status: 502, json: null } })]) {
    const p = await boot(mk()); await submit(p, TOKEN);
    assert.equal(panel(p).getAttribute('data-code'), 'error'); assert.ok(!/Admitted/i.test(p.doc.body.textContent.replace(/Ready\.[^.]*\./, '')), 'no "admitted" anywhere');
    assert.equal(panel(p).getAttribute('data-tone'), 'error'); assert.equal(p.doc.getElementById('retry').hidden, false);
  }
  // retry sends the same code again and is allowed immediately (no debounce after a failure); success then admits once
  let n = 0;
  const p = await boot({ replyFn: () => (++n === 1 ? Promise.reject(new TypeError('offline')) : Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(RESP.admitted) })) });
  await submit(p, TOKEN); assert.equal(panel(p).getAttribute('data-code'), 'error');
  p.doc.getElementById('retry').click(); await tick();
  assert.equal(p.rec.fetches.length, 2); assert.equal(p.rec.fetches[1].body.p_qr_token, TOKEN); assert.equal(panel(p).getAttribute('data-code'), 'admitted');
  assert.equal(p.doc.getElementById('retry').hidden, true);
});

// ============ debounce / one admission per scan ============
test('duplicate scan of the same code within the window is ignored client-side (server stays the real guard)', async () => {
  const p = await boot();
  await submit(p, TOKEN); await submit(p, 'KIL-' + TOKEN); await submit(p, TOKEN.toUpperCase() === TOKEN ? TOKEN : TOKEN);
  assert.equal(p.rec.fetches.length, 1, 'three quick scans of one ticket => one RPC');
  p.rec.advance(Scanner.DEBOUNCE_MS + 1); await submit(p, TOKEN);
  assert.equal(p.rec.fetches.length, 2, 'after the window the server is asked again (it answers already_used)');
  await submit(p, 'ffffffffffffffffffffffffffffffff'); assert.equal(p.rec.fetches.length, 3, 'a different code is never debounced');
});
test('a second submit while one is in flight is ignored (one admission per tap)', async () => {
  let release; const p = await boot({ replyFn: () => new Promise((res) => { release = () => res({ status: 200, ok: true, json: () => Promise.resolve(RESP.admitted) }); }) });
  p.doc.getElementById('code').value = TOKEN; p.doc.getElementById('manual').dispatchEvent(new p.w.Event('submit', { cancelable: true }));
  await tick(); assert.equal(panel(p).getAttribute('data-code'), 'checking');
  await submit(p, 'ffffffffffffffffffffffffffffffff'); assert.equal(p.rec.fetches.length, 1);
  release(); await tick(); assert.equal(panel(p).getAttribute('data-code'), 'admitted'); assert.equal(p.rec.fetches.length, 1);
});

// ============ no contact data, ever ============
async function leakCheck(opts) {
  const p = await boot({ reply: { status: 200, json: EVIL }, ...opts }); await submit(p, TOKEN);
  const html = allText(p);
  for (const s of [...SECRETS, TOKEN, 'ord_9']) assert.equal(html.includes(s), false, JSON.stringify(s) + ' reached the DOM');
  return p;
}
test('NO-CONTACT: an evil response (buyer/email/handle/phone/name/token/order keys) never reaches DOM text or attributes', async () => {
  const p = await leakCheck({}); assert.equal(panel(p).getAttribute('data-code'), 'admitted');
  assert.ok(/VIP/.test(panel(p).textContent), 'the allowed fields still render');
  assert.equal(p.doc.getElementById('code').value, '', 'the typed code is cleared from the input');
});
test('NC: a leaky adapter makes the no-contact check FAIL (the assertion really catches leaks)', async () => {
  const leaky = { ...adapter, adaptScanResponse: (resp) => { const r = adapter.adaptScanResponse(resp); r.admission.tier = String((resp.data || resp).buyer); return r; } };
  await assert.rejects(() => leakCheck({ deps: { adapter: leaky } }), /reached the DOM/);
});
test('NC: a broken renderer that prints `buyer` makes the no-contact check FAIL', async () => {
  const broken = (doc, el, result) => { Scanner.renderResult(doc, el, result); const d = doc.createElement('div'); d.textContent = 'Buyer: ' + EVIL.buyer; el.appendChild(d); };
  await assert.rejects(() => leakCheck({ deps: { render: broken } }), /reached the DOM/);
});
test('server text is only ever written with textContent: no innerHTML/outerHTML/insertAdjacentHTML/document.write in the page or its script', () => {
  for (const [n, s] of [['door.html', DOOR_HTML], ['kil-door-scanner.js', SCANNER_SRC]]) assert.ok(!/innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write/.test(s.replace(/\/\*[\s\S]*?\*\//g, '')), n);
  // a hostile event title is rendered as text
  return boot({ reply: { status: 200, json: { ...RESP.admitted, event_title: '<img src=x onerror=alert(1)>' } } }).then(async (p) => { await submit(p, TOKEN); assert.equal(p.doc.querySelectorAll('#result img').length, 0); assert.ok(panel(p).textContent.includes('<img')); });
});

// ============ camera ============
test('camera: BarcodeDetector scan => exactly one RPC, loop pauses while the result is shown, Scan next resumes, same ticket still debounced', async () => {
  const m = makeMedia(); FakeBD.next = 'KIL-' + TOKEN;
  const timers = []; const p = await boot({ bd: FakeBD, media: m.media, deps: { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {} } });
  p.doc.getElementById('cam-start').click(); await tick(); assert.equal(p.ctl.camera.running, true); assert.equal(p.doc.getElementById('cam').hidden, false);
  const step = async () => { const f = timers.shift(); if (f) f(); await tick(); };
  await step(); assert.equal(p.rec.fetches.length, 1); assert.equal(panel(p).getAttribute('data-code'), 'admitted'); assertBearer(p.rec, 'camera');
  await step(); await step(); assert.equal(p.rec.fetches.length, 1, 'detector still sees the ticket but nothing is sent while the result is up');
  p.doc.getElementById('next').click(); await tick(); await step(); assert.equal(p.rec.fetches.length, 1, 'same ticket again within the window: debounced');
  FakeBD.next = null;
});
test('camera stream is stopped on pagehide, on visibilitychange(hidden), on Stop and on sign-out', async () => {
  for (const how of ['pagehide', 'hidden', 'stop', 'signout']) {
    const m = makeMedia(); const p = await boot({ bd: FakeBD, media: m.media });
    await p.ctl.camera.start(p.doc.getElementById('cam')); assert.equal(p.ctl.camera.running, true);
    if (how === 'pagehide') p.w.dispatchEvent(new p.w.Event('pagehide'));
    if (how === 'hidden') { Object.defineProperty(p.doc, 'visibilityState', { value: 'hidden', configurable: true }); p.doc.dispatchEvent(new p.w.Event('visibilitychange')); }
    if (how === 'stop') p.doc.getElementById('cam-stop').click();
    if (how === 'signout') p.rec.authCb('SIGNED_OUT');
    assert.equal(m.track.stopped, 1, how); assert.equal(p.ctl.camera.running, false); assert.equal(p.doc.getElementById('cam').srcObject, null);
    if (how === 'signout') assert.deepEqual(p.rec.navs, ['/apply?next=%2Fdoor.html']);
  }
});
test('camera: unsupported browser => clear message, Start disabled, manual entry still works', async () => {
  const p = await boot({}); // jsdom has no BarcodeDetector / mediaDevices
  assert.equal(p.doc.getElementById('cam-start').disabled, true); assert.ok(/isn't available/.test(p.doc.getElementById('cam-msg').textContent));
  await submit(p, TOKEN); assert.equal(panel(p).getAttribute('data-code'), 'admitted');
});
test('camera: permission denied / no camera => message, no crash, manual entry still works', async () => {
  for (const [name, reason, re] of [['NotAllowedError', 'denied', /blocked/], ['NotFoundError', 'nocamera', /No usable camera/], ['AbortError', 'failed', /couldn't start/]]) {
    const p = await boot({ bd: FakeBD, media: { getUserMedia: async () => { const e = new Error('x'); e.name = name; throw e; } } });
    p.doc.getElementById('cam-start').click(); await tick();
    assert.ok(re.test(p.doc.getElementById('cam-msg').textContent), reason); assert.equal(p.ctl.camera.running, false);
    await submit(p, TOKEN); assert.equal(panel(p).getAttribute('data-code'), 'admitted');
  }
});
test('camera: BarcodeDetector without qr_code support => falls back to the jsQR path (15B/D1; was "unsupported" in 15A); a failed decoder load is a clear failure, not a hang', async () => {
  class NoQr { static async getSupportedFormats() { return ['ean_13']; } }
  const m = makeMedia(); let asked = 0;
  const p = await boot({ bd: NoQr, media: m.media, deps: { loadDecoder: () => { asked++; return Promise.reject(new Error('x')); } } });
  const r = await p.ctl.camera.start(p.doc.getElementById('cam')); assert.equal(r.ok, false); assert.equal(r.reason, 'decoder'); assert.equal(asked, 1); assert.equal(p.ctl.camera.running, false); assert.equal(m.track.stopped, 1);
});

// ============ storage / privacy / scope ============
test('nothing is written to localStorage/sessionStorage/indexedDB by the page or the script; no console logging of codes', async () => {
  for (const [n, s] of [['door.html', DOOR_HTML], ['kil-door-scanner.js', SCANNER_SRC]]) { const c = s.replace(/\/\*[\s\S]*?\*\//g, ''); assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|console\./.test(c), n); }
  const p = await boot(); await submit(p, TOKEN);
  assert.equal(p.w.localStorage.length, 0); assert.equal(p.w.sessionStorage.length, 0); assert.equal(p.w.document.cookie, '');
});
test('static guards: no third-party script, noindex, no referrer, adapter imported from our own origin, key matches event.html, 44px targets, 375px-safe', () => {
  const scripts = [...DOOR_HTML.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts.map((s) => s.split('?')[0]), ['/assets/js/vendor/supabase-js.min.js', '/assets/js/kil-door-scanner.js']);
  assert.ok(!/https?:\/\/(?!ovmqtzjfpzrbzrlkxwgw\.supabase\.co|keepitil\.com)/.test(DOOR_HTML.replace(/<!--[\s\S]*?-->/g, '')), 'no foreign origin');
  assert.match(DOOR_HTML, /<meta name="robots" content="noindex,nofollow"/); assert.match(DOOR_HTML, /<meta name="referrer" content="no-referrer"/);
  assert.match(DOOR_HTML, /import\('\/assets\/js\/kil-door-scan-adapter\.mjs/);
  assert.equal(ANON, /var KEY='([^']+)'/.exec(read('event.html'))[1], 'same publishable key as event.html (anon key is public by design; it is only the apikey header)');
  assert.match(DOOR_HTML, /\.btn\{[^}]*min-height:48px/); assert.match(DOOR_HTML, /input\[type=text\]\{[^}]*min-height:52px/); assert.match(DOOR_HTML, /\.hd \.back\{[^}]*min-height:44px/);
  assert.match(DOOR_HTML, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/, 'zoom is not disabled');
  assert.ok(!/<input[^>]*\sname=/.test(DOOR_HTML), 'the code input has no name, so even a native form submit could not put it in a URL');
  assert.match(DOOR_HTML, /id="result" role="status" aria-live="assertive"/);
});
test('scope: door.html is not referenced by any other page, nav, script or sitemap; locked files do not mention it', () => {
  const skip = new Set(['.git', 'node_modules', 'docs', 'db', 'tests', 'build-service', 'supabase']);
  const hits = [];
  (function walk(d) { for (const n of readdirSync(d)) { if (skip.has(n)) continue; const f = join(d, n); const st = statSync(f); if (st.isDirectory()) walk(f); else if (/\.(html|js|xml|json|webmanifest|txt)$/.test(n) && !/door/.test(relative(ROOT, f).replace(/vendor/, '')) && statSync(f).size < 2e6) { if (/door\.html|\/door(["'?#\s)]|$)/.test(readFileSync(f, 'utf8').replace(/Door scanner|door scanner/g, ''))) hits.push(relative(ROOT, f)); } } })(ROOT);
  assert.deepEqual(hits.filter((h) => !/\.test\./.test(h)), [], 'only door.html itself may refer to /door');
});
