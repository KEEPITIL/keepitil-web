// PROPOSED, NOT DEPLOYED. Shared plumbing for the Stripe Connect TEST-MODE payout drafts.
import Stripe from "https://esm.sh/stripe@14?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireTestKey } from "./stripe-test-guard.ts";

export const SITE = "https://keepitil.com";
export const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export const J = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// keepitil-prod. TEST-MODE payout drafts must NEVER run against it (Tower 1 review H1): they write
// app_users.stripe_account_id / payouts_enabled, the very columns the live checkout trusts, so a TEST acct_ there
// would mark a host payable in live and break their live sales. They run against a non-prod project only (local
// Supabase or a separate test project). Checked before any database client or Stripe client exists.
export const PROD_REFS = ["ovmqtzjfpzrbzrlkxwgw"];
export function requireNonProdDb(url: string | undefined): string {
  let host = "";
  try { host = new URL(String(url)).hostname; } catch (_e) { /* invalid -> refused below */ }
  if (!host || PROD_REFS.some((ref) => host === `${ref}.supabase.co` || host.startsWith(`${ref}.`))) {
    const e = new Error("refusing to run: TEST-mode payouts never run against keepitil-prod (use a non-prod Supabase project)");
    e.name = "StripeModeError";
    throw e;
  }
  return String(url);
}

// Server-side database access (service role) on the NON-PROD project only.
export const admin = () => createClient(requireNonProdDb(Deno.env.get("SUPABASE_URL")), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// The TEST key only (a separate secret from the live STRIPE_SECRET_KEY). Throws StripeModeError before any
// Stripe client exists if it is not sk_test_.
export function stripeTest(): any {
  requireNonProdDb(Deno.env.get("SUPABASE_URL"));
  const key = requireTestKey(Deno.env.get("STRIPE_TEST_SECRET_KEY"));
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

// The calling user, from their JWT (same as create-checkout v58).
export async function caller(req: Request): Promise<{ id: string; email: string | null } | null> {
  const url = requireNonProdDb(Deno.env.get("SUPABASE_URL"));   // throws (-> 503) before anything else on prod
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
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
  console.error("payouts error", (e as Error)?.name);      // details stay in the function log, never in the response
  return J({ error: "payouts error" }, 500);
}

// Constant-time string compare (the release job's shared secret).
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0 && x.length > 0;
}
