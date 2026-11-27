/*
 * CSP migration, the remaining single inline handlers outside the articles: signup, apply, connect, kode/embed, index (home), findmyweed-explore, earn, create, kbeats submit.
 * Shared pieces: assets/js/kil-actions.js (now also data-submit), assets/js/kil-common-actions.js (new), assets/js/kil-img-fallback.js (new mode swap-next).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire as __cr } from 'node:module';
const __assemble = __cr(import.meta.url)('../../tests/helpers/event-assembled.cjs').assemble;

const dir = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(dir, '../..', rel), 'utf8');
const PAGES = ['signup.html', 'apply.html', 'connect/index.html', 'kode/embed.html', 'index.html', 'findmyweed-explore.html', 'earn/index.html', 'create/index.html', 'games/kbeats/submit/index.html'];

/* ---------- shared scripts ---------- */
function node(attrs = {}, parent = null) { const n = { nodeType: 1, parentNode: parent, attrs: { ...attrs }, hasAttribute: (k) => k in n.attrs, getAttribute: (k) => (k in n.attrs ? n.attrs[k] : null) }; return n; }
function dispatcher() {
  const listeners = {}, document = { addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } }, win = {};
  const ctx = vm.createContext({ window: win, document, JSON, Array, Object, console }); vm.runInContext(read('assets/js/kil-actions.js'), ctx);
  return { win, ctx, listeners, fire: (type, target) => { const ev = { type, target, defaultPrevented: false, preventDefault() { ev.defaultPrevented = true; }, stopImmediatePropagation() {} }; (listeners[type] || []).forEach((f) => f(ev)); return ev; } };
}
test('dispatcher: submit events are delegated (data-submit); the action can prevent the default like the old "return false"', () => {
  const d = dispatcher(); assert.ok(d.listeners.submit && d.listeners.submit.length === 1);
  d.win.noSubmit = (e) => e.preventDefault(); d.win.KilActions.allow(['noSubmit']);
  const ev = d.fire('submit', node({ 'data-submit': 'noSubmit', 'data-a': '["$e"]' })); assert.equal(ev.defaultPrevented, true);
  d.fire('submit', node({ 'data-click': 'noSubmit' }));   // an element wired for click does not run on submit
});

function common(extra = {}) {
  const log = []; const classes = new Set(); const allowed = [];
  const win = { KilActions: { allow: (n) => allowed.push(...n) }, ...extra };
  const ctx = vm.createContext({ window: win, document: { getElementById: (id) => (id === 'mm' ? { classList: { toggle: (c) => (classes.has(c) ? classes.delete(c) : classes.add(c)) } } : null) }, location: { reload: () => log.push('reload') }, typeof: undefined });
  vm.runInContext(read('assets/js/kil-common-actions.js'), ctx); return { ctx, log, classes, allowed, win };
}
test('kil-common-actions: menu toggle, reload, no-submit, vsGo helpers (guarded) and the allow list', () => {
  const c = common(); c.ctx.kilToggleMobileMenu(); assert.ok(c.classes.has('open')); c.ctx.kilToggleMobileMenu(); assert.ok(!c.classes.has('open'));
  c.ctx.kilReload(); assert.deepEqual(c.log, ['reload']);
  let pd = 0; c.ctx.kilNoSubmit({ preventDefault: () => pd++ }); c.ctx.kilNoSubmit(null); assert.equal(pd, 1);
  assert.deepEqual([...c.allowed].sort(), ['kilNoSubmit', 'kilReload', 'kilToggleMobileMenu', 'kilVsGo', 'kilVsGoJoin']);
  c.ctx.kilVsGo('join'); c.ctx.kilVsGoJoin();   // not defined yet: nothing happens, no throw (the old window.vsGo&&window.vsGo(...))
  const calls = []; const c2 = common({ vsGo: (k) => calls.push(['go', k]), __vsGoJoin: () => calls.push(['join']) }); c2.ctx.kilVsGo('join'); c2.ctx.kilVsGoJoin();
  assert.deepEqual(calls, [['go', 'join'], ['join']]);
  common().ctx.kilToggleMobileMenu.call(null);
});

