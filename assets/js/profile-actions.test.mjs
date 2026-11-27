/*
 * CSP migration, profile.html: the 83 inline on*= handlers became delegated actions (assets/js/kil-actions.js) and delegated image fallbacks
 * (assets/js/kil-img-fallback.js). Tests: (1) the dispatcher itself, (2) every moved handler (counts per event:name, each name allowed and defined),
 * (3) the helper functions that replaced inline statements behave like the statements, (4) dynamic data-a values survive hostile input, (5) image fallback modes,
 * (6) a guard: no inline handler attribute is left in the page, with a negative control.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(dir, '../..', rel), 'utf8');
const PAGE = read('profile.html');

/* ---------- a tiny DOM: elements with parents and attributes ---------- */
function node(attrs = {}, parent = null) {
  const n = { nodeType: 1, parentNode: parent, attrs: { ...attrs },
    hasAttribute: (k) => k in n.attrs, getAttribute: (k) => (k in n.attrs ? n.attrs[k] : null) };
  return n;
}
function dispatcher(globals = {}) {
  const listeners = {}, document = { addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
  const win = {}; const ctx = vm.createContext({ window: win, document, JSON, Array, Object, console: { error() {} }, ...globals });
  vm.runInContext(read('assets/js/kil-actions.js'), ctx);
  const fire = (type, target) => { const ev = { type, target, immediate: false, stopImmediatePropagation() { ev.immediate = true; } }; (listeners[type] || []).forEach((f) => f(ev)); return ev; };
  return { win, fire, listeners, ctx };
}

test('dispatcher: calls an allowed global with data-a, $e and $el tokens; this is the element', () => {
  const d = dispatcher(), calls = [];
  d.win.go = function (...a) { calls.push([this, ...a]); };
  d.win.KilActions.allow(['go']);
  const el = node({ 'data-click': 'go', 'data-a': '[1,"x","$e","$el"]' });
  const ev = d.fire('click', el);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], el); assert.deepEqual(calls[0].slice(1, 3), [1, 'x']); assert.equal(calls[0][3], ev); assert.equal(calls[0][4], el);
});

test('dispatcher: only allowed names run; nothing else on window is reachable from markup', () => {
  const d = dispatcher(), hit = [];
  d.win.evil = () => hit.push('evil'); d.win.eval = () => hit.push('eval'); d.win.KilActions.allow(['ok']); d.win.ok = () => hit.push('ok');
  for (const name of ['evil', 'eval', 'location', 'constructor', '__proto__', 'ok.call', 'KilActions']) d.fire('click', node({ 'data-click': name }));
  d.fire('click', node({ 'data-click': 'ok' }));
  assert.deepEqual(hit, ['ok']);
  d.win.KilActions.allow(['a.b', 'x y', '1z', 'eval()', 5, null]);   // not identifiers: ignored
  d.win.notFn = 3; d.win.KilActions.allow(['notFn']); d.fire('click', node({ 'data-click': 'notFn' }));   // allowed but not a function: ignored
});

test('dispatcher: bad data-a never throws and passes no args; a throwing action is contained', () => {
  const d = dispatcher(), got = []; d.win.f = (...a) => got.push(a); d.win.boom = () => { throw new Error('x'); }; d.win.KilActions.allow(['f', 'boom']);
  d.fire('click', node({ 'data-click': 'f', 'data-a': '{not json' })); d.fire('click', node({ 'data-click': 'f', 'data-a': '{"a":1}' })); d.fire('click', node({ 'data-click': 'boom' }));
  assert.deepEqual(got, [[], []]);
});

test('dispatcher: bubbles inner to outer like inline handlers; data-stop stops the walk and stops other document listeners', () => {
  const d = dispatcher(), order = []; d.win.a = () => order.push('a'); d.win.b = () => order.push('b'); d.win.c = () => order.push('c'); d.win.KilActions.allow(['a', 'b', 'c']);
  const outer = node({ 'data-click': 'c' }), mid = node({ 'data-click': 'b', 'data-stop': '' }, outer), inner = node({ 'data-click': 'a' }, mid), plain = node({}, inner);
  const ev = d.fire('click', plain);
  assert.deepEqual(order, ['a', 'b']); assert.equal(ev.immediate, true);
  const o2 = node({ 'data-click': 'c' }), i2 = node({ 'data-click': 'a' }, o2); order.length = 0; const ev2 = d.fire('click', i2);
  assert.deepEqual(order, ['a', 'c']); assert.equal(ev2.immediate, false);
});

