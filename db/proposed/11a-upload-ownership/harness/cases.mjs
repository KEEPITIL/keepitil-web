// Atlas MF2 acceptance cases, run against the REAL upload_event_photo tool from a loaded media.ts module.
// runCases(mod) -> [{ id, kind, title, pass, detail }]. `kind`:
//   deny   non-owner/anonymous/missing parent: must get NO credentials, signing-count 0, insert-count 0
//   allow  legitimate owner: signing-count 1, one pending_upload INSERT/RETURNING, credentials returned
//   other  failure handling / output hygiene / design checks
import { U, makeWorld, ctxFor, runTool } from "./lib/world.mjs";

const ARGS = (slug, extra = {}) => ({ event_slug: slug, filename: "crowd-01.jpg", kind: "image", title: "t", ...extra });
const noCreds = (r) => !(r.result && (r.result.upload || r.result.ok === true));
const clean = (w) => w.calls.sign === 0 && w.calls.insertAttempts === 0 && w.calls.rows.length === 0;

export async function runCases(mod) {
  const out = [];
  const add = (id, kind, title, pass, detail) => out.push({ id, kind, title, pass: !!pass, detail });

  async function deny(id, title, wopts, ctx, args, extra) {
    const w = makeWorld(wopts);
    const r = await runTool(mod, w, args, ctx);
    const ok = noCreds(r) && clean(w) && (extra ? extra(r, w) : true);
    add(id, "deny", title, ok, `sign=${w.calls.sign} insertAttempts=${w.calls.insertAttempts} rows=${w.calls.rows.length} result=${JSON.stringify(r.result ?? r.threw ?? r.validationError)?.slice(0, 120)}`);
    return { r, w };
  }
  async function allow(id, title, wopts, ctx, args) {
    const w = makeWorld(wopts);
    const r = await runTool(mod, w, args, ctx);
    const row = w.calls.rows[0];
    const ok = r.result?.ok === true && w.calls.sign === 1 && w.calls.insertAttempts === 1 && w.calls.rows.length === 1 &&
      row?.status === "pending_upload" && r.result.media?.status === "pending_upload" && !!r.result.upload?.url && !!r.result.upload?.token;
    add(id, "allow", title, ok, `sign=${w.calls.sign} insertAttempts=${w.calls.insertAttempts} status=${row?.status} result.ok=${r.result?.ok} threw=${r.threw ?? "-"}`);
    return { r, w };
  }

  // ---- denials (Atlas: anonymous, non-owner, missing parent, other-profile owner, spoofing)
  await deny("D1", "anonymous (no verified subject, anon JWT) denied", { caller: null }, ctxFor(null), ARGS("pub-mapped"));
  await deny("D1b", "claimed subject but the DB sees an anonymous JWT: fails closed", { caller: null }, ctxFor(U.STRANGER), ARGS("pub-mapped"));
  await deny("D2", "visible published event, signed-in NON-owner: denied", { caller: U.STRANGER }, ctxFor(U.STRANGER), ARGS("pub-mapped"),
    (r) => r.result?.reason === "upload_ownership_denied");
  await deny("D2b", "published event submitted by someone else, non-owner: denied", { caller: U.STRANGER }, ctxFor(U.STRANGER), ARGS("pub-submitted"));
  await deny("D2c", "non-owner against a published event, media INSERT policy OPEN (worst case): still no signing", { caller: U.STRANGER, insertRls: "open" }, ctxFor(U.STRANGER), ARGS("pub-mapped"));
  await deny("D3", "someone else's DRAFT parent: denied", { caller: U.STRANGER }, ctxFor(U.STRANGER), ARGS("draft-mapped"));
  await deny("D4", "missing parent: denied", { caller: U.MAPPED }, ctxFor(U.MAPPED), ARGS("no-such-event"));
  await deny("D5", "spoofed model args (handle/author_handle/submitted_by/owner_handle) ignored", { caller: U.STRANGER }, ctxFor(U.STRANGER, null),
    ARGS("pub-mapped", { handle: "band-a", author_handle: "band-a", submitted_by: U.MAPPED, owner_handle: "band-a" }),
    (r) => Object.keys(r.parsed?.value ?? {}).sort().join() === "event_slug,filename,kind,title");
  await deny("D6", "spoofed ctx.handle = the owning profile's handle, but the subject is a stranger", { caller: U.STRANGER }, ctxFor(U.STRANGER, "band-a"), ARGS("pub-mapped"));
  await deny("D7", "owner of ANOTHER profile (band-d) against band-b's event", { caller: U.OTHERPROF }, ctxFor(U.OTHERPROF), ARGS("pub-band-b"));
  await deny("D7b", "owner of another profile against band-a's event", { caller: U.OTHERPROF }, ctxFor(U.OTHERPROF), ARGS("pub-mapped"));
  await deny("D8", "path traversal slug is refused before any DB or signing call", { caller: U.MAPPED }, ctxFor(U.MAPPED), ARGS("../pub-mapped"),
    (r, w) => w.calls.rpc.length === 0);

  // ---- allowed owners
  const a1 = await allow("A1", "mapped owner (profile_owners) allowed", { caller: U.MAPPED }, ctxFor(U.MAPPED, "band-a"), ARGS("pub-mapped"));
  await allow("A2", "submitted_by owner WITHOUT a profile mapping allowed", { caller: U.SUBMITTER }, ctxFor(U.SUBMITTER), ARGS("pub-submitted"));
  await allow("A3", "draft-parent owner (profile_owners) allowed", { caller: U.MAPPED }, ctxFor(U.MAPPED), ARGS("draft-mapped"));
  await allow("A3b", "draft-parent owner (submitted_by) allowed", { caller: U.SUBMITTER }, ctxFor(U.SUBMITTER), ARGS("draft-submitted"));
  await allow("A4", "multi-profile owner accepted (owns band-c and band-b, event is band-b)", { caller: U.MULTI }, ctxFor(U.MULTI), ARGS("pub-band-b"));

  // ---- failure handling
  {
    const w = makeWorld({ caller: U.MAPPED, failSign: true });
    const r = await runTool(mod, w, ARGS("pub-mapped"), ctxFor(U.MAPPED));
    add("X1", "other", "signing failure: ok=false, insert-count 0, no credentials",
      r.result?.ok === false && w.calls.sign === 1 && w.calls.insertAttempts === 0 && w.calls.rows.length === 0 && noCreds(r),
      `sign=${w.calls.sign} insertAttempts=${w.calls.insertAttempts} result=${JSON.stringify(r.result)}`);
  }
  {
    const w = makeWorld({ caller: U.MAPPED, failInsert: true });
    const r = await runTool(mod, w, ARGS("pub-mapped"), ctxFor(U.MAPPED));
    add("X2", "other", "insert failure: tool throws, NO upload credentials returned, no row",
      typeof r.threw === "string" && r.result === undefined && w.calls.rows.length === 0 && w.calls.insertAttempts === 1,
      `threw=${r.threw} result=${JSON.stringify(r.result)}`);
  }
  for (const mode of ["error", "missing", "null", "string-true", "one"]) {
    const w = makeWorld({ caller: U.MAPPED, rpcMode: mode });
    const r = await runTool(mod, w, ARGS("pub-mapped"), ctxFor(U.MAPPED));
    add("X3-" + mode, "other", `ownership function returns '${mode}': fails CLOSED (signing 0, insert 0, no credentials)`,
      noCreds(r) && clean(w), `sign=${w.calls.sign} insertAttempts=${w.calls.insertAttempts} out=${JSON.stringify(r.result ?? r.threw)?.slice(0, 100)}`);
  }

  // ---- output hygiene / design
  const note = String(a1.r.result?.note ?? "");
  add("N1", "other", "note no longer tells clients to mark the row published",
    note.length > 0 && !/mark the row published/i.test(note) && !/then mark/i.test(note) && /pending_upload/.test(note) && /cannot publish/i.test(note),
    `note=${note.slice(0, 140)}`);
  add("P1", "other", "signed path stays under the ownership-checked slug prefix",
    a1.w.calls.signPaths[0]?.startsWith("pub-mapped/") && /crowd-01\.jpg$/.test(a1.w.calls.signPaths[0]), `path=${a1.w.calls.signPaths[0]}`);
  add("P2", "other", "ownership RPC called exactly once, with only p_event_slug (no subject/handle argument)",
    a1.w.calls.rpc.length === 1 && a1.w.calls.rpc[0].name === "can_upload_event_media" &&
    JSON.stringify(a1.w.calls.rpc[0].args) === JSON.stringify({ p_event_slug: "pub-mapped" }), JSON.stringify(a1.w.calls.rpc));
  return out;
}
