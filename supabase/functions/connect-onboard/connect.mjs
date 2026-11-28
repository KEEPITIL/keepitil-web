// Stripe Connect Express onboarding scaffold. NOT deployed by merging the site.
// Deploy (needs a GO and live secrets): supabase functions deploy connect-onboard --project-ref ovmqtzjfpzrbzrlkxwgw
// Required secrets, set in the Supabase function environment, never in the browser:
//   STRIPE_SECRET_KEY            platform secret key with Connect enabled
//   SUPABASE_URL                 injected by Supabase
//   SUPABASE_ANON_KEY            injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY    injected by Supabase, used only to store stripe_account_id
//   SITE_URL                     optional, defaults to https://keepitil.com
// The browser sends Authorization only (no apikey header): connect-onboard's CORS list is authorization + content-type.

const corsHeaders = {
  'access-control-allow-origin': 'https://keepitil.com',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'vary': 'Origin',
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status, headers: Object.assign({ 'content-type': 'application/json' }, corsHeaders) });
}

async function stripeForm(fetchImpl, key, path, params) {
  const body = new URLSearchParams();
  Object.keys(params).forEach(function (k) { if (params[k] != null && params[k] !== '') body.set(k, String(params[k])); });
  const res = await fetchImpl('https://api.stripe.com' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || 'stripe_error');
  return data;
}

export async function handleOnboard(req, env, fetchImpl) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const jwt = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_authenticated' }, 401);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'stripe_not_configured' }, 503);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: 'supabase_not_configured' }, 503);
  const fetchFn = fetchImpl || fetch;
  const userRes = await fetchFn(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + jwt, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return json({ error: 'not_authenticated' }, 401);
  const user = await userRes.json();
  const uid = user && user.id;
  if (!uid) return json({ error: 'not_authenticated' }, 401);

  let accountId = '';
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    const lookup = await fetchFn(env.SUPABASE_URL + '/rest/v1/app_users?id=eq.' + encodeURIComponent(uid) + '&select=stripe_account_id', {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
    });
    if (lookup.ok) {
      const rows = await lookup.json();
      accountId = (rows && rows[0] && rows[0].stripe_account_id) || '';
    }
  }
  if (!accountId) {
    const account = await stripeForm(fetchFn, env.STRIPE_SECRET_KEY, '/v1/accounts', {
      type: 'express',
      country: 'US',
      'capabilities[card_payments][requested]': 'true',
      'capabilities[transfers][requested]': 'true',
      'metadata[supabase_uid]': uid,
    });
    accountId = account.id;
    if (env.SUPABASE_SERVICE_ROLE_KEY && accountId) {
      await fetchFn(env.SUPABASE_URL + '/rest/v1/app_users?id=eq.' + encodeURIComponent(uid), {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ stripe_account_id: accountId }),
      });
    }
  }
  const site = env.SITE_URL || 'https://keepitil.com';
  const link = await stripeForm(fetchFn, env.STRIPE_SECRET_KEY, '/v1/account_links', {
    account: accountId,
    type: 'account_onboarding',
    refresh_url: site + '/dashboard?payouts=refresh',
    return_url: site + '/dashboard?payouts=done',
  });
  return json({ url: link.url }, 200);
}
