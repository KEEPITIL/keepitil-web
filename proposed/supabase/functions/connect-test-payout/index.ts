// PROPOSED connect-test-payout (TEST MODE ONLY). NOT DEPLOYED. For Friday's Stripe Connect test.
// Runs a small TEST destination charge to the signed-in organizer's connected account, exactly how a ticket sale
// pays an organizer (transfer_data.destination), with Stripe's test card that makes funds available at once
// (pm_card_bypassPending), then reports the connected account's test balance. The bank payout itself follows the
// account's Stripe payout schedule in test mode. It refuses unless Stripe itself says payouts are enabled now.
import { requireTestObject } from "../_shared/stripe-test-guard.ts";
import { statusFromAccount, statusRpcArgs } from "../_shared/payouts-status.ts";
import { J, cors, admin, stripeTest, caller, fail } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await caller(req);
    if (!me) return J({ error: "sign in first" }, 401);
    const stripe = stripeTest();
    const db = admin();
    const { data: row } = await db.from("app_users").select("id,stripe_account_id,payouts_enabled").eq("id", me.id).maybeSingle();
    if (!row?.stripe_account_id) return J({ error: "set up payouts first" }, 409);

    // Re-check with Stripe now (the stored flag alone is not enough), and store what Stripe says.
    const account = requireTestObject(await stripe.accounts.retrieve(row.stripe_account_id), "account");
    const status = statusFromAccount(account);
    await db.rpc("set_payouts_from_stripe", statusRpcArgs(status));
    if (!status.verified) return J({ error: "Stripe has not enabled payouts on this account yet", ...status }, 409);

    let b: any = {};
    try { b = await req.json(); } catch (_e) { b = {}; }
    const amount = Math.max(100, Math.min(10000, Math.round(Number(b.amount_cents) || 1000)));   // $1 to $100, default $10

    const pi = requireTestObject(await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card"],
      payment_method: "pm_card_bypassPending",       // Stripe TEST card: funds available immediately
      confirm: true,
      transfer_data: { destination: account.id },
      metadata: { kind: "connect_test_payout", keepitil_user_id: me.id },
    }), "payment intent");
    const balance = requireTestObject(await stripe.balance.retrieve({ stripeAccount: account.id }), "balance");
    return J({
      test_mode: true,
      payment_intent: pi.id,
      status: pi.status,
      amount,
      destination: account.id,
      connected_balance: { available: balance.available, pending: balance.pending },
    });
  } catch (e) {
    return fail(e);
  }
});