test('dispatcher: each event type reads its own attribute', () => {
  const d = dispatcher(), got = []; d.win.k = (n) => got.push(n); d.win.KilActions.allow(['k']);
  const el = node({ 'data-click': 'k', 'data-change': 'k', 'data-input': 'k', 'data-keydown': 'k', 'data-over': 'k', 'data-out': 'k', 'data-a': '["x"]' });
  for (const t of ['click', 'change', 'input', 'keydown', 'mouseover', 'mouseout']) d.fire(t, el);
  assert.equal(got.length, 6);
  d.fire('click', node({ 'data-change': 'k' })); assert.equal(got.length, 6, 'an element wired for change does not run on click');
});

/* ---------- every moved handler ---------- */
const EXPECTED = {"change:toggleCat": 4, "click:addContent": 2, "click:agAsk": 3, "click:agSend": 1, "click:closeChatGroup": 2, "click:closeLoginWall": 1, "click:closeModal": 10, "click:cpMoveItem": 2, "click:cpRemoveChip": 1, "click:cpRemoveItem": 1, "click:cpSubmit": 1, "click:cpUseUrl": 1, "click:evSub": 2, "click:fbCapToggle": 1, "click:myevScroll": 2, "click:mytixScroll": 2, "click:openEditProfile": 1, "click:pfBack": 1, "click:pfChatBackdrop": 1, "click:pfClickId": 4, "click:pfCloseInsights": 1, "click:pfGoDashboard": 1, "click:pfLinksToggle": 1, "click:pfNoop": 1, "click:pfRemoveParent": 1, "click:setEvFilter": 1, "click:setGalFilter": 1, "click:shareTo": 7, "click:showTab": 1, "click:toggleAlert": 1, "click:toggleCreateMenu": 1, "click:toggleFollow": 1, "click:toggleHideFeed": 1, "click:toggleMenu": 1, "click:toggleShare": 1, "input:cpCount": 1, "keydown:cpChipKey": 2, "keydown:pfAgEnter": 1, "out:pfVidPause": 1, "over:pfVidPlay": 1};
const used = {};
for (const m of PAGE.matchAll(/\sdata-(click|change|input|keydown|over|out)="(\w+)"/g)) used[m[1] + ':' + m[2]] = (used[m[1] + ':' + m[2]] || 0) + 1;

test('all 70 delegated handlers are in the page, exactly as many per event:action as the inline handlers they replaced', () => {
  assert.deepEqual(used, EXPECTED);
  assert.equal(Object.values(used).reduce((a, b) => a + b, 0), 70);
});

test('every action used in markup is allowed, and defined as a function in the page; the allow list has no dead entries', () => {
  const allow = JSON.parse(PAGE.match(/KilActions\.allow\((\[[^\]]*\])\)/)[1]);
  const names = [...new Set(Object.keys(used).map((k) => k.split(':')[1]))].sort();
  assert.deepEqual([...allow].sort(), names);
  for (const n of names) assert.match(PAGE, new RegExp('function ' + n + '\\(|(?:var|let|const) ' + n + '\\s*=|window\\.' + n + '\\s*='), n + ' is defined');
});

test('the page loads kil-actions.js before its own scripts register document listeners, and kil-img-fallback.js', () => {
  const a = PAGE.indexOf('/assets/js/kil-actions.js'), f = PAGE.indexOf('/assets/js/kil-img-fallback.js'), first = PAGE.indexOf("document.addEventListener('click'");
  assert.ok(a > 0 && f > 0 && a < first, 'kil-actions.js comes first');
});

