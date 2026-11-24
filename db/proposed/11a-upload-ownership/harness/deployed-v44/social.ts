// v3.1 STEP 11 — external publishing tools (Postiz-backed).
//
// ARCHITECTURE, per #96:
//   Echo -> KEEPITIL tool (publish_social_post) -> our Postiz adapter -> Postiz API
// NEVER MCP-on-MCP. Echo never sees a Postiz tool name; it sees OUR tool, and the
// adapter is an implementation detail it cannot address directly.
//
// These tools are is_external=true in agent_tool_policies, so invokeTool() ENQUEUES
// them with an idempotency_key instead of running them inline. execute() therefore
// never runs on this path and is a guard, not a code path — the real work happens in
// worker.ts, draining agent_jobs. pgmq is at-least-once; the key is the only thing
// standing between a retry and a duplicate public post.

import type { ArgResult, ToolDef } from "./types.ts";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function bad<T>(error: string): ArgResult<T> {
  return { ok: false, error };
}

/** External tools are queued, never executed inline. Reaching here is a bug. */
function queuedOnly(tool: string): never {
  throw new Error(
    `${tool} is an external tool and must be executed by the job worker, not inline. ` +
      `Reaching execute() means the is_external flag was lost from agent_tool_policies.`,
  );
}

const PLATFORMS = ["x", "twitter", "instagram", "tiktok", "youtube", "facebook", "linkedin", "threads"];

// ---------------------------------------------------------- publish_social_post

interface PublishSocialPostArgs {
  provider: string;
  content: string;
  account_id: string | null;
  scheduled_for: string | null;
  image_urls: string[] | null;
  campaign_id: string | null;
  variant_id: string | null;
}

const publish_social_post: ToolDef<PublishSocialPostArgs, unknown> = {
  name: "publish_social_post",
  summary:
    "Publish or schedule a post to a connected social account. Goes live publicly. Queued and executed once, even if retried.",
  parameters: {
    type: "object",
    properties: {
      provider: { type: "string", enum: PLATFORMS },
      content: { type: "string" },
      account_id: {
        type: "string",
        description: "Optional. Which connected account, when the user has more than one for this provider.",
      },
      scheduled_for: { type: "string", description: "ISO 8601. Omit to publish now." },
      image_urls: { type: "array", items: { type: "string" } },
      campaign_id: { type: "string" },
      variant_id: { type: "string" },
    },
    required: ["provider", "content"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const provider = str(raw.provider)?.toLowerCase() ?? null;
    const content = str(raw.content);
    if (!provider || !PLATFORMS.includes(provider)) {
      return bad(`provider must be one of: ${PLATFORMS.join(", ")}`);
    }
    if (!content) return bad("content is required");
    const scheduled_for = str(raw.scheduled_for);
    if (scheduled_for) {
      if (Number.isNaN(Date.parse(scheduled_for))) return bad("scheduled_for must be ISO 8601");
      if (Date.parse(scheduled_for) < Date.now() - 60_000) {
        return bad("scheduled_for is in the past");
      }
    }
    const image_urls = Array.isArray(raw.image_urls)
      ? raw.image_urls.filter((u): u is string => typeof u === "string").slice(0, 10)
      : null;
    return {
      ok: true,
      value: {
        provider,
        content: content.slice(0, 5000),
        account_id: str(raw.account_id),
        scheduled_for,
        image_urls,
        campaign_id: str(raw.campaign_id),
        variant_id: str(raw.variant_id),
      },
    };
  },
  execute: () => queuedOnly("publish_social_post"),
  // The body is public anyway once sent, but the audit row keeps a length rather
  // than a copy: agent_actions is not a content store.
  redact: (a) => ({
    provider: a.provider,
    length: a.content.length,
    scheduled: Boolean(a.scheduled_for),
    images: a.image_urls?.length ?? 0,
    campaign_id: a.campaign_id,
  }),
};

// ------------------------------------------------------------ schedule_campaign

interface ScheduleCampaignArgs {
  campaign_id: string;
  scheduled_for: string;
}

const schedule_campaign: ToolDef<ScheduleCampaignArgs, unknown> = {
  name: "schedule_campaign",
  summary:
    "Schedule every APPROVED variant of a campaign for publication. Only approved variants are sent.",
  parameters: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      scheduled_for: { type: "string", description: "ISO 8601" },
    },
    required: ["campaign_id", "scheduled_for"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const campaign_id = str(raw.campaign_id);
    const scheduled_for = str(raw.scheduled_for);
    if (!campaign_id) return bad("campaign_id is required");
    if (!scheduled_for) return bad("scheduled_for is required");
    if (Number.isNaN(Date.parse(scheduled_for))) return bad("scheduled_for must be ISO 8601");
    if (Date.parse(scheduled_for) < Date.now() - 60_000) return bad("scheduled_for is in the past");
    return { ok: true, value: { campaign_id, scheduled_for } };
  },
  execute: () => queuedOnly("schedule_campaign"),
  redact: (a) => ({ campaign_id: a.campaign_id, scheduled_for: a.scheduled_for }),
};

export const STEP_11_TOOLS: ReadonlyArray<ToolDef<any, unknown>> = [
  publish_social_post,
  schedule_campaign,
];
