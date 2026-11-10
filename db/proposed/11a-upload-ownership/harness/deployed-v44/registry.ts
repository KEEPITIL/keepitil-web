// v3.1 STEP 6 — the typed registry.
//
// public.agent_tool_policies is the SOURCE OF TRUTH for risk_class,
// min_autonomy_level, is_external, is_mcp_safe and credit_cost. This registry
// READS it. It does not restate those values, so a policy or price change is an
// UPDATE, never a deploy.
//
// The table is an ALLOW-LIST: a tool absent from it is DENIED. A tool present in
// code but absent from the table is therefore unreachable — that is the intended
// direction of failure.

import type { CanonicalTarget, PrivacyClass, ToolDef, ToolPolicyRow } from "./types.ts";
import { PHASE_1_TOOLS } from "./tools.ts";
import { STEP_10_TOOLS } from "./events.ts";
import { STEP_11_TOOLS } from "./social.ts";
import { STEP_12_TOOLS } from "./media.ts";

const POLICY_TTL_MS = 60_000;

let cache: { at: number; rows: Map<string, ToolPolicyRow> } | null = null;

/** Loads (and briefly caches) the policy table. */
export async function loadPolicies(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  force = false,
): Promise<Map<string, ToolPolicyRow>> {
  if (!force && cache && Date.now() - cache.at < POLICY_TTL_MS) return cache.rows;

  const { data, error } = await adminDb
    .from("agent_tool_policies")
    .select(
      "tool_name, risk_class, min_autonomy_level, requires_confirmation, is_external, is_mcp_safe, max_privacy_class, description, enabled",
    );
  if (error) throw new Error(`policy_load_failed: ${error.message}`);

  const rows = new Map<string, ToolPolicyRow>();
  for (const r of (data ?? []) as ToolPolicyRow[]) rows.set(r.tool_name, r);
  cache = { at: Date.now(), rows };
  return rows;
}

/** The TypeScript side of the mirror: implementations, keyed by tool name. */
export const IMPLEMENTATIONS: Map<string, ToolDef<any, unknown>> = new Map(
  [...PHASE_1_TOOLS, ...STEP_10_TOOLS, ...STEP_11_TOOLS, ...STEP_12_TOOLS]
    .map((t) => [t.name, t] as const),
);

// ---------------------------------------------------------- canonical targets
//
// #92: four campaign tables exist and three are dead. An agent writing to the
// wrong one produces work that silently never sends. Table names are resolved
// from agent_canonical_targets at RUNTIME, never written into TypeScript.

const TARGET_TTL_MS = 300_000;
let targetCache: { at: number; rows: Map<string, CanonicalTarget> } | null = null;

export async function resolveCanonicalTarget(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  concept: string,
): Promise<CanonicalTarget> {
  if (!targetCache || Date.now() - targetCache.at > TARGET_TTL_MS) {
    const { data, error } = await adminDb.from("agent_canonical_targets")
      .select("concept, write_table, detail_table, legacy_tables, notes");
    if (error) throw new Error(`canonical_targets_load_failed: ${error.message}`);
    const rows = new Map<string, CanonicalTarget>();
    for (const r of (data ?? []) as CanonicalTarget[]) rows.set(r.concept, r);
    targetCache = { at: Date.now(), rows };
  }
  const hit = targetCache.rows.get(concept);
  // Fail CLOSED. Guessing a table is exactly the mistake the registry prevents.
  if (!hit) throw new Error(`no_canonical_target_for_concept: ${concept}`);
  return hit;
}

export function getImplementation(name: string): ToolDef<any, unknown> | null {
  return IMPLEMENTATIONS.get(name) ?? null;
}

export interface MirrorReport {
  in_sync: boolean;
  implemented: string[];
  /** Implemented in TS but missing from the allow-list => permanently DENIED. */
  missing_from_policy: string[];
  /** Implemented but the policy row is disabled. */
  disabled_in_policy: string[];
  /** Allow-listed but not yet implemented — expected while phases roll out. */
  not_yet_implemented: string[];
}

/**
 * Compares code against the allow-list. Surfaced by the diagnostics op so drift
 * is visible instead of silently degrading into "tool not found" at runtime.
 */
export async function auditMirror(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
): Promise<MirrorReport> {
  const policies = await loadPolicies(adminDb, true);
  const implemented = [...IMPLEMENTATIONS.keys()].sort();

  const missing_from_policy = implemented.filter((n) => !policies.has(n));
  const disabled_in_policy = implemented.filter((n) => policies.get(n)?.enabled === false);
  const not_yet_implemented = [...policies.keys()]
    .filter((n) => !IMPLEMENTATIONS.has(n))
    .sort();

  return {
    in_sync: missing_from_policy.length === 0 && disabled_in_policy.length === 0,
    implemented,
    missing_from_policy,
    disabled_in_policy,
    not_yet_implemented,
  };
}

/**
 * Model-facing tool descriptors for the tools this actor may actually reach.
 * Only DOMAIN parameters are exposed — never risk, autonomy, credits or identity.
 * `is_mcp_safe=false` tools are withheld from MCP surfaces entirely.
 */
export async function describeToolsForModel(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  opts: { mcp?: boolean } = {},
): Promise<Array<{ name: string; description: string; parameters: Record<string, unknown> }>> {
  const policies = await loadPolicies(adminDb);
  const out = [];
  for (const [name, impl] of IMPLEMENTATIONS) {
    const p = policies.get(name);
    if (!p || !p.enabled) continue;
    if (opts.mcp && !p.is_mcp_safe) continue;
    out.push({ name, description: impl.summary, parameters: impl.parameters });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A tool may not be invoked with data more sensitive than its policy allows.
 * max_privacy_class is NULL for every seeded row today; this honours it anyway so
 * the column becomes live config the moment it is set.
 */
const PRIVACY_ORDER: Record<PrivacyClass, number> = {
  public: 1,
  low: 2,
  creator_private: 3,
  personal: 4,
  sensitive_op: 5,
  confidential: 6,
};

export function exceedsMaxPrivacy(
  policy: ToolPolicyRow,
  privacy: PrivacyClass,
): boolean {
  if (!policy.max_privacy_class) return false;
  return PRIVACY_ORDER[privacy] > PRIVACY_ORDER[policy.max_privacy_class];
}
