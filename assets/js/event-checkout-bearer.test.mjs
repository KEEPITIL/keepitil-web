// 14A: the ticket purchase on event.html must call create-checkout (verify_jwt=true, signed-in callers only)
// with the SIGNED-IN user's access token as Authorization bearer, never the anon key.
// Offline: the real event.html runs in jsdom with a fake supabase client and a fake fetch. No network, no Stripe.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVENT_HTML = readFileSync(join(ROOT, 'event.html'), 'utf8');
const ANON = /var KEY='([^']+)'/.exec(EVENT_HTML)[1];
const USER_TOKEN = 'user.session.access-token-FAKE';
const SESSION = { access_token: USER_TOKEN, user: { email: 'buyer@example.invalid' } };
const PAID = { id: 11, name: 'General', price_cents: 2500, sort: 1 };
const FREE = { id: 12, name: 'Guest list', price_cents: 0, sort: 2 };
const EVENT_ROW = { id: 5, slug: 'test-night', title: 'Test Night', starts_at: '2026-12-01T03:00:00Z', tz: 'America/Los_Angeles', reg_questions: [], show_lineup: false, show_gallery: false, show_feed: false };
const NEXT = '/apply?next=' + encodeURIComponent('/event?e=test-night');

// any supabase-js builder chain that ends in an awaited / .then()-ed result
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

// Runs the page, picks the first tier, presses Buy and answers the name overlay. Returns what the page did.
async function runPage({ html = EVENT_HTML, session, tiers, checkoutReply }) {
  const rec = { checkoutCalls: [], navs: [], alerts: [], registrations: [], errors: [] };
  // jsdom cannot observe `location.href = ...`; the test records it instead (only that assignment is rewritten).
  const src = html.replace(/\blocation\.href\s*=/g, 'window.__nav=');
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => rec.errors.push(String(e.message).slice(0, 120)));
  const sb = {
    from: (t) => t === 'ticket_tiers' ? chain({ data: tiers }) : t === 'event_registrations'
      ? { insert: (r) => { rec.registrations.push(r); return Promise.resolve({ error: null }); } } : chain({ data: null }),
    rpc: (fn) => chain(fn === 'get_event_view' ? { data: [EVENT_ROW] } : { data: null }),
    auth: { getSession: () => Promise.resolve({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }
  };
  const dom = new JSDOM(src, {
    url: 'https://www.keepitil.com/event?e=test-night', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.supabase = { createClient: () => sb };
      w.qrcode = () => ({ addData() {}, make() {}, createDataURL: () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }); // vendor/qrcode.js is not loaded offline
      Object.defineProperty(w, '__nav', { set(v) { rec.navs.push(v); } });
      w.alert = (m) => rec.alerts.push(m);
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
      w.fetch = (url, init) => {
        if (/\/functions\/v1\/create-checkout/.test(url)) {
          rec.checkoutCalls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
          const r = checkoutReply || { status: 200, json: { url: 'https://checkout.stripe.test/c/pay_FAKE' } };
          return Promise.resolve({ status: r.status, ok: r.status < 400, json: () => Promise.resolve(r.json) });
        }
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(null) });
      };
    }
  });
  const d = dom.window.document;
  const until = async (fn, what) => {
    for (let i = 0; i < 300; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 10)); }
    throw new Error('timeout waiting for ' + what + ' ' + JSON.stringify(rec));
  };
  await until(() => d.querySelector('.tixrow .plus'), 'ticket rows');
  d.querySelector('.tixrow[data-tier="' + tiers[0].id + '"] .plus').click();
  d.getElementById('tf-buy').click();
  if (session && session.access_token) {
    const name = await until(() => d.getElementById('kr-name'), 'attendee overlay');
    name.value = 'Test Buyer'; d.getElementById('kr-go').click();
    await until(() => rec.checkoutCalls.length || rec.navs.length || /on the list/.test(d.getElementById('tf-buy').textContent), 'checkout result');
    await new Promise((r) => setTimeout(r, 60));
  } else { await until(() => rec.navs.length, 'sign-in redirect'); }
  rec.buyText = d.getElementById('tf-buy').textContent;
  dom.window.close();
  return rec;
}

const bearerOf = (call) => call.headers.Authorization;

test('with a session, create-checkout gets the session access token as bearer (not the anon key)', async () => {
  const r = await runPage({ session: SESSION, tiers: [PAID] });
  assert.equal(r.checkoutCalls.length, 1);
  assert.equal(bearerOf(r.checkoutCalls[0]), 'Bearer ' + USER_TOKEN);
  assert.notEqual(bearerOf(r.checkoutCalls[0]), 'Bearer ' + ANON);
  assert.equal(r.checkoutCalls[0].headers.apikey, ANON, 'the apikey header stays the anon key');
  assert.deepEqual(r.checkoutCalls[0].body.items, [{ tier_id: '11', quantity: 1 }]);
  assert.deepEqual(r.navs, ['https://checkout.stripe.test/c/pay_FAKE']);
});

