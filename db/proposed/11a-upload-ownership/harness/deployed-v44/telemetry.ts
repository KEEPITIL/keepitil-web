// v3.1 STEP 6 — observability writes.
//
// Unlogged calls = the cost model is blind = build rejected.
//
// Two ledgers, never joined to derive a price:
//   agent_cost_ledger  = COGS (what the provider charged us)
//   agent_credit_*     = PRODUCT CURRENCY (what the customer spent)
//
// All writes here use the service-role client: these tables have SELECT-only RLS
// and zero client write policies, by design.

import type { PrivacyClass, RiskClass, ServerContext } from "./types.ts";

export interface RunHandle {
  run_id: string;
  workflow_id: string;
  nextStepIndex: () => number;
}

export async function openRun(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  ctx: ServerContext,
  opts: {
    agent: string;
    intent?: string | null;
    surface?: string | null;
    trace_id?: string | null;
    workflow_id?: string | null;
  },
): Promise<RunHandle> {
  const row: Record<string, unknown> = {
    actor_id: ctx.actor_id,
    agent: opts.agent,
    intent: opts.intent ?? null,
    surface: opts.surface ?? "api",
    // Reasoning provider is 'none' until a model is actually called (step 9).
    execution_origin: "echo_native",
    reasoning_provider: "none",
    trace_id: opts.trace_id ?? null,
  };
  if (opts.workflow_id) row.workflow_id = opts.workflow_id;

  const { data, error } = await adminDb.from("agent_runs").insert(row)
    .select("id, workflow_id").single();
  if (error) throw new Error(`run_open_failed: ${error.message}`);

  let i = 0;
  return {
    run_id: data.id,
    workflow_id: data.workflow_id,
    nextStepIndex: () => i++,
  };
}

export async function closeRun(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  run_id: string,
  status: "succeeded" | "failed" | "blocked",
  error?: string | null,
): Promise<void> {
  // Data-modifying CTEs share one snapshot, so run-close is always its own
  // statement — never folded into the step/action writes above it.
  await adminDb.from("agent_runs")
    .update({ status, ended_at: new Date().toISOString(), error: error ?? null })
    .eq("id", run_id);
}

/**
 * One row per routing/reasoning decision. selection_reason records WHY — for a
 * deterministic tool call that means recording that no model was consulted, and
 * on what grounds. A blank reason is as useless as no row at all.
 */
export async function recordStep(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  args: {
    run_id: string;
    step_index: number;
    step_type: string;
    routing_level?: string | null;
    provider?: string | null;
    model?: string | null;
    selection_reason: Record<string, unknown>;
    privacy_class?: PrivacyClass | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    cached_tokens?: number | null;
    latency_ms?: number | null;
    status?: "ok" | "error" | "blocked";
    error?: string | null;
    /** Models tried and failed before the one that answered (agent_steps column). */
    fallback_from?: string | null;
    agent: string;
    metadata?: Record<string, unknown>;
  },
): Promise<number | null> {
  const { data, error } = await adminDb.from("agent_steps").insert({
    run_id: args.run_id,
    step_index: args.step_index,
    agent: args.agent,
    step_type: args.step_type,
    routing_level: args.routing_level ?? null,
    provider: args.provider ?? null,
    model: args.model ?? null,
    selection_reason: args.selection_reason,
    privacy_class: args.privacy_class ?? null,
    input_tokens: args.input_tokens ?? null,
    output_tokens: args.output_tokens ?? null,
    cached_tokens: args.cached_tokens ?? null,
    latency_ms: args.latency_ms ?? null,
    status: args.status ?? "ok",
    error: args.error ?? null,
    fallback_from: args.fallback_from ?? null,
    metadata: args.metadata ?? {},
  }).select("id").single();

  if (error) {
    console.error("step_write_failed", error.message);
    return null;
  }
  return data.id as number;
}

