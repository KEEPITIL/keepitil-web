/* lib/realpg.mjs - checks that ONLY a real PostgreSQL server can run (11B on real PostgreSQL 17.6, localhost Unix socket). All data synthetic.
   (1) PostgREST-style requests in SEPARATE real connections: the connection role `authenticator` (LOGIN NOINHERIT, no privileges of its own) does BEGIN; SET LOCAL ROLE <api role>; set_config('request.jwt.claim*', ..., true); <query>; COMMIT.
   (2) CONCURRENCY with deterministic synchronisation (pg_stat_activity wait events, open transactions, pg_sleep inside a script's own transaction): F3 forward's 8-table ACCESS EXCLUSIVE vs owner saves / anon reads,
       two forwards, two rollbacks, two APPLY-1 runs, concurrent owner updates, concurrent DRIFT_QUERY, anon MAINTAIN lock.
   (3) PostgreSQL 17 catalog behaviour: default ACLs, MAINTAIN inside ALL, aclitem ENTRY ORDER (relacl::text) after revoke/regrant.
   Timing instrument (the ONLY edit to a pack file): to hold a script's locks for a measurable window, its final `COMMIT;` is replaced by `SELECT pg_sleep(n); COMMIT;` (holdBeforeCommit). Numbers are wall-clock on a tiny synthetic database: they show the SHAPE
   (who waits, for how long relative to the lock window, what is left behind), NOT prod timings. */
import { U, one, su, tx, clone, closeDb, snapshot, diffSnap, brief, collector, mutate, PGM, R1MODE, open, rd, F3 } from "./core.mjs";
import { LOCK_SQL, LOCK_KEY, aclSorted } from "../../r1-fix-f3-acl-locks/build-variants.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
export const holdBeforeCommit = (sql, secs) => { const i = sql.lastIndexOf("COMMIT;"); if (i < 0) throw new Error("no final COMMIT; in script"); return sql.slice(0, i) + `SELECT pg_sleep(${secs}); ` + sql.slice(i); };
const conn = async (db, user = "postgres") => new PGM.PgDb(db.name, user).connect();
const pidOf = async (c) => (await c.client.query("select pg_backend_pid() p")).rows[0].p;
const timed = async (p) => { const t = now(); try { const v = await p; return { ok: true, v, ms: Math.round(now() - t) }; } catch (e) { return { ok: false, err: String(e.message || e), code: e.code, ms: Math.round(now() - t) }; } };
const run = (c, sql) => timed(c.client.query(sql));          // starts immediately, never throws
const rollbackQuiet = async (c) => { try { await c.client.query("rollback"); } catch {} };
async function waitFor(mon, pid, pred, what, tmo = 20000) { const t = now(); for (;;) { const r = (await mon.client.query("select state, wait_event_type t, wait_event e, left(query,60) q from pg_stat_activity where pid=$1", [pid])).rows[0]; if (r && pred(r)) return r; if (now() - t > tmo) throw new Error("timeout waiting for " + what + " " + JSON.stringify(r)); await sleep(15); } }
const blockedOnLock = (mon, pid) => waitFor(mon, pid, (r) => r.t === "Lock", "lock wait of pid " + pid);
const inSleep = (mon, pid) => waitFor(mon, pid, (r) => r.e === "PgSleep", "pg_sleep of pid " + pid);
/* a PostgREST request: one transaction, role via SET LOCAL, claims via transaction-local settings. Never throws. */
export async function req(c, role, sub, sql) {
  const claims = JSON.stringify(sub ? { sub, role } : { role });
  try { await c.client.query("begin"); await c.client.query(`set local role ${role}`);
    await c.client.query({ text: "select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)", values: [claims, sub || "", role] });
    const r = await c.client.query(sql); await c.client.query("commit"); return { rows: (Array.isArray(r) ? r[r.length - 1] : r).rows, n: (Array.isArray(r) ? r[r.length - 1] : r).rowCount }; }
  catch (e) { await rollbackQuiet(c); return { err: String(e.message), code: e.code }; } }
const sortedAcl = (t) => t == null ? null : t.slice(1, -1).split(",").sort().join(",");

