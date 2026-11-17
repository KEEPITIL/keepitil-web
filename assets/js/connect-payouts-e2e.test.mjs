// Stripe Connect payouts END TO END in TEST MODE (proposed functions under proposed/supabase/functions; NOT deployed).
// onboard (Express test account, manual payouts) -> Stripe verifies (account.updated webhook) -> a test ticket sale
// lands on the host's connected balance -> the money is HELD until the event ends + HOLD_DAYS -> the daily release
// pays it out (idempotent) -> the host dashboard row shows held / next release / paid out. In-memory fakes, no
// network, no keys. Every rule has a negative control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN = join(HERE, '..', '..', 'proposed', 'supabase', 'functions');
const FAKES = pathToFileURL(join(HERE, 'fixtures', 'connect-e2e-fakes.mjs')).href;
const require = createRequire(import.meta.url);
const HP = require('./kil-host-payouts.js');
registerHooks({ resolve(spec, ctx, next) {
  if (spec.startsWith('https://esm.sh/stripe@') || spec.startsWith('https://esm.sh/@supabase/supabase-js@')) return { url: FAKES, shortCircuit: true };
  return next(spec, ctx);
} });
let captured = null;
globalThis.Deno = { env: { get: (k) => globalThis.__sc.env[k] }, serve: (h) => { captured = h; } };
const load = async (name) => { captured = null; await import(pathToFileURL(join(FN, name, 'index.ts')).href); assert.equal(typeof captured, 'function', name); return captured; };
const H = { onboard: await load('connect-onboard'), webhook: await load('connect-webhook'), sale: await load('connect-test-payout'),
            release: await load('connect-release-payouts'), summary: await load('connect-payout-summary') };
const rule = await import(pathToFileURL(join(FN, '_shared', 'release-rule.ts')).href);
const { statusRpcArgs, statusFromAccount } = await import(pathToFileURL(join(FN, '_shared', 'payouts-status.ts')).href);

