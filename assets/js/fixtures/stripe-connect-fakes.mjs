// In-memory Stripe (Connect) and Supabase fakes for the proposed payout Edge Functions. No network.
// The test maps the functions' esm.sh imports here. State lives on globalThis.__sc so each test sets it up.
const S = () => globalThis.__sc;
const rec = (what, args) => { S().stripeCalls.push({ what, args: args === undefined ? null : JSON.parse(JSON.stringify(args)) }); };
const live = () => S().liveObjects === true;              // make Stripe return livemode:true objects

function account(id) {
  const a = S().accounts[id];
  if (!a) { const e = new Error('No such account: ' + id); e.type = 'StripeInvalidRequestError'; throw e; }
  return { object: 'account', livemode: live(), ...JSON.parse(JSON.stringify(a)) };
}

export default class Stripe {
  constructor(key) {
    S().stripeKeysUsed.push(key ? key.slice(0, 8) : key);   // prefix only, to prove which mode was used
    this.accounts = {
      create: async (p) => {
        rec('accounts.create', p);
        const id = 'acct_test' + (++S().seq);
        S().accounts[id] = { id, metadata: p.metadata || {}, charges_enabled: false, payouts_enabled: false, details_submitted: false,
                             requirements: { currently_due: ['external_account', 'tos_acceptance.date'], disabled_reason: 'requirements.past_due' } };
        return account(id);
      },
      retrieve: async (id) => { rec('accounts.retrieve', id); return account(id); }
    };
    this.accountLinks = {
      create: async (p) => { rec('accountLinks.create', p); return { object: 'account_link', url: 'https://connect.stripe.test/setup/' + p.account, expires_at: 9999999999 }; }
    };
    this.paymentIntents = {
      create: async (p) => {
        rec('paymentIntents.create', p);
        return { object: 'payment_intent', id: 'pi_test' + (++S().seq), livemode: live(), status: 'succeeded', amount: p.amount, transfer_data: p.transfer_data };
      }
    };
    this.balance = {
      retrieve: async (opts) => { rec('balance.retrieve', opts); return { object: 'balance', livemode: live(), available: [{ amount: 900, currency: 'usd' }], pending: [] }; }
    };
    this.webhooks = {
      // The fake signs with "t=1,v1=<secret>" over the exact body; anything else is a bad signature.
      constructEventAsync: async (body, sig, secret) => {
        rec('webhooks.constructEventAsync', { sig });
        if (sig !== 't=1,v1=' + secret) { const e = new Error('No signatures found matching the expected signature'); e.type = 'StripeSignatureVerificationError'; throw e; }
        return JSON.parse(body);
      }
    };
  }
}

// ---- supabase-js
class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; }
  eq(c, v) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
  maybeSingle() { const rows = (S().db[this.table] || []).filter((r) => this.filters.every((f) => f(r))); return Promise.resolve({ data: rows[0] ? { ...rows[0] } : null, error: null }); }
}
// The two service-role SQL functions, mirrored (their real SQL is tested in PGlite separately).
const RPC = {
  set_stripe_account_id({ p_user, p_account }) {
    if (!/^acct_[A-Za-z0-9]+$/.test(p_account)) return { data: null, error: { message: 'not a Stripe account id' } };
    const u = S().db.app_users.find((r) => r.id === p_user && r.stripe_account_id == null);
    if (u) u.stripe_account_id = p_account;
    return { data: !!u, error: null };
  },
  set_payouts_from_stripe({ p_account, p_charges, p_payouts, p_due, p_disabled_reason }) {
    let n = 0;
    for (const u of S().db.app_users) if (u.stripe_account_id === p_account) {
      Object.assign(u, { payouts_enabled: !!p_charges && !!p_payouts && p_disabled_reason == null, stripe_charges_enabled: !!p_charges,
                        stripe_requirements_due: p_due || [], stripe_disabled_reason: p_disabled_reason ?? null });
      n++;
    }
    return { data: n, error: null };
  }
};
export function createClient(_url, key, opts) {
  const auth = opts && opts.global && opts.global.headers && opts.global.headers.Authorization;
  return {
    from: (t) => new Query(t),
    rpc: async (name, args) => {
      S().rpcCalls.push({ name, key: key ? key.slice(0, 12) : key, args });
      if (!/service/.test(key || '')) return { data: null, error: { message: 'permission denied for function ' + name } };   // only the service role
      return RPC[name] ? RPC[name](args) : { data: null, error: { message: 'no such function ' + name } };
    },
    auth: { getUser: async () => ({ data: { user: auth && S().user ? S().user : null } }) }
  };
}
