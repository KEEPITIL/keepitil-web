/* run-combined.mjs - 11B combined RLS rehearsal (PARTIAL, PGlite; proposal only). NOTHING touches any hosted database.
   Run:  PGLITE_DIR=$HOME/work/pgl-scratch node db/proposed/11b-combined-rehearsal/run-combined.mjs        (PGlite is also found at ~/work/pgl-scratch without the variable)
   Flow: COMBINED-REPLICA.sql (baseline S0, catalog snapshot) -> the ORDER-10A order with an assertion block after EACH step -> Atlas's 26-case matrix on the final state
         -> negative controls (mutants of the combined order) -> reverse-order ROLLBACK pass with an exact catalog diff against the snapshot taken before each forward step.
   Outputs: out/matrix-results.json, out/run-combined-output.txt (stdout), and the generated F3 copies under out/generated/. Exit 0 only if every expected result occurred.   */
import { join } from "node:path";
import { HERE, UP, P10A, F3, A11, rd, U, A22, INS19, UPD14, E45, E44, sorted, eq, lit, open, closeDb, dump, clone, su, one, as, tx, denied, colset, tp, fnp, collector, snapshot, diffSnap, brief, fp, mutate, ensureDir, writeFileSync } from "./lib/core.mjs";
import * as steps from "./lib/steps.mjs";
import * as steps2 from "./lib/steps2.mjs";
import { WEB, APP, isReset } from "./lib/payloads.mjs";
import * as matrix from "./lib/matrix.mjs";
import { makeF3Lab } from "./lib/f3lab.mjs";
import { probes, PROBE_IDS } from "./lib/probes.mjs";
import { execSync } from "node:child_process";

const T0 = Date.now(); const OUT = ensureDir(join(HERE, "out")), GEN = ensureDir(join(OUT, "generated"));
const LINES = []; const log = (...a) => { const t = a.join(" "); LINES.push(t); console.log(t); };
process.on("uncaughtException", (e) => { console.log("FATAL: " + String(e && e.message || e).slice(0, 600)); process.exit(2); });

/* ------------------------------------------------------------------ inputs (verbatim files; nothing is edited except the documented, mechanical transformations below) */
const REPLICA = rd(HERE, "COMBINED-REPLICA.sql");
const A1 = rd(UP, "APPLY-1.sql"), A1B = rd(UP, "APPLY-1B-kind-check.sql"), A92 = rd(UP, "APPLY-92.sql"), A2 = rd(UP, "APPLY-2.sql");
const C1C = rd(P10A, "APPLY-1C-grant-narrowing_PROPOSED.sql"), A92_44 = rd(P10A, "APPLY-92-44col_PROPOSED.sql"), RB1C = rd(P10A, "ROLLBACK-1C_PROPOSED.sql"), RB2X = rd(P10A, "ROLLBACK-2-after-1C_PROPOSED.sql");
const FP3 = "2026-11-09_f3_media_rls_connect_publish_gate_";
const F3_FW = rd(F3, FP3 + "FORWARD_PROPOSED.sql"), F3_RB = rd(F3, FP3 + "ROLLBACK_PROPOSED.sql"), F3_DQ = rd(F3, FP3 + "DRIFT_QUERY_PROPOSED.sql"), F3_PC = rd(F3, FP3 + "POSTCHECKS_PROPOSED.sql"), F3_GR = rd(F3, FP3 + "GATE_READINESS_READONLY_PROPOSED.sql");
const F3_ORIG_FP = "c917a7dfbc778913b7e46b332aeeb348";
const A11_FN = rd(A11, "can_upload_event_media_PROPOSED.sql"), A11_RB = rd(A11, "ROLLBACK_PROPOSED.sql");
const R1_RAW = rd(HERE, "rollbacks/ROLLBACK-1.sql"), R1B = rd(HERE, "rollbacks/ROLLBACK-1B-kind-check.sql"), R92_RAW = rd(HERE, "rollbacks/ROLLBACK-92.sql");

/* ------------------------------------------------------------------ the documented, mechanical fills/regenerations (every one is listed in REHEARSAL-REPORT.md)
   (a) ROLLBACK-1: {{GET_APPROVED_PROFILE_OLD_DEF}} removed (P-3: the function did not exist on prod); {{CLAIM_PROFILE_GRANTS}} filled with what P-3/P-5 captured (PUBLIC + anon + authenticated);
       "Option A" (exact pre-state: anon ALL) swapped in for "Option B" (anon SELECT only) so the rollback can be judged for EXACTNESS. Option B is also run and reported.
   (b) ROLLBACK-92: the two placeholders filled from PRECHECK-92-RESULTS Q-2 (the captured body and ACL = the body in COMBINED-REPLICA.sql).
   (c) F3 ROLLBACK for a database where 1C ran first: the two profile_meta re-grants removed (they would re-open TRUNCATE/REFERENCES/TRIGGER that 1C closed).        */