test('with no session, create-checkout is NOT called and the buyer is sent to sign-in with a return path to the event', async () => {
  const r = await runPage({ session: null, tiers: [PAID] });
  assert.equal(r.checkoutCalls.length, 0);
  assert.deepEqual(r.navs, [NEXT]);
});

test('a session without an access token is treated as signed out (no call with an empty bearer)', async () => {
  const r = await runPage({ session: { user: { email: 'x@example.invalid' } }, tiers: [PAID] });
  assert.equal(r.checkoutCalls.length, 0);
  assert.deepEqual(r.navs, [NEXT]);
});

test('401 needs_account: the buyer sees the account message, the button recovers and they go to sign-up with the return path', async () => {
  const r = await runPage({ session: SESSION, tiers: [PAID], checkoutReply: { status: 401, json: { error: 'Create a free KEEPITIL account to buy tickets', needs_account: true } } });
  assert.equal(r.checkoutCalls.length, 1);
  assert.deepEqual(r.alerts, ['Create a free KEEPITIL account to buy tickets']);
  assert.deepEqual(r.navs, [NEXT]);
  assert.notEqual(r.buyText, 'Loading…');
});

test('a gateway 401 without a message still routes to sign-in; a 500 with an error shows it and stays on the page', async () => {
  const a = await runPage({ session: SESSION, tiers: [PAID], checkoutReply: { status: 401, json: { message: 'Invalid JWT' } } });
  assert.equal(a.alerts.length, 1); assert.deepEqual(a.navs, [NEXT]);
  const b = await runPage({ session: SESSION, tiers: [PAID], checkoutReply: { status: 500, json: { error: 'Sold out' } } });
  assert.deepEqual(b.alerts, ['Tickets: Sold out']); assert.equal(b.navs.length, 0);
});

test('free RSVP is unchanged: registration saved, no create-checkout call, "on the list"', async () => {
  const r = await runPage({ session: SESSION, tiers: [FREE] });
  assert.equal(r.checkoutCalls.length, 0);
  assert.equal(r.registrations.length, 1);
  assert.match(r.buyText, /on the list/);
});

test('NEGATIVE CONTROL: the original code (anon key as bearer) is caught by the first test\'s assertion', async () => {
  const original = EVENT_HTML.replace("'Authorization':'Bearer '+sess.access_token", "'Authorization':'Bearer '+KEY");
  assert.notEqual(original, EVENT_HTML, 'mutation applied');
  const r = await runPage({ html: original, session: SESSION, tiers: [PAID] });
  assert.equal(bearerOf(r.checkoutCalls[0]), 'Bearer ' + ANON, 'the original sends the anon key');
  assert.notEqual(bearerOf(r.checkoutCalls[0]), 'Bearer ' + USER_TOKEN, 'so test 1 (expects the session token) fails on it');
});

// ---- static guard: no ticket-path call to create-checkout / create-promo-checkout may use the anon key as bearer ----
const SKIP = /^(db|docs|node_modules|app\/tuitea|\.git|tests)\//;
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n), rel = relative(ROOT, p);
    if (SKIP.test(rel + '/')) continue;
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(html|js|mjs)$/.test(n) && !/\.test\.mjs$/.test(n)) out.push(p);
  }
  return out;
}
const ANON_BEARER = /Bearer\s*['"`]?\s*(\+|\$\{)\s*(KEY|ANON|SUPA_KEY|SUPABASE_KEY|KIL_SUPA_ANON|AK|SUPA_ANON)\b/;
function anonBearerViolations(text, file) {
  const lines = text.split('\n'), bad = [];
  lines.forEach((l, i) => {
    if (/functions\/v1\/create(-promo)?-checkout/.test(l) && ANON_BEARER.test(lines.slice(i, i + 3).join('\n'))) bad.push(file + ':' + (i + 1));
  });
  return bad;
}
test('static guard: no create-checkout call in the site uses the anon key as bearer', () => {
  const bad = walk(ROOT).flatMap((f) => anonBearerViolations(readFileSync(f, 'utf8'), relative(ROOT, f)));
  assert.deepEqual(bad, []);
  assert.match(EVENT_HTML, /functions\/v1\/create-checkout[^\n]*Bearer '\+sess\.access_token/);
});
test('static guard negative control: it flags the original line and accepts the fixed one', () => {
  const orig = "fetch(URL+'/functions/v1/create-checkout',{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+KEY},body:1})";
  assert.deepEqual(anonBearerViolations(orig, 'event.html'), ['event.html:1']);
  assert.deepEqual(anonBearerViolations(orig.replace("'Bearer '+KEY", "'Bearer '+sess.access_token"), 'event.html'), []);
});
