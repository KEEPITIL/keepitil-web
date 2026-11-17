// Stripe Connect TEST-MODE payouts (PROPOSED Edge Functions under proposed/supabase/functions; not deployed).
// Runs the real function source in Node with in-memory Stripe + Supabase fakes (assets/js/fixtures/
// stripe-connect-fakes.mjs): no network, no keys. Each rule has a negative control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { registerHooks, createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FN = join(ROOT, 'proposed', 'supabase', 'functions');
const FAKES = pathToFileURL(join(HERE, 'fixtures', 'stripe-connect-fakes.mjs')).href;
const require = createRequire(import.meta.url);
const KP = require('./kil-payouts.js');

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('https://esm.sh/stripe@') || spec.startsWith('https://esm.sh/@supabase/supabase-js@')) return { url: FAKES, shortCircuit: true };
    return next(spec, ctx);
  }
});
let captured = null;
globalThis.Deno = { env: { get: (k) => globalThis.__sc.env[k] }, serve: (h) => { captured = h; } };
async function load(name) { captured = null; await import(pathToFileURL(join(FN, name, 'index.ts')).href); assert.equal(typeof captured, 'function'); return captured; }
const H = { onboard: await load('connect-onboard'), status: await load('connect-status'), webhook: await load('connect-webhook'), payout: await load('connect-test-payout') };
const guard = await import(pathToFileURL(join(FN, '_shared', 'stripe-test-guard.ts')).href);
const { statusFromAccount } = await import(pathToFileURL(join(FN, '_shared', 'payouts-status.ts')).href);

// Fake, obviously-not-real values (short on purpose: they cannot be mistaken for real Stripe keys).
const TEST_KEY = 'sk_test_FAKE0000', WHSEC = 'whsec_FAKE0000';
const U = '00000000-0000-0000-0000-0000000000a1';
function world(over = {}) {
  globalThis.__sc = {
    env: { STRIPE_TEST_SECRET_KEY: TEST_KEY, STRIPE_TEST_CONNECT_WEBHOOK_SECRET: WHSEC, SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-FAKE', SUPABASE_ANON_KEY: 'anon-FAKE' },
    user: { id: U, email: 'host@example.invalid' },
    db: { app_users: [{ id: U, handle: 'host', stripe_account_id: null, payouts_enabled: false }] },
    accounts: {}, seq: 0, stripeCalls: [], rpcCalls: [], stripeKeysUsed: [], liveObjects: false, ...over
  };
  return globalThis.__sc;
}
const me = () => globalThis.__sc.db.app_users[0];
function readyAccount(w, id = 'acct_ready1', extra = {}) {
  w.accounts[id] = { id, metadata: { keepitil_user_id: U }, charges_enabled: true, payouts_enabled: true, details_submitted: true,
                     requirements: { currently_due: [], disabled_reason: null }, ...extra };
  w.db.app_users[0].stripe_account_id = id;
  return id;
}
async function call(h, body = {}, { auth = true, headers = {}, raw } = {}) {
  const res = await h(new Request('https://fn.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer user-jwt' } : {}), ...headers }, body: raw ?? JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}
const stripeWrites = () => globalThis.__sc.stripeCalls.filter((c) => /create/.test(c.what));
const statusWrites = () => globalThis.__sc.rpcCalls.filter((c) => c.name === 'set_payouts_from_stripe');
const signed = (event) => ({ raw: JSON.stringify(event), headers: { 'stripe-signature': 't=1,v1=' + WHSEC } });
const accountEvent = (acct, livemode = false) => ({ id: 'evt_1', object: 'event', livemode, type: 'account.updated', data: { object: { object: 'account', livemode, ...acct } } });

// ============================================================================================= the guards
test('requireTestKey: only a secret TEST key; the error never contains the key', () => {
  assert.equal(guard.requireTestKey('sk_test_abcd1234'), 'sk_test_abcd1234');
  for (const bad of ['sk_live_abcd1234', 'rk_live_abcd1234', 'rk_test_abcd1234', 'pk_test_abcd1234', 'pk_live_abcd1234', 'sk_test_', 'sk_test_abc',
                     ' sk_test_abcd1234', 'sk_test_abcd1234\n', '', undefined, null, 123]) {
    assert.throws(() => guard.requireTestKey(bad), (e) => e.name === 'StripeModeError' && !String(e.message).includes('abcd1234'), String(bad));
  }
});

test('requireTestObject: livemode must be exactly false', () => {
  assert.ok(guard.requireTestObject({ livemode: false }));
  for (const bad of [{ livemode: true }, {}, { livemode: 'false' }, { livemode: 0 }, null, undefined, 'acct_1']) {
    assert.throws(() => guard.requireTestObject(bad, 'thing'), /not a test-mode object/, JSON.stringify(bad));
  }
});

