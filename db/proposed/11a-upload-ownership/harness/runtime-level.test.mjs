// 11A harness, layer 2: the REAL runtime.ts invokeTool + identity.ts deriveServerContext + registry.ts, with media.ts
// swapped between the deployed v44 (control) and the proposed patch. Only the supabase clients are mocked.
// Signing is counted at the lowest mocked layer (adminDb.storage...createSignedUploadUrl), i.e. after the real
// services.createSignedUpload in runtime.ts has resolved the bucket.
//   node --experimental-strip-types --test harness/runtime-level.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { U, makeWorld } from "./lib/world.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "deployed-v44");
const PROPOSED = path.join(HERE, "..", "media.PROPOSED.ts");

async function loadTree(useProposed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "11a-tree-"));
  for (const f of fs.readdirSync(SRC)) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
  if (useProposed) fs.copyFileSync(PROPOSED, path.join(dir, "media.ts"));
  const u = (f) => pathToFileURL(path.join(dir, f)).href;
  return { runtime: await import(u("runtime.ts")), identity: await import(u("identity.ts")) };
}
const [PATCHED, DEPLOYED] = [await loadTree(true), await loadTree(false)];

function makeAdmin(storage) {
  const tables = {
    agent_tool_policies: [{ tool_name: "upload_event_photo", risk_class: "B", min_autonomy_level: 0, requires_confirmation: false,
      is_external: false, is_mcp_safe: true, max_privacy_class: null, description: "", enabled: true }],
    agent_canonical_targets: [{ concept: "event_media", write_table: "event_media", detail_table: null, legacy_tables: [], notes: "" }],
  };
  const single = { agent_runs: { id: "run1", workflow_id: "wf1" }, agent_steps: { id: "s1" }, agent_actions: { id: "a1" },
    platform_config: { value: "event-media" }, app_users: { handle: "someone", display_name: null }, app_admins: null };
  return {
    from(table) {
      const chain = {
        select: () => chain, insert: () => chain, update: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: single[table] ?? null, error: null }),
        single: async () => ({ data: single[table] ?? null, error: null }),
        then: (res, rej) => Promise.resolve({ data: tables[table] ?? null, error: null }).then(res, rej),
      };
      return chain;
    },
    async rpc(name) {
      if (name === "agent_authorize_tool") return { data: { allow: true, action: "proceed", credit_cost: 0, reservation_id: null, risk_class: "B", is_external: false }, error: null };
      return { data: null, error: null };
    },
    storage: { from: (bucket) => ({ createSignedUploadUrl: async (p) => { storage.n++; storage.paths.push(`${bucket}/${p}`); return { data: { signedUrl: `https://s/${p}`, token: "T" }, error: null }; } }) },
  };
}

async function invoke(tree, { sub, args, withAuth = true }) {
  const w = makeWorld({ caller: sub });
  const storage = { n: 0, paths: [] };
  const adminDb = makeAdmin(storage);
  const userDb = Object.assign(w.db, { auth: { getUser: async () => (sub ? { data: { user: { id: sub, email: null } }, error: null } : { data: { user: null }, error: { message: "no jwt" } }) } });
  const req = new Request("https://edge/invoke", { headers: withAuth ? { Authorization: "Bearer mock" } : {} });
  const ctx = await tree.identity.deriveServerContext(req, userDb, adminDb);
  if (!ctx) return { ctx, storage, w };
  const res = await tree.runtime.invokeTool({ tool: "upload_event_photo", agent: "echo", args }, ctx, { adminDb, userDb });
  return { ctx, res, storage, w };
}
const ARGS = (slug, extra = {}) => ({ event_slug: slug, filename: "crowd-01.jpg", ...extra });

test("RT1 anonymous: deriveServerContext returns null (no Authorization / invalid JWT), tool never reached, signing 0", async () => {
  const a = await invoke(PATCHED, { sub: null, args: ARGS("pub-mapped"), withAuth: false });
  assert.equal(a.ctx, null); assert.equal(a.storage.n, 0);
  const b = await invoke(PATCHED, { sub: null, args: ARGS("pub-mapped"), withAuth: true });
  assert.equal(b.ctx, null); assert.equal(b.storage.n, 0);
});

