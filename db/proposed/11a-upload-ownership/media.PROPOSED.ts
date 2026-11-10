// v3.1 STEP 12 — media pipeline. L0 BY DEFAULT.
//
// THE RULE THAT DEFINES THIS FILE:
//   camera/picker -> client resize -> signed upload -> Supabase Storage -> scope row
//   NOTHING is AI-analysed on upload. No moderation pass, no tagging, no captioning,
//   no vision call. Analysing on upload would be silent COGS on every single photo a
//   user takes, charged to nobody and invisible in the cost model.
//
// Analysis, captioning, moderation and generation are ON DEMAND ONLY, and each one
// is a separate allow-listed tool that goes through agent_authorize_tool and costs
// credits. generate_event_flyer is priced at 10 with cost_is_variable=true, so the
// hold is a ceiling and the unused remainder returns to the customer.
//
// Cloudinary is NOT approved. Supabase Storage is the source of truth.
// Search happens through agent_media_index (a read-only view across scopes); writes
// always go to the specific scope table.

import type { ArgResult, ToolDef, ToolExecContext } from "./types.ts";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function bad<T>(error: string): ArgResult<T> {
  return { ok: false, error };
}

/** Rejects traversal and absolute paths before anything is signed. */
function safeFilename(name: string): string | null {
  const base = name.split("/").pop()?.split("\\").pop() ?? "";
  if (!base || base.startsWith(".")) return null;
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(base)) return null;
  return base;
}

// ---------------------------------------------------------- upload_event_photo

interface UploadEventPhotoArgs {
  event_slug: string;
  filename: string;
  kind: string;
  title: string | null;
}

