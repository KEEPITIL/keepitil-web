// v3.1 STEP 10 — native event lifecycle + Vibe/Sentinel comment handling.
//
// TABLE NAMES ARE RESOLVED AT RUNTIME from agent_canonical_targets (#92). There are
// four campaign tables and three are dead; the same class of mistake is possible for
// events and media. Hard-coding a table here would be the same prime-directive
// violation as hard-coding a model or a price — if the canonical table changes it
// must be an UPDATE, not a deploy.
//
// THE TRAP (#88/#92): events_integrity_guard is a BEFORE trigger that SILENTLY
// rewrites status='published' to 'review' when the venue is missing, the date is
// missing/past/more than 6 months out, or the dedupe_key duplicates a published
// event. So an accepted UPDATE does not mean the event is live. Every publish here
// RE-READS the row and reports what the database actually stored.

import type { ArgResult, ToolDef, ToolExecContext } from "./types.ts";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function ok<T>(value: T): ArgResult<T> {
  return { ok: true, value };
}
function bad<T>(error: string): ArgResult<T> {
  return { ok: false, error };
}

// ------------------------------------------------------------ create_event_draft

interface CreateEventDraftArgs {
  title: string;
  starts_at: string;
  venue: string | null;
  city: string | null;
  tagline: string | null;
  description: string | null;
  ends_at: string | null;
  tz: string | null;
  genres: string[] | null;
}

const create_event_draft: ToolDef<CreateEventDraftArgs, unknown> = {
  name: "create_event_draft",
  summary:
    "Create a DRAFT event. Never publishes. Returns the draft and any integrity problems that would block publishing later.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      starts_at: { type: "string", description: "ISO 8601 start time" },
      ends_at: { type: "string" },
      venue: { type: "string" },
      city: { type: "string" },
      tagline: { type: "string" },
      description: { type: "string" },
      tz: { type: "string", description: "IANA timezone, e.g. America/Los_Angeles" },
      genres: { type: "array", items: { type: "string" } },
    },
    required: ["title", "starts_at"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const title = str(raw.title);
    const starts_at = str(raw.starts_at);
    if (!title) return bad("title is required");
    if (!starts_at) return bad("starts_at is required");
    if (Number.isNaN(Date.parse(starts_at))) return bad("starts_at must be ISO 8601");
    const ends_at = str(raw.ends_at);
    if (ends_at && Number.isNaN(Date.parse(ends_at))) return bad("ends_at must be ISO 8601");
    const genres = Array.isArray(raw.genres)
      ? raw.genres.filter((g): g is string => typeof g === "string").slice(0, 12)
      : null;
    return ok({
      title: title.slice(0, 200),
      starts_at,
      ends_at,
      venue: str(raw.venue),
      city: str(raw.city),
      tagline: str(raw.tagline),
      description: str(raw.description),
      tz: str(raw.tz),
      genres,
    });
  },
  execute: async (a, { db, ctx, resolveTarget }: ToolExecContext) => {
    const target = await resolveTarget("event");

    const { data, error } = await db.from(target.write_table).insert({
      title: a.title,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      venue: a.venue,
      city: a.city,
      tagline: a.tagline,
      description: a.description,
      tz: a.tz,
      genres: a.genres,
      status: "draft",
      // Ownership is SERVER-derived. The model never names the owner, so it cannot
      // create an event on someone else's behalf even if it asks to.
      owner_handle: ctx.handle,
      submitted_by: ctx.actor_id,
      source: "agent",
    }).select("id, slug, title, status, starts_at, venue, city, tz").single();

    if (error) throw new Error(error.message);

    // Tell the user NOW what would block a publish, rather than letting them
    // discover it as a silent downgrade later.
    const blockers: string[] = [];
    if (!a.venue) blockers.push("missing venue");
    const start = Date.parse(a.starts_at);
    if (start < Date.now()) blockers.push("start date is in the past");
    if (start > Date.now() + 1000 * 60 * 60 * 24 * 183) {
      blockers.push("start date is more than 6 months out");
    }

    return {
      event: data,
      status: "draft",
      publish_blockers: blockers,
      note: blockers.length
        ? "This event cannot be published until these are fixed; publishing now would be downgraded to review."
        : "No known blockers to publishing.",
    };
  },
  redact: (a) => ({ title: a.title, has_venue: Boolean(a.venue), city: a.city }),
};

// ----------------------------------------------------------------- publish_event

interface PublishEventArgs {
  event_id: string;
}

