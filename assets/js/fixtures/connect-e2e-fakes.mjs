// In-memory Stripe Connect + Supabase fakes for the TEST-MODE payout functions (no network, no keys).
// State lives on globalThis.__sc. Models: accounts (manual payouts), destination charges landing on the connected
// account's balance, payouts.create/list per connected account with idempotency keys, webhook signatures, and the
// supabase-js calls the functions use. set_payouts_from_stripe mirrors STEP 1's 4-argument SQL function exactly.
const S = () => globalThis.__sc;
const rec = (what, args, opts) => S().stripeCalls.push({ what, args: args === undefined ? null : JSON.parse(JSON.stringify(args)), opts: opts ? JSON.parse(JSON.stringify(opts)) : null });
const live = () => S().liveObjects === true;
function account(id) {
  const a = S().accounts[id];
  if (!a) { const e = new Error('No such account: ' + id); e.type = 'StripeInvalidRequestError'; throw e; }
  return { object: 'account', livemode: live(), ...JSON.parse(JSON.stringify(a)) };
}
const bal = (id) => (S().balances[id] ??= { available: 0, pending: 0 });

export default class Stripe {
  constructor(key) {
    S().stripeKeysUsed.push(key ? key.slice(0, 8) : key);
    this.accounts = {
      create: async (p) => {
        rec('accounts.create', p);
        const id = 'acct_test' + (++S().seq);
        S().accounts[id] = { id, metadata: p.metadata || {}, settings: p.settings || {}, charges_enabled: false, payouts_enabled: false, details_submitted: false,
                             requirements: { currently_due: ['external_account'], disabled_reason: 'requirements.past_due' } };
        return account(id);
      },
      retrieve: async (id) => { rec('accounts.retrieve', id); return account(id); }
    };
    this.accountLinks = { create: async (p) => { rec('accountLinks.create', p); return { object: 'account_link', url: 'https://connect.stripe.test/setup/' + p.account }; } };
    this.paymentIntents = {
      create: async (p) => {
        rec('paymentIntents.create', p);
        if (p.transfer_data?.destination) bal(p.transfer_data.destination).available += p.amount;   // pm_card_bypassPending: available at once
        return { object: 'payment_intent', id: 'pi_test' + (++S().seq), livemode: live(), status: 'succeeded', amount: p.amount, transfer_data: p.transfer_data };
      }
    };
    this.balance = {
      retrieve: async (opts) => {
        rec('balance.retrieve', null, opts);
        const b = bal(opts.stripeAccount);
        return { object: 'balance', livemode: live(), available: [{ amount: b.available, currency: 'usd' }], pending: [{ amount: b.pending, currency: 'usd' }] };
      }
    };
    this.payouts = {
      create: async (p, opts) => {
        rec('payouts.create', p, opts);
        S().idem ??= {};
        if (S().idem[opts.idempotencyKey]) return S().idem[opts.idempotencyKey];
        const b = bal(opts.stripeAccount);
        if (p.amount > b.available) { const e = new Error('Insufficient funds'); e.type = 'StripeInvalidRequestError'; throw e; }
        b.available -= p.amount;
        const po = { object: 'payout', id: 'po_test' + (++S().seq), livemode: live(), amount: p.amount, currency: p.currency, status: 'pending', arrival_date: 1800000000 };
        (S().payouts[opts.stripeAccount] ??= []).unshift(po);
        S().idem[opts.idempotencyKey] = po;
        return po;
      },
      list: async (p, opts) => { rec('payouts.list', p, opts); return { object: 'list', data: (S().payouts[opts.stripeAccount] || []).slice(0, p.limit || 10) }; }
    };
    this.webhooks = {
      constructEventAsync: async (body, sig, secret) => {
        if (sig !== 't=1,v1=' + secret) { const e = new Error('No signatures found'); e.type = 'StripeSignatureVerificationError'; throw e; }
        return JSON.parse(body);
      }
    };
  }
}

// ---- supabase-js (the subset the functions use)
class Query {
  constructor(table, svc) { this.table = table; this.svc = svc; this.filters = []; this.patch = null; }
  select() { return this; }
  eq(c, v) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  update(p) { this.patch = p; return this; }
  rows() { return (S().db[this.table] || []).filter((r) => this.filters.every((f) => f(r))); }
  maybeSingle() { const r = this.rows(); return Promise.resolve({ data: r[0] ? { ...r[0] } : null, error: null }); }
  then(ok, bad) {
    let res;
    if (this.patch) {
      // STEP 1's guard_stripe_columns: only the server role may change stripe_account_id / payouts_enabled
      if (!this.svc && ('stripe_account_id' in this.patch || 'payouts_enabled' in this.patch)) res = { data: null, error: { message: 'payout fields can only be set by the server from Stripe' } };
      else { const r = this.rows(); r.forEach((x) => Object.assign(x, this.patch)); res = { data: r.map((x) => ({ id: x.id })), error: null }; }
    } else res = { data: this.rows().map((x) => ({ ...x })), error: null };
    return Promise.resolve(res).then(ok, bad);
  }
}
const RPC = {
  // STEP 1 (#182): public.set_payouts_from_stripe(p_account text, p_charges boolean, p_payouts boolean, p_disabled_reason text)
  set_payouts_from_stripe(args) {
    const keys = Object.keys(args).sort().join();
    if (keys !== 'p_account,p_charges,p_disabled_reason,p_payouts') return { data: null, error: { message: `Could not find the function public.set_payouts_from_stripe(${Object.keys(args).join(', ')})` } };
    let n = 0;
    for (const u of S().db.app_users) if (u.stripe_account_id === args.p_account) { u.payouts_enabled = !!args.p_charges && !!args.p_payouts && args.p_disabled_reason == null; n++; }
    return { data: n, error: null };
  }
};
export function createClient(_url, key, opts) {
  const auth = opts?.global?.headers?.Authorization;
  const svc = /service/.test(key || '');
  return {
    from: (t) => new Query(t, svc),
    rpc: async (name, args) => {
      S().rpcCalls.push({ name, args });
      if (!svc) return { data: null, error: { message: 'permission denied for function ' + name } };
      const r = RPC[name] ? RPC[name](args) : { data: null, error: { message: 'no such function ' + name } };
      if (r.error) S().rpcErrors.push(r.error.message);
      return r;
    },
    auth: { getUser: async () => ({ data: { user: auth && S().user ? S().user : null } }) }
  };
}