const GPE_OLD = `CREATE OR REPLACE FUNCTION public.get_profile_events(p_handle text)
 RETURNS TABLE(slug text, title text, cover_url text, starts_at timestamp with time zone, venue text, city text, status text, genres text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select e.slug, e.title, e.cover_url, e.starts_at, e.venue, e.city, e.status, e.genres
  from public.events e
  where e.owner_handle = p_handle
    and ( e.status = 'published'
          or e.owner_handle = (select handle from public.app_users where id = auth.uid()) )
  order by e.starts_at desc nulls last, e.id desc;
$function$`;
const GPE_GRANTS = `REVOKE ALL ON FUNCTION public.get_profile_events(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_profile_events(text) TO anon, authenticated, service_role`;
const fillR92 = (s) => s.replace("{{GET_PROFILE_EVENTS_OLD_DEFINITION}}", GPE_OLD).replace("{{GET_PROFILE_EVENTS_OLD_GRANTS}}", GPE_GRANTS);
const fillR1 = (s, optionA = true) => {
  let o = s.replace("{{GET_APPROVED_PROFILE_OLD_DEF}};", "-- (removed: get_approved_profile did not exist before APPLY-1, P-3)").replace("{{CLAIM_PROFILE_GRANTS}};", "GRANT EXECUTE ON FUNCTION public.claim_profile(text, text) TO PUBLIC, anon, authenticated;");
  if (optionA) o = o.replace("-- Option A (exact pre-state per P-10, re-opens anon write PRIVILEGES; RLS had no anon write policy): GRANT ALL ON TABLE public.profile_meta, public.profile_owners TO anon;", "GRANT ALL ON TABLE public.profile_meta, public.profile_owners TO anon;");
  if (/\{\{/.test(o.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n"))) throw new Error("unfilled placeholder in ROLLBACK-1"); return o; };
const regenF3Rollback = (rb) => {   // remove profile_meta from the two re-grant lines that 1C had already (correctly) closed
  let o = mutate(rb, "GRANT UPDATE,DELETE,REFERENCES,TRIGGER ON TABLE public.event_media,public.venue_media,public.profile_meta TO anon;", "GRANT UPDATE,DELETE,REFERENCES,TRIGGER ON TABLE public.event_media,public.venue_media TO anon;   -- 11B regeneration: profile_meta removed (1C closed it)", "f3 rb line 1");
  return mutate(o, "GRANT TRUNCATE ON TABLE public.event_media,public.venue_media,public.profile_meta TO anon,authenticated;", "GRANT TRUNCATE ON TABLE public.event_media,public.venue_media TO anon,authenticated;   -- 11B regeneration: profile_meta removed (1C closed it)", "f3 rb line 2"); };

/* ------------------------------------------------------------------ report plumbing */
const R = { generated: new Date().toISOString(), engine: null, steps: [], matrix: [], mutants: [], rollback: [], findings: [], fingerprints: {} };
let failures = 0;
const record = (sink, arr, stepId) => { for (const c of arr) { sink.push({ step: stepId, ...c }); if (!c.ok) failures++; } };
const show = (arr, prefix = "  ") => { for (const c of arr) log(`${prefix}${c.ok ? "PASS" : "FAIL"} ${c.id}  ${c.name}${c.ok ? "" : "\n" + prefix + "       -> " + c.why}`); };
async function runStep(id, title, db, sql, assertFn, { expectFail = null } = {}) {
  const r = await tx(db, sql); log(`\n== STEP ${id}: ${title}`);
  let a = [];
  if (expectFail) { const ok = !r.ok && expectFail.test(r.err); a.push({ id: id + ".apply", name: `apply aborts as expected (${expectFail})`, ok, why: r.ok ? "applied" : r.err.slice(0, 200) }); }
  else a.push({ id: id + ".apply", name: "applied in one transaction without error", ok: r.ok, why: r.err || "" });
  if (assertFn && (r.ok || expectFail)) a = a.concat(await assertFn());
  record(R.steps, a, id); show(a); return r; }

/* =================================================================== BASELINE (S0) */
const P = await (await import("./lib/core.mjs")).loadPGlite();
R.engine = (await (async () => { const d = await open(); const v = (await one(d, "select version() v")).v; await closeDb(d); return v.split(" on ")[0]; })());
log(`11B combined RLS rehearsal  engine=${R.engine}  (production is PostgreSQL 17.6; PGlite is a stand-in)`);
const db = await open(); await db.exec(REPLICA);
const cat0 = await snapshot(db); const FP0 = await fp(db); R.fingerprints.FP0_baseline = FP0;
const B = { S0: await dump(db) };
const CAT = { S0: cat0 };
log(`baseline S0 loaded: ${Object.keys(cat0.relations).length} relations, ${Object.keys(cat0.functions).length} functions, ${Object.keys(cat0.policies).length} policies; privilege fingerprint FP0=${FP0}`);
{ const a = []; const { check } = collector(a);
  await check("S0.1", "baseline matches the captured prod state: profile_meta 4 own rows ALL for anon/authenticated incl TRUNCATE; profile_content ALL; events 45 readable + hash unreadable; no #91 columns; no private.account_age; no atlas_media_guard; no can_upload_event_media", async () =>
    (await tp(db, "anon", "profile_meta", "TRUNCATE")) && (await tp(db, "authenticated", "profile_content", "TRUNCATE")) && eq(await colset(db, "anon", "events", "SELECT"), sorted(E45)) && !(await one(db, "select to_regclass('private.account_age') is not null x")).x
    && !(await one(db, "select exists(select 1 from pg_namespace where nspname='atlas_media_guard') x")).x && !(await one(db, "select to_regprocedure('public.can_upload_event_media(text)') is not null x")).x);
  await check("S0.2", "the existing prod publish gate is installed verbatim with its early return for published->published updates", async () => /old\.status = 'published' then/.test((await one(db, "select pg_get_functiondef('public.profile_meta_publish_gate()'::regprocedure) d")).d));
  record(R.steps, a, "S0"); show(a); }

/* =================================================================== THE ORDER (ORDER-10A.md) */
// step 2 (add): APPLY-1 -> 1B -> 92 (45-col)
await runStep("S1", "APPLY-1 (own transaction)", db, A1, () => steps.afterAPPLY1(db, cat0)); CAT.S1 = await snapshot(db); B.S1 = await dump(db); R.fingerprints.FP1_after_apply1 = await fp(db);
{ const rej = await as(db, "authenticated", U.TUI, "insert into public.profile_content(profile_slug,kind,data) values ('tuitea','account_type_request','{}')");
  const a = [{ id: "S1B.0", name: "BEFORE 1B the 'request a business type' insert is rejected by the 9-kind CHECK (this is why 1B exists)", ok: /profile_content_kind_check/.test(rej.err || ""), why: JSON.stringify(rej).slice(0, 200) }]; record(R.steps, a, "S1B"); show(a); }
await runStep("S1B", "APPLY-1B (kind check)", db, A1B, () => steps.afterAPPLY1B(db)); CAT.S2 = await snapshot(db); B.S2 = await dump(db);
await runStep("S92", "APPLY-92 (corrected pack version, REVOKE SELECT (event_password_hash) only; 45-column guard)", db, A92, () => steps.afterAPPLY92(db, cat0)); CAT.S3 = await snapshot(db); B.S3 = await dump(db);
// step 3 (opt-in house/age): the admin functions with a set_config'd admin identity (the real flow is Joe's signed-in admin session)
log("\n== STEP S4: attestation batch A/B/C through the admin functions (identity = set_config('request.jwt.claim.sub') + SET ROLE authenticated)");
{ const w = [];
  w.push(await as(db, "authenticated", U.ADM2, `select public.admin_set_account_age('${U.HOUSE}', true, 'house')`));
  w.push(await as(db, "authenticated", U.ADM2, `select public.admin_move_house_page('groove-trooper', '${U.HOUSE}')`));
  w.push(await as(db, "authenticated", U.TUI, `select public.admin_set_account_age('${U.TUI}', true, 'founder_self', 'my own words', '2026-11-09')`));
  w.push(await as(db, "authenticated", U.TUI, `select public.admin_set_account_age('${U.FOB}', true, 'admin_attested')`));
  const a = [{ id: "S4.0", name: "the four admin calls succeeded", ok: w.every((x) => !x.err), why: JSON.stringify(w.filter((x) => x.err)) }].concat(await steps.afterAttestation(db)); record(R.steps, a, "S4"); show(a); }
CAT.S4 = await snapshot(db); B.S4 = await dump(db);


// step 4 (client): ONE Pages deploy = #91 web + #129 (10B) + #130. Grants are still 22/22, so old and new saves BOTH work (the deliberate compatibility window). Replays run on a clone so the chain stays clean.
{ const w = await clone(B.S4); const a = await steps2.clientStage(w, "S5", { appWorks: true, f3: false }); await closeDb(w); log("\n== STEP S5a: client payload checks in the compatibility window (22-column grants, real #129 web payloads + real bundled-app payload)"); record(R.steps, a, "S5"); show(a); }
// step 5 (owners opt in) + visibility proof
await runStep("S5", "owner opt-in + visibility proof (anon RPCs return exactly attested + opted-in pages; minors fail closed)", db, "select 1", () => steps.afterClient(db)); CAT.S5 = await snapshot(db); B.S5 = await dump(db);
// step 6 (revoke 1C)
const FP2 = await fp(db); R.fingerprints.FP2_before_1C = FP2;
await runStep("S6", "APPLY-1C grant narrowing (guard + post-asserts are inside the file)", db, C1C, async () => { const fp3 = await fp(db); R.fingerprints.FP3_after_1C = fp3; return steps2.afterC1C(db, { fp2: FP2, fp3 }); }); CAT.S6 = await snapshot(db); B.S6 = await dump(db);
{ const a = []; const { check } = collector(a);
  await check("S6.idem", "1C is idempotent: a second run is accepted and the catalog snapshot is identical", async () => { const w = await clone(B.S6); const r = await tx(w, C1C); const d = diffSnap(CAT.S6, await snapshot(w)); await closeDb(w); return (r.ok && d.n === 0) || (r.err || brief(d)); });
  await check("S6.ord-alt", "ORDER-10A alternate order (APPLY-1, 1B, 1C, then APPLY-92-44col) ends in a catalog snapshot IDENTICAL to APPLY-92 (45) then 1C (functions, ACLs, policies, md5s)", async () => {
    const w = await clone(B.S2); const r1 = await tx(w, C1C); const r2 = await tx(w, A92_44); const d = diffSnap(CAT.S6, await snapshot(w)); await closeDb(w); return (r1.ok && r2.ok && d.n === 0) || (r1.err || r2.err || brief(d)); });
  await check("S6.stale-92", "STALE BASELINE: the stock APPLY-92 (45-column guard) REFUSES after 1C and changes nothing (the 44-column variant exists for that order)", async () => {
    const w = await clone(B.S2); await tx(w, C1C); const before = await snapshot(w); const r = await tx(w, A92); const d = diffSnap(before, await snapshot(w)); await closeDb(w); return (!r.ok && /events guard: .* column SELECT set differs from the 45 expected/.test(r.err) && d.n === 0) || (r.err || "applied"); });
  await check("S6.rerun-A1", "HAZARD (documented, 10A proof RERUN-A1): re-running APPLY-1 AFTER 1C re-grants account_type/status to owners; re-running 1C afterwards narrows them again", async () => {
    const w = await clone(B.S6); await tx(w, A1); const open_ = !(await as(w, "authenticated", U.TUI, "update public.profile_meta set account_type='editorial_brand' where slug='tuitea'")).err; await tx(w, C1C); const shut = denied(await as(w, "authenticated", U.TUI, "update public.profile_meta set account_type='editorial_brand' where slug='tuitea'")); await closeDb(w); return (open_ && shut) || JSON.stringify({ open_, shut }); });
  await check("S6.rb92-after-1C", "FINDING (ORDER-10A text vs file): ORDER-10A says ROLLBACK-92's guard 'must be given the 44-column list or it will refuse' after 1C, but the ROLLBACK-92 in the pack has NO executable events guard (the guard is a comment pointing at VERIFY-92 V-3): run after 1C it SUCCEEDS, restores the old get_profile_events and leaves the events column grants at 44 (it re-grants no columns)", async () => {
    const w = await clone(B.S6); const r = await tx(w, fillR92(R92_RAW)); const cols = await colset(w, "anon", "events", "SELECT"); await closeDb(w); return (r.ok && eq(cols, sorted(E44))) || (r.err || "events set changed"); });
  log("\n== STEP S6b: 1C idempotence, alternate order, stale baseline, APPLY-1 re-run hazard"); record(R.steps, a, "S6"); show(a); }
{ const w = await clone(B.S6); const a = await steps2.clientStage(w, "S7", { appWorks: false, f3: false }); await closeDb(w); log("\n== STEP S7: visibility proof / real owner saves AFTER 1C (before F3): web payloads work, the bundled app save is refused"); record(R.steps, a, "S7"); show(a); }
// step 8 (server gate): F3 forward. (a) the committed forward ABORTS on a catalog it does not match; (b) re-baseline from the DRIFT_QUERY on THIS replica; (c) run the COPY.
log("\n== STEP S8: F3 FORWARD (Atlas, #121)");
{ const a = []; const { check } = collector(a);
  const before = await snapshot(db);
  const stale = await tx(db, F3_FW);
  await check("S8.stale", "EXPECTED stale-baseline abort: the committed forward (literal c917a7df...) raises 'Catalog drift' on the combined replica and changes nothing", async () => (!stale.ok && /Catalog drift: stop and re-review/.test(stale.err) && diffSnap(before, await snapshot(db)).n === 0) || (stale.err || "applied"));
  await db.exec("reset role; set search_path = public, extensions"); const dq = (await db.query(F3_DQ)).rows[0]; await db.exec('set search_path = "$user", public');
  R.fingerprints.F3_rebaselined_replica = dq.fingerprint;
  await check("S8.fp", "DRIFT_QUERY re-run on the replica (search_path = public, extensions) returns a 32-hex fingerprint different from Atlas's c917a7df... (prod must be re-baselined the same way, from a READ-ONLY capture, never auto-refreshed)", async () => /^[0-9a-f]{32}$/.test(dq.fingerprint) && dq.fingerprint !== F3_ORIG_FP);
  const fwCopy = F3_FW.split(F3_ORIG_FP).join(dq.fingerprint); writeFileSync(join(GEN, "F3-FORWARD-rebaselined-for-replica-NOT-FOR-PROD.sql"), "-- GENERATED by run-combined.mjs: COPY of Atlas's FORWARD with the literal replaced by the COMBINED REPLICA's own fingerprint. Replica only. NEVER for prod.\n" + fwCopy);
  const fw = await tx(db, fwCopy);
  await check("S8.apply", "the re-baselined COPY applies in one transaction", async () => fw.ok || fw.err);
  const pcs = fw.ok ? await db.exec(F3_PC) : [];
  await check("S8.pc", "F3 section-4 post-check statements: 8 statements run; quarantine counts 19 backup / 19 hidden / 0 orphan-published", async () => { const last = pcs[pcs.length - 1]?.rows?.[0]; return (pcs.length === 8 && Number(last.quarantine_backup_count) === 19 && Number(last.orphan_hidden_count) === 19 && Number(last.orphan_published_count) === 0) || JSON.stringify(last); });
  record(R.steps, a, "S8"); show(a);
  CAT.S8 = await snapshot(db); B.S8 = await dump(db);
  const a2 = await steps2.afterF3(db, { catBefore: CAT.S6, catAfter: CAT.S8 }); record(R.steps, a2, "S8"); show(a2); }
// step 9: 11A
await runStep("S9", "11A can_upload_event_media (own transaction)", db, A11_FN, () => steps2.after11A(db)); CAT.S9 = await snapshot(db); B.S9 = await dump(db);
// step 10: APPLY-2 (the very last revoke, after the app release)
await runStep("S10", "APPLY-2 (closes anon reads of profile_meta; its column revokes are no-ops after 1C)", db, A2, () => steps2.afterApply2(db)); CAT.S10 = await snapshot(db); B.S10 = await dump(db);

/* =================================================================== MATRIX: Atlas's 26 cases on the combined final state */
log("\n== MATRIX (Atlas section 6) on the final combined state, run twice: after step 9 (F3+11A, anon reads still open) and after step 10 (APPLY-2)");
const MX = [];                                                           // every sub-check
async function runMatrixOn(blob, state) {
  const sink = [];
  for (const [fn, label] of [[(w) => matrix.suiteMedia(w, sink), "media"], [(w) => matrix.suiteM12(w, sink), "m12"], [(w) => matrix.suiteConnect(w, sink), "connect"], [(w) => matrix.suiteP1(w, sink), "p1"], [(w) => matrix.suiteFindings(w, sink, { A1 }), "findings"]]) {
    const w = await clone(blob); try { await fn(w); } finally { await closeDb(w); } }
  const w = await clone(blob); try { const a = await steps2.after11A(w); for (const c of a) sink.push({ ...c, case: "M9" }); } finally { await closeDb(w); }
  for (const c of sink) MX.push({ state, ...c });
}
await runMatrixOn(B.S9, "after-step-9 (F3 + 11A)");
await runMatrixOn(B.S10, "after-step-10 (APPLY-2)");
// D1 / R1 / R2 run on the pre-F3 state (= after 1C, B.S6) with the committed F3 forward/rollback
const lab = makeF3Lab({ F3_FW, F3_RB, F3_DQ, ORIG: F3_ORIG_FP, regen: regenF3Rollback, pre: B.S6, post11A: A11_FN });
for (const c of await lab.drift()) MX.push({ state: "pre-F3 (after 1C)", ...c });
for (const c of await lab.rollback()) MX.push({ state: "pre-F3 (after 1C) + F3 forward", ...c });
{ const { db: wf, rbRegen } = await lab.worldFwd(); try { await wf.exec("grant truncate on public.profile_content to anon"); const r = await tx(wf, rbRegen);
    MX.push({ state: "pre-F3 + F3 forward", id: "FIND.scope", case: "FIND", ok: r.ok === true, name: "FIND-3 (reproduced): F3's drift/rollback fingerprint does not cover profile_content (nor profile_claim_requests, private.account_age): a 1C privilege re-granted on profile_content after F3 is NOT detected by F3's rollback guard (the rollback proceeds). 1C's own block-H fingerprint is the only guard for those tables", why: r.err || "" }); } finally { await closeDb(wf); } }
// gate readiness (F3 README REVIEW NOTE 1) on the combined replica
{ const w = await clone(B.S6); const r = (await w.query(F3_GR)).rows[0]; await closeDb(w); R.fingerprints.gate_readiness_replica = r;
  MX.push({ state: "pre-F3", id: "FIND.readiness", case: "FIND", ok: Number(r.published_rows) === 4 && Number(r.published_failing_gate) === 0, name: "FIND-1c F3 GATE_READINESS (read-only) returns published_rows=4 / published_failing_gate=0 on the replica (fixture rows are COMPLETE: an assumption; prod must run it)", why: JSON.stringify(r) }); }
// 11A harness (mock Storage/edge) executed by reference for M9
let h11 = { ran: false };
try { const o = execSync("node --test harness/runtime-level.test.mjs harness/upload-ownership.test.mjs 2>&1 | tail -12", { cwd: A11, encoding: "utf8", timeout: 100000 }); const g = (k) => Number((o.match(new RegExp("# " + k + " (\\d+)")) || [])[1]); h11 = { ran: true, tests: g("tests"), pass: g("pass"), fail: g("fail") }; } catch (e) { h11 = { ran: true, error: String(e.message).slice(0, 200) }; }
MX.push({ state: "11A harness (mocked Storage/edge)", id: "M9.edge-harness", case: "M9", ok: h11.ran && h11.fail === 0 && h11.pass > 0, name: `M9 (by reference) 11A's own edge-tool harness with MOCKED Storage/PostgREST: ${JSON.stringify(h11)} - ownership is verified BEFORE the mock signing call; the real signed-upload path stays BLOCKED`, why: JSON.stringify(h11) });
R.h11 = h11;

const CASES = [
  ["M1", "Anonymous direct INSERT into each media table (default status / forged published)", "Permission denied; zero rows"],
  ["M2", "Non-owner authenticated INSERT against published and draft parents, incl .select() and upsert", "RLS denied; zero rows"],
  ["M3", "Mapped parent owner INSERT with omitted status", "pending accepted for event and venue; owner reads RETURNING; others cannot read"],
  ["M4", "Event submitted_by owner without profile mapping inserts into own draft event", "Accepted pending; unrelated user denied"],
  ["M5", "Owner INSERT with status published/hidden/NULL/arbitrary; pending_upload", "Denied; event pending_upload accepted, venue denied; invalid kind fails CHECK"],
  ["M6", "Authenticated fan calls original tag RPC signatures", "id returned, count +1, author from session, pending, not publicly readable"],
  ["M7", "Anonymous calls each wrapper and private function", "EXECUTE/USAGE denied; no row"],
  ["M8", "Fan RPC against absent parent / other user's draft; owner on own draft", "denied / denied / accepted pending; invalid kind rejected; quarantine unchanged"],
  ["M9", "upload_event_photo owner flow with signed-upload mock; non-owner cannot obtain signing", "owner gets row without publication; non-owner denied BEFORE mock signing"],
  ["M10", "Owner cannot UPDATE pending -> published; service reviewer can", "owner 0 rows; service accepted; public get_media exposes only reviewed row"],
  ["M11", "delete_event on an owned synthetic event with no sales", "still deletes its event_media rows; unrelated deletion denied"],
  ["M12", "Anonymous/authenticated TRUNCATE all three target tables", "Denied; service/postgres maintenance still works"],
  ["C1", "Owner UPDATE status/sources/last_reviewed_at, alone and together", "42501; no persisted change"],
  ["C2", "Owner INSERT/upsert of a new owned profile with fabricated evidence", "42501; zero rows"],
  ["C3", "Owner edit of each content column on a published row (+NULL/JSON, combined)", "review + sources=[] + last_reviewed_at=NULL (server-stamped updated_at)"],
  ["C4", "Real profile.html save payload against an existing published row", "Save succeeds with review reset; no privilege/trigger error"],
  ["C5", "Same payload as a no-op except updated_at", "Published stays published; evidence unchanged"],
  ["C6", "Owner alters content while trying to keep/forge a gate field in the same UPDATE", "42501, whole statement rolled back"],
  ["C7", "Owner changes content on an already-review row with stale evidence", "Evidence invalidated; stays unpublished"],
  ["C8", "Service/admin publishes a complete fixture; edits an already-published fixture to violate the gate", "first succeeds; second raises check_violation"],
  ["C9", "Signed-in is_admin user who does not own another profile attempts direct UPDATE", "Denied/0 rows by owner RLS; service/postgres path supported"],
  ["C10", "Anonymous and unrelated authenticated profile writes; normal claim creation", "denied by RLS; normal claim succeeds with fixed review defaults"],
  ["P1", "post_collaborators pc_insert / pc_update before/after", "Non-owner/forged insert denied; owned-source pending allowed; only collaborator-profile owner updates"],
  ["D1", "Modify one policy/ACL/default/trigger/owner/function in a disposable baseline, run forward", "Drift exception before any change"],
  ["R1", "Apply forward, then rollback; recompute full fingerprint; repeat with pending venue submission", "Exact original fingerprint restored; rollback aborts while a pending venue row exists"],
  ["R2", "Change a patched policy/helper/function, then an unrelated routine, after forward; run rollback", "Rollback pre-check aborts before overwriting; no partial restoration"]];
const FORCED = {
  M9: { status: "PARTIAL", blocked: "Real Storage signed-upload and the deployed agent-tool-invoke edge function need real Storage + PostgREST + JWT (B3). Executed here: the SQL ownership boundary public.can_upload_event_media on the combined catalog (11A.1-11A.3) and, by reference, 11A's own mocked edge-tool harness (ownership checked before the mock signing call)." },
  M11: { status: "BLOCKED", blocked: "delete_event body is not captured (no production access) and the replica has no such function: needs the real catalog (B3/Sentinel). Hazard to check there: F3 revokes DELETE on event_media/venue_media from authenticated, so if delete_event is SECURITY INVOKER its media cleanup would now be denied." },
  P1: { status: "PARTIAL", blocked: "post_collaborators policy predicates were never captured; only a stand-in policy shape ('TO authenticated, sub-selects profile_owners', PRECHECK-RESULTS P-12) was executed. The real pc_insert/pc_update need the real catalog (B3/Sentinel)." }};
const CHANGED_NOTE = { C1: "Layer changed: with 1C the first denial is the column ACL (42501 permission denied), not F3's trigger message; the trigger layer is proven separately (C1.trigger-layer).", C2: "Same layering as C1.",
  C3: "CHANGED MEANING: #91/1C column denial takes precedence over the legacy C3 type-edit expectation. account_type, tagline, pronouns, book_email, badges, highlights, entity_category (and slug) are now refused (42501) instead of resetting review; the 11 owner-writable content columns still reset review; profile_public/public_fields are writable and do NOT reset review (F3 README row 6).",
  C4: "The recorded final web payload is a diff UPDATE keyed by slug (no 19-key upsert any more); the bundled app's 19-key upsert is refused (designed denial).", C5: "The web no-op writes nothing; the legacy 'account_type:null' no-op (C5-INFO) is now refused before the trigger.",
  C6: "CHANGED MEANING: re-assigning the old identical gate value is now refused by the column ACL (F3 permitted it).", C8: "C8d CHANGED MEANING: admin+owner self-publication is closed by 1C on the client path. C8e/FIND: DEFINER admin paths now run the completeness gate.",
  C10: "CHANGED MEANING: claim_profile is revoked by APPLY-1; creation goes request_profile_claim -> approve_profile_claim -> owner's first save." };
const cases = CASES.map(([id, title, expected]) => {
  const subs = MX.filter((c) => c.case === id); const f = FORCED[id]; const failed = subs.filter((c) => !c.ok);
  let status, reason = "";
  if (f && f.status === "BLOCKED" && subs.length === 0) { status = "BLOCKED"; reason = f.blocked; }
  else if (subs.length === 0) { status = "BLOCKED"; reason = "no executable part"; }
  else if (failed.length) { status = "EXECUTED-FAIL"; reason = failed.map((c) => c.id + ": " + c.why).join(" | ").slice(0, 600); }
  else if (f && f.status === "PARTIAL") { status = "PARTIAL"; reason = f.blocked; }
  else status = "EXECUTED-PASS";
  return { id, title, expected, status, reason, note: CHANGED_NOTE[id] || "", changedMeaning: subs.some((c) => c.changedMeaning), designedDenial: subs.some((c) => c.designedDenial), checks: subs.length, passed: subs.filter((c) => c.ok).length, subchecks: subs.map((c) => ({ id: c.id, state: c.state, ok: c.ok, name: c.name, why: c.ok ? "" : c.why })) };
});
const supp = MX.filter((c) => ["POST", "FIND"].includes(c.case));
for (const c of cases) { log(`  ${c.status.padEnd(14)} ${c.id.padEnd(4)} ${c.passed}/${c.checks} sub-checks  ${c.title}${c.status === "EXECUTED-FAIL" ? "\n       -> " + c.reason : ""}`); }
for (const c of supp) log(`  ${c.ok ? "PASS" : "FAIL"} ${c.id}  ${c.name.slice(0, 150)}${c.ok ? "" : "  -> " + c.why}`);
for (const c of cases) if (c.status === "EXECUTED-FAIL") failures++;
for (const c of supp) if (!c.ok) failures++;
const tot = { cases: cases.length, executed: cases.filter((c) => c.status.startsWith("EXECUTED") || c.status === "PARTIAL").length, pass: cases.filter((c) => c.status === "EXECUTED-PASS").length, fail: cases.filter((c) => c.status === "EXECUTED-FAIL").length, partial: cases.filter((c) => c.status === "PARTIAL").length, blocked: cases.filter((c) => c.status === "BLOCKED").length, subchecks: MX.length, subchecksPassed: MX.filter((c) => c.ok).length };
log(`MATRIX TOTALS: ${JSON.stringify(tot)}`);
R.matrix = { totals: tot, cases, supplementary: supp.map((c) => ({ id: c.id, ok: c.ok, name: c.name, why: c.ok ? "" : c.why })) };

/* ---- exactly how the bundled app's save behaves at each stage of the order */
R.appPayload = [];
for (const [k, blob] of [["after step 5 (APPLY-1/1B/92 + attestation; 22-column grants; no F3 yet)", B.S5], ["after 1C (step 6)", B.S6], ["after 1C + F3 (step 8)", B.S8], ["final (after 11A and APPLY-2)", B.S10]]) {
  const w = await clone(blob); const r = await steps2.appRun(w); const m = steps2.metaCalls(r)[0]; await closeDb(w);
  R.appPayload.push({ stage: k, upsertAccepted: !m.err, sqlstate: m.code || null, error: m.err || null, publishedPageStatusAfter: r.row.status, demotedToReview: isReset(r.row), accountTypeAfter: r.row.account_type }); }
log("\n== BUNDLED APP SAVE (old 19-key upsert incl account_type) at each stage:"); for (const x of R.appPayload) log(`  ${x.stage}: accepted=${x.upsertAccepted}${x.sqlstate ? " sqlstate=" + x.sqlstate : ""}${x.error ? " '" + x.error + "'" : ""} -> published page is now '${x.publishedPageStatusAfter}'${x.demotedToReview ? " (DEMOTED, evidence cleared)" : ""}`);

/* =================================================================== NEGATIVE CONTROLS: mutants of the combined order */
log("\n== NEGATIVE CONTROLS (mutants of the combined order; each must FAIL its named probes; the unmutated order must pass them all)");
const ORDER = ["A1", "A1B", "A92", "ATT", "OPTIN", "C1C", "F3", "A11", "A2"];
async function applyF3(w, fw = F3_FW, stale = false) {
  await w.exec("reset role; set search_path = public, extensions"); const fpx = (await w.query(F3_DQ)).rows[0].fingerprint; await w.exec('set search_path = "$user", public');
  return tx(w, stale ? fw : fw.split(F3_ORIG_FP).join(fpx)); }
async function buildWorld(spec = {}) {
  const w = await clone(B.S0); const logs = [];
  const doStep = async (st) => {
    if (st === "A1") return tx(w, spec.A1 || A1); if (st === "A1B") return tx(w, A1B); if (st === "A92") return tx(w, spec.A92 || A92);
    if (st === "ATT") { const rs = [await as(w, "authenticated", U.ADM2, `select public.admin_set_account_age('${U.HOUSE}', true, 'house')`), await as(w, "authenticated", U.ADM2, `select public.admin_move_house_page('groove-trooper', '${U.HOUSE}')`), await as(w, "authenticated", U.TUI, `select public.admin_set_account_age('${U.TUI}', true, 'founder_self', 'q', 'd')`)]; return { ok: rs.every((x) => !x.err), err: rs.map((x) => x.err).filter(Boolean).join(";") }; }
    if (st === "OPTIN") { const r = await as(w, "authenticated", U.TUI, "update public.profile_meta set profile_public=true, public_fields=array['display_name','bio','events'], updated_at=now() where slug='tuitea'"); return { ok: !r.err, err: r.err }; }
    if (st === "C1C") return tx(w, spec.C1C || C1C); if (st === "F3") return applyF3(w, spec.F3 || F3_FW); if (st === "A11") return tx(w, spec.A11 || A11_FN); if (st === "A2") return tx(w, A2); };
  for (const st of ORDER) { if (spec.skip && spec.skip.includes(st)) { logs.push([st, "skipped"]); continue; } let r = await doStep(st); logs.push([st, r.ok ? "ok" : "ABORT: " + (r.err || "").slice(0, 110)]); if (spec.after && spec.after[st]) { const r2 = await spec.after[st](w); logs.push([st + "+", r2 && r2.ok === false ? "ABORT: " + (r2.err || "").slice(0, 110) : "ok"]); } }
  return { w, logs }; }
const P0 = []; { const { w } = await buildWorld(); await probes(w, { sink: P0 }); await closeDb(w); }
{ const a = [{ id: "NC.0", name: `POSITIVE CONTROL: the correct combined order passes all ${PROBE_IDS.length} probes`, ok: P0.length === PROBE_IDS.length && P0.every((x) => x.ok), why: JSON.stringify(P0.filter((x) => !x.ok).map((x) => x.id + ": " + x.why)) }]; record(R.mutants, a, "NC"); show(a); }
const C1C_NO_TRUNC_PC = mutate(C1C, "REVOKE REFERENCES, TRIGGER, TRUNCATE ON TABLE public.profile_content FROM anon, authenticated, PUBLIC;", "REVOKE REFERENCES, TRIGGER ON TABLE public.profile_content FROM anon, authenticated, PUBLIC;", "1c truncate");
const C1C_NO_TRUNC_NO_POST = mutate(C1C_NO_TRUNC_PC, "  IF has_table_privilege('anon','public.profile_content','TRUNCATE') OR has_table_privilege('authenticated','public.profile_content','TRUNCATE')", "  IF false AND (has_table_privilege('anon','public.profile_content','TRUNCATE') OR has_table_privilege('authenticated','public.profile_content','TRUNCATE')", "1c post truncate").replace("     OR has_table_privilege('anon','public.profile_owners','TRUNCATE') OR has_table_privilege('authenticated','public.profile_owners','TRUNCATE')\n     OR has_table_privilege('anon','public.profile_meta','TRUNCATE') OR has_table_privilege('authenticated','public.profile_meta','TRUNCATE') THEN", "     OR has_table_privilege('anon','public.profile_owners','TRUNCATE') OR has_table_privilege('authenticated','public.profile_owners','TRUNCATE')\n     OR has_table_privilege('anon','public.profile_meta','TRUNCATE') OR has_table_privilege('authenticated','public.profile_meta','TRUNCATE')) THEN");
const A11_VISIBILITY = "create or replace function public.can_upload_event_media(p_event_slug text) returns boolean language sql stable security definer set search_path = '' as $$ select auth.uid() is not null and exists (select 1 from public.events e where e.slug = p_event_slug) $$; revoke all on function public.can_upload_event_media(text) from public, anon, authenticated, service_role; grant execute on function public.can_upload_event_media(text) to authenticated;";
const A11_DEFAULT_GRANTS = "create or replace function public.can_upload_event_media(p_event_slug text) returns boolean language sql stable security definer set search_path = '' as $$ select auth.uid() is not null and exists (select 1 from public.events e where e.slug = p_event_slug and (e.submitted_by = auth.uid() or exists (select 1 from public.profile_owners po where po.profile_slug = e.owner_handle and po.owner_id = auth.uid()))) $$;";
const F3_NO_TRUNC = mutate(F3_FW, "REVOKE TRUNCATE ON TABLE public.event_media,public.venue_media,public.profile_meta\n FROM anon,authenticated;", "", "f3 truncate");
const F3_NO_OWNER_GUARD = mutate(F3_FW, " if new.status is distinct from old.status\n or new.sources is distinct from old.sources\n or new.last_reviewed_at is distinct from old.last_reviewed_at then\n raise exception 'publication evidence is server-managed' using errcode='42501';\n end if;\n if new.slug", " if new.slug", "f3 update guard");
const F3_NO_INS_GUARD = mutate(F3_NO_OWNER_GUARD, " if new.status is distinct from 'review'\n or new.sources is distinct from '[]'::jsonb\n or new.last_reviewed_at is not null then\n raise exception 'publication evidence is server-managed' using errcode='42501';\n end if;\n else", " null;\n else", "f3 insert guard");
const F3_EARLY = mutate(F3_FW, " if new.status is distinct from 'published' then\n return new;\n end if;\n\n if nullif", " if new.status is distinct from 'published' then\n return new;\n end if;\n if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;\n\n if nullif", "f3 early return");
const MUTANTS = [
  { id: "N1", desc: "skip APPLY-1C (grant narrowing never applied)", spec: { skip: ["C1C", "A2"] }, mustFail: ["p.c3type", "p.c1status", "p.grantset", "p.ev44", "p.trunc-pc", "p.app-nodemote"] },
  { id: "N2", desc: "grant account_type (INSERT+UPDATE) back to authenticated after 1C (before APPLY-2, whose own column revokes would hide it)", spec: { skip: ["A2"], after: { C1C: (w) => tx(w, "grant update (account_type) on table public.profile_meta to authenticated; grant insert (account_type) on table public.profile_meta to authenticated") } }, mustFail: ["p.c3type", "p.grantset"] },
  { id: "N3a", desc: "1C with the profile_content TRUNCATE revoke forgotten: caught IN-TRANSACTION by 1C's own post-assert (1C aborts, so the later state also lacks 1C)", spec: { C1C: C1C_NO_TRUNC_PC }, expectAbort: { step: "C1C", re: /1C post-assert: TRUNCATE still held/ }, mustFail: ["p.trunc-pc", "p.grantset"] },
  { id: "N3b", desc: "1C with BOTH the TRUNCATE revoke and its post-assert removed: only the matrix/probe can catch it", spec: { C1C: C1C_NO_TRUNC_NO_POST }, mustFail: ["p.trunc-pc"] },
  { id: "N3c", desc: "F3 forward with its REVOKE TRUNCATE (event_media, venue_media, profile_meta) forgotten", spec: { F3: F3_NO_TRUNC }, mustFail: ["p.trunc-media"] },
  { id: "N4", desc: "F3 forward run BEFORE the client/1C fix (1C skipped): the bundled app's no-op-ish save DEMOTES a published page to review (C5-INFO demonstrated)", spec: { skip: ["C1C", "A2"] }, mustFail: ["p.app-nodemote", "p.c3type", "p.grantset"], extra: async (w) => { const r = await steps2.appRun(w); return { demoted: isReset(r.row), status: r.row.status, upsertOk: !steps2.metaCalls(r)[0].err }; } },
  { id: "N5", desc: "APPLY-1 re-run AFTER 1C (known hazard: re-grants account_type/status to owners)", spec: { skip: ["A2"], after: { C1C: (w) => tx(w, A1) } }, mustFail: ["p.c3type", "p.c1status", "p.grantset"] },
  { id: "N6a", desc: "omit the 11A function (the patched edge tool fails closed; the SQL boundary is absent)", spec: { skip: ["A11"] }, mustFail: ["p.m9fn", "p.m9grants"] },
  { id: "N6b", desc: "11A with a visibility-only body (any signed-in caller on an existing event passes: the non-owner path passes)", spec: { A11: A11_VISIBILITY }, mustFail: ["p.m9fn"] },
  { id: "N6c", desc: "11A created without REVOKE/GRANT (Supabase default grants leave anon EXECUTE)", spec: { A11: A11_DEFAULT_GRANTS }, mustFail: ["p.m9grants"] },
  { id: "N8a", desc: "event_password_hash left granted to anon BEFORE 1C: 1C's guard G6 refuses (neither the 45 nor the 44 columns), so 1C is not applied", spec: { after: { A92: (w) => tx(w, "grant select (event_password_hash) on table public.events to anon") } }, expectAbort: { step: "C1C", re: /neither the 45 nor the 44/ }, mustFail: ["p.hash", "p.grantset", "p.ev44"] },
  { id: "N8b", desc: "event_password_hash granted to anon AFTER the whole order", spec: { after: { A2: (w) => tx(w, "grant select (event_password_hash) on table public.events to anon") } }, mustFail: ["p.hash", "p.ev44"] },
  { id: "N9", desc: "skip the house/age attestation before the web deploy (groove-trooper, the only public page, goes private)", spec: { skip: ["ATT"] }, mustFail: ["p.house"] },
  { id: "N10", desc: "skip APPLY-1B (kind CHECK): the owner's 'request a business type' is silently rejected", spec: { skip: ["A1B"] }, mustFail: ["p.btype"] },
  { id: "N11", desc: "F3 with the published->published early return KEPT (trusted edits skip the completeness gate)", spec: { F3: F3_EARLY }, mustFail: ["p.c8b"] },
  { id: "N12", desc: "F3 with the owner UPDATE+INSERT evidence guards removed while 1C is applied: owners are STILL refused (privilege layer), only the defence-in-depth probe fails", spec: { F3: F3_NO_INS_GUARD }, mustFail: ["p.trigger-layer"], mustPass: ["p.c1status"] }];
const NCR = [];
for (const m of MUTANTS) {
  let res; try { const { w, logs } = await buildWorld(m.spec); const sink = []; await probes(w, { sink }); const extra = m.extra ? await m.extra(w) : null; await closeDb(w);
    const failed = sink.filter((x) => !x.ok).map((x) => x.id); const missed = m.mustFail.filter((id) => !failed.includes(id)); const wrongFail = (m.mustPass || []).filter((id) => failed.includes(id));
    const abortOk = !m.expectAbort || logs.some(([s, st]) => s === m.expectAbort.step && m.expectAbort.re.test(st));
    if (missed.length) log("        [debug] probes: " + sink.map((x) => x.id + "=" + x.ok).join(" ") + " | order: " + logs.map(([a, b]) => a + "=" + b.slice(0, 50)).join(" "));
    res = { id: m.id, desc: m.desc, ok: missed.length === 0 && wrongFail.length === 0 && abortOk, failedProbes: failed, missed, wrongFail, abortOk, order: logs.map(([s, st]) => s + "=" + st.slice(0, 60)).join(" "), extra }; }
  catch (e) { res = { id: m.id, desc: m.desc, ok: false, err: String(e.message).slice(0, 300) }; }
  NCR.push(res); if (!res.ok) failures++;
  log(`  ${res.ok ? "OK  " : "BAD "} ${m.id}  ${m.desc}\n        fails=[${(res.failedProbes || []).join(",")}] required=[${m.mustFail.join(",")}]${res.missed && res.missed.length ? " MISSED=" + res.missed : ""}${res.extra ? " " + JSON.stringify(res.extra) : ""}${res.abortOk === false ? " (expected abort not seen)" : ""}${res.err ? " ERR " + res.err : ""}`); }
// N7 revoke-before-add (wrong order): APPLY-2 on the baseline
{ const w = await clone(B.S0); const r = await tx(w, A2); const aborted = !r.ok && /profile_claim_requests/.test(r.err);
  await tx(w, "create table if not exists public.profile_claim_requests(id uuid primary key default gen_random_uuid(), profile_slug text, requester_id uuid, status text)"); const r2 = await tx(w, A2);
  const direct = denied(await as(w, "anon", "", "select slug from public.profile_meta")); const rpc = (await as(w, "anon", "", "select slug from public.get_public_profile('groove-trooper')")).err; await closeDb(w);
  const ok = aborted && r2.ok && direct && /does not exist/.test(rpc || ""); NCR.push({ id: "N7", desc: "wrong order: APPLY-2 (revoke) before APPLY-1 (add)", ok, failedProbes: ["anon-reads"], note: `APPLY-2 on the baseline aborts ('${(r.err || "").slice(0, 70)}'); forcing it (stub table) makes anon's direct profile_meta reads fail while get_public_profile does not exist yet: ${rpc}` });
  if (!ok) failures++; log(`  ${ok ? "OK  " : "BAD "} N7  wrong order: APPLY-2 (revoke) before APPLY-1 (add): aborts as-is; forced, anon reads break (direct=${direct}, rpc='${(rpc || "").slice(0, 60)}')`); }
// N13: D1 with the drift check bypassed; N14: rollback pre-check bypassed
{ const labBad = makeF3Lab({ F3_FW: mutate(F3_FW, `IF v_fingerprint IS DISTINCT FROM '${F3_ORIG_FP}' THEN`, "IF false THEN", "drift bypass"), F3_RB, F3_DQ, ORIG: F3_ORIG_FP, regen: regenF3Rollback, pre: B.S6, post11A: A11_FN });
  const d = await labBad.drift(); const failed = d.filter((x) => !x.ok).map((x) => x.id);
  const ok = failed.some((x) => /D1\.extra_policy/.test(x)) && failed.includes("D1.stale"); NCR.push({ id: "N13", desc: "F3 drift check bypassed (IF false): D1 cases must fail", ok, failedProbes: failed.slice(0, 6), note: `${failed.length} of ${d.length} D1 checks failed` }); if (!ok) failures++; log(`  ${ok ? "OK  " : "BAD "} N13  F3 drift check bypassed -> ${failed.length}/${d.length} D1 checks fail (incl. stale demonstration)`);
  const labRb = makeF3Lab({ F3_FW, F3_RB: mutate(F3_RB, "IF v_fingerprint IS DISTINCT FROM v_expected THEN", "IF false THEN", "rollback precheck"), F3_DQ, ORIG: F3_ORIG_FP, regen: regenF3Rollback, pre: B.S6, post11A: A11_FN });
  const r = await labRb.rollback(); const f2 = r.filter((x) => !x.ok).map((x) => x.id); const ok2 = f2.some((x) => /^R2\./.test(x)); NCR.push({ id: "N14", desc: "F3 rollback forward-state pre-check bypassed: the R2 silent-overwrite cases must fail", ok: ok2, failedProbes: f2.slice(0, 6), note: `${f2.length} of ${r.length} R checks failed` }); if (!ok2) failures++; log(`  ${ok2 ? "OK  " : "BAD "} N14  F3 rollback pre-check bypassed -> ${f2.length}/${r.length} R checks fail (${f2.slice(0, 4).join(",")})`); }
R.mutants = { positive: P0.map((x) => ({ id: x.id, ok: x.ok })), controls: NCR };
log(`NEGATIVE CONTROLS: ${NCR.length} mutants, ${NCR.filter((x) => x.ok).length} behaved as required`);

/* =================================================================== ROLLBACK PASS: reverse order, exact catalog diff against the snapshot taken before each forward step */
log("\n== ROLLBACK PASS (reverse order) - each rollback must return the catalog to the snapshot taken BEFORE its forward step, compared exactly (grants, columns, policies, triggers, constraints, indexes, functions + md5)");
const rb = await clone(B.S10); const RB = [];
const rbCheck = async (id, name, sql, target, { expectAbort = null } = {}) => {
  const before = await snapshot(rb); const r = await tx(rb, sql); const after = await snapshot(rb);
  let ok, why = "";
  if (expectAbort) { const d = diffSnap(before, after); ok = !r.ok && expectAbort.test(r.err) && d.n === 0; why = r.ok ? "applied" : (d.n ? "partial change: " + brief(d) : r.err.slice(0, 160)); }
  else { const d = diffSnap(target, after); ok = r.ok && d.n === 0; why = !r.ok ? r.err.slice(0, 200) : (d.n ? brief(d, 8) : ""); }
  RB.push({ id, name, ok, why }); if (!ok) failures++; log(`  ${ok ? "PASS" : "FAIL"} ${id}  ${name}${ok ? "" : "\n       -> " + why}`); return { r, after }; };
{ const a = []; const { check } = collector(a);
  await check("RB.0", "SANITY: the data-only steps (attestation, owner opt-in, payload replays on clones) changed NO catalog object: snapshot after step 3 == after step 4 == after step 5", async () => diffSnap(CAT.S3, CAT.S4).n === 0 && diffSnap(CAT.S4, CAT.S5).n === 0 || brief(diffSnap(CAT.S3, CAT.S5)));
  record(RB, a, "RB"); show(a); }
await rbCheck("RB.10", "ROLLBACK-2-after-1C (APPLY-2 undone, narrowing kept) == snapshot before APPLY-2", RB2X, CAT.S9);
{ // optional: the STOCK ROLLBACK-2 would undo 1C (documented) - shown on a scratch clone
  const w = await clone(B.S10); await tx(w, rd(UP, "ROLLBACK-2.sql")); const reopened = !(await as(w, "authenticated", U.TUI, "update public.profile_meta set account_type='editorial_brand' where slug='tuitea'")).err; await closeDb(w);
  const a = [{ id: "RB.10b", name: "FINDING (documented): the STOCK ROLLBACK-2 run after 1C re-grants account_type/status to owners (undoes the narrowing); ROLLBACK-2-after-1C exists for that reason", ok: reopened, why: "stock rollback did not re-open" }]; record(RB, a, "RB"); show(a); }
await rbCheck("RB.9", "11A ROLLBACK (drop can_upload_event_media) == snapshot before 11A", A11_RB, CAT.S8);
{ // F3 rollback. The reverse order forces ROLLBACK-2-after-1C and the 11A rollback BEFORE it. Both leave the catalog semantically identical (RB.9/RB.10 prove it with sorted ACLs) but F3's guard fingerprints relacl::text, which is ORDER-sensitive.
  const f3rb = F3_RB.split(F3_ORIG_FP).join(R.fingerprints.F3_rebaselined_replica), f3rg = regenF3Rollback(F3_RB).split(F3_ORIG_FP).join(R.fingerprints.F3_rebaselined_replica);
  await rbCheck("RB.8pre", "FINDING: F3's rollback guard REFUSES right after the legitimate APPLY-2 / ROLLBACK-2-after-1C round trip ('Forward catalog changed') although the catalog is semantically identical to the F3-forward state (snapshot with sorted ACLs: 0 differences): its fingerprint hashes relacl::text, whose entry ORDER changed (anon re-appended). Nothing is changed", f3rg, null, { expectAbort: /Forward catalog changed/ });
  { const same = diffSnap(CAT.S8, await snapshot(rb)); const a = [{ id: "RB.8pre2", name: "the catalog IS semantically unchanged at that point (sorted-ACL snapshot == the snapshot right after F3 forward)", ok: same.n === 0, why: brief(same) }]; record(RB, a, "RB"); show(a); }
  await rb.exec("reset role; set search_path = public, extensions"); const nowFp = (await rb.query(F3_DQ)).rows[0].fingerprint; await rb.exec('set search_path = "$user", public');
  const gr = await tx(rb, `update atlas_media_guard.rollback_guard set catalog_fingerprint = '${nowFp}'`);
  { const a = [{ id: "RB.8guard", name: "REPLICA-ONLY step: the stored guard fingerprint is refreshed to the current DRIFT_QUERY value AFTER the exact-equality proof above (on prod this must be a reviewed, deliberate act, never automatic)", ok: gr.ok, why: gr.err || "" }]; record(RB, a, "RB"); show(a); }
  await rbCheck("RB.8a", "F3 ROLLBACK as committed (only the literal re-baselined) REFUSES after 1C and changes nothing: its blanket re-grants (TRUNCATE to anon+authenticated, UPDATE/DELETE/REFERENCES/TRIGGER to anon on profile_meta) would re-open what 1C closed", f3rb, null, { expectAbort: /Rollback did not restore original catalog/ });
  // RB.8b: the regenerated rollback is correct but its FINAL guard compares an ORDER-sensitive fingerprint against the pre-F3 capture, whose ACL entry order the APPLY-2 round trip changed. Exactness is therefore judged by the sorted-ACL snapshot; the final guard is bypassed in this scratch step ONLY.
  const f3rgBypass = mutate(f3rg, `IF v_fingerprint IS DISTINCT FROM '${R.fingerprints.F3_rebaselined_replica}' THEN`, "IF false THEN", "final guard");
  await rbCheck("RB.8b", "F3 ROLLBACK REGENERATED for the post-1C catalog (profile_meta removed from its two re-grant lines; final ORDER-sensitive guard bypassed in this scratch step only) == snapshot before F3 (exact, sorted ACLs)", f3rgBypass, CAT.S6);
  { const norm = (v) => Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (k === "acl") && typeof x === "string" && x.startsWith("{") ? x.slice(1, -1).split(",").sort().join(",") : norm(x)])) : v;
    const w6 = await clone(B.S6); await w6.exec("reset role; set search_path = public, extensions"); const st6 = (await w6.query(F3_DQ)).rows[0]; await closeDb(w6);
    await rb.exec("reset role; set search_path = public, extensions"); const stNow = (await rb.query(F3_DQ)).rows[0]; await rb.exec('set search_path = "$user", public');
    const a = [{ id: "RB.8c", name: "ROOT CAUSE shown: after the APPLY-2/rollback round trip F3's DRIFT_QUERY fingerprint differs from the pre-F3 one, but the two 'state' JSONs are IDENTICAL once the ACL entry order is normalised (only the order of aclitem entries differs)", ok: st6.fingerprint !== stNow.fingerprint && JSON.stringify(norm(JSON.parse(JSON.stringify(st6.state)))) === JSON.stringify(norm(JSON.parse(JSON.stringify(stNow.state)))), why: `fp pre-F3=${st6.fingerprint} now=${stNow.fingerprint}` }]; record(RB, a, "RB"); show(a); } }
await rbCheck("RB.6", "ROLLBACK-1C with {{PRE_1C_FINGERPRINT}} = FP2 == snapshot before 1C (exact; its own privilege fingerprint also equals FP2)", RB1C.replaceAll("{{PRE_1C_FINGERPRINT}}", FP2), CAT.S5);
RB.push({ id: "RB.6b", name: "ROLLBACK-1C: block-H privilege fingerprint after the rollback equals the saved FP2", ok: (await fp(rb)) === FP2, why: "" }); if ((await fp(rb)) !== FP2) failures++; log(`  ${RB[RB.length - 1].ok ? "PASS" : "FAIL"} RB.6b  ${RB[RB.length - 1].name}`);
await rbCheck("RB.3", "ROLLBACK-92 (placeholders filled from PRECHECK-92 Q-2) == snapshot before APPLY-92 (old get_profile_events body + ACL back, new functions gone)", fillR92(R92_RAW), CAT.S2);
await rbCheck("RB.2", "ROLLBACK-1B == snapshot before APPLY-1B", R1B, CAT.S1);
// ROLLBACK-1 last: compare with the baseline S0; residual structural items are classified
await rb.exec("set kil.rollback_ok = 'yes'");
const r1 = await tx(rb, fillR1(R1_RAW, true)); const dR1 = diffSnap(cat0, await snapshot(rb));
log(`  ROLLBACK-1 (Option A = exact pre-state) applied=${r1.ok}${r1.ok ? "" : " " + r1.err}`); log("  residual catalog differences vs the baseline S0: " + (dR1.n ? brief(dR1, 12) : "NONE"));
R.rollback1Residual = dR1.sections;
const KNOWN_RESIDUAL = { columns: ["public.profile_meta.profile_public", "public.profile_meta.age_verified", "public.profile_meta.is_minor", "public.profile_meta.under_18", "public.profile_meta.public_fields", "public.profile_meta.admin_approved"], constraints: ["public.profile_meta.profile_meta_minor_flags_agree"], schemas: ["private"] };
const resid = Object.fromEntries(Object.entries(dR1.sections).map(([k, v]) => [k, { removed: v.removed, added: v.added, changed: v.changed.map((c) => c.key) }]));
const unexpected = []; for (const [sec, v] of Object.entries(resid)) { const known = new Set(KNOWN_RESIDUAL[sec] || []); for (const k of [...v.removed, ...v.added, ...v.changed]) if (!known.has(k)) unexpected.push(sec + ":" + k); }
const ok1 = r1.ok && unexpected.length === 0; RB.push({ id: "RB.1", name: "ROLLBACK-1 (Option A) returns every ACL / policy / trigger / function / md5 to the baseline; the ONLY residue is the 6 added profile_meta columns + the minor-flags CHECK (documented by ROLLBACK-1) and the tightened ACL of schema private (REVOKE ALL ON SCHEMA private is not reversed; NOT documented)", ok: ok1, why: unexpected.join(" ") || "" }); if (!ok1) failures++;
log(`  ${ok1 ? "PASS" : "FAIL"} RB.1  ROLLBACK-1 exactness: known residue = 6 columns + 1 constraint; unexpected = ${unexpected.length ? unexpected.join(", ") : "none"}`);
await closeDb(rb);
{ // Option B (the pack's default): anon is left with SELECT-only; measure it
  const w = await clone(B.S2); await w.exec("set kil.rollback_ok = 'yes'"); await tx(w, R1B); const rr = await tx(w, fillR1(R1_RAW, false)); const dB = diffSnap(cat0, await snapshot(w)); await closeDb(w);
  const rel = dB.sections.relations ? [...dB.sections.relations.changed.map((c) => c.key + " " + JSON.stringify(c.from.acl.filter((x) => !(c.to.acl || []).includes(x))))] : [];
  R.rollback1OptionB = { applied: rr.ok, relationsChanged: rel };
  log(`  INFO ROLLBACK-1 Option B (the pack's default): anon keeps SELECT only on profile_meta/profile_owners; differences vs baseline in relations ACL: ${rel.join("; ") || "none"}`); }
R.rollback = RB;

/* =================================================================== OUTPUTS */
R.totalFailures = failures; R.elapsedSec = Math.round((Date.now() - T0) / 1000);
R.stepsSummary = Object.values(R.steps.reduce((m, c) => { (m[c.step] = m[c.step] || { step: c.step, checks: 0, pass: 0 }).checks++; if (c.ok) m[c.step].pass++; return m; }, {}));
writeFileSync(join(OUT, "matrix-results-full.json"), JSON.stringify(R, null, 1) + "\n");
writeFileSync(join(HERE, "matrix-results.json"), JSON.stringify({ generated: R.generated, engine: R.engine, totals: R.matrix.totals, cases: R.matrix.cases.map((c) => ({ id: c.id, title: c.title, status: c.status, reason: c.reason, note: c.note, changedMeaning: c.changedMeaning, designedDenial: c.designedDenial, checks: c.checks, passed: c.passed, failedChecks: c.subchecks.filter((x) => !x.ok).map((x) => x.id) })), supplementary: R.matrix.supplementary, steps: R.stepsSummary, negativeControls: { mutants: NCR.length, behavedAsRequired: NCR.filter((x) => x.ok).length, items: NCR.map((x) => ({ id: x.id, desc: x.desc, ok: x.ok, failedProbes: x.failedProbes, note: x.note || "" })) }, rollback: { checks: RB.length, passed: RB.filter((x) => x.ok).length, items: RB.map((x) => ({ id: x.id, ok: x.ok, name: x.name, why: x.why })) }, fingerprints: R.fingerprints, h11: R.h11, appPayload: R.appPayload, rollback1Residual: R.rollback1Residual, rollback1OptionB: R.rollback1OptionB }, null, 1) + "\n");

/* ---- MATRIX-RESULTS.md (generated from the same data, so the numbers cannot drift from the JSON) */
{ const t = R.matrix.totals; const esc = (x) => String(x).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const md = [];
  md.push("# MATRIX-RESULTS.md - slice 11B combined RLS rehearsal (PARTIAL, PGlite; proposal only)", "",
    `Generated by \`node db/proposed/11b-combined-rehearsal/run-combined.mjs\` (${R.generated}); engine ${R.engine}. Machine-readable: \`matrix-results.json\`. NOTHING here was run against production; PGlite is a stand-in (production is PostgreSQL 17.6, real Supabase roles/PostgREST/JWT/Storage are absent). Atlas's cases were run on the COMBINED final state (APPLY-1, 1B, APPLY-92, attestation, 1C, F3 re-baselined, 11A, then again after APPLY-2), not on F3 alone.`, "",
    "## Totals (Atlas's 26 cases M1-M12, C1-C10, P1, D1, R1, R2)", "",
    "| | count |", "|---|---:|", `| cases | ${t.cases} |`, `| executed (EXECUTED-PASS + EXECUTED-FAIL + PARTIAL) | ${t.executed} |`, `| **EXECUTED-PASS** | ${t.pass} |`, `| **EXECUTED-FAIL** | ${t.fail} |`, `| **PARTIAL** (SQL part executed and passed; the rest BLOCKED) | ${t.partial} |`, `| **BLOCKED** (nothing executable on PGlite) | ${t.blocked} |`,
    `| sub-checks executed / passed (a case's checks run on 1-2 states) | ${t.subchecks} / ${t.subchecksPassed} |`, "",
    "## The 26 cases", "", "| case | status | sub-checks | what was run on the combined state | note |", "|---|---|---:|---|---|");
  for (const c of R.matrix.cases) md.push(`| ${c.id} | **${c.status}**${c.changedMeaning ? " (meaning changed)" : ""}${c.designedDenial ? " (designed denial)" : ""} | ${c.passed}/${c.checks} | ${esc(c.title)} -> expected: ${esc(c.expected)} | ${esc(c.note || (c.status === "BLOCKED" || c.status === "PARTIAL" ? c.reason : ""))} |`);
  md.push("", "## BLOCKED and PARTIAL, with reasons", "");
  for (const c of R.matrix.cases.filter((x) => x.status === "BLOCKED" || x.status === "PARTIAL")) md.push(`* **${c.id} ${c.status}**: ${c.reason}`);
  md.push("", "## Dimensions BLOCKED for every case: 'needs real Postgres/PostgREST (B3)'", "",
    "* PostgREST / Data API behaviour and real JWT claims (the replica switches ROLE with SET ROLE and a stubbed `auth.uid()`; every case above is SQL-level, not HTTP-level).",
    "* Storage buckets / signed uploads, the deployed `agent-tool-invoke` edge function and the real `upload_event_photo` tool (M9; only 11A's mocked harness and the SQL boundary were run).",
    "* Concurrency and lock behaviour (F3's `LOCK TABLE ... ACCESS EXCLUSIVE` on 8 tables with a 5s `lock_timeout`; two sessions racing the forward/rollback).",
    "* The real production catalog: real function bodies (`claim_profile`, `get_event_view`, `delete_event`), real `events_*`/`profile_content`/`post_collaborators` policies, the 492-function hash set, platform roles and default privileges, collation, PostgreSQL 17.6.", "",
    "## Cases whose meaning changed in the combined order ('stricter #91 column-denial expectations take precedence over legacy C3 type-edit expectations')", "");
  for (const c of R.matrix.cases.filter((x) => x.note)) md.push(`* **${c.id}**: ${c.note}`);
  md.push("", "## Real payloads used for C4/C5", "", `* Web: \`payload-fixtures/web-payloads.json\` = the REAL \`saveEditProfile\` of the #129/10B \`profile.html\` (sha256 ${WEB.source.sha256.slice(0, 12)}...) driven through the repo's own vm harness (\`assets/js/profile-noop-save.test.mjs\`): no-op, bio edit, link edit, business-type request (+ public toggle, insert fallback).`,
    `* App: \`payload-fixtures/app-payload.json\` = \`saveEditProfile\` of the bundled iOS app copy (\`www/profile.html\`, built from keepitil-web ${APP.source.bundleSource.split(" ")[1]?.slice(0, 7) || ""}): ONE upsert with the old 19 keys incl. \`account_type\`. After 1C (and 1C+F3) it is refused: \`${(R.matrix.cases.find((x) => x.id === "C4").subchecks.find((x) => x.id === "C4.app") || {}).ok ? "42501 permission denied for table profile_meta" : "UNEXPECTED"}\`, nothing written, page unchanged = the designed 'app copy breaks until the bundle is rebuilt' result (EXECUTED-PASS because the denial is the designed behaviour). In the compatibility window (22-column grants) it still works; under F3 without 1C it demotes a published page to review (negative control N4).`,
    "", "## Supplementary checks (not among the 26)", "", "| id | result | what |", "|---|---|---|");
  const seen = new Set(); for (const c of R.matrix.supplementary) { if (seen.has(c.id)) continue; seen.add(c.id); md.push(`| ${c.id} | ${c.ok ? "PASS" : "FAIL"} | ${esc(c.name)} |`); }
  const STEPN = { S0: "baseline S0 (COMBINED-REPLICA.sql)", S1: "APPLY-1 (own transaction)", S1B: "APPLY-1B kind CHECK", S92: "APPLY-92 (corrected, 45-col guard)", S4: "attestation batch (admin functions, set_config identity)", S5: "client window: #129 web + bundled-app payloads on 22-col grants; owner opt-in + visibility proof", S6: "APPLY-1C (+ idempotence, alternate 44-col order, stale-baseline, re-run hazard)", S7: "after 1C: real owner saves, bundled app refused", S8: "F3 FORWARD: stale abort -> re-baseline -> copy applied -> post-checks", S9: "11A can_upload_event_media", S10: "APPLY-2" };
  md.push("", "## Order actually run and the post-check block after each step", "", "| step | what | post-checks | passed |", "|---|---|---:|---:|", ...R.stepsSummary.map((x) => `| ${x.step} | ${STEPN[x.step] || ""} | ${x.checks} | ${x.pass} |`));
  md.push("", "## Negative controls (mutants of the combined order)", "", `${NCR.filter((x) => x.ok).length} of ${NCR.length} behaved as required (the correct order passes all ${PROBE_IDS.length} probes first).`, "", "| id | mutant | probes that failed (as required) |", "|---|---|---|", ...NCR.map((x) => `| ${x.id} | ${esc(x.desc)} | ${x.ok ? "OK" : "BAD"}: ${esc((x.failedProbes || []).slice(0, 7).join(", "))}${x.note ? " - " + esc(x.note) : ""} |`));
  md.push("", "## Rollback pass (reverse order, exact catalog diff against the snapshot taken before each forward step)", "", "| id | result | what |", "|---|---|---|", ...RB.map((x) => `| ${x.id} | ${x.ok ? "PASS" : "FAIL"} | ${esc(x.name)}${x.why ? " - " + esc(x.why) : ""} |`), "", `ROLLBACK-1 (Option A) residue vs baseline: ${JSON.stringify(R.rollback1Residual)}`, "");
  md.push("", "## Failing sub-checks", "", R.matrix.cases.flatMap((c) => c.subchecks.filter((x) => !x.ok).map((x) => `* ${c.id} / ${x.id} (${x.state}): ${x.why}`)).join("\n") || "none", "");
  writeFileSync(join(HERE, "MATRIX-RESULTS.md"), md.join("\n")); }
writeFileSync(join(OUT, "run-combined-output.txt"), LINES.join("\n") + "\n");
log(`\nSUMMARY steps=${R.steps.length} checks (${R.steps.filter((x) => x.ok).length} pass)  matrix=${JSON.stringify(R.matrix.totals)}  negative controls=${NCR.filter((x) => x.ok).length}/${NCR.length}  rollback=${RB.filter((x) => x.ok).length}/${RB.length}  failures=${failures}  elapsed=${R.elapsedSec}s`);
process.exit(failures ? 1 : 0);
