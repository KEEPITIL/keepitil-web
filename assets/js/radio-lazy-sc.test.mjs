// The SoundCloud player frame loads only where the radio can be seen (Grok-approved draft 2026-11-20).
// Run: node --test assets/js/radio-lazy-sc.test.mjs
//
// /earn hides the docked radio bar on phones (body.rad-m #kil-radio{display:none!important}, and
// applyBarVisibility hides it on every phone), yet main still mounted the w.soundcloud.com iframe at
// idle and on the first tap: an invisible player spamming "encrypted-media" errors.
//
// METHOD: the REAL keepitil-radio.js runs inside jsdom with a fake clock. The /earn case loads the
// REAL earn/index.html markup and CSS (its inline scripts do not run; the one thing they would do
// here, body.rad-m on <=860px, is applied by hand). requestIdleCallback is routed through the fake
// clock, so "idle" is just advancing time. Then: idle + taps + 60s, and look for the iframe.
// NEGATIVE CONTROL: KIL_RADIO_FILE=<main's keepitil-radio.js> makes the hidden-case tests FAIL
// (main mounts the frame there), which proves they can see a mounted frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RADIO = readFileSync(process.env.KIL_RADIO_FILE || path.join(root, 'assets/js/keepitil-radio.js'), 'utf8');
const EARN = readFileSync(path.join(root, 'earn/index.html'), 'utf8');
const PLAIN = '<!doctype html><html><head></head><body><main><p>page</p></main></body></html>';

function load(html, { url, phone }) {
  const vc = new VirtualConsole();           /* jsdom's CSS parser complains about modern CSS; not ours */
  const dom = new JSDOM(html, { url, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc });
  const w = dom.window, d = w.document;
  let now = 0, seq = 0;
  const q = new Map();
  w.setTimeout = (fn, ms = 0) => { const id = ++seq; q.set(id, { fn, at: now + (+ms || 0) }); return id; };
  w.setInterval = (fn, ms = 0) => { const id = ++seq; q.set(id, { fn, at: now + (+ms || 0), every: Math.max(1, +ms || 0) }); return id; };
  w.clearTimeout = w.clearInterval = (id) => { q.delete(id); };
  w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(now), 16);
  w.requestIdleCallback = (fn, o) => w.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 50 }), 50);
  const errors = [];
  const advance = (ms) => {
    const until = now + ms;
    for (let guard = 0; guard < 100000; guard++) {
      let next = null;
      for (const [id, t] of q) if (t.at <= until && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      now = t.at;
      if (t.every) t.at = now + t.every; else q.delete(id);
      try { t.fn(); } catch (e) { errors.push(e); }
    }
    now = until;
  };
  const state = { phone };
  w.matchMedia = (qs) => ({
    matches: /max-width:\s*860px/.test(qs) ? state.phone : false, media: qs,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  });
  w.fetch = () => new Promise(() => {});      /* Supabase never answers: no network in tests */
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  if (phone) d.body.classList.add('rad-m');   /* what earn's inline MOBILE LAYOUT FLAG does */
  w.eval(RADIO);
  return { dom, w, d, advance, errors, state };
}

function settle({ w, d, advance }) {
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.dispatchEvent(new w.Event('load'));
  advance(5000);
}
function tap({ w, d, advance }) {
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) d.body.dispatchEvent(new w.Event(ev, { bubbles: true }));
  advance(1000);
}
const scFrames = (d) => [...d.querySelectorAll('iframe')].filter((f) => /w\.soundcloud\.com/.test(f.src));

test('(b) /earn on a phone, radio hidden: no w.soundcloud.com iframe after idle, taps and 60s', () => {
  const page = load(EARN, { url: 'https://keepitil.com/earn/', phone: true });
  settle(page);
  const bar = page.d.getElementById('kil-radio');
  assert.ok(bar, 'the radio bar element exists (it is hidden, not absent)');
  tap(page); tap(page);
  page.advance(60000);
  assert.deepEqual(scFrames(page.d).map((f) => f.src), []);
  assert.equal(page.d.getElementById('kil-sc'), null);
  assert.equal(page.d.getElementById('kil-sc-api'), null, 'and no SoundCloud API script either');
  assert.equal(page.w.__kilRadioUiVisible(), false, 'the bar must read as hidden on an Earn phone');
});

test('(b2) /earn phone CSS alone hides it: body.rad-m rule from the real page, no inline display', () => {
  const page = load(EARN, { url: 'https://keepitil.com/earn/', phone: true });
  settle(page);
  const bar = page.d.getElementById('kil-radio');
  bar.style.removeProperty('display');        /* take applyBarVisibility out: only earn's CSS left */
  assert.equal(page.w.getComputedStyle(bar).display, 'none', "earn's body.rad-m rule must hide the bar");
  tap(page);
  page.advance(10000);
  assert.deepEqual(scFrames(page.d), []);
});

test('(b3) a page where the shell forbids the radio (#kil-radio display:none): no iframe', () => {
  const page = load(PLAIN, { url: 'https://keepitil.com/', phone: false });
  const st = page.d.createElement('style');
  st.textContent = '#kil-radio,#kil-sc{display:none!important}';   /* keepitil-shell.js _rk */
  page.d.head.appendChild(st);
  settle(page); tap(page); page.advance(10000);
  assert.deepEqual(scFrames(page.d), []);
});

test('(c) desktop, radio visible: the iframe is created at idle, without a tap (autoplay path kept)', () => {
  const page = load(PLAIN, { url: 'https://keepitil.com/', phone: false });
  settle(page);
  assert.equal(page.w.__kilRadioUiVisible(), true);
  const f = scFrames(page.d);
  assert.equal(f.length, 1, 'exactly one SoundCloud frame');
  assert.equal(f[0].id, 'kil-sc');
  assert.equal(f[0].getAttribute('allow'), 'autoplay');
  assert.ok(page.d.getElementById('kil-sc-api'), 'the SoundCloud API script is requested too');
  tap(page); page.advance(10000);
  assert.equal(scFrames(page.d).length, 1, 'taps do not mount a second one');
});

test('(c2) /earn on desktop, radio visible: the iframe is created', () => {
  const page = load(EARN, { url: 'https://keepitil.com/earn/', phone: false });
  settle(page);
  assert.equal(scFrames(page.d).length, 1);
});

test('(c3) hidden first, then the bar appears (phone widened to desktop): the iframe is created then', () => {
  const page = load(EARN, { url: 'https://keepitil.com/earn/', phone: true });
  settle(page); tap(page);
  assert.deepEqual(scFrames(page.d), []);
  page.state.phone = false;
  page.d.body.classList.remove('rad-m');
  page.w.dispatchEvent(new page.w.Event('resize'));
  page.advance(100);
  assert.equal(scFrames(page.d).length, 1);
});
