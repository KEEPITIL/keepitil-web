// v3.1 STEP 6 — the mandatory call order. No exceptions, no bypass path.
//
//   1+2. agent_authorize_tool() -> policy check, credit_cost from config, and the
//                                  reserve, as ONE call that cannot be left half-done (#81).
//                                  allow=false: STOP and surface `action`. Never bypass.
//   3. select_best_model()       -> step 9. NEVER hard-code a model, never pin one to an L-level.
//   4. agent_job_enqueue()       -> with an idempotency_key for anything external.
//   5. agent_job_complete/fail() -> settles the hold with ACTUAL usage, or releases it.
//   6. agent_steps + agent_cost_ledger on every model call.
//
// There is deliberately no "force" or "skip_policy" parameter anywhere in this
// module. The only way to reach a tool is through invokeTool().

import type {
  InvokeRequest,
  InvokeResponse,
  PolicyDecision,
  PrivacyClass,
  ServerContext,
} from "./types.ts";
import { assertNoIdentityArgs, IdentityBoundaryViolation } from "./identity.ts";
import {
  exceedsMaxPrivacy,
  getImplementation,
  loadPolicies,
  resolveCanonicalTarget,
} from "./registry.ts";
import type { ToolServices } from "./types.ts";
import { recordShadow } from "./shadow.ts";
import {
  closeAction,
  closeRun,
  openAction,
  openRun,
  recordStep,
  type RunHandle,
} from "./telemetry.ts";

/**
 * Stable idempotency key. Same actor + tool + args + workflow => same key, so an
 * at-least-once redelivery cannot produce a second external effect. pgmq gives us
 * at-least-once DELIVERY; only this key protects the EFFECT.
 */