/* ---------- the helpers that replaced inline statements ---------- */
const helperSrc = PAGE.slice(PAGE.indexOf('function pfStop(ev)'), PAGE.indexOf('if(window.KilActions) KilActions.allow('));
function helpers(extra = {}) {
  const log = []; const ctx = vm.createContext({ history: { back: () => log.push('back') }, location: {}, closeChatGroup: () => log.push('closeChatGroup'), agSend: () => log.push('agSend'), ...extra, document: extra.document || { getElementById: () => null } });
  vm.runInContext(helperSrc, ctx); return { ctx, log };
}
test('pfBack / pfGoDashboard / pfNoop', () => {
  const { ctx, log } = helpers(); ctx.pfBack(); ctx.pfGoDashboard(); ctx.pfNoop();
  assert.deepEqual(log, ['back']); assert.equal(ctx.location.href, '/dashboard');
});
test('pfLinksToggle flips none/block on #pfLinksMenu', () => {
  const m = { style: { display: 'none' } }; const { ctx } = helpers({ document: { getElementById: (id) => (id === 'pfLinksMenu' ? m : null) } });
  ctx.pfLinksToggle(); assert.equal(m.style.display, 'block'); ctx.pfLinksToggle(); assert.equal(m.style.display, 'none');
});
test('pfChatBackdrop closes only when the click is on the backdrop itself', () => {
  const { ctx, log } = helpers(), el = {}; ctx.pfChatBackdrop({ target: {} }, el); assert.deepEqual(log, []); ctx.pfChatBackdrop({ target: el }, el); assert.deepEqual(log, ['closeChatGroup']);
});
test('pfCloseInsights removes #insOv if present and is silent otherwise', () => {
  let removed = 0; const { ctx } = helpers({ document: { getElementById: (id) => (id === 'insOv' ? { remove: () => removed++ } : null) } });
  ctx.pfCloseInsights(); assert.equal(removed, 1);
  const h2 = helpers(); h2.ctx.pfCloseInsights();
});
test('pfRemoveParent / pfClickId', () => {
  let rm = 0, clicks = []; const { ctx } = helpers({ document: { getElementById: (id) => ({ click: () => clicks.push(id) }) } });
  ctx.pfRemoveParent({ parentNode: { remove: () => rm++ } }); ctx.pfClickId('cpFile'); ctx.pfClickId('cpCam'); ctx.pfClickId('cpRec');
  assert.equal(rm, 1); assert.deepEqual(clicks, ['cpFile', 'cpCam', 'cpRec']);
});
test('pfAgEnter sends only on Enter and prevents the default', () => {
  const { ctx, log } = helpers(); let pd = 0;
  ctx.pfAgEnter({ key: 'a', preventDefault: () => pd++ }); assert.deepEqual(log, []); assert.equal(pd, 0);
  ctx.pfAgEnter({ key: 'Enter', preventDefault: () => pd++ }); assert.deepEqual(log, ['agSend']); assert.equal(pd, 1);
});
test('pfVidPlay swallows a rejected play(); pfVidPause pauses', () => {
  const { ctx } = helpers(); let paused = 0;
  ctx.pfVidPlay({ play() { throw new Error('NotAllowed'); } }); ctx.pfVidPause({ pause: () => paused++ }); assert.equal(paused, 1);
});
test('pfStop: stopImmediatePropagation when there is one, stopPropagation for fake events, nothing for null', () => {
  const { ctx } = helpers(); const calls = [];
  ctx.pfStop({ stopImmediatePropagation: () => calls.push('imm'), stopPropagation: () => calls.push('prop') });
  ctx.pfStop({ stopPropagation: () => calls.push('prop2') }); ctx.pfStop(null); ctx.pfStop(undefined);
  assert.deepEqual(calls, ['imm', 'prop2']);
});

