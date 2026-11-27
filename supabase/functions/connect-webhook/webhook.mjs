// Stripe Connect webhook scaffold. NOT deployed by merging the site.
// Deploy: supabase functions deploy connect-webhook --no-verify-jwt --project-ref ovmqtzjfpzrbzrlkxwgw
// Required secret: STRIPE_WEBHOOK_SECRET (whsec_… from the Connect endpoint in the Stripe Dashboard).
// Also SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, injected by Supabase.
// Listens for account.updated and writes payouts_enabled on app_users.stripe_account_id.
// Point the Stripe endpoint at https://ovmqtzjfpzrbzrlkxwgw.supabase.co/functions/v1/connect-webhook

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status, headers: { 'content-type': 'application/json' } });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function verifyStripeSignature(raw, header, secret, nowSec) {
  if (!secret || !header || !raw) return false;
  const parts = {};
  String(header).split(',').forEach(function (p) { const i = p.indexOf('='); if (i > 0) parts[p.slice(0, i)] = p.slice(i + 1); });
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t)) return false;
  if (Math.abs((nowSec || Math.floor(Date.now() / 1000)) - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + raw));
  const hex = Array.from(new Uint8Array(mac)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  return timingSafeEqual(hex, v1);
}

export async function handleWebhook(req, env, fetchImpl) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'webhook_not_configured' }, 503);
  const raw = await req.text();
  const ok = await verifyStripeSignature(raw, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'bad_signature' }, 400);
  let event;
  try { event = JSON.parse(raw); } catch (e) { return json({ error: 'bad_json' }, 400); }
  if (!event || event.type !== 'account.updated' || !event.data || !event.data.object) return json({ ok: true, ignored: true }, 200);
  const account = event.data.object;
  const enabled = !!(account.charges_enabled && account.payouts_enabled && account.details_submitted);
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && account.id) {
    const fetchFn = fetchImpl || fetch;
    await fetchFn(env.SUPABASE_URL + '/rest/v1/app_users?stripe_account_id=eq.' + encodeURIComponent(account.id), {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ payouts_enabled: enabled }),
    });
  }
  return json({ ok: true, payouts_enabled: enabled }, 200);
}
