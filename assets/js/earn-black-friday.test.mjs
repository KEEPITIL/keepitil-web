// node --test assets/js/earn-black-friday.test.mjs
//
// /earn/black-friday/: the Black Friday early-access page (2026-11-21). It lives under EARN, where
// the Shop slide already lives; the nav stays exactly the five; the signup is the existing INLINE
// form (kil-bf-popup.js -> public.subscribers + public.marketing_contacts), opened by the visitor;
// the merch links go to live Shopify product pages; and there is no radio dock at any width.
// METHOD for the radio and tabs: the REAL keepitil-shell.js runs in jsdom over the REAL page markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PAGE = readFileSync(join(ROOT, 'earn/black-friday/index.html'), 'utf8');
const SHELL = readFileSync(join(ROOT, 'keepitil-shell.js'), 'utf8');
const EARN = readFileSync(join(ROOT, 'earn/index.html'), 'utf8');
const FIVE = ['DISCOVER', 'CONNECT', 'CREATE', 'CULTURE', 'EARN'];

/* The page's markup without its <script> tags (jsdom does not fetch them); the shell is eval'd. */
function load(html, { phone }) {
  const dom = new JSDOM(html.replace(/<script\b[^>]*src=[^>]*><\/script>/g, ''), {
    url: 'https://keepitil.com/earn/black-friday/', pretendToBeVisual: true, runScripts: 'outside-only',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  let now = 0, seq = 0;
  const q = new Map();
  w.setTimeout = (fn, ms = 0) => { const id = ++seq; q.set(id, { fn, at: now + (+ms || 0) }); return id; };
  w.setInterval = (fn, ms = 0) => { const id = ++seq; q.set(id, { fn, at: now + (+ms || 0), every: Math.max(1, +ms || 0) }); return id; };
  w.clearTimeout = w.clearInterval = (id) => { q.delete(id); };
  w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(now), 16);
  w.cancelAnimationFrame = (id) => q.delete(id);
  w.requestIdleCallback = (fn) => w.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 50 }), 50);
  const advance = (ms) => {
    const until = now + ms;
    for (let guard = 0; guard < 100000; guard++) {
      let next = null;
      for (const [id, t] of q) if (t.at <= until && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      now = t.at;
      if (t.every) t.at = now + t.every; else q.delete(id);
      try { t.fn(); } catch (e) {}
    }
    now = until;
  };
  w.matchMedia = (qs) => ({ matches: /max-width:\s*860px/.test(qs) ? phone : false, media: qs,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.fetch = () => new Promise(() => {});
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(w.navigator, 'serviceWorker', { value: undefined, configurable: true });
  w.eval(SHELL);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.dispatchEvent(new w.Event('load'));
  advance(6000);
  return { dom, w, d: w.document };
}
const radioScript = (d) => !!d.querySelector('script[src*="keepitil-radio"]');
const radioHidden = (d) => [...d.querySelectorAll('style')].some((s) => s.textContent.includes('#kil-radio,#kil-sc{display:none!important}'));

test('the page lives under EARN and its static nav is exactly the five tabs (no Shop)', () => {
  assert.match(PAGE, /<link rel="canonical" href="https:\/\/keepitil\.com\/earn\/black-friday\/"\/>/);
  const nav = /<ul class="nav-links">([\s\S]*?)<\/ul>/.exec(PAGE)[1];
  assert.deepEqual([...nav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]), FIVE);
  assert.doesNotMatch(nav, /shop/i);
  assert.match(PAGE, /<script src="\/keepitil-shell\.js\?v=[^"]+" defer><\/script>/, 'the shell gives the phone tabs, as on every main page');
});

test('the signup is the existing inline form, and nothing opens by itself', () => {
  assert.match(PAGE, /<div id="kil-bf-inline"><\/div>/);
  assert.match(PAGE, /<script src="\/assets\/js\/kil-bf-popup\.js\?v=[^"]+" defer><\/script>/);
  assert.doesNotMatch(PAGE, /aria-modal|role="dialog"|position:\s*fixed|setTimeout|<form/);
});

test('no discount code on the page', () => {
  assert.doesNotMatch(PAGE.replace(/<!--[\s\S]*?-->/g, ''), /discount|promo code|coupon|% off|\bcode\b/i);
});

test('every merch link is a live-store product page for one of the five sets', () => {
  const hrefs = [...PAGE.matchAll(/href="(https:\/\/www\.illestratedlifestyle\.com\/products\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 25, '5 sets x (art link + 4 items)');
  const handles = new Set(hrefs.map((h) => new URL(h.replace(/&amp;/g, '&')).pathname.split('/')[2]));
  for (const h of handles) assert.match(h, /^(im-the-boss-koala-cub|mechanic-life-bear|happy-thanksgiving-bear|keepitil-standard-bear|promoted-to-grandpa-bear)-(t-shirt|premium-sweatshirt|mug|tote-bag)(-1)?$/, h);
  assert.equal(handles.size, 20);
  for (const s of ['Koala Cub', 'Mechanic Life Bear', 'Happy Thanksgiving Bear', 'Standard Bear', 'Promoted to Grandpa']) assert.match(PAGE, new RegExp('<h3>' + s + '</h3>'));
});

test('Earn links to the page, outside the partner carousel', () => {
  assert.match(EARN, /<a href="\/earn\/black-friday\/"[^>]*>BLACK FRIDAY EARLY ACCESS/);
  const grid = EARN.slice(EARN.indexOf('<div class="grid g-cards" id="affGrid">'), EARN.indexOf('</section>', EARN.indexOf('id="affGrid"')));
  assert.ok(grid.indexOf('/earn/black-friday/') > grid.indexOf('</a>\n  </div>'), 'the link sits after the carousel');
});

test('desktop: the shell loads no radio on this page (data-radio="off")', () => {
  assert.match(PAGE, /<html [^>]*data-radio="off"/);
  const { d, dom } = load(PAGE, { phone: false });
  assert.equal(radioScript(d), false, 'keepitil-radio.js must not be injected');
  assert.equal(radioHidden(d), true, 'the shell hides #kil-radio/#kil-sc');
  dom.window.close();
});

test('phone: no radio, and the shell mounts the five bottom tabs', () => {
  const { d, dom } = load(PAGE, { phone: true });
  assert.equal(radioScript(d), false);
  const bnav = d.getElementById('kil-bnav');
  assert.ok(bnav, 'bottom nav mounted');
  const labels = [...bnav.querySelectorAll('a')].map((a) => a.textContent.trim().toUpperCase()).filter(Boolean);
  for (const t of FIVE) assert.ok(labels.some((l) => l.includes(t)), t + ' tab in ' + labels);
  dom.window.close();
});

test('NEGATIVE CONTROL: without data-radio="off" the same page gets the desktop radio', () => {
  const { d, dom } = load(PAGE.replace(' data-radio="off"', ''), { phone: false });
  assert.equal(radioScript(d), true, 'the check can see an injected radio');
  dom.window.close();
});
