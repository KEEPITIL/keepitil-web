// PROPOSED connect-status (minimal). NOT DEPLOYED. Ships with the payout-flag lock
// (proposed/supabase/sql/payouts_flag_lock.PROPOSED.sql), because after the lock this is the ONLY way an
// organizer becomes payout-ready: the server reads the organizer's account FROM STRIPE and sets
//   app_users.payouts_enabled = charges_enabled && payouts_enabled && no requirements.disabled_reason
// through the service-role-only public.set_payouts_from_stripe. The page calls it on return from Stripe
// (?payouts=done) instead of the old client rpc('mark_payouts_enabled').
// Uses STRIPE_SECRET_KEY like the live connect-onboard (a TEST key in prod today). #181 replaces this with its
// fuller version (status columns, webhook, test-mode guard) when it rebases on top.
import Stripe from "https://esm.sh/stripe@14?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function caller(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data } = await anon.auth.getUser();
    return data?.user?.id ?? null;
  } catch (_e) {
    return null;
  }
}

// The one rule, from an account object the server itself just read from Stripe.
export function payoutReady(account: any): { charges: boolean; payouts: boolean; disabled: string | null; ready: boolean } {
  const charges = account?.charges_enabled === true, payouts = account?.payouts_enabled === true;
  const r = account?.requirements?.disabled_reason;
  const disabled = typeof r === "string" && r ? r : null;
  return { charges, payouts, disabled, ready: charges && payouts && disabled === null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const uid = await caller(req);
    if (!uid) return J({ error: "sign in to check payouts" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row } = await admin.from("app_users").select("id,stripe_account_id,payouts_enabled").eq("id", uid).maybeSingle();
    if (!row?.stripe_account_id) return J({ connected: false, verified: false });

    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) return J({ error: "payouts are not configured" }, 503);
    const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
    const account = await stripe.accounts.retrieve(row.stripe_account_id);
    if (!account || account.object !== "account" || account.id !== row.stripe_account_id) {
      return J({ error: "Stripe returned a different account" }, 502);
    }
    const s = payoutReady(account);
    const { error } = await admin.rpc("set_payouts_from_stripe", {
      p_account: account.id, p_charges: s.charges, p_payouts: s.payouts, p_disabled_reason: s.disabled,
    });
    if (error) return J({ error: "could not save payout status" }, 500);
    const due = Array.isArray(account.requirements?.currently_due) ? account.requirements.currently_due.slice(0, 20) : [];
    return J({ connected: true, verified: s.ready, charges_enabled: s.charges, payouts_enabled: s.payouts, currently_due: due });
  } catch (e) {
    return J({ error: "payouts error: " + String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
