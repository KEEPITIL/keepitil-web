// PROPOSED connect-webhook (TEST MODE ONLY). NOT DEPLOYED. Deploy with verify_jwt = false (Stripe calls it).
// Handles account.updated from Stripe Connect: verifies the Stripe signature with the TEST webhook secret, refuses
// live-mode events, and writes the account's verified payout status. Nothing else.
import { requireTestObject } from "../_shared/stripe-test-guard.ts";
import { statusFromAccount, statusRpcArgs } from "../_shared/payouts-status.ts";
import { J, admin, stripeTest, fail } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return J({ error: "POST only" }, 405);
  try {
    const stripe = stripeTest();
    const secret = Deno.env.get("STRIPE_TEST_CONNECT_WEBHOOK_SECRET") || "";
    if (!/^whsec_[A-Za-z0-9]{8,}$/.test(secret)) return J({ error: "webhook secret not configured" }, 503);
    const sig = req.headers.get("stripe-signature") || "";
    const body = await req.text();
    let event: any;
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, secret);
    } catch (_e) {
      return J({ error: "bad signature" }, 400);                 // nothing written
    }
    requireTestObject(event, "event");
    if (event.type !== "account.updated") return J({ received: true, ignored: event.type });
    const status = statusFromAccount(event.data && event.data.object);
    const { data, error } = await admin().rpc("set_payouts_from_stripe", statusRpcArgs(status));
    if (error) return J({ error: "could not save payout status" }, 500);
    return J({ received: true, updated: data ?? 0 });
  } catch (e) {
    return fail(e);
  }
});