/** Opens an agent_actions row. Every side effect gets one, reads included. */
export async function openAction(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  args: {
    run_id: string;
    step_id: number | null;
    workflow_id: string;
    actor_id: string;
    tool_name: string;
    risk_class: RiskClass;
    is_external: boolean;
    args_redacted: Record<string, unknown>;
    idempotency_key?: string | null;
    confirmed_by_user?: boolean;
    requested_by?: string;
  },
): Promise<number | null> {
  const { data, error } = await adminDb.from("agent_actions").insert({
    run_id: args.run_id,
    step_id: args.step_id,
    workflow_id: args.workflow_id,
    actor_id: args.actor_id,
    requested_by: args.requested_by ?? "agent",
    tool_name: args.tool_name,
    risk_class: args.risk_class,
    is_external: args.is_external,
    idempotency_key: args.idempotency_key ?? null,
    args_redacted: args.args_redacted,
    status: "pending",
    confirmed_by_user: args.confirmed_by_user ?? false,
    execution_origin: "echo_native",
  }).select("id").single();

  if (error) {
    console.error("action_open_failed", error.message);
    return null;
  }
  return data.id as number;
}

export async function closeAction(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  action_id: number | null,
  status: "succeeded" | "failed" | "denied",
  result_summary: Record<string, unknown> = {},
  error?: string | null,
): Promise<void> {
  if (action_id === null) return;
  await adminDb.from("agent_actions").update({
    status,
    result_summary,
    error: error ?? null,
    completed_at: new Date().toISOString(),
  }).eq("id", action_id);
}

/**
 * COGS. Called on every MODEL call — step 9 wires this to select_best_model()
 * output. effective_rate_used captures the rate AT EXECUTION TIME: historical
 * cost is never recomputed from current pricing, and money is BIGINT microUSD,
 * never a float.
 */
export async function recordModelCost(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  args: {
    run_id: string;
    step_id: number | null;
    workflow_id: string;
    actor_id: string;
    provider: string;
    model: string | null;
    operation: string;
    input_tokens?: number;
    output_tokens?: number;
    cached_input_tokens?: number;
    image_count?: number;
    search_calls?: number;
    /** The pricing row actually applied, copied verbatim. Required. */
    effective_rate_used: Record<string, unknown>;
    pricing_source?: string | null;
    pricing_verified_at?: string | null;
    provider_cost_microusd?: number;
    external_api_cost_microusd?: number;
    storage_cost_microusd?: number;
    reasoning_provider?: string | null;
    /** false for chatgpt_host runs: the host supplied reasoning, we only ran tools. */
    billable_to_customer?: boolean;
  },
): Promise<void> {
  if (!args.effective_rate_used || Object.keys(args.effective_rate_used).length === 0) {
    throw new Error(
      "cost_ledger_requires_effective_rate: refusing to write a cost row with no rate provenance",
    );
  }
  const { error } = await adminDb.from("agent_cost_ledger").insert({
    run_id: args.run_id,
    step_id: args.step_id,
    workflow_id: args.workflow_id,
    actor_id: args.actor_id,
    provider: args.provider,
    model: args.model,
    operation: args.operation,
    input_tokens: args.input_tokens ?? 0,
    output_tokens: args.output_tokens ?? 0,
    cached_input_tokens: args.cached_input_tokens ?? 0,
    image_count: args.image_count ?? 0,
    search_calls: args.search_calls ?? 0,
    effective_rate_used: args.effective_rate_used,
    pricing_source: args.pricing_source ?? null,
    pricing_verified_at: args.pricing_verified_at ?? null,
    provider_cost_microusd: args.provider_cost_microusd ?? 0,
    external_api_cost_microusd: args.external_api_cost_microusd ?? 0,
    storage_cost_microusd: args.storage_cost_microusd ?? 0,
    execution_origin: "echo_native",
    reasoning_provider: args.reasoning_provider ?? args.provider,
    billable_to_customer: args.billable_to_customer ?? true,
  });
  if (error) console.error("cost_write_failed", error.message);
}
