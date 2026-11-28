// Stripe Connect scaffold. No network. Run: node --test tests/connect-onboard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { handleOnboard } from '../supabase/functions/connect-onboard/connect.mjs';
import { handleWebhook, verifyStripeSignature } from '../supabase/functions/connect-webhook/webhook.mjs';

function req(method, headers, body) {
  return new Request('https://example.test/fn', { method, headers, body });
}

test('onboarding refuses a missing session and a missing platform key', async () => {
  const noAuth = await handleOnboard(req('POST', {}), { STRIPE_SECRET_KEY: 'sk_test' }, async () => { throw new Error('no fetch'); });
  assert.equal(noAuth.status, 401);
  const noKey = await handleOnboard(req('POST', { authorization: 'Bearer jwt' }), { STRIPE_SECRET_KEY: '' }, async () => { throw new Error('no fetch'); });
  assert.equal(noKey.status, 503);
  assert.equal((await noKey.json()).error, 'stripe_not_configured');
});

test('onboarding returns the Stripe account link and does not put the secret in the response', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
    if (String(url).includes('/rest/v1/app_users?id=eq.')) return new Response(JSON.stringify([{ stripe_account_id: '' }]), { status: 200 });
    if (String(url).endsWith('/v1/accounts')) return new Response(JSON.stringify({ id: 'acct_123' }), { status: 200 });
    if (String(url).includes('/rest/v1/app_users?id=eq.') && init && init.method === 'PATCH') return new Response(null, { status: 204 });
    if (String(url).endsWith('/v1/account_links')) return new Response(JSON.stringify({ url: 'https://connect.stripe.com/setup/s/abc' }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const res = await handleOnboard(req('POST', { authorization: 'Bearer jwt' }), {
    STRIPE_SECRET_KEY: 'sk_live_secret',
    SUPABASE_URL: 'https://db.example.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    SITE_URL: 'https://keepitil.com',
  }, fetchImpl);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.url, 'https://connect.stripe.com/setup/s/abc');
  assert.equal(JSON.stringify(body).includes('sk_live_secret'), false);
  assert.ok(calls.some((u) => u.endsWith('/v1/accounts')));
});

test('webhook rejects a missing secret and a bad signature, and syncs account.updated', async () => {
  const missing = await handleWebhook(req('POST', { 'stripe-signature': 't=1,v1=ab' }, '{}'), { STRIPE_WEBHOOK_SECRET: '' });
  assert.equal(missing.status, 503);
  const raw = JSON.stringify({ id: 'evt_1', type: 'account.updated', data: { object: { id: 'acct_123', charges_enabled: true, payouts_enabled: true, details_submitted: true } } });
  const t = String(Math.floor(Date.now() / 1000));
  const good = createHmac('sha256', 'whsec_test').update(t + '.' + raw).digest('hex');
  assert.equal(await verifyStripeSignature(raw, 't=' + t + ',v1=' + good, 'whsec_test', Number(t)), true);
  assert.equal(await verifyStripeSignature(raw, 't=' + t + ',v1=deadbeef', 'whsec_test', Number(t)), false);
  let patched = null;
  const res = await handleWebhook(req('POST', { 'stripe-signature': 't=' + t + ',v1=' + good }, raw), {
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    SUPABASE_URL: 'https://db.example.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
  }, async (url, init) => { patched = { url: String(url), body: init.body }; return new Response(null, { status: 204 }); });
  assert.equal(res.status, 200);
  assert.match(patched.url, /stripe_account_id=eq\.acct_123/);
  assert.equal(JSON.parse(patched.body).payouts_enabled, true);
});

test('the dashboard promote panel offers Connect Payouts without an inline handler', () => {
  const src = readFileSync(new URL('../assets/js/kil-creator.js', import.meta.url), 'utf8');
  assert.match(src, /Connect Payouts/);
  assert.match(src, /functions\/v1\/connect-onboard/);
  assert.doesNotMatch(src, /onclick|STRIPE_SECRET|whsec_/);
});