const publish_event: ToolDef<PublishEventArgs, unknown> = {
  name: "publish_event",
  summary:
    "Publish an event. Returns the status the database actually stored — publishing can be downgraded to review.",
  parameters: {
    type: "object",
    properties: { event_id: { type: "string" } },
    required: ["event_id"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const event_id = str(raw.event_id);
    if (!event_id) return bad("event_id is required");
    if (!isUuid(event_id)) return bad("event_id must be a uuid");
    return ok({ event_id });
  },
  execute: async (a, { db, resolveTarget }: ToolExecContext) => {
    const target = await resolveTarget("event");

    const { error } = await db.from(target.write_table)
      .update({ status: "published" }).eq("id", a.event_id);
    if (error) throw new Error(error.message);

    // THE WHOLE POINT. events_integrity_guard may have rewritten this to 'review'
    // without raising anything. The write succeeding proves nothing.
    const { data: after, error: readErr } = await db.from(target.write_table)
      .select("id, slug, title, status, review_reason, venue, starts_at")
      .eq("id", a.event_id).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!after) {
      return { published: false, status: null, note: "event not visible to this caller after write" };
    }

    const published = after.status === "published";
    return {
      published,
      status: after.status,
      review_reason: after.review_reason ?? null,
      event: after,
      // Wording the caller can surface verbatim. Never claim "live" on a downgrade.
      note: published
        ? "Event is live."
        : `NOT live. The integrity guard moved it to '${after.status}'${
          after.review_reason ? `: ${after.review_reason}` : ""
        }. Fix the cause and publish again.`,
    };
  },
  redact: (a) => ({ event_id: a.event_id }),
};

// ------------------------------------------------------------------ cancel_event

interface CancelEventArgs {
  event_id: string;
  reason: string | null;
}