test('statusFromAccount: verified only when charges AND payouts are enabled and nothing disables the account', () => {
  const a = (o) => ({ object: 'account', id: 'acct_x1', livemode: false, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], disabled_reason: null }, ...o });
  assert.equal(statusFromAccount(a({})).verified, true);
  assert.equal(statusFromAccount(a({ payouts_enabled: false })).verified, false);
  assert.equal(statusFromAccount(a({ charges_enabled: false })).verified, false);
  assert.equal(statusFromAccount(a({ requirements: { currently_due: ['external_account'], disabled_reason: 'requirements.past_due' } })).verified, false);
  assert.deepEqual(statusFromAccount(a({ requirements: { currently_due: ['external_account'], disabled_reason: null } })).currently_due, ['external_account']);
  assert.throws(() => statusFromAccount(a({ livemode: true })), /not a test-mode object/);
  assert.throws(() => statusFromAccount({ object: 'customer', id: 'cus_1', livemode: false }), /not a Stripe account/);
});

// ============================================================================================= refusals
test('every function REFUSES a non-test key: 503, Stripe never built, nothing written', async () => {
  for (const key of ['sk_live_abcd1234', 'rk_live_abcd1234', 'pk_test_abcd1234', undefined]) {
    for (const [name, h] of Object.entries(H)) {
      const w = world(); w.env.STRIPE_TEST_SECRET_KEY = key; readyAccount(w);
      const before = JSON.stringify(w.db);
      const r = name === 'webhook' ? await call(h, null, signed(accountEvent(w.accounts.acct_ready1))) : await call(h);
      assert.equal(r.status, 503, `${name} with ${key}`);
      assert.equal(r.json.test_mode_only, true);
      assert.deepEqual(w.stripeKeysUsed, [], `${name}: no Stripe client was created`);
      assert.deepEqual(w.stripeCalls, []);
      assert.deepEqual(w.rpcCalls, [], `${name}: nothing written`);
      assert.equal(JSON.stringify(w.db), before);
    }
  }
  // NEGATIVE CONTROL: with the test key the same calls do reach Stripe
  const w = world(); readyAccount(w); await call(H.status);
  assert.deepEqual(w.stripeKeysUsed, ['sk_test_']);
});

test('every function REFUSES livemode=true Stripe objects and writes nothing', async () => {
  for (const [name, h] of Object.entries(H)) {
    const w = world({ liveObjects: true });
    if (name !== 'onboard') readyAccount(w);
    const r = name === 'webhook' ? await call(h, null, signed(accountEvent(w.accounts.acct_ready1, true))) : await call(h);
    assert.equal(r.status, 503, name);
    assert.match(r.json.error, /not a test-mode object/, name);
    assert.deepEqual(statusWrites(), [], name + ': no status written');
    assert.equal(me().payouts_enabled, false, name);
    assert.ok(!w.rpcCalls.some((c) => c.name === 'set_stripe_account_id'), name + ': no account id stored');
    assert.ok(!stripeWrites().some((c) => c.what === 'paymentIntents.create'), name + ': no payment');
  }
});

// ============================================================================================= the client-claim hole
test('NEGATIVE CONTROL: the current page lets the browser mark payouts enabled; the new page does not', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const oldPage = execFileSync('git', ['show', '32fe95c:create-event.html'], { cwd: ROOT, encoding: 'utf8' });
  const newPage = readFileSync(join(ROOT, 'create-event.html'), 'utf8');
  const claim = /rpc\(\s*'mark_payouts_enabled'\s*\)/;
  assert.match(strip(oldPage), claim, 'before: ?payouts=done makes the browser call mark_payouts_enabled()');
  assert.doesNotMatch(strip(newPage), claim, 'after: the page never claims payouts itself');
  assert.doesNotMatch(strip(newPage), /payouts_enabled\s*[:=]\s*true|\.update\([^)]*payouts_enabled/, 'and never writes the flag');
  assert.match(newPage, /\/assets\/js\/kil-payouts\.js/);
  assert.match(newPage, /KIL_PAYOUTS\.refresh\(window\.fetch\.bind\(window\), SUPA_URL, s\.access_token\)/);
});

