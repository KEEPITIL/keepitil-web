// PROPOSED connect-status (TEST MODE ONLY). NOT DEPLOYED.
// The server refresh: reads the caller's Stripe account FROM STRIPE, writes the verified status to app_users
// through the service-role-only SQL function, and returns it for the host dashboard. The page calls this on return
// from Stripe onboarding instead of the old client-callable mark_payouts_enabled().
import { requireTestObject } from "../_shared/stripe-test-guard.ts";
import { statusFromAccount, statusRpcArgs } from "../_shared/payouts-status.ts";
import { J, cors, admin, stripeTest, caller, fail } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const me = await caller(req);
    if (!me) return J({ error: "sign in to see payout status" }, 401);
    const stripe = stripeTest();
    const db = admin();
    const { data: row } = await db.from("app_users").select("id,stripe_account_id").eq("id", me.id).maybeSingle();
    if (!row?.stripe_account_id) return J({ connected: false, verified: false, test_mode: true });

    const account = requireTestObject(await stripe.accounts.retrieve(row.stripe_account_id), "account");
    if (account.id !== row.stripe_account_id) return J({ error: "Stripe returned a different account" }, 500);
    const owner = account.metadata && account.metadata.keepitil_user_id;
    if (owner && owner !== me.id) return J({ error: "this payout account belongs to another user" }, 403);

    const status = statusFromAccount(account);
    const { error } = await db.rpc("set_payouts_from_stripe", statusRpcArgs(status));
    if (error) return J({ error: "could not save payout status" }, 500);
    return J({ connected: true, test_mode: true, ...status });
  } catch (e) {
    return fail(e);
  }
});
