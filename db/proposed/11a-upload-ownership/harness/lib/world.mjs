// Fake supabase-like world for the 11A harness. Pure JS, no network, no packages.
// It stands in for: the caller-JWT supabase client (`db` = userDb), the admin client (`adminDb`),
// Storage signing, and the SQL function public.can_upload_event_media. See ../README.md for what is NOT modelled.

export const U = {
  MAPPED: "00000000-0000-4000-8000-0000000000a1",     // owns profile band-a via profile_owners
  SUBMITTER: "00000000-0000-4000-8000-0000000000a2",  // events.submitted_by on e2/e4, no profile mapping
  STRANGER: "00000000-0000-4000-8000-0000000000a3",   // signed in, owns nothing
  MULTI: "00000000-0000-4000-8000-0000000000a4",      // owns band-c AND band-b (multi-profile owner)
  OTHERPROF: "00000000-0000-4000-8000-0000000000a5",  // owns band-d only
  SOMEONE: "00000000-0000-4000-8000-0000000000a6",    // submitter of e5, not a caller in any case
};

export function baseData() {
  return {
    events: [
      { id: "e1", slug: "pub-mapped", owner_handle: "band-a", submitted_by: null, status: "published" },
      { id: "e2", slug: "pub-submitted", owner_handle: "unmapped-handle", submitted_by: U.SUBMITTER, status: "published" },
      { id: "e3", slug: "draft-mapped", owner_handle: "band-a", submitted_by: null, status: "draft" },
      { id: "e4", slug: "draft-submitted", owner_handle: null, submitted_by: U.SUBMITTER, status: "draft" },
      { id: "e5", slug: "pub-band-b", owner_handle: "band-b", submitted_by: U.SOMEONE, status: "published" },
    ],
    profile_owners: [
      { profile_slug: "band-a", owner_id: U.MAPPED },
      { profile_slug: "band-c", owner_id: U.MULTI },
      { profile_slug: "band-b", owner_id: U.MULTI },
      { profile_slug: "band-d", owner_id: U.OTHERPROF },   // profile_slug is the PK in the real table: one owner row per profile
    ],
    event_media: [],
  };
}

const isOwner = (data, sub, ev) =>
  !!sub && !!ev && (ev.submitted_by === sub ||
    data.profile_owners.some((po) => po.profile_slug === ev.owner_handle && po.owner_id === sub));

/**
 * opts.caller      JWT subject the DATABASE sees (auth.uid()). null = anonymous.
 * opts.insertRls   'owner' (post-Atlas media INSERT policy: parent owner only) | 'open' (any signed-in caller)
 * opts.failInsert  insert returns an error
 * opts.failSign    signing returns {ok:false}
 * opts.rpcMode     'real' | 'missing' (function not deployed) | 'null' | 'string-true' | 'one' | 'error'
 */
export function makeWorld(opts = {}) {
  const data = baseData();
  const caller = opts.caller ?? null;
  const calls = { sign: 0, signPaths: [], insertAttempts: 0, rpc: [], eventReads: 0, rows: data.event_media };

  const project = (row, cols) => {
    if (!cols || cols === "*") return { ...row };
    const out = {};
    for (const c of cols.split(",").map((s) => s.trim())) out[c] = row[c];
    return out;
  };

  const db = {
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name !== "can_upload_event_media") return { data: null, error: { message: `function public.${name} does not exist` } };
      switch (opts.rpcMode ?? "real") {
        case "missing": return { data: null, error: { message: "Could not find the function public.can_upload_event_media(p_event_slug) in the schema cache" } };
        case "error": return { data: null, error: { message: "boom" } };
        case "null": return { data: null, error: null };
        case "string-true": return { data: "true", error: null };
        case "one": return { data: 1, error: null };
      }
      // anon has no EXECUTE on the real function
      if (!caller) return { data: null, error: { message: "permission denied for function can_upload_event_media" } };
      // mirrors the SQL: identity is the DB's own auth.uid() (= `caller`), never an argument or ctx
      const ev = data.events.find((e) => e.slug === args?.p_event_slug);
      return { data: isOwner(data, caller, ev), error: null };
    },
    from(table) {
      const q = { table, cols: null, filters: [], payload: null, mode: "select" };
      const run = async (single) => {
        if (q.mode === "select" && table === "events") {
          calls.eventReads++;
          const rows = data.events.filter((e) => q.filters.every(([c, v]) => e[c] === v) &&
            (e.status === "published" || isOwner(data, caller, e)));   // caller-RLS visibility
          return { data: rows[0] ? project(rows[0], q.cols) : null, error: null };
        }
        if (q.mode === "insert") {
          calls.insertAttempts++;
          if (opts.failInsert) return { data: null, error: { message: "insert failed (mock)" } };
          const ev = data.events.find((e) => e.slug === q.payload.event_slug);
          if ((opts.insertRls ?? "owner") === "owner" && !isOwner(data, caller, ev)) {
            return { data: null, error: { message: `new row violates row-level security policy for table "${table}"` } };
          }
          const row = { id: data.event_media.length + 1, ...q.payload };
          data.event_media.push(row);
          return { data: project(row, q.cols), error: null };
        }
        return { data: null, error: { message: `unmodelled query on ${table}` } };
      };
      const chain = {
        select(cols) { q.cols = cols; return chain; },
        insert(payload) { q.mode = "insert"; q.payload = payload; return chain; },
        eq(c, v) { q.filters.push([c, v]); return chain; },
        maybeSingle: () => run(true),
        single: () => run(true),
      };
      return chain;
    },
  };

  const services = {
    async createSignedUpload(path) {
      calls.sign++; calls.signPaths.push(path);
      if (opts.failSign) return { ok: false, reason: "sign_failed: mock" };
      return { ok: true, bucket: "event-media", signedUrl: `https://storage.mock/sign/${path}?token=T`, token: "T" };
    },
  };

  return { db, services, calls, data, resolveTarget: async () => ({ write_table: "event_media" }) };
}

export const ctxFor = (actor_id, handle = null) => ({
  actor_id, handle, display_name: null, email: null, is_admin: false, authorization: actor_id ? "Bearer mock" : "",
});

/** Runs the REAL tool (validate + execute) from a loaded media module against a world. */
export async function runTool(mod, world, rawArgs, ctx) {
  const tool = mod.STEP_12_TOOLS.find((t) => t.name === "upload_event_photo");
  const parsed = tool.validate(rawArgs);
  if (!parsed.ok) return { validationError: parsed.error, parsed };
  try {
    const result = await tool.execute(parsed.value, {
      db: world.db, ctx, resolveTarget: world.resolveTarget, services: world.services,
    });
    return { result, parsed };
  } catch (e) {
    return { threw: e instanceof Error ? e.message : String(e), parsed };
  }
}