const upload_event_photo: ToolDef<UploadEventPhotoArgs, unknown> = {
  name: "upload_event_photo",
  summary:
    "Prepare a signed upload for an event photo or video. Only the event's owner (the submitter, or an owner of the event's profile) may use it. Returns a URL the client uploads to directly. The file is stored as-is and is NOT analysed.",
  parameters: {
    type: "object",
    properties: {
      event_slug: { type: "string" },
      filename: { type: "string", description: "Base filename, e.g. crowd-01.jpg" },
      kind: { type: "string", enum: ["image", "video", "post"], default: "image" },
      title: { type: "string" },
    },
    required: ["event_slug", "filename"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const event_slug = str(raw.event_slug);
    const rawName = str(raw.filename);
    if (!event_slug) return bad("event_slug is required");
    if (!rawName) return bad("filename is required");
    const filename = safeFilename(rawName);
    if (!filename) {
      return bad("filename must be a simple base name (letters, digits, dot, dash, underscore)");
    }
    const kind = str(raw.kind) ?? "image";
    if (!["image", "video", "post"].includes(kind)) return bad("kind must be image, video or post");
    return { ok: true, value: { event_slug, filename, kind, title: str(raw.title) } };
  },
  execute: async (a, { db, ctx, resolveTarget, services }: ToolExecContext) => {
    // MF2 (11A): UPLOAD OWNERSHIP BOUNDARY. Everything in this block runs BEFORE any
    // storage signing. A storage signature is not parent ownership (Atlas), so event
    // visibility alone must never be enough to obtain one.
    //
    // 1. There must be a verified authenticated subject. ctx.actor_id is derived by
    //    deriveServerContext() from userDb.auth.getUser() (the validated JWT). It is
    //    never read from model args, ctx.handle, user_metadata or the event row.
    const subject = typeof ctx?.actor_id === "string" ? ctx.actor_id.trim() : "";
    if (!subject) return { ok: false, reason: "authentication_required" };

    // The slug becomes a storage path prefix. A real slug never contains these.
    if (/[\\/]|\.\./.test(a.event_slug)) return { ok: false, reason: "upload_ownership_denied" };

    // 2. Ownership is decided IN THE DATABASE by a SECURITY DEFINER function that
    //    derives the subject itself from auth.uid() (the same JWT this userDb carries):
    //      events.submitted_by = auth.uid()
    //      OR EXISTS (profile_owners: profile_slug = events.owner_handle AND owner_id = auth.uid())
    //    It is called with db.rpc under the caller's JWT, so it needs no service role and
    //    keeps working after events.submitted_by is revoked from anon/authenticated (10A
    //    APPLY-1C), which a caller-RLS read of that column would not. It returns only a
    //    boolean, so submitted_by is never exposed. Fail CLOSED: anything but exactly
    //    `true` (false, null, missing function, RPC error) means no signing.
    const { data: allowed, error: oErr } = await db.rpc("can_upload_event_media", {
      p_event_slug: a.event_slug,
    });
    if (oErr) throw new Error(`ownership_check_failed: ${oErr.message}`);
    if (allowed !== true) return { ok: false, reason: "upload_ownership_denied" };

    const target = await resolveTarget("event_media");

    // Path is derived from the ownership-checked slug (the function matched it exactly
    // against events.slug) plus a validated base name. The model never supplies a path,
    // so it cannot write outside this event's prefix.
    const stamp = Date.now().toString(36);
    const path = `${a.event_slug}/${stamp}-${a.filename}`;

    const signed = await services.createSignedUpload(path);
    if (!signed.ok) return { ok: false, reason: signed.reason };

    // The scope row is written under the caller's RLS, not service-role. This stays as
    // defense in depth: the media-table INSERT policy independently requires ownership.
    // If it fails we throw, so no signed URL or token is ever returned to the caller.
    const { data: row, error: mErr } = await db.from(target.write_table).insert({
      event_slug: a.event_slug,
      kind: a.kind,
      media_url: `${signed.bucket}/${path}`,
      title: a.title,
      author_handle: ctx.handle,
      status: "pending_upload",
    }).select("id, event_slug, kind, media_url, status").single();
    if (mErr) throw new Error(mErr.message);

    return {
      ok: true,
      media: row,
      upload: {
        url: signed.signedUrl,
        token: signed.token,
        path,
        bucket: signed.bucket,
        method: "PUT",
      },
      processing: "none",
      note:
        "Upload directly to the signed URL. The row stays pending_upload: clients cannot publish it, and nothing here marks it published. A reviewer publishes it after the upload is verified. The file is stored as-is: no moderation, tagging, captioning or analysis runs on upload. Those are separate on-demand tools that cost credits.",
    };
  },
  redact: (a) => ({ event_slug: a.event_slug, kind: a.kind }),
};

// -------------------------------------------------------- generate_event_flyer

interface GenerateFlyerArgs {
  title: string;
  agent: string | null;
  genre: string | null;
  quote: string | null;
}

interface FlyerResult {
  ok: boolean;
  url?: string | null;
  images_generated: number;
  reason?: string;
}

const generate_event_flyer: ToolDef<GenerateFlyerArgs, FlyerResult> = {
  name: "generate_event_flyer",
  summary:
    "Generate a branded flyer image on demand. Costs credits. Only run when the user asks for one.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      agent: { type: "string", description: "Agent slug whose visual identity to use" },
      genre: { type: "string" },
      quote: { type: "string", description: "Optional overlay line; generated if omitted" },
    },
    required: ["title"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const title = str(raw.title);
    if (!title) return bad("title is required");
    return {
      ok: true,
      value: {
        title: title.slice(0, 200),
        agent: str(raw.agent)?.toLowerCase() ?? null,
        genre: str(raw.genre),
        quote: str(raw.quote),
      },
    };
  },
  execute: async (a, { services }: ToolExecContext): Promise<FlyerResult> => {
    // Reuses the deployed gen-post-image function rather than adding a second image
    // path. apply:false so it never mutates an unrelated post record as a side effect.
    const res = await services.generateImage({
      title: a.title,
      agent: a.agent,
      genre: a.genre,
      quote: a.quote,
      apply: false,
      overlay: true,
    });
    if (!res.ok) return { ok: false, images_generated: 0, reason: res.reason };
    return { ok: true, url: res.url ?? null, images_generated: 1 };
  },
  // cost_is_variable=true on this tool, so the 10-credit hold is a CEILING. Settle
  // with what was actually produced: a failed generation returns the whole hold.
  creditsUsed: (r) => (r.images_generated > 0 ? 10 : 0),
  redact: (a) => ({ title: a.title, agent: a.agent }),
};

export const STEP_12_TOOLS: ReadonlyArray<ToolDef<any, any>> = [
  upload_event_photo,
  generate_event_flyer,
];
