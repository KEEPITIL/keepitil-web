// Buyer service fee on event.html (Joe 2026-11-17): the order summary shows the fee BEFORE payment, computed by
// assets/js/kil-fee.js with the checkout's numbers (5% + $0.50 per order); free-only orders show no fee; the old
// "fees included" wording is gone. Offline: the real event.html in jsdom with a fake Supabase client.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVENT_HTML = readFileSync(join(ROOT, 'event.html'), 'utf8');
const FEE_SRC = readFileSync(join(ROOT, 'assets', 'js', 'kil-fee.js'), 'utf8');
const KF = require('./kil-fee.js');

const EVENT_ROW = { id: 5, slug: 'test-night', title: 'Test Night', starts_at: '2099-12-01T03:00:00Z', tz: 'America/Los_Angeles', reg_questions: [], show_lineup: false, show_gallery: false, show_feed: false };
const TIERS = [
  { id: 11, name: 'General', price_cents: 2000, sort: 1 },
  { id: 12, name: 'Early', price_cents: 1999, sort: 2 },
  { id: 13, name: 'Guest list', price_cents: 0, sort: 3 }
];

function chain(result) {
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k === 'then') return (a, b) => Promise.resolve(result).then(a, b);
      if (k === 'catch') return (b) => Promise.resolve(result).catch(b);
      return () => p;
    },
    apply() { return p; }
  });
  return p;
}

// Opens the page, presses "+" on the given tiers, and returns what the order summary says.
async function summary(picks, { loadFee = true } = {}) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.message).slice(0, 160)));
  const sb = {
    from: (t) => t === 'ticket_tiers' ? chain({ data: TIERS }) : chain({ data: null }),
    rpc: (fn) => chain(fn === 'get_event_view' ? { data: [EVENT_ROW] } : { data: null }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }
  };
  const dom = new JSDOM(EVENT_HTML, {
    url: 'https://www.keepitil.com/event?e=test-night', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.supabase = { createClient: () => sb };
      w.qrcode = () => ({ addData() {}, make() {}, createDataURL: () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
      w.fetch = () => Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(null) });
      if (loadFee) w.eval(FEE_SRC);   // jsdom does not fetch <script src>; load the real file the page references
    }
  });
  const d = dom.window.document;
  for (let i = 0; i < 300 && !d.querySelector('.tixrow .plus'); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(d.querySelector('.tixrow .plus'), 'ticket rows rendered');
  for (const [tier, n] of picks) for (let k = 0; k < n; k++) d.querySelector(`.tixrow[data-tier="${tier}"] .plus`).click();
  const out = { sub: d.getElementById('tf-sub').textContent, tax: d.getElementById('tf-tax').textContent, fee: d.getElementById('tf-fee').textContent,
                footer: d.getElementById('ev-tixfoot').textContent, errors };
  dom.window.close();
  return out;
}

test('kil-fee.js: 5% + $0.50 per order, same rounding as the checkout', () => {
  assert.equal(KF.bps, 500);
  assert.equal(KF.flatCents, 50);
  assert.equal(KF.serviceFeeCents(4000), 250);
  assert.equal(KF.serviceFeeCents(1999), 150, 'round(99.95)=100 + 50');
  assert.equal(KF.serviceFeeCents(1990), 150);
  assert.equal(KF.serviceFeeCents(1989), 149);
  assert.equal(KF.serviceFeeCents(0), 0);
  assert.equal(KF.label(), 'Service fee (5% + $0.50 per order)');
});

test('the page loads kil-fee.js before its own script, and "fees included" is gone', () => {
  const a = EVENT_HTML.indexOf('/assets/js/kil-fee.js'), b = EVENT_HTML.indexOf('<script>', EVENT_HTML.indexOf('supabase-js.min.js'));
  assert.ok(a > 0 && a < b, 'kil-fee.js is loaded before the inline page script');
  assert.doesNotMatch(EVENT_HTML, /fees included/i);
});

test('2 x $20: summary shows the fee line and total before payment', async () => {
  const s = await summary([[11, 2]]);
  assert.deepEqual(s.errors, []);
  assert.equal(s.sub, '$40');
  assert.equal(s.fee, 'Service fee (5% + $0.50 per order) $2.50 · Total $42.50');
  assert.equal(s.tax, 'Tax $0.00');
});

test('rounding on the page: one $19.99 ticket -> $1.50 fee, $21.49 total', async () => {
  const s = await summary([[12, 1]]);
  assert.equal(s.fee, 'Service fee (5% + $0.50 per order) $1.50 · Total $21.49');
});

test('multi-tier + free: fee on the paid subtotal only, flat part once', async () => {
  const s = await summary([[11, 1], [12, 1], [13, 3]]);
  const sub = 2000 + 1999;
  assert.equal(KF.serviceFeeCents(sub), 250);   // round(199.95)=200 + 50
  assert.equal(s.fee, 'Service fee (5% + $0.50 per order) $2.50 · Total $42.49');
});

test('free-only order: no fee line', async () => {
  const s = await summary([[13, 2]]);
  assert.equal(s.fee, '');
  assert.doesNotMatch(s.footer, /service fee|fees included/i);
});

test('nothing selected: no fee line', async () => {
  const s = await summary([]);
  assert.equal(s.fee, '');
});

test('if kil-fee.js fails to load, the page still works and shows no made-up fee', async () => {
  const s = await summary([[11, 2]], { loadFee: false });
  assert.deepEqual(s.errors, []);
  assert.equal(s.fee, '');
  assert.equal(s.sub, '$40');
});

test('create-event.html: both fee lines say buyers pay 5% + $0.50 per order', () => {
  const ce = readFileSync(join(ROOT, 'create-event.html'), 'utf8');
  const want = 'Buyers pay a 5% + $0.50 service fee per order; you receive the full ticket price.';
  assert.equal(ce.split(want).length - 1, 2, 'tier note and payouts panel');
  assert.doesNotMatch(ce, /KEEPITIL keeps \d/);
  assert.ok(want.includes(KF.label().match(/\d+% \+ \$\d+\.\d\d/)[0]), 'same numbers as kil-fee.js');
});
