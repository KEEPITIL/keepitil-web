// node --test assets/js/no-bf-popup.test.mjs   (no dependencies)
//
// Joe 2026-11-20 6:40 PM: "Remove this popup as well. It's annoying" - the BLACK FRIDAY GUEST LIST
// auto-open modal. No page may auto-open it (timed, scroll or exit-intent) on any device. The
// signup survives only as the inline form on /early-access.html, a page the visitor chose to open,
// with the same endpoint, tables and payload.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const POPUP_PATH = join(ROOT, 'assets/js/kil-bf-popup.js');
const POPUP = readFileSync(POPUP_PATH, 'utf8');
const SKIP_DIRS = new Set(['.git', 'node_modules']);
/* Opt-in pages a visitor opens on purpose. Only these may mount the inline signup. */
const OPT_IN = new Set(['early-access.html', 'earn/black-friday/index.html']);

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

/* Things an auto-opening modal needs. Any one of them in the guest-list script is a regression. */
export function autoOpenSignals(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const hits = [];
  if (/aria-modal/.test(code)) hits.push('aria-modal');
  if (/role="'\s*\+\s*\(inline|role="dialog"|'dialog'/.test(code)) hits.push('dialog role');
  if (/position:\s*fixed/.test(code)) hits.push('fixed overlay');
  if (/\bsetTimeout\s*\(|\bsetInterval\s*\(/.test(code)) hits.push('timer');
  if (/addEventListener\(\s*['"](scroll|mouseout|mouseleave|visibilitychange|beforeunload)['"]/.test(code)) hits.push('scroll/exit-intent listener');
  if (/\bopenModal\b|\bshouldAutoOpen\b/.test(code)) hits.push('modal opener');
  if (/body\.appendChild/.test(code)) hits.push('appends to body');
  return hits;
}

/* Run the browser build of the script against a fake document and record what it did. */
function runInFakePage(src, { inlineHost }) {
  const log = { created: [], appended: [], timers: 0, listeners: [] };
  const el = (tag) => ({ tag, className: '', innerHTML: '', textContent: '', style: {},
    appendChild(c) { log.appended.push(c.tag || '?'); return c; }, remove() {},
    querySelector() { return { addEventListener() {}, querySelectorAll() { return []; } }; },
    querySelectorAll() { return []; }, addEventListener(t) { log.listeners.push(t); } });
  const host = inlineHost ? el('div') : null;
  const document = {
    readyState: 'complete', referrer: '',
    head: el('head'), body: el('body'), activeElement: null,
    getElementById(id) { return id === 'kil-bf-inline' ? host : null; },
    createElement(t) { log.created.push(t); return el(t); },
    addEventListener(t) { log.listeners.push(t); }, removeEventListener() {},
  };
  const window = { document, location: { pathname: '/', search: '' }, localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout() { log.timers++; }, setInterval() { log.timers++; }, addEventListener(t) { log.listeners.push(t); },
    fetch() { return Promise.resolve({ ok: true, status: 201 }); } };
  window.window = window;
  vm.runInNewContext(src, { window, globalThis: window, setTimeout: window.setTimeout, setInterval: window.setInterval, URLSearchParams });
  return { log, host, window };
}

test('no page loads the guest-list script except the opt-in pages (/early-access.html, /earn/black-friday/)', () => {
  const bad = [];
  for (const f of walk(ROOT, '.html')) {
    const rel = relative(ROOT, f);
    const s = readFileSync(f, 'utf8');
    if (/kil-bf-popup\.js/.test(s) && !OPT_IN.has(rel)) bad.push(rel);
  }
  assert.deepEqual(bad, []);
  const ea = readFileSync(join(ROOT, 'early-access.html'), 'utf8');
  assert.match(ea, /<div id="kil-bf-inline"><\/div>/, 'early-access keeps the inline form');
  const bf = readFileSync(join(ROOT, 'earn/black-friday/index.html'), 'utf8');
  assert.match(bf, /<div id="kil-bf-inline"><\/div>/, '/earn/black-friday/ mounts the inline form');
});

test('no HTML page carries modal markup for the guest list', () => {
  const bad = [];
  for (const f of walk(ROOT, '.html')) {
    const rel = relative(ROOT, f);
    const s = readFileSync(f, 'utf8');
    if (/id="kil-bf"|class="kilbf-card"|aria-modal="true"[^>]*kilbf/.test(s)) bad.push(rel);
    // The signup copy may appear only on the opt-in landing page.
    if (!OPT_IN.has(rel) && /Join the guest list|Get on the guest list/.test(s)) bad.push(rel);
  }
  assert.deepEqual(bad, []);
});

test('the guest-list script has no auto-open path: no modal, timer, overlay or scroll/exit trigger', () => {
  assert.deepEqual(autoOpenSignals(POPUP), []);
  const K = require(POPUP_PATH);
  assert.equal(K.shouldAutoOpen, undefined);
});

test('in a page without #kil-bf-inline it does nothing at all', () => {
  const { log } = runInFakePage(POPUP, { inlineHost: false });
  assert.deepEqual(log.created, []);
  assert.deepEqual(log.appended, []);
  assert.equal(log.timers, 0);
  assert.deepEqual(log.listeners, []);
});

test('with #kil-bf-inline it renders the inline form only (no dialog)', () => {
  const { host, log } = runInFakePage(POPUP, { inlineHost: true });
  assert.equal(log.timers, 0);
  // Before Nov 27 the form renders; after, the phase message. Either way: never a dialog.
  assert.ok(!/aria-modal|role="dialog"/.test(host.innerHTML));
});

test('signup endpoint and payload are unchanged', () => {
  const K = require(POPUP_PATH);
  assert.equal(K.SOURCE, 'bf2026-early-access');
  assert.deepEqual(Object.keys(K.buildPayload('a@b.co', '')).sort(), ['email', 'phone', 'source']);
  assert.match(POPUP, /\/rest\/v1\/' \+ table/);
  assert.match(POPUP, /post\(fetchFn, 'subscribers', buildPayload\(email, phone\)\)/);
  assert.match(POPUP, /post\(fetchFn, 'marketing_contacts', buildContact\(email, loc, ref\)\)/);
});

test('no other site script opens a guest-list or timed signup popup', () => {
  const bad = [];
  for (const f of walk(ROOT, '.js')) {
    if (f === POPUP_PATH || /\.test\.|\/vendor\/|\/games\/|\/app\//.test(f)) continue;
    const s = readFileSync(f, 'utf8');
    if (/guest list|kil-bf|kilbf/i.test(s)) bad.push(relative(ROOT, f));
  }
  assert.deepEqual(bad, []);
});

test('NEGATIVE CONTROL: the detector and the fake page catch the pre-hotfix auto-open modal', () => {
  // The exact shape that shipped on origin/main 2663aa7.
  const old = POPUP.replace('  function init() {\n    var doc = root.document, host = doc.getElementById(\'kil-bf-inline\');\n    if (host) mountInline(host);\n  }',
    "  function openModal() {\n    var doc = root.document;\n    var box = doc.createElement('div'); box.id = 'kil-bf';\n    box.innerHTML = '<div class=\"kilbf-card\" role=\"dialog\" aria-modal=\"true\"></div>';\n    doc.body.appendChild(box);\n  }\n"
    + "  function shouldAutoOpen() { return true; }\n"
    + "  function init() {\n    var doc = root.document, host = doc.getElementById('kil-bf-inline');\n    if (host) { mountInline(host); return; }\n    if (!shouldAutoOpen(root.location, Date.now())) return;\n    root.setTimeout(openModal, 5000);\n  }");
  assert.notEqual(old, POPUP, 'control actually injected the modal');
  const hits = autoOpenSignals(old);
  for (const h of ['aria-modal', 'timer', 'modal opener', 'appends to body']) assert.ok(hits.includes(h), h + ' in ' + hits);
  const { log } = runInFakePage(old, { inlineHost: false });
  assert.equal(log.timers, 1, 'the old code scheduled the popup');
  assert.ok(autoOpenSignals("x.addEventListener('mouseout', f)").length > 0, 'exit intent is caught');
  assert.ok(autoOpenSignals("window.addEventListener('scroll', f)").length > 0, 'scroll trigger is caught');
});
