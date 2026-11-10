// v3.1 STEP 13 — shadow mode and the autonomy gate.
//
// The layer is ATLAS's (#87). This wires it, and the wiring choice is the point:
//
// SHADOW RECORDING IS AUTOMATIC, NOT AN API AN AGENT REMEMBERS TO CALL.
// The moment that matters is exactly when a tool is DENIED for autonomy reasons or
// held for confirmation — the agent decided, and was not allowed to execute. That is
// the comparison we need: what it WOULD have done vs what the human actually did.
// If recording were a separate call an agent had to make, the sample would be
// biased toward the cases someone remembered to instrument.
//
// NOTHING GRADUATES ON OPINION. agent_autonomy_gate is the only path to an
// autonomy upgrade, and this module never performs the upgrade itself — it reports
// whether the gate passes. Granting autonomy stays a human act.

export interface ShadowRecordArgs {
  agent: string;
  proposed_tool: string;
  proposed_args?: Record<string, unknown>;
  confidence?: number | null;
  run_id?: string | null;
  actor_id?: string | null;
  capability?: string | null;
  routing_level?: string | null;
  provider?: string | null;
  model?: string | null;
  proposed_content?: string | null;
}

/**
 * Records what the agent WOULD have done. Never throws: a shadow write failing must
 * not change the outcome of the request the user is waiting on. Shadow mode is
 * measurement, and measurement that can break the thing it measures is worse than
 * no measurement.
 */
export async function recordShadow(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  args: ShadowRecordArgs,
): Promise<string | null> {
  try {
    const { data, error } = await adminDb.rpc("agent_shadow_record", {
      p_agent: args.agent,
      p_proposed_tool: args.proposed_tool,
      p_proposed_args: args.proposed_args ?? {},
      p_confidence: args.confidence ?? null,
      p_run_id: args.run_id ?? null,
      p_actor_id: args.actor_id ?? null,
      p_capability: args.capability ?? null,
      p_routing_level: args.routing_level ?? null,
      p_provider: args.provider ?? null,
      p_model: args.model ?? null,
      p_proposed_content: args.proposed_content ?? null,
    });
    if (error) {
      console.error("shadow_record_failed", error.message);
      return null;
    }
    return (data as string) ?? null;
  } catch (e) {
    console.error("shadow_record_threw", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Closes the loop: what the human actually did. Called from an explicit op, because
 * only a human knows the real action — inferring it would fabricate the very
 * ground truth the eval depends on.
 */
export async function resolveShadow(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  args: {
    id: string;
    actual_tool: string;
    human_action: string;
    actual_content?: string | null;
    human_actor_id?: string | null;
  },
): Promise<{ ok: boolean; data?: unknown; reason?: string }> {
  const { data, error } = await adminDb.rpc("agent_shadow_resolve", {
    p_id: args.id,
    p_actual_tool: args.actual_tool,
    p_human_action: args.human_action,
    p_actual_content: args.actual_content ?? null,
    p_human_actor_id: args.human_actor_id ?? null,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, data };
}

export async function computeEvals(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  args: { agent: string; capability?: string | null; days?: number },
): Promise<{ ok: boolean; data?: unknown; reason?: string }> {
  const { data, error } = await adminDb.rpc("agent_eval_compute", {
    p_agent: args.agent,
    p_capability: args.capability ?? null,
    p_days: args.days ?? 30,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, data };
}

/**
 * Asks whether an agent has EARNED a level. Reports; never grants.
 *
 * The separation is deliberate. A function that both evaluates and promotes can
 * promote on a bug. This returns the gate's verdict and leaves the write to a human
 * who has read it.
 */
export async function checkAutonomyGate(
  // deno-lint-ignore no-explicit-any
  adminDb: any,
  args: { agent: string; target_level: string; capability?: string | null },
): Promise<{ ok: boolean; data?: unknown; reason?: string }> {
  const { data, error } = await adminDb.rpc("agent_autonomy_gate", {
    p_agent: args.agent,
    p_target_level: args.target_level,
    p_capability: args.capability ?? null,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, data };
}
