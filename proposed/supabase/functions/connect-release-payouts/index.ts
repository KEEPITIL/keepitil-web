// PROPOSED connect-release-payouts (TEST MODE ONLY). NOT DEPLOYED. A daily job (pg_cron + net.http_post with the
// service role key), never a page: "transfer after the event". For every payout-verified host, if every paid event
// has ended + HOLD_DAYS, pays the connected account's AVAILABLE USD balance out to the host's bank (payouts.create on
// the connected account, idempotent per account per day). Otherwise holds, and says until when.
import { requireTestObject } from "../_shared/stripe-test-guard.ts";
import { releaseDecision, releaseKey, HOLD_DAYS } from "../_shared/release-rule.ts";
import { J, admin, stripeTest, fail } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return J({ error: "POST only" }, 405);
  try {
    // Only the scheduler, holding the service role key, may run this. A host token (or none) is refused.
    const auth = req.headers.get("Authorization") || "";
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!svc || auth !== `Bearer ${svc}`) return J({ error: "service only" }, 403);
    const stripe = stripeTest();
    const db = admin();
    const now = Date.now();
    const { data: hosts } = await db.from("app_users").select("id,handle,stripe_account_id,payouts_enabled").eq("payouts_enabled", true);
    const out: any[] = [];
    for (const h of hosts || []) {
      if (!h.stripe_account_id || !h.handle) continue;
      const { data: evs } = await db.from("events").select("id,ends_at,starts_at").eq("owner_handle", h.handle);
      const events = [];
      for (const e of evs || []) {
        const { data: paid } = await db.from("event_orders").select("id").eq("event_id", e.id).eq("status", "paid");
        events.push({ ...e, paid_orders: (paid || []).length });
      }
      const d = releaseDecision(events, now, HOLD_DAYS);
      if (!d.release) { out.push({ handle: h.handle, released: 0, hold_until: d.nextReleaseAt ? new Date(d.nextReleaseAt).toISOString() : null, reason: d.reason }); continue; }
      const bal = requireTestObject(await stripe.balance.retrieve({ stripeAccount: h.stripe_account_id }), "balance");
      const usd = (bal.available || []).filter((b: any) => b.currency === "usd").reduce((n: number, b: any) => n + (b.amount | 0), 0);
      if (usd <= 0) { out.push({ handle: h.handle, released: 0, reason: "nothing available" }); continue; }
      const po = requireTestObject(await stripe.payouts.create({ amount: usd, currency: "usd", metadata: { kind: "keepitil_event_release" } },
        { stripeAccount: h.stripe_account_id, idempotencyKey: releaseKey(h.stripe_account_id, now) }), "payout");
      out.push({ handle: h.handle, released: usd, payout: po.id, status: po.status });
    }
    return J({ test_mode: true, hold_days: HOLD_DAYS, hosts: out });
  } catch (e) {
    return fail(e);
  }
});