const cancel_event: ToolDef<CancelEventArgs, unknown> = {
  name: "cancel_event",
  summary: "Cancel an event. Destructive and confirmation-gated by policy.",
  parameters: {
    type: "object",
    properties: { event_id: { type: "string" }, reason: { type: "string" } },
    required: ["event_id"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const event_id = str(raw.event_id);
    if (!event_id) return bad("event_id is required");
    if (!isUuid(event_id)) return bad("event_id must be a uuid");
    return ok({ event_id, reason: str(raw.reason) });
  },
  execute: async (a, { db, resolveTarget }: ToolExecContext) => {
    const target = await resolveTarget("event");

    const { error } = await db.from(target.write_table)
      .update({ status: "cancelled", review_reason: a.reason })
      .eq("id", a.event_id);
    if (error) throw new Error(error.message);

    // Re-read here too: the same guard logic governs every status write.
    const { data: after } = await db.from(target.write_table)
      .select("id, slug, title, status, review_reason").eq("id", a.event_id).maybeSingle();

    return {
      cancelled: after?.status === "cancelled",
      status: after?.status ?? null,
      event: after ?? null,
    };
  },
  redact: (a) => ({ event_id: a.event_id, has_reason: Boolean(a.reason) }),
};

// ----------------------------------------------------------- comment triage tools
//
// Comments live in the EXISTING comments + post_comments tables. No third table.
//
// The uuid/bigint gap I reported in #97 is CLOSED (#98): agent_comment_triage
// .source_id is now TEXT and agent_comment_route takes p_source_id text, so
// post_comments (uuid ids) route the same as comments (bigint ids). Verified live
// before this change — the old source_unroutable fallback is deleted rather than
// left as dead code that would quietly keep refusing valid work.
//
// Ids are passed through AS TEXT. The database validates that the id parses for the
// target table and returns routed=false on a mismatch, so no orphan triage row.

const KNOWN_SOURCES = new Set(["comments", "post_comments"]);

/** comments uses bigint ids, post_comments uuid. Both travel as text. */
function idLooksValidFor(sourceTable: string, id: string): boolean {
  if (sourceTable === "comments") return /^\d+$/.test(id);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

interface DraftReplyArgs {
  source_table: string;
  source_id: string;
  classification: string;
  confidence: number;
  draft_body: string;
}

const draft_comment_reply: ToolDef<DraftReplyArgs, unknown> = {
  name: "draft_comment_reply",
  summary:
    "Classify a comment and store a DRAFT reply for review. Never sends. Low-confidence routine replies stay drafted by policy.",
  parameters: {
    type: "object",
    properties: {
      source_table: { type: "string", enum: ["comments", "post_comments"] },
      source_id: { type: "string" },
      classification: {
        type: "string",
        enum: ["routine", "question", "serious", "abuse", "spam"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      draft_body: { type: "string" },
    },
    required: ["source_table", "source_id", "classification", "confidence", "draft_body"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const source_table = str(raw.source_table);
    const source_id = str(raw.source_id);
    const classification = str(raw.classification);
    const draft_body = str(raw.draft_body);
    if (!source_table || !KNOWN_SOURCES.has(source_table)) {
      return bad("source_table must be 'comments' or 'post_comments'");
    }
    if (!source_id) return bad("source_id is required");
    if (!classification) return bad("classification is required");
    if (!draft_body) return bad("draft_body is required");
    const confidence = Number(raw.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return bad("confidence must be between 0 and 1");
    }
    return {
      ok: true,
      value: { source_table, source_id, classification, confidence, draft_body },
    };
  },
  execute: async (a, { db, ctx, services }: ToolExecContext) => {
    if (!idLooksValidFor(a.source_table, a.source_id)) {
      return { routed: false, reason: `source_id is not a valid id for ${a.source_table}` };
    }

    // Confirm the comment is visible to THIS caller under their RLS before acting
    // on it, so triage cannot be used to probe comments they cannot see.
    // post_comments has no target_type/target_id, so select per table rather than
    // asking for columns that do not exist there.
    const cols = a.source_table === "comments"
      ? "id, target_type, target_id, user_id, body"
      : "id, post_key, profile_slug, user_id, body";
    const { data: comment, error: cErr } = await db.from(a.source_table)
      .select(cols).eq("id", a.source_id).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!comment) return { routed: false, reason: "comment_not_visible_to_caller" };

    const routed = await services.routeComment({
      source_table: a.source_table,
      source_id: a.source_id,
      classification: a.classification,
      confidence: a.confidence,
      body_excerpt: String(comment.body ?? "").slice(0, 300),
      // comments carries target_type/target_id; post_comments identifies its parent
      // by profile_slug + post_key. Map both onto the same two fields.
      target_type: a.source_table === "comments" ? (comment.target_type ?? null) : "post",
      target_id: a.source_table === "comments"
        ? (comment.target_id ?? null)
        : `${comment.profile_slug ?? ""}/${comment.post_key ?? ""}`,
      author_id: comment.user_id ?? null,
    });

    // Store the draft alongside the routing decision. A draft is never a send:
    // the disposition from the DB decides whether a human must see it first.
    await services.updateTriage(a.source_table, a.source_id, { draft_reply: a.draft_body });

    return {
      routed: true,
      assigned_agent: routed.assigned_agent,
      disposition: routed.disposition,
      requires_human: routed.requires_human,
      draft_stored: true,
      sent: false,
      actor: ctx.handle,
    };
  },
  redact: (a) => ({
    source_table: a.source_table,
    source_id: a.source_id,
    classification: a.classification,
    confidence: a.confidence,
  }),
};

interface SendReplyArgs {
  source_table: string;
  source_id: string;
  body: string;
}

const send_comment_reply: ToolDef<SendReplyArgs, unknown> = {
  name: "send_comment_reply",
  summary: "Post a public reply to a comment. Visible to everyone once sent.",
  parameters: {
    type: "object",
    properties: {
      source_table: { type: "string", enum: ["comments", "post_comments"] },
      source_id: { type: "string" },
      body: { type: "string" },
    },
    required: ["source_table", "source_id", "body"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const source_table = str(raw.source_table);
    const source_id = str(raw.source_id);
    const body = str(raw.body);
    if (!source_table || !KNOWN_SOURCES.has(source_table)) {
      return bad("source_table must be 'comments' or 'post_comments'");
    }
    if (!source_id) return bad("source_id is required");
    if (!body) return bad("body is required");
    return { ok: true, value: { source_table, source_id, body: body.slice(0, 4000) } };
  },
  execute: async (a, { db, ctx, services }: ToolExecContext) => {
    if (!idLooksValidFor(a.source_table, a.source_id)) {
      return { sent: false, reason: `source_id is not a valid id for ${a.source_table}` };
    }

    // Read the parent under the CALLER'S RLS. If they cannot see the comment they
    // cannot reply to it, which also prevents replying into a thread they were
    // never party to.
    const parentCols = a.source_table === "comments"
      ? "id, target_type, target_id"
      : "id, post_key, profile_slug";
    const { data: parent, error: pErr } = await db.from(a.source_table)
      .select(parentCols).eq("id", a.source_id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parent) return { sent: false, reason: "parent_comment_not_visible_to_caller" };

    // The reply is written as the CALLER. author_handle comes from the session,
    // never from the model, so an agent cannot post under another identity.
    const { data, error } = await db.from("comments").insert({
      user_id: ctx.actor_id,
      author_handle: ctx.handle,
      target_type: a.source_table === "comments" ? parent.target_type : "post",
      target_id: a.source_table === "comments"
        ? parent.target_id
        : `${parent.profile_slug ?? ""}/${parent.post_key ?? ""}`,
      body: a.body,
    }).select("id, created_at").single();
    if (error) throw new Error(error.message);

    await services.updateTriage(a.source_table, a.source_id, {
      resolved_at: new Date().toISOString(),
      disposition: "sent",
    });

    return { sent: true, comment_id: data.id, created_at: data.created_at };
  },
  redact: (a) => ({ source_table: a.source_table, source_id: a.source_id, length: a.body.length }),
};

export const STEP_10_TOOLS: ReadonlyArray<ToolDef<any, unknown>> = [
  create_event_draft,
  publish_event,
  cancel_event,
  draft_comment_reply,
  send_comment_reply,
];