async function idempotencyKey(
  ctx: ServerContext,
  tool: string,
  args: unknown,
  workflow_id: string,
): Promise<string> {
  const canonical = JSON.stringify({ a: ctx.actor_id, t: tool, w: workflow_id, g: args });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${tool}:${hex.slice(0, 40)}`;
}

export interface RuntimeDeps {
  // deno-lint-ignore no-explicit-any
  adminDb: any;
  // deno-lint-ignore no-explicit-any
  userDb: any;
}

export async function invokeTool(
  req: InvokeRequest,
  ctx: ServerContext,
  deps: RuntimeDeps,
): Promise<InvokeResponse> {
  const { adminDb, userDb } = deps;
  const privacy: PrivacyClass = req.privacy_class ?? "low";
  const t0 = Date.now();

  let run: RunHandle | null = null;
  let ownsRun = false;

  try {
    // -- 0. IDENTITY BOUNDARY. Before anything else, before any run is opened.
    assertNoIdentityArgs(req.args ?? {});

    const impl = getImplementation(req.tool);
    const policies = await loadPolicies(adminDb);
    const policy = policies.get(req.tool);

    // The allow-list is the gate. Absent from the table => denied, even if the
    // TypeScript implementation exists and is perfectly good.
    if (!policy || !policy.enabled) {
      return {
        ok: false,
        tool: req.tool,
        action: "denied",
        reason: policy ? "tool_disabled" : "tool_not_in_allowlist",
      };
    }
    if (!impl) {
      return { ok: false, tool: req.tool, action: "denied", reason: "tool_not_implemented" };
    }
    if (exceedsMaxPrivacy(policy, privacy)) {
      return {
        ok: false,
        tool: req.tool,
        action: "denied",
        reason: "privacy_class_exceeds_tool_maximum",
      };
    }

    // Validate DOMAIN args only. Identity was already rejected above.
    const parsed = impl.validate((req.args ?? {}) as Record<string, unknown>);
    if (!parsed.ok) {
      return { ok: false, tool: req.tool, action: "denied", reason: `invalid_args: ${parsed.error}` };
    }

    // Join the caller's run when there is one, so a multi-step workflow stays a
    // single trace. Only open (and therefore only close) a run we created.
    if (req.run_id) {
      const { data: existing, error: runErr } = await adminDb
        .from("agent_runs").select("id, workflow_id").eq("id", req.run_id).maybeSingle();
      if (runErr || !existing) {
        return { ok: false, tool: req.tool, action: "denied", reason: "unknown_run_id" };
      }
      const { count } = await adminDb.from("agent_steps")
        .select("id", { count: "exact", head: true }).eq("run_id", req.run_id);
      let i = count ?? 0;
      run = { run_id: existing.id, workflow_id: existing.workflow_id, nextStepIndex: () => i++ };
      ownsRun = false;
    } else {
      run = await openRun(adminDb, ctx, {
        agent: req.agent,
        intent: req.tool,
        surface: req.surface ?? "api",
        workflow_id: req.workflow_id ?? undefined,
      });
      ownsRun = true;
    }
    const runId = run.run_id;

    // -- 1+2. AUTHORIZE. One call: policy_check -> read credit_cost from config ->
    // provision the account -> reserve, but ONLY when the tool can proceed right now.
    //
    // p_confirmed comes from the UI confirmation round-trip and nowhere else. Since
    // #84 the function itself refuses to hold credits for a call that still needs a
    // human, so an unconfirmed request cannot leave a reservation behind.
    const { data: decisionRaw, error: policyErr } = await adminDb.rpc("agent_authorize_tool", {
      p_actor_id: ctx.actor_id,
      p_tool_name: req.tool,
      p_privacy_class: privacy,
      p_envelope_id: req.envelope_id ?? null,
      p_run_id: runId,
      p_workflow_id: run.workflow_id,
      p_confirmed: Boolean(req.user_confirmed),
    });
    if (policyErr) throw new Error(`authorize_failed: ${policyErr.message}`);
    const decision = decisionRaw as PolicyDecision;
    const reservationId: string | null = decision.reservation_id ?? null;
    const creditCost = Number(decision.credit_cost ?? 0);

    /** Release is idempotent; every early exit AFTER a hold exists goes through here. */
    const releaseHold = async (why: string) => {
      if (!reservationId) return;
      await adminDb.rpc("agent_credits_release", {
        p_reservation_id: reservationId,
        p_reason: why.slice(0, 200),
      });
    };

    if (!decision.allow) {
      const stepId = await recordStep(adminDb, {
        run_id: runId,
        step_index: run.nextStepIndex(),
        step_type: "policy_check",
        routing_level: "L0",
        selection_reason: {
          decision: "denied",
          reason: decision.reason,
          policy_source: "agent_authorize_tool",
          model_consulted: false,
          detail: decision,
        },
        privacy_class: privacy,
        status: "blocked",
        latency_ms: Date.now() - t0,
        agent: req.agent,
      });
      const actionId = await openAction(adminDb, {
        run_id: runId,
        step_id: stepId,
        workflow_id: run.workflow_id,
        actor_id: ctx.actor_id,
        tool_name: req.tool,
        risk_class: policy.risk_class,
        is_external: policy.is_external,
        args_redacted: impl.redact?.(parsed.value) ?? {},
      });
      await closeAction(adminDb, actionId, "denied", { reason: decision.reason }, decision.reason);

      // STEP 13. This is the moment shadow mode exists for: the agent DECIDED and
      // was not permitted to execute. Recording it here rather than behind a call
      // an agent must remember keeps the sample unbiased — every denial is captured,
      // not only the ones someone instrumented. Only permission-shaped denials are
      // shadowed; a malformed-args rejection is a bug, not a judgement worth scoring.
      const permissionDenial = decision.reason === "autonomy_level_too_low" ||
        decision.reason === "risk_class_above_user_ceiling" ||
        decision.reason === "external_actions_not_permitted";
      if (permissionDenial) {
        await recordShadow(adminDb, {
          agent: req.agent,
          proposed_tool: req.tool,
          proposed_args: impl.redact?.(parsed.value) ?? {},
          run_id: runId,
          actor_id: ctx.actor_id,
          capability: req.tool,
          routing_level: "L0",
        });
      }

      if (ownsRun) await closeRun(adminDb, runId, "blocked", decision.reason ?? "denied");

      // Surface the DB's own action verbatim. Never translate a denial into a retry.
      return {
        ok: false,
        tool: req.tool,
        action: decision.action ?? "denied",
        reason: decision.reason,
        run_id: runId,
        step_id: stepId,
        data: { have: decision.have, need: decision.need, envelope: decision.envelope },
      };
    }

    // -- 1b. Confirmation gate. Money and destructive work stop here until a HUMAN
    // says yes through the UI. user_confirmed can never arrive from a model,
    // because "confirm" is not in the model's argument surface at all.
    //
    // The DECISION is the database's, not ours: we branch on the action it returned
    // rather than re-deriving it. Since #84 no hold exists on this path, so there is
    // deliberately nothing to release here — an unconditional release would be dead
    // code today and a double-release the day the contract moves again.
    // Risk class E re-confirms every time, so this can fire even when confirmed.
    if (decision.action === "await_user_confirmation") {
      const stepId = await recordStep(adminDb, {
        run_id: runId,
        step_index: run.nextStepIndex(),
        step_type: "confirmation_required",
        routing_level: "L0",
        selection_reason: {
          decision: "await_user_confirmation",
          risk_class: decision.risk_class,
          fresh_confirmation_each_time: decision.fresh_confirmation_each_time,
          // Distinguishes a first ask from a risk-E re-ask on an already-approved
          // action, so stale-approval rejections are visible in telemetry.
          already_confirmed: Boolean(req.user_confirmed),
          hold_taken: false,
          model_consulted: false,
        },
        privacy_class: privacy,
        status: "blocked",
        latency_ms: Date.now() - t0,
        agent: req.agent,
      });
      // Also a decide-but-do-not-execute moment, and the most valuable one: the
      // human is about to take a real action we can compare against.
      await recordShadow(adminDb, {
        agent: req.agent,
        proposed_tool: req.tool,
        proposed_args: impl.redact?.(parsed.value) ?? {},
        run_id: runId,
        actor_id: ctx.actor_id,
        capability: req.tool,
        routing_level: "L0",
      });

      if (ownsRun) await closeRun(adminDb, runId, "blocked", "awaiting_user_confirmation");
      return {
        ok: false,
        tool: req.tool,
        action: "await_user_confirmation",
        reason: "requires_confirmation",
        run_id: runId,
        step_id: stepId,
      };
    }

    // The hold is already taken (or correctly skipped) by agent_authorize_tool.
    const stepId = await recordStep(adminDb, {
      run_id: runId,
      step_index: run.nextStepIndex(),
      step_type: "tool_call",
      // L0: deterministic. No model was consulted to reach this tool, so no
      // provider/model is recorded — and selection_reason says exactly why.
      routing_level: "L0",
      provider: null,
      model: null,
      selection_reason: {
        decision: "allow",
        policy_source: "agent_authorize_tool",
        risk_class: decision.risk_class,
        is_external: decision.is_external,
        model_consulted: false,
        why_no_model: "deterministic_registry_dispatch",
        allows_free_providers: decision.allows_free_providers,
        requires_zdr: decision.requires_zdr,
        // Cost comes from agent_tool_policies.credit_cost, never from code.
        credit_cost: creditCost,
        cost_is_variable: decision.cost_is_variable ?? false,
        settle_required: decision.settle_required ?? false,
        confirmed_by_user: Boolean(req.user_confirmed),
      },
      privacy_class: privacy,
      agent: req.agent,
      metadata: { reservation_id: reservationId },
    });

    const idem = policy.is_external
      ? await idempotencyKey(ctx, req.tool, parsed.value, run.workflow_id)
      : null;

    const actionId = await openAction(adminDb, {
      run_id: runId,
      step_id: stepId,
      workflow_id: run.workflow_id,
      actor_id: ctx.actor_id,
      tool_name: req.tool,
      risk_class: policy.risk_class,
      is_external: policy.is_external,
      args_redacted: impl.redact?.(parsed.value) ?? {},
      idempotency_key: idem,
      confirmed_by_user: Boolean(req.user_confirmed),
    });

    // -- 4. EXTERNAL WORK IS QUEUED, NEVER RUN INLINE. The idempotency key is what
    // makes a retry safe; the queue only guarantees at-least-once delivery.
    // Phase 1 has no external tools, so this path is dormant until step 11.
    if (policy.is_external) {
      const { data: jobId, error: jobErr } = await adminDb.rpc("agent_job_enqueue", {
        p_job_type: `tool:${req.tool}`,
        p_payload: { args: parsed.value, privacy_class: privacy },
        p_run_id: runId,
        p_workflow_id: run.workflow_id,
        p_actor_id: ctx.actor_id,
        p_idempotency_key: idem,
        p_envelope_id: req.envelope_id ?? null,
        p_reservation_id: reservationId,
      });
      if (jobErr) {
        await releaseHold("enqueue_failed");
        await closeAction(adminDb, actionId, "failed", {}, jobErr.message);
        if (ownsRun) await closeRun(adminDb, runId, "failed", jobErr.message);
        return { ok: false, tool: req.tool, action: "denied", reason: "enqueue_failed", run_id: runId };
      }
      if (ownsRun) await closeRun(adminDb, runId, "succeeded");
      return {
        ok: true,
        tool: req.tool,
        action: "queued",
        data: { job_id: jobId, idempotency_key: idem },
        run_id: runId,
        step_id: stepId,
        action_id: actionId,
      };
    }

    // Named capabilities, not the admin client. A tool gets exactly the privileged
    // operations it needs and nothing else — see ToolServices for why.
    const services: ToolServices = {
      routeComment: async (a) => {
        const { data, error } = await adminDb.rpc("agent_comment_route", {
          p_source_table: a.source_table,
          p_source_id: a.source_id,
          p_classification: a.classification,
          p_confidence: a.confidence,
          p_body_excerpt: a.body_excerpt,
          p_target_type: a.target_type,
          p_target_id: a.target_id,
          p_author_id: a.author_id,
          p_run_id: runId,
        });
        if (error) throw new Error(`comment_route_failed: ${error.message}`);
        return (data ?? {}) as Record<string, unknown>;
      },
      updateTriage: async (source_table, source_id, patch) => {
        await adminDb.from("agent_comment_triage").update(patch)
          .eq("source_table", source_table).eq("source_id", source_id);
      },

      // The bucket is read from config here, NOT accepted from the tool. A tool
      // supplies a path within that bucket and nothing else.
      createSignedUpload: async (path: string) => {
        const { data: cfg } = await adminDb.from("platform_config")
          .select("value").eq("key", "event_media_bucket").maybeSingle();
        const bucket = cfg?.value ?? null;
        if (!bucket) return { ok: false as const, reason: "event_media_bucket_not_configured" };

        const { data, error } = await adminDb.storage.from(bucket)
          .createSignedUploadUrl(path);
        if (error) return { ok: false as const, reason: `sign_failed: ${error.message}` };
        return {
          ok: true as const,
          bucket,
          signedUrl: data.signedUrl,
          token: data.token,
        };
      },

      // gen-post-image is gated by a shared key held in its own source. We read it
      // by NAME from app_secrets and fail closed if it is not seeded, rather than
      // copying the literal into this codebase.
      generateImage: async (a) => {
        const { data: sec } = await adminDb.from("app_secrets")
          .select("value").eq("key", "gen_image_gate").maybeSingle();
        const gate = sec?.value ?? null;
        if (!gate) {
          return {
            ok: false as const,
            reason:
              "gen_image_gate_not_seeded: add app_secrets.gen_image_gate with the x-kil-gate value from gen-post-image. Not hard-coded here on purpose.",
          };
        }
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/gen-post-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-kil-gate": gate },
          body: JSON.stringify(a),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.ok === false) {
          return {
            ok: false as const,
            reason: String(j?.error ?? `gen_image_failed_${r.status}`).slice(0, 200),
          };
        }
        return { ok: true as const, url: (j?.url as string) ?? null };
      },
    };

    // -- Inline execution, under the CALLER'S RLS.
    try {
      const result = await impl.execute(parsed.value, {
        db: userDb,
        ctx,
        resolveTarget: (concept: string) => resolveCanonicalTarget(adminDb, concept),
        services,
      });

      // Settle with ACTUAL usage. For a variable-cost tool the hold is only a
      // ceiling, so the unused remainder goes back to the customer.
      if (decision.settle_required && reservationId) {
        const actual = decision.cost_is_variable && impl.creditsUsed
          ? impl.creditsUsed(result)
          : creditCost;
        await adminDb.rpc("agent_credits_settle", {
          p_reservation_id: reservationId,
          p_actual_amount: actual,
          p_reason: `tool:${req.tool}`,
        });
      }
      await closeAction(adminDb, actionId, "succeeded", { ok: true });
      if (ownsRun) await closeRun(adminDb, runId, "succeeded");

      return {
        ok: true,
        tool: req.tool,
        action: "proceed",
        data: result,
        run_id: runId,
        step_id: stepId,
        action_id: actionId,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Release is idempotent and belongs in the catch block. Failed work never
      // bills the customer.
      await releaseHold(`tool_failed: ${msg}`);
      await closeAction(adminDb, actionId, "failed", {}, msg);
      if (ownsRun) await closeRun(adminDb, runId, "failed", msg);
      return { ok: false, tool: req.tool, action: "error", error: msg, run_id: runId, step_id: stepId };
    }
  } catch (e) {
    if (e instanceof IdentityBoundaryViolation) {
      // Loud on purpose. This is an attempted privilege escalation, not a typo.
      console.error("IDENTITY_BOUNDARY_VIOLATION", { tool: req.tool, path: e.path });
      if (run) await closeRun(adminDb, run.run_id, "blocked", "identity_from_model");
      return {
        ok: false,
        tool: req.tool,
        action: "denied",
        reason: "identity_from_model",
        error: e.message,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (run && ownsRun) await closeRun(adminDb, run.run_id, "failed", msg);
    return { ok: false, tool: req.tool, action: "error", error: msg };
  }
}
