// PROPOSED, NOT DEPLOYED. Shared plumbing for the Stripe Connect TEST-MODE payout drafts.
import Stripe from "https://esm.sh/stripe@14?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireTestKey } from "./stripe-test-guard.ts";

export const SITE = "https://keepitil.com";
export const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export const J = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Server-side database access (service role). Only these functions write the Stripe columns, through the
// service-role-only SQL functions in proposed/supabase/sql/payouts_verified_by_stripe.PROPOSED.sql.
export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// The TEST key only (a separate secret from the live STRIPE_SECRET_KEY). Throws StripeModeError before any
// Stripe client exists if it is not sk_test_.
export function stripeTest(): any {
  const key = requireTestKey(Deno.env.get("STRIPE_TEST_SECRET_KEY"));
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

// The calling user, from their JWT (same as create-checkout v58).
export async function caller(req: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data } = await anon.auth.getUser();
    if (!data?.user?.id) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch (_e) {
    return null;
  }
}

// StripeModeError -> 503 "not configured for test mode"; anything else -> 500. Never includes a key.
export function fail(e: unknown) {
  const name = (e as { name?: string })?.name;
  if (name === "StripeModeError") return J({ error: String((e as Error).message), test_mode_only: true }, 503);
  return J({ error: "payouts error: " + String((e as Error)?.message || e).slice(0, 200) }, 500);
}