test('a client claim alone does nothing: returning with ?payouts=done, the server still asks Stripe', async () => {
  // The organizer "comes back" from Stripe but has not finished: Stripe says not enabled.
  const w = world();
  w.accounts.acct_half1 = { id: 'acct_half1', metadata: { keepitil_user_id: U }, charges_enabled: false, payouts_enabled: false, details_submitted: true,
                            requirements: { currently_due: ['external_account'], disabled_reason: 'requirements.past_due' } };
  me().stripe_account_id = 'acct_half1';
  const r = await call(H.status, { payouts: 'done', verified: true, payouts_enabled: true });   // whatever the client says
  assert.equal(r.status, 200);
  assert.equal(r.json.verified, false);
  assert.equal(me().payouts_enabled, false, 'flag stays false');
  assert.deepEqual(me().stripe_requirements_due, ['external_account']);
  // and a signed-in user cannot call the server-only writer directly (only the service role can)
  const { createClient } = await import(FAKES);
  const userClient = createClient('https://db.test', 'anon-FAKE', { global: { headers: { Authorization: 'Bearer user-jwt' } } });
  const direct = await userClient.rpc('set_payouts_from_stripe', { p_account: 'acct_half1', p_charges: true, p_payouts: true, p_due: [], p_disabled_reason: null });
  assert.match(direct.error.message, /permission denied/);
  assert.equal(me().payouts_enabled, false);
  // NEGATIVE CONTROL: once Stripe says enabled, the same server call sets it
  Object.assign(w.accounts.acct_half1, { charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], disabled_reason: null } });
  assert.equal((await call(H.status)).json.verified, true);
  assert.equal(me().payouts_enabled, true);
});

// ============================================================================================= onboarding
test('connect-onboard: creates ONE Express test account, stores it server-side, returns the Stripe link, never sets payouts', async () => {
  const w = world();
  const r = await call(H.onboard);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.match(r.json.url, /^https:\/\/connect\.stripe\.test\/setup\/acct_test\d+$/);
  const create = w.stripeCalls.find((c) => c.what === 'accounts.create').args;
  assert.equal(create.type, 'express');
  assert.deepEqual(create.capabilities, { card_payments: { requested: true }, transfers: { requested: true } });
  assert.equal(create.metadata.keepitil_user_id, U);
  const link = w.stripeCalls.find((c) => c.what === 'accountLinks.create').args;
  assert.equal(link.type, 'account_onboarding');
  assert.equal(link.return_url, 'https://keepitil.com/create-event.html?payouts=done');
  assert.match(me().stripe_account_id, /^acct_test/);
  assert.equal(w.rpcCalls[0].key, 'service-role', 'stored through the service role');
  assert.equal(me().payouts_enabled, false, 'onboarding never sets payouts');
  // second time: same account, no new one
  const again = await call(H.onboard);
  assert.equal(again.status, 200);
  assert.equal(w.stripeCalls.filter((c) => c.what === 'accounts.create').length, 1);
  assert.equal((await call(H.onboard, {}, { auth: false })).status, 401);
});

// ============================================================================================= status refresh
test('connect-status: reads Stripe, stores the verified status, refuses someone else\'s account', async () => {
  let w = world(); readyAccount(w);
  let r = await call(H.status);
  assert.deepEqual([r.status, r.json.verified, r.json.charges_enabled, r.json.payouts_enabled], [200, true, true, true]);
  assert.equal(me().payouts_enabled, true);
  w = world();
  r = await call(H.status);
  assert.deepEqual(r.json, { connected: false, verified: false, test_mode: true });
  w = world(); readyAccount(w, 'acct_other1', { metadata: { keepitil_user_id: 'someone-else' } });
  r = await call(H.status);
  assert.equal(r.status, 403);
  assert.deepEqual(statusWrites(), []);
  assert.equal(me().payouts_enabled, false);
});

// ============================================================================================= webhook
test('connect-webhook: only a correctly signed TEST account.updated changes the status', async () => {
  let w = world(); me().stripe_account_id = 'acct_ready1';
  const ready = { id: 'acct_ready1', charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], disabled_reason: null }, metadata: {} };
  // bad signature: nothing
  let r = await call(H.webhook, null, { raw: JSON.stringify(accountEvent(ready)), headers: { 'stripe-signature': 't=1,v1=whsec_WRONG000' } });
  assert.equal(r.status, 400); assert.deepEqual(statusWrites(), []); assert.equal(me().payouts_enabled, false);
  // other event types: ignored
  r = await call(H.webhook, null, signed({ ...accountEvent(ready), type: 'payout.paid' }));
  assert.equal(r.json.ignored, 'payout.paid'); assert.deepEqual(statusWrites(), []);
  // missing webhook secret: refused
  w.env.STRIPE_TEST_CONNECT_WEBHOOK_SECRET = undefined;
  r = await call(H.webhook, null, signed(accountEvent(ready)));
  assert.equal(r.status, 503);
  // NEGATIVE CONTROL: a valid signed test account.updated does update it
  w = world(); me().stripe_account_id = 'acct_ready1';
  r = await call(H.webhook, null, signed(accountEvent(ready)));
  assert.deepEqual([r.status, r.json.updated], [200, 1]);
  assert.equal(me().payouts_enabled, true);
  // and a later "disabled" update turns it back off
  r = await call(H.webhook, null, signed(accountEvent({ ...ready, payouts_enabled: false, requirements: { currently_due: ['external_account'], disabled_reason: 'requirements.past_due' } })));
  assert.equal(me().payouts_enabled, false);
});