export async function realPgSuite(ctx) {
  const { B, lab, F3_FW, F3_RB, regen, A1, F3_ORIG, F3_DQ, A11_FN, F3_ORIG_TEXT } = ctx; const sink = [];
  const { check } = collector(sink);
  const chk = async (id, name, fn, extra = {}) => { const metrics = {}; const r = await check(id, name, () => fn(metrics), extra); r.metrics = metrics; return r; };
  const withWorld = async (blob, fn) => { const db = await clone(blob); const conns = []; const mk = async (u) => { const c = await conn(db, u); conns.push(c); return c; }; try { return await fn(db, mk); } finally { for (const c of conns) await c.disconnect(); await closeDb(db); } };
  const fwOf = (F0, hold) => { const t = lab.patch(F3_FW, F0); return hold ? holdBeforeCommit(t, hold) : t; };
  const ownerUpd = (col = "bio", val = "edited by cc") => `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${U.TUI}',true); update public.profile_meta set ${col}='${val}', updated_at=now() where slug='tuitea'`;

  /* ---------------------------------------------------------------- (1) PostgREST-style requests, separate real connections (final state: after APPLY-2) */
  await withWorld(B.S10, async (db, mk) => {
    const auth = await mk("authenticator"), auth2 = await mk("authenticator");
    await chk("RP.1", "the connection role (authenticator, NOINHERIT) has NO privileges of its own: a bare query on profile_meta is refused (42501), only SET LOCAL ROLE gives access; it cannot SET ROLE postgres", async (m) => {
      const a = await timed(auth.client.query("select count(*) from public.profile_meta")); const b = await timed(auth.client.query("set role postgres")); await rollbackQuiet(auth);
      const who = (await auth.client.query("select current_user u, session_user s")).rows[0];
      return (!a.ok && a.code === "42501" && !b.ok && b.code === "42501" && who.u === "authenticator") || JSON.stringify({ a: a.err, b: b.err, who }); });
    await chk("RP.2", "anon request: get_public_profile('groove-trooper') returns the attested+opted-in page; direct SELECT on profile_meta is refused after APPLY-2; request GUCs do not leak into the next request on the same connection", async () => {
      const a = await req(auth, "anon", "", "select slug from public.get_public_profile('groove-trooper')"); const b = await req(auth, "anon", "", "select slug from public.profile_meta");
      const c = await req(auth, "authenticated", U.TUI, "select auth.uid()::text u"); const d = await req(auth, "authenticated", "", "select auth.uid()::text u");
      return (a.rows?.length === 1 && b.code === "42501" && c.rows[0].u === U.TUI && (d.rows[0].u === null || d.rows[0].u === "")) || JSON.stringify({ a, b, c, d }); });
    await chk("RP.3", "owner request (sub = tuitea's owner): reads exactly its own profile_meta row; a bio edit is accepted; account_type and status are refused (42501); another signed-in user's UPDATE of that row touches 0 rows", async () => {
      const own = await req(auth, "authenticated", U.TUI, "select slug from public.profile_meta"); const ok = await req(auth, "authenticated", U.TUI, "update public.profile_meta set bio='rp3 edit', updated_at=now() where slug='tuitea' returning slug");
      const bad = await req(auth, "authenticated", U.TUI, "update public.profile_meta set account_type='editorial_brand' where slug='tuitea'"); const bad2 = await req(auth, "authenticated", U.TUI, "update public.profile_meta set status='published' where slug='tuitea'");
      const other = await req(auth, "authenticated", U.STR, "update public.profile_meta set bio='x' where slug='tuitea' returning slug");
      return (own.rows?.length === 1 && own.rows[0].slug === "tuitea" && ok.rows?.length === 1 && bad.code === "42501" && bad2.code === "42501" && (other.rows?.length === 0 || other.code === "42501")) || JSON.stringify({ own, ok, bad: bad.err, bad2: bad2.err, other }); });
    await chk("RP.4", "two simultaneous request connections with different identities see only their own rows (no cross-talk; each request is its own transaction)", async (m) => {
      const t = now(); const [a, b] = await Promise.all([req(auth, "authenticated", U.TUI, "select count(*)::int c, min(slug) s from public.profile_meta"), req(auth2, "authenticated", U.STR, "select count(*)::int c from public.profile_meta")]); m.ms = Math.round(now() - t);
      return (a.rows?.[0].c === 1 && a.rows[0].s === "tuitea" && b.rows?.[0].c === 0) || JSON.stringify({ a, b }); });
  });

  /* ---------------------------------------------------------------- (2) concurrency */
  // CC.0 natural lock window of the F3 forward and rollback on the (tiny) replica
  await withWorld(B.S6, async (db, mk) => { const F0 = await lab.fpOf(db); const f = await mk(); const t = await run(f, fwOf(F0)); await rollbackQuiet(f);
    await chk("CC.0", "F3 forward, no contention, on the combined replica: applies; wall time of the whole transaction (= its ACCESS EXCLUSIVE window) is recorded", async (m) => { m.forward_ms = t.ms; return t.ok || t.err; }); });

  // CC.1 an owner save is in flight (short) when the forward arrives: the forward WAITS for it, then proceeds
  await withWorld(B.S6, async (db, mk) => { const F0 = await lab.fpOf(db); const o = await mk(), f = await mk(), mon = await mk(); const fpid = await pidOf(f);
    await chk("CC.1", "F3 forward arrives while an owner save transaction is still open (held ~1.5 s): the forward's LOCK TABLE waits for the owner (lock wait ~ hold time, < the 5 s lock_timeout), then applies; the owner's edit is committed and kept", async (m) => {
      await o.client.query(ownerUpd("bio", "cc1 owner edit")); const t0 = now(); const pf = run(f, fwOf(F0)); await blockedOnLock(mon, fpid); const blockedAt = now();
      await sleep(1500); await o.client.query("commit"); const r = await pf; m.owner_hold_ms = Math.round(now() - t0); m.forward_total_ms = r.ms; m.forward_wait_ms = Math.round(now() - blockedAt);
      const bio = (await one(db, "select bio from public.profile_meta where slug='tuitea'")).bio; const guard = (await one(db, "select to_regclass('atlas_media_guard.rollback_guard') is not null g")).g;
      return (r.ok && bio === "cc1 owner edit" && guard) || JSON.stringify({ r: r.err, bio, guard }); }); });

  // CC.2 the owner transaction outlives lock_timeout (5 s): the forward gives up, changes nothing
  await withWorld(B.S6, async (db, mk) => { const F0 = await lab.fpOf(db); const o = await mk(), f = await mk(), mon = await mk(); const fpid = await pidOf(f); const before = await snapshot(db);
    await chk("CC.2", "F3 forward vs an owner transaction held ~7 s (> lock_timeout 5 s): the forward fails with 55P03 lock_not_available after ~5 s and changes NOTHING (catalog snapshot identical, no guard schema)", async (m) => {
      await o.client.query(ownerUpd("bio", "cc2 long owner txn")); const pf = run(f, fwOf(F0)); await blockedOnLock(mon, fpid); const t0 = now(); const r = await pf; m.forward_fail_after_ms = Math.round(now() - t0); await rollbackQuiet(f); await o.client.query("commit");
      const d = diffSnap(before, await snapshot(db)); const guard = (await one(db, "select to_regclass('atlas_media_guard.rollback_guard') is not null g")).g;
      return (!r.ok && r.code === "55P03" && !guard && d.n === 0 && r.ms >= 4500 && r.ms < 7000) || JSON.stringify({ r, d: brief(d), guard }); }); });

  // CC.3 the forward holds ACCESS EXCLUSIVE (3 s): owner save and anon read and a drift capture arrive during it
  await withWorld(B.S6, async (db, mk) => { const F0 = await lab.fpOf(db); const f = await mk(), o = await mk(), a = await mk("authenticator"), d = await mk(), mon = await mk(); const fpid = await pidOf(f);
    await chk("CC.3", "while the F3 forward holds its 8-table ACCESS EXCLUSIVE locks (held 3 s): an owner save and an anonymous read of event_media BLOCK until the forward commits (then succeed); a DRIFT_QUERY capture started in the same window is ALSO BLOCKED (it touches the locked tables) and returns the POST-forward fingerprint, never the old one", async (m) => {
      const pf = run(f, fwOf(F0, 3)); await inSleep(mon, fpid); const t0 = now();
      const po = run(o, ownerUpd("bio", "cc3 owner during forward") + "; commit"); const pa = run(a, "begin; set local role anon; select count(*)::int c from public.event_media; commit");
      await sleep(300); const dq = await timed((async () => { await d.client.query("reset role; set search_path = public, extensions"); const r = (await d.client.query(F3_DQ)).rows[0]; await d.client.query('set search_path = "$user", public'); return r; })());
      const [rf, ro, ra] = [await pf, await po, await pa]; m.forward_ms = rf.ms; m.owner_blocked_ms = ro.ms; m.anon_read_blocked_ms = ra.ms; m.drift_capture_ms = dq.ms;
      const okRows = ra.v && ra.v.rows !== undefined ? true : Array.isArray(ra.v) ? true : ra.ok;
      return (rf.ok && ro.ok && ra.ok && dq.ok && dq.v.fingerprint !== F0 && dq.ms >= 2000 && ro.ms >= 2000 && ra.ms >= 2000 && okRows) || JSON.stringify({ rf: rf.err, ro: ro.err, ra: ra.err, dq: dq.err || (dq.v && dq.v.fingerprint === F0 ? "returned pre-forward fp" : "ok"), ms: [rf.ms, ro.ms, ra.ms, dq.ms] }); }); });

  // CC.4 two forwards at once (drift guard under concurrency)
  await withWorld(B.S6, async (db, mk) => { const F0 = await lab.fpOf(db); const f1 = await mk(), f2 = await mk(), mon = await mk(); const p1 = await pidOf(f1), p2 = await pidOf(f2);
    await chk("CC.4", "two F3 forwards started together (first holds locks ~2 s): the second WAITS on LOCK TABLE, then its drift/precondition guard ABORTS it (the catalog is no longer the baseline); end state == exactly one forward applied, one guard row", async (m) => {
      const r1p = run(f1, fwOf(F0, 2)); await inSleep(mon, p1); const t0 = now(); const r2p = run(f2, fwOf(F0)); await blockedOnLock(mon, p2); const [r1, r2] = [await r1p, await r2p]; await rollbackQuiet(f2); m.second_wait_ms = r2.ms; m.second_total_ms = Math.round(now() - t0);
      const g = (await one(db, "select count(*)::int n from atlas_media_guard.rollback_guard")).n; m.second_error = (r2.err || "").slice(0, 120);
      return (r1.ok && !r2.ok && /Catalog drift|already exists|stop and re-review/.test(r2.err) && g === 1) || JSON.stringify({ r1: r1.err, r2: r2.err, g }); }); });

  // CC.5 two rollbacks at once (regenerated rollback; its ORDER-sensitive final fingerprint guard bypassed, see RB.8 / R1)
  await withWorld(B.S6, async (db, mk) => { const F0 = await lab.fpOf(db); const f = await mk(); await timed(f.client.query(fwOf(F0))); await rollbackQuiet(f); const r1 = await mk(), r2 = await mk(), mon = await mk(); const p1 = await pidOf(r1), p2 = await pidOf(r2);
    const rb = R1MODE ? lab.patch(regen(F3_RB), F0) : mutate(lab.patch(regen(F3_RB), F0), `IF v_fingerprint IS DISTINCT FROM '${F0}' THEN`, "IF false THEN", "end guard");
    await chk("CC.5", "two F3 rollbacks started together (first holds locks ~2 s): the second waits, then ABORTS (forward objects already gone); end state == pre-F3 catalog (sorted-ACL snapshot) and no guard schema", async (m) => {
      const pre = await clone(B.S6); const snapPre = await snapshot(pre); await closeDb(pre);
      const a = run(r1, holdBeforeCommit(rb, 2)); await inSleep(mon, p1); const b = run(r2, rb); await blockedOnLock(mon, p2); const [x, y] = [await a, await b]; await rollbackQuiet(r2); m.second_wait_ms = y.ms; m.second_error = (y.err || "").slice(0, 120);
      const d = diffSnap(snapPre, await snapshot(db)); return (x.ok && !y.ok && d.n === 0) || JSON.stringify({ x: x.err, y: y.err, d: brief(d) }); }); });

  // CC.6 owner updates: two tabs of the same owner (different columns, same row) and two owners (different rows)
  await withWorld(B.S10, async (db, mk) => { const t1 = await mk(), t2 = await mk(), mon = await mk(); const p2 = await pidOf(t2);
    await chk("CC.6a", "two concurrent saves of the SAME row by the same owner (different columns): the second waits for the first's row lock, then applies on top of the committed row; no lost update (both columns persisted)", async (m) => {
      await t1.client.query(ownerUpd("bio", "cc6 tab1 bio")); const t0 = now(); const pb = run(t2, ownerUpd("about", "cc6 tab2 about") + "; commit"); await blockedOnLock(mon, p2); await sleep(500); await t1.client.query("commit"); const r = await pb; m.second_wait_ms = Math.round(now() - t0);
      const row = await one(db, "select bio, about, status from public.profile_meta where slug='tuitea'"); return (r.ok && row.bio === "cc6 tab1 bio" && row.about === "cc6 tab2 about") || JSON.stringify({ r: r.err, row }); });
    const o2 = await mk();
    await chk("CC.6b", "two owners saving DIFFERENT rows at the same time do not block each other (no table-level lock on the owner path)", async (m) => {
      await t1.client.query(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${U.TUI}',true); update public.profile_meta set bio='cc6b a' where slug='tuitea'`);
      const other = await one(db, `select profile_slug slug from public.profile_owners where owner_id <> '${U.TUI}' limit 1`); if (!other) { await t1.client.query("rollback"); return "no second owner row in the replica fixtures"; }
      const t0 = now(); const r = await timed(o2.client.query(`begin; set local role authenticated; select set_config('request.jwt.claim.sub',(select owner_id::text from public.profile_owners where profile_slug='${other.slug}' limit 1),true); update public.profile_meta set bio='cc6b b' where slug='${other.slug}'; commit`)); m.ms = Math.round(now() - t0); await t1.client.query("rollback");
      return (r.ok && m.ms < 1000) || JSON.stringify(r); }); });

  if (!R1MODE) {
  // CC.7 two APPLY-1 runs at once on the baseline (APPLY scripts take no advisory locks; only table locks serialise them)
  await withWorld(B.S0, async (db, mk) => { const a = await mk(), b = await mk(), mon = await mk(); const pa = await pidOf(a), pb = await pidOf(b);
    await chk("CC.7", "FINDING: two APPLY-1 runs started together on the baseline (no advisory locks in the packs; the first holds its table locks ~2 s): the second waits on the table locks and then FAILS with `tuple concurrently updated` (transaction rolled back); the catalog equals exactly ONE APPLY-1. APPLY scripts must be serialised by the operator", async (m) => {
      const one_ = await clone(B.S0); await tx(one_, A1); const snap1 = await snapshot(one_); await closeDb(one_);
      const x = run(a, holdBeforeCommit(A1, 2)); await inSleep(mon, pa); const y = run(b, A1); await blockedOnLock(mon, pb); const [rx, ry] = [await x, await y]; m.second_total_ms = ry.ms; await rollbackQuiet(b);
      const d = diffSnap(snap1, await snapshot(db)); m.second_outcome = ry.ok ? "completed" : ry.err; return (rx.ok && d.n === 0 && (ry.ok || /concurrently updated|deadlock detected/.test(ry.err))) || JSON.stringify({ rx: rx.err, ry: ry.err, d: brief(d) }); }); });
  }

  if (R1MODE) {
    const lockStmt = "SELECT pg_advisory_xact_lock(" + LOCK_KEY + ");";
    const unlock = (sql) => { const i = sql.indexOf("-- R1-LOCK"); if (i < 0) return sql; const j = sql.indexOf(lockStmt); return sql.slice(0, i) + sql.slice(j + lockStmt.length); };
    const advWait = async (mon, pid) => (await mon.client.query("select (classid::bigint*4294967296 + objid::bigint)::text k, granted from pg_locks where locktype='advisory' and pid=$1", [pid])).rows;
    const relLocksOf = async (mon, pid) => (await mon.client.query("select count(*)::int n from pg_locks where pid=$1 and locktype='relation' and relation in (select oid from pg_class where relnamespace='public'::regnamespace)", [pid])).rows[0].n;
    // CC.7 (R1-FIX) two APPLY-1 runs at once: the advisory lock serialises them
    await withWorld(B.S0, async (db, mk) => { const a = await mk(), b = await mk(), mon = await mk(); const pa = await pidOf(a), pb = await pidOf(b);
      await chk("CC.7", "R1-FIX: two APPLY-1 runs started together on the baseline (the first holds the pack lock ~2 s): the second WAITS on the advisory lock (pg_locks: ungranted advisory lock on the pack key, and it has touched no public table), and only after the first commits runs on the committed state; no `tuple concurrently updated`; the catalog equals exactly ONE APPLY-1", async (m) => {
        const one_ = await clone(B.S0); await tx(one_, A1); const snap1 = await snapshot(one_); await closeDb(one_);
        const x = run(a, holdBeforeCommit(A1, 2)); await inSleep(mon, pa); const y = run(b, A1); await blockedOnLock(mon, pb);
        const w = await advWait(mon, pb); const rel = await relLocksOf(mon, pb); m.second_waiting_on_key = w.map((r) => r.k + (r.granted ? " granted" : " WAITING")).join(","); m.second_public_relation_locks_while_waiting = rel;
        const [rx, ry] = [await x, await y]; m.second_total_ms = ry.ms; await rollbackQuiet(b); const d = diffSnap(snap1, await snapshot(db)); m.second_outcome = ry.ok ? "completed (idempotent re-run on the committed state)" : ry.err;
        return (rx.ok && w.length === 1 && w[0].k === LOCK_KEY && w[0].granted === false && rel === 0 && ry.ms >= 1200 && d.n === 0 && (ry.ok || !/concurrently updated|deadlock detected/.test(ry.err))) || JSON.stringify({ rx: rx.err, w, rel, ry: ry.err, ms: ry.ms, d: brief(d) }); }); });
    // CC.7c NEGATIVE CONTROL: the same two APPLY-1 runs WITHOUT the lock overlap (the original behaviour)
    await withWorld(B.S0, async (db, mk) => { const a = await mk(), b = await mk(), mon = await mk(); const pa = await pidOf(a), pb = await pidOf(b);
      await chk("CC.7c", "NEGATIVE CONTROL for CC.7: the same two APPLY-1 runs with the lock statement REMOVED do not queue on an advisory lock (no pg_locks advisory wait); they overlap and the second dies with `tuple concurrently updated` (or deadlock) as before", async (m) => {
        const A = unlock(A1); if (A === A1) return "control could not strip the lock";
        const x = run(a, holdBeforeCommit(A, 2)); await inSleep(mon, pa); const y = run(b, A); await blockedOnLock(mon, pb); const w = await advWait(mon, pb); const [rx, ry] = [await x, await y]; await rollbackQuiet(b); m.second_outcome = ry.ok ? "completed" : ry.err; m.advisory_waits = w.length;
        return (rx.ok && w.length === 0 && !ry.ok && /concurrently updated|deadlock detected/.test(ry.err)) || JSON.stringify({ rx: rx.err, ry: ry.err, w }); }); });
    // CC.8 (R1-FIX): MAINTAIN is revoked by the R1 forward, so the anonymous LOCK TABLE is refused
    await withWorld(B.S9, async (db, mk) => { const x = await mk("authenticator");
      await chk("CC.8", "R1-FIX: after the R1 F3 forward an ANONYMOUS session can NOT take LOCK TABLE ... ACCESS EXCLUSIVE on event_media or venue_media (42501); MAINTAIN is false for anon and authenticated on both tables. RESIDUAL (not MAINTAIN, not changed by R1): a signed-in `authenticated` session can still take that lock through its UPDATE privilege (recorded in the metrics)", async (m) => {
        const out = []; for (const [role, t] of [["anon", "event_media"], ["anon", "venue_media"], ["authenticated", "event_media"], ["authenticated", "venue_media"]]) { await x.client.query("begin; set local role " + role); const l = await timed(x.client.query(`lock table public.${t} in access exclusive mode`)); await rollbackQuiet(x); out.push(role + ":" + t + ":" + (l.ok ? "ALLOWED" : l.code)); }
        const p = await one(db, "select bool_or(has_table_privilege('anon',c.oid,'MAINTAIN') or has_table_privilege('authenticated',c.oid,'MAINTAIN')) any, bool_and(has_table_privilege('authenticated',c.oid,'UPDATE')) auth_update from pg_class c where c.oid in ('public.event_media'::regclass,'public.venue_media'::regclass)");
        m.lock_outcomes = out.join(" "); m.authenticated_has_UPDATE_on_both = p.auth_update;
        return (out.filter((q) => q.startsWith("anon:")).every((q) => /:42501$/.test(q)) && p.any === false) || out.join(" ") + " " + JSON.stringify(p); });
      await chk("CC.8c", "after 1C the same anonymous LOCK TABLE on profile_meta / profile_owners / profile_content is refused (1C removed MAINTAIN there)", async () => { const out = []; for (const t of ["profile_meta", "profile_owners", "profile_content"]) { await x.client.query("begin; set local role anon"); const l = await timed(x.client.query(`lock table public.${t} in access exclusive mode`)); await rollbackQuiet(x); out.push(t + ":" + (l.ok ? "ALLOWED" : l.code)); } return out.every((s) => /42501/.test(s)) || out.join(" "); }); });
    // CC.8-control: NEGATIVE CONTROL with the ORIGINAL F3 pair (committed in PR #121): MAINTAIN is left, anon can lock; its regenerated rollback refuses (order-sensitive final guard) on real PG
    await withWorld(B.S6, async (db, mk) => { const x = await mk("authenticator"), y = await mk("authenticator"), mon = await mk(); const px = await pidOf(y);
      const O = F3_ORIG_TEXT; await db.exec("reset role; set search_path = public, extensions"); const Fo = (await db.query(O.dq)).rows[0].fingerprint; await db.exec('set search_path = "$user", public');
      const fwr = await tx(db, O.fw.split(F3_ORIG).join(Fo));
      await chk("CC.8-control", "NEGATIVE CONTROL: with the ORIGINAL F3 forward (PR #121 text, no REVOKE MAINTAIN) an ANONYMOUS session CAN take ACCESS EXCLUSIVE on event_media and a second anonymous read blocks (the defect R1-FIX closes)", async (m) => {
        if (!fwr.ok) return "original forward failed on the replica: " + fwr.err;
        await x.client.query("begin; set local role anon"); const l = await timed(x.client.query("lock table public.event_media in access exclusive mode")); if (!l.ok) { await rollbackQuiet(x); return "anon LOCK refused with the original F3: " + l.err; }
        const rdp_ = run(y, "begin; set local role anon; select count(*)::int c from public.event_media; commit;"); await blockedOnLock(mon, px); await sleep(800); await x.client.query("commit"); const r = await rdp_; m.reader_blocked_ms = r.ms; return (r.ok && r.ms >= 700) || JSON.stringify(r); });
      await chk("ACLO.real-control", "NEGATIVE CONTROL on the real packs: the ORIGINAL F3 forward followed by the ORIGINAL (post-1C regenerated) F3 rollback is REFUSED by its own final order-sensitive guard ('Rollback did not restore original catalog') although the privileges are semantically restored; the R1 pair (R1.exact / R1.fp-roundtrip) is accepted", async (m) => {
        if (!fwr.ok) return "original forward failed: " + fwr.err; const before = await snapshot(db); const rbO = regen(O.rb).split(F3_ORIG).join(Fo); const r = await tx(db, rbO); const d = diffSnap(before, await snapshot(db)); m.outcome = (r.err || "applied").slice(0, 120);
        return (!r.ok && /Rollback did not restore original catalog/.test(r.err) && d.n === 0) || JSON.stringify({ err: r.err, d: brief(d) }); }); });
  }

  if (!R1MODE) {
  // CC.8 MAINTAIN (PostgreSQL 17+): an anonymous caller can take ACCESS EXCLUSIVE on a media table and block every reader (F3 leaves MAINTAIN); the proposed mitigation closes it
  await withWorld(B.S9, async (db, mk) => { const x = await mk("authenticator"), y = await mk("authenticator"), mon = await mk(); const px = await pidOf(y);
    await chk("CC.8", "FINDING (reproduced with real concurrency): after F3 an ANONYMOUS session can run LOCK TABLE event_media IN ACCESS EXCLUSIVE MODE (MAINTAIN is still granted) and a second anonymous read blocks for as long as it holds the lock", async (m) => {
      await x.client.query("begin; set local role anon"); const l = await timed(x.client.query("lock table public.event_media in access exclusive mode")); if (!l.ok) { await rollbackQuiet(x); m.lock_error = l.err; return "anon LOCK refused: " + l.err; }
      const t0 = now(); const rd = run(y, "begin; set local role anon; select count(*)::int c from public.event_media; commit"); await blockedOnLock(mon, px); await sleep(1500); await x.client.query("commit"); const r = await rd; m.reader_blocked_ms = r.ms; return (r.ok && r.ms >= 1500) || JSON.stringify(r); });
    await chk("CC.8b", "proposed mitigation (version-guarded REVOKE MAINTAIN on event_media/venue_media from anon, authenticated): the same anonymous LOCK TABLE is then refused 42501; PROPOSAL ONLY, applied to the scratch replica", async () => {
      await db.exec("revoke maintain on table public.event_media, public.venue_media from anon, authenticated"); await x.client.query("begin; set local role anon"); const l = await timed(x.client.query("lock table public.event_media in access exclusive mode")); await rollbackQuiet(x); return (!l.ok && l.code === "42501") || JSON.stringify(l); });
    await chk("CC.8c", "after 1C the same anonymous LOCK TABLE on profile_meta / profile_owners / profile_content is refused (1C removed MAINTAIN there)", async () => { const out = []; for (const t of ["profile_meta", "profile_owners", "profile_content"]) { await x.client.query("begin; set local role anon"); const l = await timed(x.client.query(`lock table public.${t} in access exclusive mode`)); await rollbackQuiet(x); out.push(t + ":" + (l.ok ? "ALLOWED" : l.code)); } return out.every((s) => /42501/.test(s)) || out.join(" "); }); });
  }

  /* ---------------------------------------------------------------- (3) PostgreSQL 17 catalog behaviour on a scratch database */
  { const db = await open(); try {
    await db.exec("create schema t17; create table t17.a(id int); create table t17.b(id int); create function t17.f() returns int language sql as 'select 1'");
    await chk("PG17.1", "server is PostgreSQL 17.6; a fresh database has NO default ACLs (pg_default_acl empty)", async (m) => { const v = (await one(db, "show server_version")).server_version; const n = (await one(db, "select count(*)::int n from pg_default_acl")).n; m.server_version = v; return (/^17\.6/.test(v) && n === 0) || JSON.stringify({ v, n }); });
    await chk("PG17.2", "MAINTAIN exists and is part of ALL TABLES on 17: GRANT ALL gives the 'm' bit and has_table_privilege(...,'MAINTAIN') is true; GRANT SELECT does not", async (m) => {
      await db.exec("grant all on t17.a to anon; grant select on t17.b to anon"); const a = (await one(db, "select relacl::text r, has_table_privilege('anon','t17.a','MAINTAIN') m from pg_class where oid='t17.a'::regclass")); const b = (await one(db, "select relacl::text r, has_table_privilege('anon','t17.b','MAINTAIN') m from pg_class where oid='t17.b'::regclass"));
      m.all_acl = a.r; m.select_acl = b.r; return (/anon=[a-zA-Z]*m[a-zA-Z]*\//.test(a.r) && a.m === true && b.m === false) || JSON.stringify({ a, b }); });
    await chk("PG17.3", "a new function has NULL proacl and PUBLIC (hence anon) may EXECUTE it: the implicit default that Supabase leaves anon with", async () => { const r = await one(db, "select proacl is null n, has_function_privilege('anon','t17.f()','EXECUTE') x from pg_proc where oid='t17.f()'::regprocedure"); return (r.n === true && r.x === true) || JSON.stringify(r); });
    await chk("PG17.4", "ACL ENTRY ORDER is not canonical: revoking ALL from a role and granting it back MOVES its aclitem to the END of relacl::text, so two catalogs with the same grants can have different relacl::text (F3's fingerprints hash relacl::text); sorted entries are equal", async (m) => {
      await db.exec("create table t17.c(id int); grant select on t17.c to anon; grant select on t17.c to authenticated; grant select on t17.c to service_role");
      const before = (await one(db, "select relacl::text r from pg_class where oid='t17.c'::regclass")).r; await db.exec("revoke select on t17.c from anon; grant select on t17.c to anon");
      const after = (await one(db, "select relacl::text r from pg_class where oid='t17.c'::regclass")).r; m.before = before; m.after = after; const h = (await one(db, `select md5('${before}') a, md5('${after}') b`));
      return (before !== after && sortedAcl(before) === sortedAcl(after) && h.a !== h.b) || JSON.stringify({ before, after }); });
    await chk("PG17.5", "a plain re-GRANT of a privilege the role already has does NOT reorder (the reorder needs the entry to be removed first)", async (m) => { const a = (await one(db, "select relacl::text r from pg_class where oid='t17.c'::regclass")).r; await db.exec("grant select on t17.c to authenticated"); const b = (await one(db, "select relacl::text r from pg_class where oid='t17.c'::regclass")).r; m.acl = b; return a === b || JSON.stringify({ a, b }); });
    await chk("PG17.6", "functions behave the same: after REVOKE ALL FROM the roles + GRANT in a different order than the original (the shape of F3's rollback), proacl::text changes but its sorted entries do not", async (m) => {
      await db.exec("revoke all on function t17.f() from postgres; grant execute on function t17.f() to anon, authenticated, service_role; grant execute on function t17.f() to postgres"); const o = (await one(db, "select proacl::text r from pg_proc where oid='t17.f()'::regprocedure")).r;
      await db.exec("revoke all on function t17.f() from public, postgres, anon, authenticated, service_role; grant execute on function t17.f() to public; grant execute on function t17.f() to postgres; grant execute on function t17.f() to anon; grant execute on function t17.f() to authenticated; grant execute on function t17.f() to service_role");
      const n = (await one(db, "select proacl::text r from pg_proc where oid='t17.f()'::regprocedure")).r; m.original = o; m.after_rollback_shape = n; return (o !== n && sortedAcl(o) === sortedAcl(n)) || JSON.stringify({ o, n }); });
  } finally { await closeDb(db); } }
  /* ---------------------------------------------------------------- (4) R1-FIX: ACL-order immunity (negative control + fix) and the pack lock (two real connections, negative control) */
  if (R1MODE) {
    { const db = await open(); try {
      await db.exec("create schema acl; create table acl.t(id int, v int); create function acl.f() returns int language sql as 'select 1'");
      const fpRel = async (sorted) => (await one(db, sorted ? `select md5(coalesce(${aclSorted("c.relacl")},'<null>')) h, ${aclSorted("c.relacl")} s from pg_class c where c.oid='acl.t'::regclass` : "select md5(coalesce(c.relacl::text,'<null>')) h, c.relacl::text s from pg_class c where c.oid='acl.t'::regclass"));
      const fpCol = async (sorted) => (await one(db, `select md5(coalesce(${sorted ? aclSorted("a.attacl") : "a.attacl::text"},'<null>')) h from pg_attribute a where a.attrelid='acl.t'::regclass and a.attname='id'`)).h;
      const fpFn = async (sorted) => (await one(db, `select md5(coalesce(${sorted ? aclSorted("p.proacl") : "p.proacl::text"},'<null>')) h from pg_proc p where p.oid='acl.f()'::regprocedure`)).h;
      await db.exec("grant select on acl.t to anon; grant select on acl.t to authenticated; grant select on acl.t to service_role; grant select (id) on acl.t to anon; grant select (id) on acl.t to authenticated; grant select (id) on acl.t to service_role; revoke all on function acl.f() from public; grant execute on function acl.f() to anon, authenticated, service_role");
      const o1 = await fpRel(false), n1 = await fpRel(true), oc1 = await fpCol(false), nc1 = await fpCol(true), of1 = await fpFn(false), nf1 = await fpFn(true);
      await db.exec("revoke select on acl.t from anon; grant select on acl.t to anon; revoke select (id) on acl.t from anon; grant select (id) on acl.t to anon; revoke execute on function acl.f() from anon; grant execute on function acl.f() to anon");
      const o2 = await fpRel(false), n2 = await fpRel(true), oc2 = await fpCol(false), nc2 = await fpCol(true), of2 = await fpFn(false), nf2 = await fpFn(true);
      await chk("ACLO.1", "NEGATIVE CONTROL (this assertion FAILS under the OLD expression): hashing relacl::text / attacl::text / proacl::text gives a DIFFERENT fingerprint for the same privileges after revoke + re-grant moved the anon entry to the end (relation, column and function ACLs)", async (m) => {
        m.rel_before = o1.s; m.rel_after_text = (await fpRel(false)).s; const oldEqual = o1.h === o2.h && oc1 === oc2 && of1 === of2; return (!oldEqual && o1.h !== o2.h && oc1 !== oc2 && of1 !== of2) || JSON.stringify({ rel: o1.h === o2.h, col: oc1 === oc2, fn: of1 === of2 }); });
      await chk("ACLO.2", "the R1 sorted-aclitem expression gives the SAME fingerprint before and after the reorder, for relation, column and function ACLs (the assertion the old expression fails)", async (m) => { m.sorted_acl = n2.s; return (n1.h === n2.h && nc1 === nc2 && nf1 === nf2) || JSON.stringify({ rel: [n1.h, n2.h], col: [nc1, nc2], fn: [nf1, nf2] }); });
      await chk("ACLO.3", "the sorted expression is still SENSITIVE: a real privilege change (extra INSERT for anon; a dropped function grant; a column grant removed) changes the fingerprint, and NULL (default ACL) stays distinct from an empty '{}' ACL", async () => {
        await db.exec("grant insert on acl.t to anon"); const r = (await fpRel(true)).h !== n2.h; await db.exec("revoke execute on function acl.f() from authenticated"); const f = (await fpFn(true)) !== nf2; await db.exec("revoke select (id) on acl.t from service_role"); const c = (await fpCol(true)) !== nc2;
        await db.exec("create table acl.n(id int); create table acl.e(id int); revoke all on acl.e from postgres");
        const q = await one(db, `select (select ${aclSorted("c.relacl")} from pg_class c where c.oid='acl.n'::regclass) n, (select ${aclSorted("c.relacl")} from pg_class c where c.oid='acl.e'::regclass) e`);
        return (r && f && c && q.n === null && q.e === "{}") || JSON.stringify({ r, f, c, q }); });
    } finally { await closeDb(db); } }

    /* the pack lock, with two REAL connections on a probe pack that uses the SAME lock text as every pack */
    { const fs = await import("node:fs"), path = await import("node:path"); const { R1D } = await import("./core.mjs");
      await chk("LK.static", "every R1 APPLY/ROLLBACK pack variant (16 files: #91 APPLY-1/1B/2 + ROLLBACK-1/1B/2, #92 APPLY-92/ROLLBACK-92, 10A APPLY-1C/APPLY-92-44col/ROLLBACK-1C/ROLLBACK-2-after-1C, F3 FORWARD/ROLLBACK, 11A install/rollback; the F3 DRIFT_QUERY and POSTCHECKS read-only files are excluded) has ONE top-level BEGIN with pg_advisory_xact_lock(KEY) as the FIRST statement after it, the same KEY in all of them, and no statement before BEGIN", async (m) => {
        const files = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } }; walk(R1D);
        const packs = files.filter((f) => !/(DRIFT_QUERY|POSTCHECKS)/.test(f)); const bad = [];
        for (const f of packs) { const t = fs.readFileSync(f, "utf8"); const noc = t.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n"); const first = noc.match(/^\s*(begin|start transaction);\s*(select pg_advisory_xact_lock\(([-0-9]+)\);)/i); if (!first || first[3] !== LOCK_KEY) bad.push(path.relative(R1D, f)); }
        m.packs = packs.length; return (packs.length === 16 && bad.length === 0) || JSON.stringify({ n: packs.length, bad }); }); }
    const probeSql = (who, lock, tail = "") => `begin; ${lock ? LOCK_SQL : ""}\ninsert into probe(who,ev,t) values ('${who}','start',clock_timestamp()); select pg_sleep(1.5); insert into probe(who,ev,t) values ('${who}','end',clock_timestamp()); ${tail || "commit;"}`;
    const probeRun = async (lock, { failFirst = false } = {}) => { const db = await open(); const conns = [];
      try { await db.exec("create table probe(who text, ev text, t timestamptz)"); const a = await conn(db), b = await conn(db), mon = await conn(db); conns.push(a, b, mon); const pa = await pidOf(a), pb = await pidOf(b);
        const A = run(a, failFirst ? probeSql("A", lock, "select 1/0; commit;") : probeSql("A", lock)); await inSleep(mon, pa); const t0 = now(); const B_ = run(b, probeSql("B", lock));
        let waiting = []; if (lock) { await blockedOnLock(mon, pb); waiting = (await mon.client.query("select (classid::bigint*4294967296 + objid::bigint)::text k, granted from pg_locks where locktype='advisory' and pid=$1", [pb])).rows; } else await sleep(300);
        const [ra, rb] = [await A, await B_]; await rollbackQuiet(a); await rollbackQuiet(b);
        const rows = (await db.query("select who, ev, extract(epoch from t)::float8 e from probe order by t")).rows; const g = (w, e) => (rows.find((r) => r.who === w && r.ev === e) || {}).e;
        return { ra, rb, waiting, aEnd: g("A", "end"), aStart: g("A", "start"), bStart: g("B", "start"), bEnd: g("B", "end"), ms: Math.round(now() - t0) }; } finally { for (const c of conns) await c.disconnect(); await closeDb(db); } };
    await chk("LK.1", "TWO REAL CONNECTIONS, WITH the lock: B (same lock text as every pack) blocks on the advisory lock while A is mid-transaction (pg_locks: ungranted advisory lock, key = the pack key) and B's first statement runs only AFTER A committed (B.start >= A.end; no overlap)", async (m) => {
      const r = await probeRun(true); m.b_wait_ms = r.ms; m.a_end_to_b_start_ms = Math.round((r.bStart - r.aEnd) * 1000);
      return (r.ra.ok && r.rb.ok && r.waiting.length === 1 && r.waiting[0].k === LOCK_KEY && r.waiting[0].granted === false && r.bStart >= r.aEnd) || JSON.stringify(r); });
    await chk("LK.2", "NEGATIVE CONTROL (two real connections, lock statement REMOVED): B does NOT wait; its first statement runs INSIDE A's open transaction (B.start < A.end) = the overlap the lock prevents", async (m) => {
      const r = await probeRun(false); m.b_start_before_a_end_ms = Math.round((r.aEnd - r.bStart) * 1000);
      return (r.ra.ok && r.rb.ok && r.bStart < r.aEnd) || JSON.stringify(r); });
    await chk("LK.3", "the lock is released by ABORT too: A fails (division by zero) while holding the lock; B (blocked meanwhile) then proceeds and commits; nothing of A remains", async (m) => {
      const r = await probeRun(true, { failFirst: true }); m.b_wait_ms = r.ms;
      return (!r.ra.ok && r.ra.code === "22012" && r.rb.ok && r.waiting.length === 1 && r.waiting[0].granted === false && r.aStart === undefined && r.ms >= 1000) || JSON.stringify(r); });
    // cross-pack, two real packs: F3 forward (held ~2 s) vs the 11A install on the same pre-F3 replica
    await withWorld(B.S6, async (db, mk) => { const F0 = await lab.fpOf(db); const a = await mk(), b = await mk(), mon = await mk(); const pa = await pidOf(a), pb = await pidOf(b);
      await chk("LK.4", "CROSS-PACK on the replica: the R1 F3 forward (A, held ~2 s) and the R1 11A install (B, a different pack) share the key, so B waits on the advisory lock until F3 commits; both then succeed and the end state has the F3 guard row AND can_upload_event_media", async (m) => {
        const A = run(a, fwOf(F0, 2)); await inSleep(mon, pa); const Bp = run(b, A11_FN); await blockedOnLock(mon, pb);
        const w = (await mon.client.query("select (classid::bigint*4294967296 + objid::bigint)::text k, granted from pg_locks where locktype='advisory' and pid=$1", [pb])).rows; const rel = (await mon.client.query("select count(*)::int n from pg_locks where pid=$1 and locktype='relation' and relation in (select oid from pg_class where relnamespace='public'::regnamespace)", [pb])).rows[0].n;
        const ra = await A; const tA = now(); const rb = await Bp; const tB = now(); m.b_total_ms = rb.ms;
        const st = await one(db, "select to_regclass('atlas_media_guard.rollback_guard') is not null g, to_regprocedure('public.can_upload_event_media(text)') is not null f");
        return (ra.ok && rb.ok && w.length === 1 && w[0].k === LOCK_KEY && !w[0].granted && rel === 0 && tB >= tA && rb.ms >= 1200 && st.g && st.f) || JSON.stringify({ ra: ra.err, rb: rb.err, w, rel, st }); }); });
  }
  return sink;
}