const TEST_KEY = 'sk_test_FAKE0000', WHSEC = 'whsec_FAKE0000', SVC = 'service-role-FAKE';
const U = '00000000-0000-0000-0000-0000000000a1', DAY = 86_400_000;
function world(over = {}) {
  globalThis.__sc = {
    env: { STRIPE_TEST_SECRET_KEY: TEST_KEY, STRIPE_TEST_CONNECT_WEBHOOK_SECRET: WHSEC, SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: SVC, SUPABASE_ANON_KEY: 'anon-FAKE' },
    user: { id: U, email: 'host@example.invalid' },
    db: { app_users: [{ id: U, handle: 'host', stripe_account_id: null, payouts_enabled: false }], events: [], event_orders: [] },
    accounts: {}, balances: {}, payouts: {}, seq: 0, stripeCalls: [], rpcCalls: [], rpcErrors: [], stripeKeysUsed: [], liveObjects: false, ...over,
  };
  return globalThis.__sc;
}
const post = (h, body, headers = { Authorization: 'Bearer user-token' }) => h(new Request('https://fn.test', { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }));
const json = async (r) => ({ status: r.status, body: await r.json() });
const svcHeaders = { Authorization: `Bearer ${SVC}` };
const verify = async (w) => {   // Stripe finishes onboarding: account.updated, signed
  const id = w.db.app_users[0].stripe_account_id;
  Object.assign(w.accounts[id], { charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { currently_due: [], disabled_reason: null } });
  const ev = { object: 'event', livemode: false, type: 'account.updated', data: { object: { object: 'account', livemode: false, ...w.accounts[id] } } };
  return json(await H.webhook(new Request('https://fn.test', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=' + WHSEC }, body: JSON.stringify(ev) })));
};
const hostEvent = (w, endsAgoDays, paid = 1) => {
  const id = w.db.events.length + 1;
  w.db.events.push({ id, owner_handle: 'host', starts_at: new Date(Date.now() - (endsAgoDays + 0.2) * DAY).toISOString(), ends_at: new Date(Date.now() - endsAgoDays * DAY).toISOString() });
  for (let i = 0; i < paid; i++) w.db.event_orders.push({ id: id * 100 + i, event_id: id, status: 'paid' });
  return id;
};

test('END TO END: onboard → verified → sale lands → held during the event window → released after → dashboard shows it', async () => {
  const w = world();
  const ob = await json(await post(H.onboard, {}));
  assert.equal(ob.status, 200); assert.equal(ob.body.test_mode, true);
  const acct = w.db.app_users[0].stripe_account_id;
  assert.match(acct, /^acct_test/);
  assert.equal(w.accounts[acct].settings.payouts.schedule.interval, 'manual', 'money is held on the account, not paid out by Stripe automatically');
  assert.equal(w.db.app_users[0].payouts_enabled, false, 'onboarding never sets payouts');
  assert.equal((await verify(w)).body.updated, 1);
  assert.equal(w.db.app_users[0].payouts_enabled, true, 'only Stripe (signed webhook) makes the host payout-ready');

  const sale = await json(await post(H.sale, { amount_cents: 2500 }));
  assert.equal(sale.status, 200); assert.equal(sale.body.connected_balance.available[0].amount, 2500);

  hostEvent(w, 1);                                         // event ended 1 day ago: still inside the 3-day hold
  let rel = await json(await post(H.release, undefined, svcHeaders));
  assert.equal(rel.body.hosts[0].released, 0); assert.match(rel.body.hosts[0].hold_until, /^\d{4}-/);
  let sum = await json(await post(H.summary, undefined));
  assert.equal(sum.body.held_cents, 2500); assert.match(sum.body.next_release_at, /^\d{4}-/);

  w.db.events[0].ends_at = new Date(Date.now() - 4 * DAY).toISOString();   // now past ends_at + 3 days
  rel = await json(await post(H.release, undefined, svcHeaders));
  assert.equal(rel.body.hosts[0].released, 2500); assert.match(rel.body.hosts[0].payout, /^po_test/);
  const again = await json(await post(H.release, undefined, svcHeaders));
  assert.equal(again.body.hosts[0].released, 0, 'nothing left: a retried run never pays twice');
  assert.equal(w.payouts[acct].length, 1);
  const call = w.stripeCalls.find((c) => c.what === 'payouts.create');
  assert.equal(call.opts.stripeAccount, acct); assert.match(call.opts.idempotencyKey, new RegExp(`^kil-release-${acct}-\\d{4}-\\d{2}-\\d{2}$`));

  sum = await json(await post(H.summary, undefined));
  assert.equal(sum.body.held_cents, 0); assert.equal(sum.body.payouts[0].amount, 2500);
  const dom = new JSDOM('<div id="p"></div>'); const el = dom.window.document.getElementById('p');
  HP.render(dom.window.document, el, sum.body);
  assert.match(el.textContent, /Payouts: ready/); assert.match(el.textContent, /Paid out \$25\.00 · pending · arrives \d{4}-\d{2}-\d{2}/); assert.match(el.textContent, /TEST mode/);
  assert.deepEqual(w.stripeKeysUsed.filter((k) => k !== 'sk_test_'), [], 'only the TEST key was ever used');
  assert.deepEqual(w.rpcErrors, [], 'every status write matched STEP 1\'s set_payouts_from_stripe signature');
});

test('release rule: holds until every PAID event ended + HOLD_DAYS; free events and undated paid events behave safely', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const ev = (endDaysAgo, paid = 1, ends = true) => ({ id: 1, ends_at: ends ? new Date(now - endDaysAgo * DAY).toISOString() : null, starts_at: ends ? null : null, paid_orders: paid });
  assert.equal(rule.HOLD_DAYS, 3);
  assert.equal(rule.releaseDecision([ev(4)], now).release, true);
  assert.equal(rule.releaseDecision([ev(2)], now).release, false);
  assert.equal(rule.releaseDecision([ev(10), ev(1)], now).release, false, 'one event still in its window holds the host');
  assert.equal(rule.releaseDecision([ev(1, 0)], now).reason, 'no paid events');
  assert.deepEqual(rule.releaseDecision([ev(0, 1, false)], now), { release: false, nextReleaseAt: null, reason: 'a paid event has no date' });
  assert.equal(rule.releaseAt({ id: 1, ends_at: null, starts_at: '2026-11-10T20:00:00Z', paid_orders: 1 }, 3), Date.parse('2026-11-14T20:00:00Z'), 'no end time: start + 1 day');
});

test('NEGATIVE CONTROLS: live key, live objects, host token on the release job, unverified host, bad webhook signature', async () => {
  let w = world({ env: { ...world().env, STRIPE_TEST_SECRET_KEY: 'sk_live_FAKE0000' } });
  assert.equal((await post(H.onboard, {})).status, 503, 'a live key is refused before any Stripe call');
  assert.equal(w.stripeCalls.length, 0);
  w = world({ liveObjects: true });
  assert.equal((await post(H.onboard, {})).status, 503, 'a livemode object is refused');
  w = world(); await post(H.onboard, {}); await verify(w); hostEvent(w, 10);
  assert.equal((await post(H.release, undefined)).status, 403, 'a host token cannot run the release job');
  assert.equal((await post(H.release, undefined, {})).status, 403, 'nor can no token');
  assert.equal(w.stripeCalls.filter((c) => c.what === 'payouts.create').length, 0);
  w = world(); await post(H.onboard, {}); hostEvent(w, 10);   // never verified by Stripe
  const r = await json(await post(H.release, undefined, svcHeaders));
  assert.deepEqual(r.body.hosts, [], 'an unverified host is never paid out');
  const bad = await H.webhook(new Request('https://fn.test', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=whsec_WRONG000' }, body: '{}' }));
  assert.equal(bad.status, 400);
});

test('#181 regression: the status write now matches STEP 1\'s 4-argument SQL function (p_due removed)', () => {
  const s = statusFromAccount({ object: 'account', livemode: false, id: 'acct_x1', charges_enabled: true, payouts_enabled: true, requirements: { currently_due: ['a'], disabled_reason: null } });
  assert.deepEqual(Object.keys(statusRpcArgs(s)).sort(), ['p_account', 'p_charges', 'p_disabled_reason', 'p_payouts']);
  const lock = readFileSync(join(HERE, '..', '..', 'proposed', 'supabase', 'sql', 'payouts_flag_lock.PROPOSED.sql'), 'utf8');
  assert.match(lock, /set_payouts_from_stripe\(p_account text, p_charges boolean, p_payouts boolean,\s+p_disabled_reason text\)/);
});

test('onboarding stores the account id via the service role only, never overwrites one, and the host page cannot', async () => {
  const w = world(); w.db.app_users[0].stripe_account_id = null;
  await post(H.onboard, {}); const first = w.db.app_users[0].stripe_account_id;
  await post(H.onboard, {});
  assert.equal(w.db.app_users[0].stripe_account_id, first, 'a second onboarding reuses the account');
  assert.equal(w.stripeCalls.filter((c) => c.what === 'accounts.create').length, 1);
  const fakes = await import(FAKES);
  const userClient = fakes.createClient('https://db.test', 'anon-FAKE', {});
  const res = await userClient.from('app_users').update({ stripe_account_id: 'acct_evil' }).eq('id', U);
  assert.match(res.error.message, /only be set by the server/, 'STEP 1 guard: a client cannot set it');
});

test('dashboard: the PAYOUTS card ships hidden behind KIL_FLAGS.hostPayouts; the row writes text only', () => {
  const html = readFileSync(join(HERE, '..', '..', 'organizers', 'dashboard.html'), 'utf8');
  assert.match(html, /<div class="card" id="payouts-card" hidden>/);
  assert.match(html, /window\.KIL_FLAGS && window\.KIL_FLAGS\.hostPayouts/);
  const dom = new JSDOM('<div id="p"></div>'); const el = dom.window.document.getElementById('p');
  HP.render(dom.window.document, el, { connected: true, verified: false, currently_due: ['<img src=x onerror=alert(1)>'], held_cents: 0, payouts: [] });
  assert.equal(el.querySelector('img'), null, 'NEGATIVE CONTROL: markup in Stripe fields is shown as text');
  assert.match(el.textContent, /not ready yet/);
  HP.render(dom.window.document, el, null);
  assert.match(el.textContent, /could not be checked/);
});