// ============================================================================================= test payout
test('connect-test-payout: refuses until Stripe enables payouts; then a TEST destination charge to the organizer', async () => {
  // not set up
  let w = world();
  assert.equal((await call(H.payout)).status, 409);
  // set up but not enabled by Stripe (even if the stored flag were true)
  w = world(); w.accounts.acct_half1 = { id: 'acct_half1', metadata: {}, charges_enabled: true, payouts_enabled: false, requirements: { currently_due: ['external_account'], disabled_reason: null } };
  me().stripe_account_id = 'acct_half1'; me().payouts_enabled = true;
  let r = await call(H.payout);
  assert.equal(r.status, 409);
  assert.ok(!w.stripeCalls.some((c) => c.what === 'paymentIntents.create'), 'no charge');
  assert.equal(me().payouts_enabled, false, 'stale flag corrected from Stripe');
  // NEGATIVE CONTROL: verified by Stripe -> the test charge runs
  w = world(); readyAccount(w);
  r = await call(H.payout);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const pi = w.stripeCalls.find((c) => c.what === 'paymentIntents.create').args;
  assert.deepEqual([pi.amount, pi.currency, pi.payment_method, pi.confirm, pi.transfer_data.destination], [1000, 'usd', 'pm_card_bypassPending', true, 'acct_ready1']);
  assert.equal(pi.metadata.kind, 'connect_test_payout');
  assert.deepEqual(r.json.connected_balance.available, [{ amount: 900, currency: 'usd' }]);
  assert.equal(r.json.test_mode, true);
  // amount is clamped to $1..$100
  for (const [ask, got] of [[50, 100], [99999, 10000], ['abc', 1000], [2500, 2500]]) {
    w = world(); readyAccount(w); await call(H.payout, { amount_cents: ask });
    assert.equal(w.stripeCalls.find((c) => c.what === 'paymentIntents.create').args.amount, got, String(ask));
  }
});

// ============================================================================================= dashboard
test('host dashboard: status lines come from the server response only', async () => {
  const dom = new JSDOM('<div class="rail"><div class="card"></div></div>');
  const d = dom.window.document;
  const half = KP.normalize({ connected: true, verified: false, charges_enabled: true, payouts_enabled: false, currently_due: ['external_account', 'individual.verification.document'], disabled_reason: null, test_mode: true });
  const box = KP.render(d, d.querySelector('.card'), half);
  assert.equal(box.getAttribute('data-verified'), 'no');
  assert.deepEqual([...box.querySelectorAll('p')].map((p) => p.textContent), [
    'Card payments: enabled', 'Payouts to your bank: not enabled yet',
    'Stripe still needs: external account, individual verification document', 'Stripe TEST mode: no real money moves.']);
  assert.deepEqual(KP.describe(null), ['Payout status could not be checked with Stripe right now.']);
  assert.deepEqual(KP.describe(KP.normalize({ connected: false, verified: false })), ['No Stripe account connected yet.']);
  // refresh: posts to connect-status with the user's token; an error / unreachable server gives null (no made-up status)
  const calls = [];
  const ok = await KP.refresh((u, o) => { calls.push([u, o.headers.Authorization]); return Promise.resolve({ ok: true, json: () => Promise.resolve({ connected: true, verified: true, charges_enabled: true, payouts_enabled: true }) }); }, 'https://db.test', 'tok');
  assert.equal(ok.verified, true);
  assert.deepEqual(calls, [['https://db.test/functions/v1/connect-status', 'Bearer tok']]);
  assert.equal(await KP.refresh(() => Promise.reject(new Error('offline')), 'x', 't'), null);
  assert.equal(await KP.refresh(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }), 'x', 't'), null);
  assert.equal(await KP.refresh(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ error: 'x' }) }), 'x', 't'), null);
  // text only: a hostile field name from the server cannot inject markup
  const evil = KP.render(d, d.querySelector('.card'), KP.normalize({ connected: true, currently_due: ['<img src=x onerror=alert(1)>'] }));
  assert.equal(evil.querySelector('img'), null);
});

test('no Stripe keys or webhook secrets in the repo files this PR adds', () => {
  const files = execFileSync('git', ['ls-files', '--others', '--cached', '--exclude-standard', 'proposed', 'assets/js/kil-payouts.js', 'assets/js/connect-payouts.test.mjs', 'assets/js/fixtures'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert.ok(files.length >= 8, files.join(','));
  for (const f of files) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(s, /\b(sk|rk)_(live|test)_[A-Za-z0-9]{12,}|whsec_[A-Za-z0-9]{12,}/, f + ' contains something that looks like a real key');
  }
});