/* ---------- dynamic data-a built in JS strings ---------- */
test('dynamic data-a values are JSON, attribute-escaped: hostile strings round-trip and cannot leave the attribute', () => {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const sites = [...PAGE.matchAll(/data-a="'\+esc\(JSON\.stringify\((\[[^\]]*\](?:\])?)\)\)\+'"/g)].map((m) => m[1]);
  assert.ok(sites.length >= 7, 'found the dynamic sites: ' + sites.join(' '));
  const evil = '"><img src=x onerror=alert(1)>\'`';
  for (const expr of sites) {
    const ctx = vm.createContext({ esc, JSON, i: 3, which: evil, src: evil, idx: 2, c: [evil, 'x'] });
    const arr = vm.runInContext(expr, ctx);
    const html = '<b data-a="' + esc(JSON.stringify(arr)) + '">';
    assert.equal((html.match(/"/g) || []).length, 2, 'no stray quote in ' + expr);
    assert.equal(/<img/.test(html), false);
    const raw = html.match(/data-a="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.deepEqual(JSON.parse(raw), JSON.parse(JSON.stringify(arr)));
  }
});

/* ---------- image fallback modes used by the page ---------- */
function fbEnv() {
  const listeners = []; const doc = { readyState: 'complete', addEventListener(t, f) { if (t === 'error') listeners.push(f); }, querySelectorAll: () => [] };
  const ctx = vm.createContext({ window: {}, document: doc, parseFloat, String }); vm.runInContext(read('assets/js/kil-img-fallback.js'), ctx);
  const img = (attrs) => { const el = { tagName: 'IMG', style: {}, attrs: { ...attrs }, parentNode: { style: {} }, getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null), setAttribute: (k, v) => { el.attrs[k] = v; } }; return el; };
  return { fire: (t) => listeners.forEach((f) => f({ target: t })), img };
}
test('image fallback: hide, dim, src (once, same-site path only)', () => {
  const e = fbEnv();
  const a = e.img({ 'data-fb': 'hide' }); e.fire(a); assert.equal(a.style.display, 'none');
  const b = e.img({ 'data-fb': 'dim', 'data-fb-op': '.2' }); e.fire(b); assert.equal(b.style.opacity, '0.2');
  const b2 = e.img({ 'data-fb': 'dim', 'data-fb-op': 'x' }); e.fire(b2); assert.equal(b2.style.opacity, '0.12');
  const c = e.img({ 'data-fb': 'src', 'data-fb-src': '/icon-192.png', src: '/broken.jpg' }); e.fire(c); assert.equal(c.attrs.src, '/icon-192.png');
  c.attrs.src = '/also-broken'; e.fire(c); assert.equal(c.attrs.src, '/also-broken', 'swapped once: a failing fallback cannot loop');
  for (const bad of ['//evil.example/x.png', 'javascript:alert(1)', 'https://evil.example/x.png', '/a b', '/x"onerror="y', '']) { const d = e.img({ 'data-fb': 'src', 'data-fb-src': bad, src: '/orig' }); e.fire(d); assert.equal(d.attrs.src, '/orig', 'refuses ' + bad); }
});
test('every data-fb in the profile page uses a known mode with valid parameters (12 former onerror handlers)', () => {
  const modes = [...PAGE.matchAll(/\sdata-fb="([\w-]+)"/g)].map((m) => m[1]);
  assert.equal(modes.length, 12);
  assert.ok(modes.every((m) => ['hide', 'dim', 'src'].includes(m)));
  for (const m of PAGE.matchAll(/data-fb-src="([^"]*)"/g)) assert.match(m[1], /^\/(?!\/)[^\s"'<>\\]*$/);
  for (const m of PAGE.matchAll(/data-fb-op="([^"]*)"/g)) assert.ok(parseFloat(m[1]) >= 0 && parseFloat(m[1]) <= 1);
});

/* ---------- guard ---------- */
const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => {
  assert.ok(INLINE.test('<button onclick="x()">'));
  assert.ok(INLINE.test("'<img onerror=\"this.src=1\">'"));
  assert.equal(INLINE.test('<button data-click="x">'), false);
});
test('profile.html has no inline on*= handler attribute left', () => {
  const noComments = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...noComments.matchAll(new RegExp(INLINE.source, 'gi'))].map((m) => m[0]), []);
});
