// PROPOSED connect-onboard (TEST MODE ONLY). NOT DEPLOYED. The live connect-onboard is not in this repo.
// Creates the signed-in organizer's Stripe Express account (once) and returns a Stripe onboarding link.
// It NEVER sets payouts_enabled: that comes only from connect-status / connect-webhook reading the account.
import { requireTestObject } from "../_shared/stripe-test-guard.ts";
import { SITE, J, cors, admin, stripeTest, caller, fail } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await caller(req);
    if (!me) return J({ error: "sign in to set up payouts" }, 401);
    const stripe = stripeTest();                                   // refuses anything but sk_test_
    const db = admin();
    const { data: row } = await db.from("app_users").select("id,handle,stripe_account_id").eq("id", me.id).maybeSingle();
    if (!row?.handle) return J({ error: "pick your KEEPITIL handle first" }, 400);

    let account: any;
    if (row.stripe_account_id) {
      account = requireTestObject(await stripe.accounts.retrieve(row.stripe_account_id), "account");
    } else {
      account = requireTestObject(await stripe.accounts.create({
        type: "express",
        country: "US",
        ...(me.email ? { email: me.email } : {}),
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_profile: { product_description: "Event tickets sold on KEEPITIL" },
        metadata: { keepitil_user_id: me.id, keepitil_handle: row.handle },
      }), "account");
      // Store the new account id server-side; the SQL refuses to overwrite an existing one.
      const { error } = await db.rpc("set_stripe_account_id", { p_user: me.id, p_account: account.id });
      if (error) return J({ error: "could not save the payout account" }, 500);
    }

    // AccountLink objects carry no livemode field; the account above was already checked.
    const link = await stripe.accountLinks.create({
      account: account.id,
      type: "account_onboarding",
      refresh_url: `${SITE}/create-event.html?payouts=refresh`,
      return_url: `${SITE}/create-event.html?payouts=done`,
    });
    return J({ url: link.url, test_mode: true });
  } catch (e) {
    return fail(e);
  }
});
