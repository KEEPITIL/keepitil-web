// Payout-flag lock, the parts that run in Node (the SQL itself is tested in PGlite under proposed/supabase/tests):
// - the minimal connect-status Edge Function (proposed, not deployed) with in-memory Stripe/Supabase fakes;
// - create-event.html no longer claims payouts in the browser; it asks connect-status.
// No network, no keys (the values below are obvious fakes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FAKES = pathToFileURL(join(HERE, 'fixtures', 'payouts-lock-fakes.mjs')).href;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('https://esm.sh/stripe@') || spec.startsWith('https://esm.sh/@supabase/supabase-js@')) return { url: FAKES, shortCircuit: true };
    return next(spec, ctx);
  }
});
let handler = null;
globalThis.Deno = { env: { get: (k) => globalThis.__pl.env[k] }, serve: (h) => { handler = h; } };
const mod = await import(pathToFileURL(join(ROOT, 'proposed', 'supabase', 'functions', 'connect-status', 'index.ts')).href);

const U = '00000000-0000-0000-0000-0000000000a1';
function world(user = {}, accounts = {}) {
  globalThis.__pl = {
    env: { STRIPE_SECRET_KEY: 'sk_test_FAKE0000', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-FAKE', SUPABASE_ANON_KEY: 'anon-FAKE' },
    uid: U, db: { app_users: [{ id: U, handle: 'host', stripe_account_id: null, payouts_enabled: false, ...user }] },
    accounts, stripeCalls: [], stripeKeys: [], rpcCalls: [], swapAccount: false
  };
  return globalThis.__pl;
}
async function call(body = {}, auth = true) {
  const res = await handler(new Request('https://fn.test/connect-status', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer user-jwt' } : {}) }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}
const me = () => globalThis.__pl.db.app_users[0];
const READY = { charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], disabled_reason: null } };
const HALF = { charges_enabled: true, payouts_enabled: false, requirements: { currently_due: ['external_account'], disabled_reason: 'requirements.past_due' } };

test('payoutReady: charges AND payouts enabled AND no disabled_reason', () => {
  assert.equal(mod.payoutReady(READY).ready, true);
  assert.equal(mod.payoutReady({ ...READY, payouts_enabled: false }).ready, false);
  assert.equal(mod.payoutReady({ ...READY, charges_enabled: false }).ready, false);
  assert.equal(mod.payoutReady({ ...READY, requirements: { disabled_reason: 'rejected.fraud' } }).ready, false);
  assert.equal(mod.payoutReady({ charges_enabled: 'true', payouts_enabled: 1 }).ready, false, 'only real booleans count');
  assert.equal(mod.payoutReady(null).ready, false);
});

test('connect-status: Stripe says ready -> payouts_enabled set true through the service-role writer', async () => {
  const w = world({ stripe_account_id: 'acct_ok1' }, { acct_ok1: READY });
  const r = await call();
  assert.deepEqual([r.status, r.json.connected, r.json.verified], [200, true, true]);
  assert.equal(me().payouts_enabled, true);
  assert.deepEqual(w.rpcCalls.map((c) => [c.name, c.service, c.args]), [['set_payouts_from_stripe', true,
    { p_account: 'acct_ok1', p_charges: true, p_payouts: true, p_disabled_reason: null }]]);
  assert.deepEqual(w.stripeCalls, [['accounts.retrieve', 'acct_ok1']]);
});

test('connect-status: Stripe says not ready -> stays false, and a previously true flag is corrected to false', async () => {
  world({ stripe_account_id: 'acct_half1' }, { acct_half1: HALF });
  let r = await call();
  assert.deepEqual([r.json.verified, r.json.charges_enabled, r.json.payouts_enabled], [false, true, false]);
  assert.deepEqual(r.json.currently_due, ['external_account']);
  assert.equal(me().payouts_enabled, false);
  // the one user flagged true today (possibly client-set) and NOT ready per Stripe: the first check sets it false
  world({ stripe_account_id: 'acct_flag1', payouts_enabled: true }, { acct_flag1: HALF });
  r = await call();
  assert.equal(r.json.verified, false);
  assert.equal(me().payouts_enabled, false);
});

test('NEGATIVE CONTROL: whatever the client sends, only Stripe decides', async () => {
  world({ stripe_account_id: 'acct_half1' }, { acct_half1: HALF });
  const r = await call({ verified: true, payouts_enabled: true, payouts: 'done', p_charges: true });
  assert.equal(r.json.verified, false);
  assert.equal(me().payouts_enabled, false);
  // and once Stripe enables it, the same call sets it
  globalThis.__pl.accounts.acct_half1 = READY;
  assert.equal((await call()).json.verified, true);
  assert.equal(me().payouts_enabled, true);
});

test('connect-status: no account yet -> not connected, Stripe never called, nothing written', async () => {
  const w = world();
  const r = await call();
  assert.deepEqual(r.json, { connected: false, verified: false });
  assert.deepEqual([w.stripeKeys, w.stripeCalls, w.rpcCalls], [[], [], []]);
});

test('connect-status: refusals write nothing (signed out, no Stripe key, Stripe returns another account)', async () => {
  let w = world({ stripe_account_id: 'acct_ok1' }, { acct_ok1: READY });
  assert.equal((await call({}, false)).status, 401);
  w = world({ stripe_account_id: 'acct_ok1' }, { acct_ok1: READY }); w.env.STRIPE_SECRET_KEY = undefined;
  assert.equal((await call()).status, 503);
  assert.deepEqual(w.rpcCalls, []);
  w = world({ stripe_account_id: 'acct_ok1' }, { acct_ok1: READY }); w.swapAccount = true;
  assert.equal((await call()).status, 502);
  assert.deepEqual(w.rpcCalls, []);
  assert.equal(me().payouts_enabled, false);
});

// main's create-event.html, or null when this checkout has no origin/main (CI checks out shallow, one commit).
function mainsCreateEvent() {
  try {
    const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const base = git(['merge-base', 'HEAD', 'origin/main']).trim();
    return git(['show', base + ':create-event.html']);
  } catch {
    return null;
  }
}

test('NEGATIVE CONTROL: main\'s page claims payouts in the browser; this branch\'s page asks the server', (t) => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const before = mainsCreateEvent();
  const after = readFileSync(join(ROOT, 'create-event.html'), 'utf8');
  const claim = /rpc\(\s*'mark_payouts_enabled'\s*\)/;
  if (before === null) {
    t.diagnostic('before-half skipped: origin/main is not in this checkout (shallow clone); the after-half below still runs');
  } else {
    assert.match(strip(before), claim, 'before: the page calls rpc(mark_payouts_enabled) on ?payouts=done');
  }
  assert.doesNotMatch(strip(after), claim, 'after: never');
  assert.match(after, /fetch\(SUPA_URL\+'\/functions\/v1\/connect-status'/);
  assert.match(after, /if\(pd&&pd\.verified===true\)\{ payok=true; \}/, 'payok only from the server\'s verified answer');
  assert.doesNotMatch(strip(after), /payok=true;\s*\}\s*\}catch/, 'no unconditional payok=true after the call');
  assert.match(after, /Stripe is still checking your account/, 'a host who is not ready yet sees "still checking", not "connected"');
  assert.match(after, /pn\.textContent=/, 'text only');
});

test('no Stripe keys, emails or real ids in the files this PR adds', () => {
  const files = execFileSync('git', ['ls-files', '--others', '--cached', '--exclude-standard', 'proposed', 'assets/js/fixtures/payouts-lock-fakes.mjs', 'assets/js/payouts-flag-lock.test.mjs'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert.ok(files.length >= 6, files.join(','));
  for (const f of files) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(s, /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{12,}|whsec_[A-Za-z0-9]{12,}/, f + ': key-like string');
    assert.doesNotMatch(s, /[A-Za-z0-9._%+-]+@(?!example\.invalid)[A-Za-z0-9.-]+\.(com|net|org|io|co)\b/, f + ': email');
    const uuids = (s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []).filter((u) => !/^00000000-0000-0000-0000-0000000000/.test(u));
    assert.deepEqual(uuids, [], f + ': only synthetic 00000000-… test ids');
  }
});
