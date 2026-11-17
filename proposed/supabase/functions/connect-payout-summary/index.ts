// PROPOSED connect-payout-summary (TEST MODE ONLY). NOT DEPLOYED. The host dashboard's payout row: the signed-in
// host's verified status (read from Stripe now), the connected account's held / pending balance, the last payouts to
// the bank, and when the next release is due (connect-release-payouts' rule). Read-only apart from storing the status.
import { requireTestObject } from "../_shared/stripe-test-guard.ts";
import { statusFromAccount, statusRpcArgs } from "../_shared/payouts-status.ts";
import { releaseDecision, stripeDelayDays } from "../_shared/release-rule.ts";
import { J, cors, admin, stripeTest, caller, fail } from "../_shared/common.ts";

const usd = (arr: any[] | undefined) => (arr || []).filter((b) => b.currency === "usd").reduce((n, b) => n + (b.amount | 0), 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await caller(req);
    if (!me) return J({ error: "sign in to see payouts" }, 401);
    const db = admin();
    const { data: row } = await db.from("app_users").select("id,handle,stripe_account_id").eq("id", me.id).maybeSingle();
    if (!row?.stripe_account_id) return J({ connected: false, verified: false, test_mode: true });
    const stripe = stripeTest();
    const account = requireTestObject(await stripe.accounts.retrieve(row.stripe_account_id), "account");
    const status = statusFromAccount(account);
    await db.rpc("set_payouts_from_stripe", statusRpcArgs(status));
    const bal = requireTestObject(await stripe.balance.retrieve({ stripeAccount: row.stripe_account_id }), "balance");
    const list = await stripe.payouts.list({ limit: 5 }, { stripeAccount: row.stripe_account_id });
    const payouts = (list?.data || []).map((p: any) => requireTestObject(p, "payout"))
      .map((p: any) => ({ amount: p.amount | 0, currency: p.currency, status: String(p.status), arrival_date: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null }));
    const { data: evs } = await db.from("events").select("id,ends_at,starts_at").eq("owner_handle", row.handle || "");
    const events = [];
    for (const e of evs || []) {
      const { data: paid } = await db.from("event_orders").select("id").eq("event_id", e.id).eq("status", "paid");
      events.push({ ...e, paid_orders: (paid || []).length });
    }
    const d = releaseDecision(events, Date.now());
    return J({
      test_mode: true, connected: true, verified: status.verified,
      charges_enabled: status.charges_enabled, payouts_enabled: status.payouts_enabled, currently_due: status.currently_due.slice(0, 20),
      held_cents: usd(bal.available), pending_cents: usd(bal.pending),
      next_release_at: d.release ? "next daily run" : d.nextReleaseAt ? new Date(d.nextReleaseAt).toISOString() : null,
      stripe_delay_days: stripeDelayDays(account), payouts,
    });
  } catch (e) {
    return fail(e);
  }
});
