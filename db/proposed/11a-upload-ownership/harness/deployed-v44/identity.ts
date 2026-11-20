// v3.1 STEP 6 — THE ONE BOUNDARY THAT MATTERS MOST.
//
//   THE MODEL NEVER SUPPLIES IDENTITY.
//
// BAD : args from the LLM contain user_id / actor_id / account_id / scopes / credit_balance
// GOOD: OAuth session -> SERVER derives actor -> RLS -> model passes ONLY domain args
//
// If the model can name the user, the entire permission + credit system becomes
// decoration. This module is the enforcement point, and it fails CLOSED: an
// identity-shaped key anywhere in the argument tree rejects the whole call. It is
// never stripped-and-continued, because a model that tried to set identity is a
// signal, not a formatting mistake.

import type { ServerContext } from "./types.ts";

/**
 * Keys a model may never send. Matched case-insensitively, at any depth.
 * Additions are cheap; removals require review.
 */
const FORBIDDEN_ARG_KEYS: readonly string[] = [
  // identity
  "user_id", "userid", "actor_id", "actorid", "account_id", "accountid",
  "owner_id", "profile_id", "uid", "sub", "actor", "user", "impersonate",
  // authorization
  "scopes", "scope", "role", "roles", "is_admin", "admin", "permissions",
  "authorization", "auth", "jwt", "token", "access_token", "refresh_token",
  "api_key", "apikey", "secret", "service_role", "service_role_key", "password",
  // entitlement
  "credit_balance", "credits", "credits_available", "subscription", "plan",
  "autonomy_level", "max_risk_class", "envelope_id", "reservation_id",
  "budget", "ad_spend", "billable_to_customer",
];

const FORBIDDEN = new Set(FORBIDDEN_ARG_KEYS.map((k) => k.toLowerCase()));

export class IdentityBoundaryViolation extends Error {
  readonly key: string;
  readonly path: string;
  constructor(key: string, path: string) {
    super(
      `identity_from_model: argument "${path}" is server-derived and must never be supplied by a model`,
    );
    this.name = "IdentityBoundaryViolation";
    this.key = key;
    this.path = path;
  }
}

/**
 * Recursively rejects identity/authorization/entitlement keys in model-supplied
 * args. Depth-capped so a hostile payload cannot exhaust the stack.
 */
export function assertNoIdentityArgs(
  value: unknown,
  path = "args",
  depth = 0,
): void {
  if (depth > 12 || value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoIdentityArgs(v, `${path}[${i}]`, depth + 1));
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const norm = key.toLowerCase().replace(/[\s-]/g, "_");
    if (FORBIDDEN.has(norm)) {
      throw new IdentityBoundaryViolation(key, `${path}.${key}`);
    }
    assertNoIdentityArgs(child, `${path}.${key}`, depth + 1);
  }
}

/**
 * Derives the actor from the caller's session — the ONLY sanctioned source.
 * Returns null when the JWT is absent or invalid; callers must treat that as 401.
 */
export async function deriveServerContext(
  req: Request,
  // deno-lint-ignore no-explicit-any
  userDb: any,
  // deno-lint-ignore no-explicit-any
  adminDb: any,
): Promise<ServerContext | null> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return null;

  const { data, error } = await userDb.auth.getUser();
  if (error || !data?.user?.id) return null;

  const actor_id: string = data.user.id;
  const email: string | null = data.user.email ?? null;

  // Profile + admin status are read with the service-role client because this is
  // the server establishing WHO the caller is — it is not user-facing tool work.
  const [{ data: profile }, { data: adminRow }] = await Promise.all([
    adminDb.from("app_users").select("handle, display_name").eq("id", actor_id)
      .maybeSingle(),
    adminDb.from("app_admins").select("user_id").eq("user_id", actor_id)
      .maybeSingle(),
  ]);

  return {
    actor_id,
    handle: profile?.handle ?? null,
    display_name: profile?.display_name ?? null,
    email,
    is_admin: Boolean(adminRow),
    authorization,
  };
}