function fbEnv() {
  const listeners = []; const doc = { readyState: 'complete', addEventListener(t, f) { if (t === 'error') listeners.push(f); }, querySelectorAll: () => [] };
  const ctx = vm.createContext({ window: {}, document: doc, parseFloat, String }); vm.runInContext(read('assets/js/kil-img-fallback.js'), ctx);
  return { fire: (t) => listeners.forEach((f) => f({ target: t })) };
}
test('image fallback swap-next hides the image and shows its next sibling as flex (the home Spotlight initials)', () => {
  const e = fbEnv(), next = { style: {} }; const img = { tagName: 'IMG', style: {}, nextElementSibling: next, getAttribute: (k) => (k === 'data-fb' ? 'swap-next' : null) };
  e.fire(img); assert.equal(img.style.display, 'none'); assert.equal(next.style.display, 'flex');
  const lone = { tagName: 'IMG', style: {}, nextElementSibling: null, getAttribute: (k) => (k === 'data-fb' ? 'swap-next' : null) }; e.fire(lone); assert.equal(lone.style.display, 'none');
});

/* ---------- pages ---------- */
const INLINE = /\son(click|change|input|keydown|keyup|error|load|mouseover|mouseout|submit|focus|blur)\s*=/i;
test('control: the guard detects an inline handler', () => { assert.ok(INLINE.test('<form onsubmit="return false">')); assert.equal(INLINE.test('<form data-submit="x">'), false); });
test('none of the nine pages has an inline on*= handler attribute left', () => {
  for (const p of PAGES) {
    const t = read(p).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.deepEqual([...t.matchAll(new RegExp(INLINE.source, 'gi'))].map((m) => m[0]), [], p);
  }
});
const count = (p, re) => (__assemble(read(p)).match(re) || []).length;
test('mobile menu toggles: signup, apply, connect use kilToggleMobileMenu and load kil-actions.js then kil-common-actions.js', () => {
  for (const p of ['signup.html', 'apply.html', 'connect/index.html']) {
    const h = read(p); assert.equal(count(p, /data-click="kilToggleMobileMenu"/g), 1, p);
    const a = h.indexOf('/assets/js/kil-actions.js'), c = h.indexOf('/assets/js/kil-common-actions.js');
    assert.ok(a > 0 && c > a, p + ' script order');
  }
});
test('connect and kode/embed image fallbacks are data-fb="hide"; the home Spotlight image is swap-next', () => {
  assert.equal(count('connect/index.html', /data-fb="hide"/g), 2); assert.equal(count('kode/embed.html', /data-fb="hide"/g), 1);
  assert.equal(count('index.html', /data-fb="swap-next"/g), 1); assert.ok(__assemble(read('kode/embed.html')).includes('/assets/js/kil-img-fallback.js'));
});
test('home: the hamburger is data-click="toggleMenu" and toggleMenu is allowed', () => {
  const h = read('index.html'); assert.equal(count('index.html', /data-click="toggleMenu"/g), 1);
  assert.match(h, /KilActions\.allow\(\['toggleMenu'\]\)/); assert.ok(h.indexOf('/assets/js/kil-actions.js') < h.indexOf('KilActions.allow('));
});
test('findmyweed-explore: showView("list") / showView("map") through data-click', () => {
  const h = read('findmyweed-explore.html');
  assert.match(h, /id="btnList" class="on" data-click="showView" data-a="\[&quot;list&quot;\]"/); assert.match(h, /id="btnMap" data-click="showView" data-a="\[&quot;map&quot;\]"/);
  assert.match(h, /KilActions\.allow\(\["showView"\]\)/); assert.ok(h.indexOf('/assets/js/kil-actions.js') < h.indexOf('KilActions.allow('));
});
test('create: the two Enter-a-competition buttons call the guarded helpers', () => {
  const h = read('create/index.html'); assert.match(h, /data-click="kilVsGoJoin"/); assert.match(h, /data-click="kilVsGo" data-a="\[&quot;join&quot;\]"/);
  assert.ok(h.indexOf('/assets/js/kil-common-actions.js') < h.indexOf('/vs-app.js'));
});
test('kbeats submit: the four forms are data-submit="kilNoSubmit" and the scripts load before the module', () => {
  const h = read('games/kbeats/submit/index.html'); assert.equal(count('games/kbeats/submit/index.html', /data-submit="kilNoSubmit"/g), 4);
  assert.ok(h.indexOf('/assets/js/kil-common-actions.js') < h.indexOf('type="module"'));
});
test('earn: the two playlist buttons were removed (earn-dead-buttons): no handler attribute, no data-click for them', () => {
  const h = read('earn/index.html'); assert.doesNotMatch(h.replace(/\/\*[\s\S]*?\*\//g, ''), /setDefaultPlaylist|rmPlaylist/);
});
