// PROPOSED connect-release-payouts (TEST MODE ONLY). NOT DEPLOYED. A daily job (pg_cron + net.http_post with the
// service role key), never a page: "transfer after the event". For every payout-verified host, if every paid event
// has ENDED, pays the connected account's AVAILABLE USD balance (Stripe decides when funds become available) out to the host's bank (payouts.create on
// the connected account, idempotent per account per day). Otherwise holds, and says until when.
import { requireTestObject } from "../_shared/stripe-test-guard.ts";
import { releaseDecision, releaseKey } from "../_shared/release-rule.ts";
import { J, admin, stripeTest, fail, sameSecret } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return J({ error: "POST only" }, 405);
  try {
    // Only the scheduler may run this: it sends a DEDICATED secret (PAYOUT_RELEASE_CRON_SECRET, kept in Vault for the
    // pg_cron job), not the service role key, compared in constant time. A host token (or none) is refused.
    const auth = req.headers.get("Authorization") || "";
    const secret = Deno.env.get("PAYOUT_RELEASE_CRON_SECRET") || "";
    if (secret.length < 32 || !sameSecret(auth, `Bearer ${secret}`)) return J({ error: "scheduler only" }, 403);
    const stripe = stripeTest();
    const db = admin();
    const now = Date.now();
    const { data: hosts } = await db.from("app_users").select("id,handle,stripe_account_id,payouts_enabled").eq("payouts_enabled", true);
    const out: any[] = [];
    for (const h of hosts || []) {
      if (!h.stripe_account_id || !h.handle) continue;
      try {   // one host's error (e.g. a live acct_ the test key cannot see) never stops the others
      const { data: evs } = await db.from("events").select("id,ends_at,starts_at").eq("owner_handle", h.handle);
      const events = [];
      for (const e of evs || []) {
        const { data: paid } = await db.from("event_orders").select("id").eq("event_id", e.id).eq("status", "paid");
        events.push({ ...e, paid_orders: (paid || []).length });
      }
      const d = releaseDecision(events, now);
      if (!d.release) { out.push({ handle: h.handle, released: 0, hold_until: d.nextReleaseAt ? new Date(d.nextReleaseAt).toISOString() : null, reason: d.reason }); continue; }
      const bal = requireTestObject(await stripe.balance.retrieve({ stripeAccount: h.stripe_account_id }), "balance");
      const usd = (bal.available || []).filter((b: any) => b.currency === "usd").reduce((n: number, b: any) => n + (b.amount | 0), 0);
      if (usd <= 0) { out.push({ handle: h.handle, released: 0, reason: "nothing available" }); continue; }
      const po = requireTestObject(await stripe.payouts.create({ amount: usd, currency: "usd", metadata: { kind: "keepitil_event_release" } },
        { stripeAccount: h.stripe_account_id, idempotencyKey: releaseKey(h.stripe_account_id, now) }), "payout");
      out.push({ handle: h.handle, released: usd, payout: po.id, status: po.status });
      } catch (e) {
        out.push({ handle: h.handle, released: 0, error: (e as Error)?.name === "StripeModeError" ? "not a test-mode account" : "skipped after an error" });
      }
    }
    return J({ test_mode: true, payout_timing: "stripe", hosts: out });
  } catch (e) {
    return fail(e);
  }
});