test("RT2 PATCHED: mapped owner end to end: proceed, storage signing 1, pending_upload row", async () => {
  const r = await invoke(PATCHED, { sub: U.MAPPED, args: ARGS("pub-mapped") });
  assert.equal(r.res.ok, true); assert.equal(r.res.data.ok, true);
  assert.equal(r.storage.n, 1); assert.match(r.storage.paths[0], /^event-media\/pub-mapped\/.+-crowd-01\.jpg$/);
  assert.equal(r.w.calls.rows.length, 1); assert.equal(r.w.calls.rows[0].status, "pending_upload");
  assert.ok(r.res.data.upload.url);
});

test("RT3 PATCHED: visible-event non-owner end to end: denied, storage signing 0, insert 0, no credentials", async () => {
  const r = await invoke(PATCHED, { sub: U.STRANGER, args: ARGS("pub-mapped") });
  assert.equal(r.res.data.ok, false); assert.equal(r.res.data.reason, "upload_ownership_denied");
  assert.equal(r.res.data.upload, undefined);
  assert.equal(r.storage.n, 0); assert.equal(r.w.calls.insertAttempts, 0); assert.equal(r.w.calls.rows.length, 0);
});

test("RT4 PATCHED: identity keys in model args are rejected by the real identity boundary before anything runs", async () => {
  for (const extra of [{ user_id: U.MAPPED }, { owner_id: U.MAPPED }, { sub: U.MAPPED }, { nested: { actor_id: U.MAPPED } }]) {
    const r = await invoke(PATCHED, { sub: U.STRANGER, args: ARGS("pub-mapped", extra) });
    assert.equal(r.res.ok, false); assert.equal(r.res.reason, "identity_from_model");
    assert.equal(r.storage.n, 0); assert.equal(r.w.calls.rpc.length, 0); assert.equal(r.w.calls.insertAttempts, 0);
  }
});

test("RT5 PATCHED: ownership function missing/erroring: the invoke returns an error, signing 0", async () => {
  const w = makeWorld({ caller: U.MAPPED, rpcMode: "missing" });
  const storage = { n: 0, paths: [] };
  const adminDb = makeAdmin(storage);
  const userDb = Object.assign(w.db, { auth: { getUser: async () => ({ data: { user: { id: U.MAPPED } }, error: null }) } });
  const ctx = await PATCHED.identity.deriveServerContext(new Request("https://e", { headers: { Authorization: "Bearer x" } }), userDb, adminDb);
  const res = await PATCHED.runtime.invokeTool({ tool: "upload_event_photo", agent: "echo", args: ARGS("pub-mapped") }, ctx, { adminDb, userDb });
  assert.equal(res.ok, false); assert.equal(res.action, "error"); assert.match(res.error, /ownership_check_failed/);
  assert.equal(storage.n, 0); assert.equal(w.calls.rows.length, 0);
});

test("NEGATIVE CONTROL RT6 DEPLOYED v44: the same non-owner request reaches storage signing (count 1)", async () => {
  const r = await invoke(DEPLOYED, { sub: U.STRANGER, args: ARGS("pub-mapped") });
  assert.equal(r.storage.n, 1, "unpatched v44 must have signed for a non-owner");
  console.log(`# CONTROL RT6: unpatched v44, non-owner: storage signing count = ${r.storage.n}, action=${r.res.action}, ok=${r.res.data?.ok ?? "(threw: " + r.res.error + ")"}`);
});

test("NEGATIVE CONTROL RT7 DEPLOYED v44 with an open media INSERT policy: non-owner gets credentials AND a row", async () => {
  const w = makeWorld({ caller: U.STRANGER, insertRls: "open" });
  const storage = { n: 0, paths: [] };
  const adminDb = makeAdmin(storage);
  const userDb = Object.assign(w.db, { auth: { getUser: async () => ({ data: { user: { id: U.STRANGER } }, error: null }) } });
  const ctx = await DEPLOYED.identity.deriveServerContext(new Request("https://e", { headers: { Authorization: "Bearer x" } }), userDb, adminDb);
  const res = await DEPLOYED.runtime.invokeTool({ tool: "upload_event_photo", agent: "echo", args: ARGS("pub-mapped") }, ctx, { adminDb, userDb });
  assert.equal(res.data.ok, true); assert.ok(res.data.upload.url); assert.equal(storage.n, 1);
  assert.match(res.data.note, /mark the row published/);
});
