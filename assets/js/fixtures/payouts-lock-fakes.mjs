// In-memory Stripe + Supabase fakes for the proposed minimal connect-status Edge Function. No network.
// The test maps the function's esm.sh imports here; state lives on globalThis.__pl.
const S = () => globalThis.__pl;

export default class Stripe {
  constructor(key) {
    S().stripeKeys.push(key ? key.slice(0, 8) : key);
    this.accounts = {
      retrieve: async (id) => {
        S().stripeCalls.push(['accounts.retrieve', id]);
        if (S().swapAccount) return { object: 'account', id: 'acct_someoneelse', charges_enabled: true, payouts_enabled: true, requirements: {} };
        const a = S().accounts[id];
        if (!a) { const e = new Error('No such account'); e.type = 'StripeInvalidRequestError'; throw e; }
        return { object: 'account', id, ...JSON.parse(JSON.stringify(a)) };
      }
    };
  }
}

class Query {
  constructor(t) { this.t = t; this.f = []; }
  select() { return this; }
  eq(c, v) { this.f.push((r) => String(r[c]) === String(v)); return this; }
  maybeSingle() { const r = (S().db[this.t] || []).find((x) => this.f.every((f) => f(x))); return Promise.resolve({ data: r ? { ...r } : null, error: null }); }
}
export function createClient(_url, key, opts) {
  const auth = opts && opts.global && opts.global.headers && opts.global.headers.Authorization;
  return {
    from: (t) => new Query(t),
    // Mirrors the service-role-only public.set_payouts_from_stripe (its real SQL is tested in PGlite).
    rpc: async (name, args) => {
      S().rpcCalls.push({ name, service: /service/.test(key || ''), args });
      if (!/service/.test(key || '')) return { data: null, error: { message: 'permission denied for function ' + name } };
      if (name !== 'set_payouts_from_stripe') return { data: null, error: { message: 'no such function' } };
      let n = 0;
      for (const u of S().db.app_users) if (u.stripe_account_id === args.p_account) {
        u.payouts_enabled = !!args.p_charges && !!args.p_payouts && args.p_disabled_reason == null; n++;
      }
      return { data: n, error: null };
    },
    auth: { getUser: async () => ({ data: { user: auth && S().uid ? { id: S().uid } : null } }) }
  };
}
