/* proof/prove.mjs - 12A door hardening proofs on REAL PostgreSQL (localhost Unix socket only; replica of the captured prod door tables; ALL DATA SYNTHETIC).
   Nothing here connects to any hosted database. The ORIGINAL function bodies are the prod-captured ones (baseline/PROD-FACTS-12A.md); the HARDENED ones are installed by running the
   committed packs/*.sql themselves, so what is proven is what would be applied.
   Every behavioural test runs against BOTH the original (negative control) and the hardened replica; a test marked "detects" must FAIL on the original or it is not a valid proof.
   Roles: anon / authenticated / service_role / postgres are NOSUPERUSER stand-ins created by lib/pgdb.mjs (same adapter as the 11B/R1 real-PG harness); API requests run as the
   `authenticator` connection role: BEGIN; SET LOCAL ROLE <api role>; set_config('request.jwt.claim.sub', ...); <query>; COMMIT (the PostgREST shape).
   Usage: node proof/prove.mjs [--only=<id prefix>]     (start Postgres first: ~/work/pg-local/bin/pg-start.sh; run-proof.sh does that and always stops it) */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as PG from "../../11b-combined-rehearsal/lib/pgdb.mjs";
import { ORIG, HARD, MD5, REPO_PACK_KEY, buildAll, bodyOf } from "../build.mjs";
import { aclSorted } from "../../r1-fix-f3-acl-locks/build-variants.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (...p) => readFileSync(join(HERE, ...p), "utf8");
const PK = (n) => rd("packs", n);
const PACK = { a1: "12a_01_event_checkin_scan_APPLY_PROPOSED.sql", a2: "12a_02_check_in_ticket_APPLY_PROPOSED.sql", r2: "12a_02_check_in_ticket_ROLLBACK_PROPOSED.sql", r1: "12a_01_event_checkin_scan_ROLLBACK_PROPOSED.sql",
  drift: "12a_DRIFT_QUERY_PROPOSED.sql", pc0: "12a_POSTCHECKS_S0_original_PROPOSED.sql", pc1: "12a_POSTCHECKS_S1_after-step1_PROPOSED.sql", pc2: "12a_POSTCHECKS_S2_after-step2_PROPOSED.sql" };
const md5 = (s) => createHash("md5").update(s).digest("hex");
const tok = (label) => md5("12a-fixture-token-" + label);
const SENT_EMAIL = "sentinel.buyer.9f3k@example.invalid", SENT_HANDLE = "sentinel_buyer_handle_9f3k";
const U = { OWN: "a0000000-0000-4000-8000-0000000000a1", OTH: "a0000000-0000-4000-8000-0000000000a2", NOH: "a0000000-0000-4000-8000-0000000000a3", EMP: "a0000000-0000-4000-8000-0000000000a4" };
const WHO = { owner: ["authenticated", U.OWN], other: ["authenticated", U.OTH], noh: ["authenticated", U.NOH], emp: ["authenticated", U.EMP], anon: ["anon", ""], service: ["service_role", ""] };
const SIG = { scan: "public.event_checkin_scan(text)", ticket: "public.check_in_ticket(text)", core: "private.door_checkin_core(text)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);

/* ------------------------------------------------------------------ fixtures */
const T = { paid1: tok("paid1"), paid2: tok("paid2"), refunded: tok("refunded"), cancelled: tok("cancelled"), pending: tok("pending"), statusci: tok("statusci"), replayed: tok("replayed"),
  nullowner: tok("nullowner"), emptyowner: tok("emptyowner"), notier: tok("notier"), dup: tok("dup"), upper: tok("upper").toUpperCase(), other: tok("other"), race: tok("race"), stress: tok("stress"), noh: tok("noh") };
const FIXTURE_SQL = `
insert into public.app_users(id,handle,email) values ('${U.OWN}','DoorOwner','door.owner@example.invalid'),('${U.OTH}','someoneelse','other@example.invalid'),('${U.EMP}','','empty@example.invalid');
insert into public.events(id,slug,title,owner_handle) values (1,'doors-open','Doors Open Night','DoorOwner'),(2,'null-owner','Null Owner Show',null),(3,'empty-owner','Empty Owner Show',''),(4,'other-show','Other Show','someoneelse');
insert into public.ticket_tiers(id,event_id,name,price_cents) values (1,1,'VIP',5000);
insert into public.event_orders(id,event_id,tier_id,buyer_email,buyer_handle,qty,qr_token,status,amount_cents,checked_in_at) values
 (1,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',2,'${T.paid1}','paid',10000,null),
 (2,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.paid2}','paid',5000,null),
 (3,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.refunded}','refunded',5000,null),
 (4,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.cancelled}','cancelled',5000,null),
 (5,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.pending}','pending',5000,null),
 (6,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.statusci}','checked_in',5000,'2026-01-01 10:00:00+00'),
 (7,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.replayed}','paid',5000,'2026-01-01 11:00:00+00'),
 (8,2,null,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.nullowner}','paid',0,null),
 (9,3,null,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.emptyowner}','paid',0,null),
 (10,1,null,'${SENT_EMAIL}','${SENT_HANDLE}',3,'${T.notier}','paid',0,null),
 (11,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.dup}','paid',5000,null),
 (12,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.dup}','paid',5000,null),
 (13,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.upper}','paid',5000,null),
 (14,4,null,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.other}','paid',0,null),
 (15,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.race}','paid',5000,null),
 (16,1,1,'${SENT_EMAIL}','${SENT_HANDLE}',1,'${T.stress}','paid',5000,null);
select setval(pg_get_serial_sequence('public.events','id'), 100), setval(pg_get_serial_sequence('public.event_orders','id'), 1000);`;

/* ------------------------------------------------------------------ worlds */
let tplOrig = null, tplHard = null;
const open = [];
async function mkWorld(tpl) {
  const db = await PG.createDb(tpl); open.push(db);
  const w = { db, name: db.name, extras: [], q: (s, p) => db.client.query(s, p), async close() { for (const c of w.extras) await c.disconnect(); await db.close(); const i = open.indexOf(db); if (i >= 0) open.splice(i, 1); } };
  w.conn = async (user) => { const c = await PG.newClient(db.name, user); w.extras.push(c); return c; };
  w.auth = await w.conn("authenticator");
  return w;
}
async function req(c, role, sub, sql, params = [], pre = "") {
  await c.client.query("BEGIN");
  try {
    await c.client.query("SET LOCAL ROLE " + role);
    await c.client.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role',$2,true)", [sub || "", role]);
    if (pre) await c.client.query(pre);
    const r = await c.client.query(sql, params); await c.client.query("COMMIT");
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (e) { try { await c.client.query("ROLLBACK"); } catch {} return { err: String(e.message), code: e.code }; }
}
const NORM = { valid: "admitted", already: "already_used", notpaid: "unpaid", notyours: "forbidden", notfound: "invalid", unauth: "unauth" };
const wrap = (w, fn) => ({
  fn, w,
  async call(who, token, o = {}) {
    const [role, sub] = WHO[who]; const c = o.conn || w.auth;
    const r = await req(c, role, sub, call_(fn), [token], o.pre);
    return this.shape(r);
  },
  shape(r) {
    if (r.err) return { code: "error", err: r.err, errcode: r.code, raw: null };
    const j = r.rows[0].j; const code = fn === "scan" ? j.result : NORM[j.status] || "?" + j.status;
    return { code, raw: j, json: JSON.stringify(j) };
  },
  async state(id) { return (await w.q("select status, qty, checked_in_at, qr_token from public.event_orders where id=$1", [id])).rows[0]; },
  async admittedCount() { return (await w.q("select count(*)::int n from public.event_orders where checked_in_at is not null and id in (1,2,3,4,5,8,9,10,11,12,13,14,15,16)")).rows[0].n; },
});
const FNQ = { scan: "public.event_checkin_scan", ticket: "public.check_in_ticket", core: "private.door_checkin_core" };
const call_ = (fn) => `select ${FNQ[fn]}($1) as j`;
async function callRaw(ctx, who, token, o = {}) { const [role, sub] = WHO[who]; const r = await req(o.conn || ctx.w.auth, role, sub, call_(ctx.fn), [token], o.pre); return ctx.shape(r); }

/* ------------------------------------------------------------------ harness */
const results = [];     // behavioural matrix rows
const packRows = [];    // pack / structural rows
const adjRows = [];     // adjacent findings rows
const want = (id) => !only || id.startsWith(only);

async function matrix(id, name, ctrl, fn, fns = ["scan", "ticket"]) {
  for (const f of fns) {
    const rid = fns.length > 1 ? `${id}.${f}` : id; if (!want(rid)) continue;
    const exp = typeof ctrl === "string" ? ctrl : ctrl[f];
    const outcome = {};
    for (const [variant, tpl] of [["hardened", tplHard], ["original", tplOrig]]) {
      if (variant === "original" && exp === "n/a") { outcome.original = { skipped: true }; continue; }
      const w = await mkWorld(tpl); const ctx = wrap(w, f);
      let ok = false, why = "";
      try { const v = await fn(ctx, variant); ok = v === true; if (!ok) why = typeof v === "string" ? v : "returned " + JSON.stringify(v); } catch (e) { why = "threw: " + String(e.message || e).slice(0, 300); }
      outcome[variant] = { pass: ok, why }; await w.close();
    }
    const h = outcome.hardened.pass, o = outcome.original;
    const controlOK = exp === "n/a" ? null : exp === "detects" ? o.pass === false : o.pass === true;
    results.push({ id: rid, name, fn: f, hardened: h, hardenedWhy: outcome.hardened.why, original: o.skipped ? "n/a" : o.pass, originalWhy: o.why || "", control: exp, controlOK });
    console.log(`${h && controlOK !== false ? "PASS" : "FAIL"} ${rid} ${name} | hardened=${h} original=${o.skipped ? "n/a" : o.pass} (control: ${exp}${controlOK === false ? " NOT MET" : ""})`);
  }
}
async function structural(id, name, fn, rows = packRows) {
  if (!want(id)) return; let ok = false, why = "";
  try { const v = await fn(); ok = v === true; if (!ok) why = typeof v === "string" ? v : "returned " + JSON.stringify(v); } catch (e) { why = "threw: " + String(e.message || e).slice(0, 400); }
  rows.push({ id, name, pass: ok, why }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${ok ? "" : " :: " + why}`);
}

/* pack runner: returns {ok, err, rows(last result set with rows)} */
async function runPack(c, sql) {
  try { const r = await c.query(sql); const arr = Array.isArray(r) ? r : [r]; const rows = [...arr].reverse().find((x) => x.rows && x.rows.length && x.fields && x.fields.some((f) => f.name === "ok")); return { ok: true, rows: rows ? rows.rows : [] }; }
  catch (e) { try { await c.query("ROLLBACK"); } catch {} return { ok: false, err: String(e.message), code: e.code }; }
}
const allOk = (rows) => rows.length > 0 && rows.every((r) => r.ok === true);
const hold = (sql, secs) => { const i = sql.lastIndexOf("COMMIT;"); return sql.slice(0, i) + `SELECT pg_sleep(${secs}); ` + sql.slice(i); };
async function drift(w) { const r = await w.q(rd("packs", PACK.drift) .replace(/^--.*$/gm, "")); const rows = (Array.isArray(r) ? r.find((x) => x.rows.length) : r).rows; return rows[0].actual; }
const catFp = async (w) => { const r = await w.q(`select jsonb_build_object(
  'defs', (select jsonb_object_agg(s, pg_get_functiondef(to_regprocedure(s))) from unnest(array['${SIG.scan}','${SIG.ticket}']) s),
  'md5', (select jsonb_object_agg(p.oid::regprocedure::text, md5(p.prosrc)) from pg_proc p where p.proname in ('event_checkin_scan','check_in_ticket','door_checkin_core')),
  'cfg', (select jsonb_object_agg(p.oid::regprocedure::text, p.proconfig) from pg_proc p where p.proname in ('event_checkin_scan','check_in_ticket','door_checkin_core')),
  'acl_sorted', (select jsonb_object_agg(p.oid::regprocedure::text, ${aclSorted("p.proacl")}) from pg_proc p where p.proname in ('event_checkin_scan','check_in_ticket','door_checkin_core')),
  'acl_raw', (select jsonb_object_agg(p.oid::regprocedure::text, p.proacl::text) from pg_proc p where p.proname in ('event_checkin_scan','check_in_ticket','door_checkin_core')),
  'owner', (select jsonb_object_agg(p.oid::regprocedure::text, pg_get_userbyid(p.proowner)) from pg_proc p where p.proname in ('event_checkin_scan','check_in_ticket','door_checkin_core')),
  'schemas', (select jsonb_agg(nspname order by nspname) from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema'),
  'user_funcs', (select count(*) from pg_proc where pronamespace not in (select oid from pg_namespace where nspname in ('pg_catalog','information_schema'))),
  'data', (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from public.event_orders t)) j`); return r.rows[0].j; };
const same = (a, b, skip = []) => { const A = { ...a }, B = { ...b }; for (const k of skip) { delete A[k]; delete B[k]; } return JSON.stringify(A) === JSON.stringify(B); };

/* ------------------------------------------------------------------ main */
let rolesMine = false;
async function main() {
  await PG.ensureRoles(); rolesMine = true;
  /* template (original) database: replica + captured ORIGINAL function bodies + captured ACLs + fixtures */
  const base = await PG.createDb(null); open.push(base);
  const c = base.client;
  await c.query(rd("proof", "replica.sql"));
  await c.query(ORIG.ticket); await c.query(ORIG.scan);
  await c.query("REVOKE ALL ON FUNCTION public.check_in_ticket(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.check_in_ticket(text) TO anon, authenticated, service_role;");
  await c.query("REVOKE ALL ON FUNCTION public.event_checkin_scan(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.event_checkin_scan(text) TO authenticated, service_role;");
  await c.query(FIXTURE_SQL);
  tplOrig = (await PG.snapshotDb(base)).pgTemplate;
  /* hardened template: the REAL packs applied to a clone of the original */
  const hdb = await PG.createDb(tplOrig); open.push(hdb);
  const r1 = await runPack(hdb.client, PK(PACK.a1)), r2 = await runPack(hdb.client, PK(PACK.a2));
  if (!r1.ok || !r2.ok || !allOk(r1.rows) || !allOk(r2.rows)) throw new Error("hardened template build failed: " + JSON.stringify({ r1: r1.err, r2: r2.err }));
  tplHard = (await PG.snapshotDb(hdb)).pgTemplate; await hdb.close(); open.splice(open.indexOf(hdb), 1);

  /* ============================ A. behavioural matrix (hardened vs original control) ============================ */
  await matrix("M01", "raw token admits once (owner, paid order)", "baseline", async (x) => { const r = await x.call("owner", T.paid1); const s = await x.state(1); return adm(r) && s.checked_in_at !== null || JSON.stringify([r, s]); });
  await matrix("M01b", "admit response carries event title, tier name, qty and checked_in_at", "detects", async (x) => { const r = await x.call("owner", T.paid1); const j = r.raw;
    const ev = x.fn === "scan" ? j.event_title : j.event, at = x.fn === "scan" ? j.checked_in_at : j.at; return (adm(r) && ev === "Doors Open Night" && j.tier === "VIP" && j.qty === 2 && !!at) || JSON.stringify(j); });
  await matrix("M02", "'KIL-' prefixed token admits", { scan: "detects", ticket: "baseline" }, async (x) => adm(await x.call("owner", "KIL-" + T.paid1)) || "not admitted");
  await matrix("M03", "'kil-' / 'Kil-' (case-insensitive prefix) admits", { scan: "detects", ticket: "baseline" }, async (x) => { const a = await x.call("owner", "kil-" + T.paid1), b = await x.call("owner", "Kil-" + T.paid2); return (adm(a) && adm(b)) || JSON.stringify([a.code, b.code]); });
  await matrix("M04", "surrounding whitespace/newlines are trimmed (' \\tKIL-<token>\\n ')", "detects", async (x) => adm(await x.call("owner", " \tKIL-" + T.paid1 + "\n ")) || "not admitted");
  await matrix("M05", "second scan of the same ticket = already_used, admission time unchanged", "baseline", async (x) => { const a = await x.call("owner", T.paid1); const t1 = (await x.state(1)).checked_in_at; await sleep(30); const b = await x.call("owner", T.paid1); const t2 = (await x.state(1)).checked_in_at;
    return (adm(a) && b.code === "already_used" && +t1 === +t2) || JSON.stringify([a.code, b.code, t1, t2]); });
  await matrix("M05b", "an order already admitted before (replay) is already_used and keeps its original time", "baseline", async (x) => { const b = await x.call("owner", T.replayed); const s = await x.state(7); return (b.code === "already_used" && s.checked_in_at.toISOString() === "2026-01-01T11:00:00.000Z") || JSON.stringify(b.code); });
  await matrix("M06", "two concurrent scans (two real connections, row-lock handshake) -> exactly one admission", "baseline", async (x) => (await race(x, T.race, 15)));
  await matrix("M07", "ten concurrent scans of one ticket -> exactly one admitted", "baseline", async (x) => {
    const cs = []; for (let i = 0; i < 10; i++) cs.push(await x.w.conn("authenticator")); const rs = await Promise.all(cs.map((cn) => callRaw(x, "owner", T.stress, { conn: cn })));
    const n = rs.filter(adm).length, st = await x.state(16); return (n === 1 && st.checked_in_at !== null && rs.every((r) => r.code === "admitted" || r.code === "already_used")) || JSON.stringify(rs.map((r) => r.code)); });
  await matrix("M08", "refunded / cancelled / pending orders are refused (unpaid) and never admitted", "baseline", async (x) => {
    const r = [await x.call("owner", T.refunded), await x.call("owner", T.cancelled), await x.call("owner", T.pending)]; const none = (await Promise.all([3, 4, 5].map((i) => x.state(i)))).every((s) => s.checked_in_at === null);
    return (r.every((y) => y.code === "unpaid") && none) || JSON.stringify(r.map((y) => y.code)); });
  await matrix("M08b", "status 'checked_in' is refused as already_used (never re-admitted)", "detects", async (x) => { const r = await x.call("owner", T.statusci); const s = await x.state(6); return (r.code === "already_used" && s.status === "checked_in") || JSON.stringify(r.code); });
  await matrix("M09", "unknown token refused (invalid), nothing admitted", "baseline", async (x) => { const r = await x.call("owner", tok("nope")); return (r.code === "invalid" && (await x.admittedCount()) === 0) || r.code; });
  await matrix("M10", "empty / whitespace / null / 'KIL-' only refused, nothing admitted", "baseline", async (x) => { const rs = []; for (const t of ["", "   ", null, "KIL-", "kil- "]) rs.push(await x.call("owner", t)); return (rs.every((r) => r.code === "empty" || r.code === "invalid") && (await x.admittedCount()) === 0) || JSON.stringify(rs.map((r) => r.code)); });
  await matrix("M11", "non-owner refused (forbidden) both ways; nothing admitted", "baseline", async (x) => { const a = await x.call("other", T.paid1), b = await x.call("owner", T.other); return (a.code === "forbidden" && b.code === "forbidden" && (await x.admittedCount()) === 0) || JSON.stringify([a.code, b.code]); });
  await matrix("M12", "NULL-OWNER HOLE: signed-in caller with NO app_users handle vs event with NULL owner_handle is refused", { scan: "baseline", ticket: "detects" }, async (x) => { const r = await x.call("noh", T.nullowner); const s = await x.state(8); return (r.code === "forbidden" && s.checked_in_at === null) || "code=" + r.code + " admitted_in_db=" + (s.checked_in_at !== null); });
  await matrix("M12b", "no-handle caller vs a normally owned event is refused", "baseline", async (x) => { const r = await x.call("noh", T.paid1); return r.code === "forbidden" || r.code; });
  await matrix("M13", "EMPTY-STRING handle caller vs event with '' owner_handle is refused (original ADMITS on both functions)", "detects", async (x) => { const r = await x.call("emp", T.emptyowner); const s = await x.state(9); return (r.code === "forbidden" && s.checked_in_at === null) || "code=" + r.code; });
  await matrix("M14", "owner handle match is case-insensitive (event owner DoorOwner vs caller handle DOOROWNER); the ORIGINAL check_in_ticket compares case-sensitively", { scan: "baseline", ticket: "detects" }, async (x) => { await x.w.q("update public.app_users set handle='DOOROWNER' where id=$1", [U.OWN]); return adm(await x.call("owner", T.paid1)) || "not admitted"; });
  await matrix("M15", "duplicated qr_token (no UNIQUE constraint) is refused as ambiguous, never guessed", "detects", async (x) => { const r = await x.call("owner", T.dup); const n = (await x.w.q("select count(*)::int n from public.event_orders where qr_token=$1 and checked_in_at is not null", [T.dup])).rows[0].n; return (r.code === "invalid" && n === 0) || "code=" + r.code + " admitted_rows=" + n; });
  await matrix("M16", "token match is exact (stored UPPERCASE hex admits as stored; lowercased copy is invalid) - documented behaviour, same as original", "baseline", async (x) => { const a = await x.call("owner", T.upper.toLowerCase()); const b = await x.call("owner", T.upper); return (a.code === "invalid" && adm(b)) || JSON.stringify([a.code, b.code]); });
  await matrix("M17", "stale token: after the token is rotated the old one is invalid and the new one admits", "baseline", async (x) => { await x.w.q("update public.event_orders set qr_token=$1 where id=1", [tok("rotated")]); const a = await x.call("owner", T.paid1); const b = await x.call("owner", tok("rotated")); return (a.code === "invalid" && adm(b)) || JSON.stringify([a.code, b.code]); });
  await matrix("M18", "REFUND RACE: a refund committing while a scan waits on the row is NOT overridden (stays unpaid, not admitted)", "detects", async (x) => {
    const a = await x.w.conn("postgres"); await a.client.query("BEGIN"); await a.client.query("update public.event_orders set status='refunded' where id=15");
    const b = await x.w.conn("authenticator"); const pid = (await b.client.query("select pg_backend_pid() p")).rows[0].p;
    const pb = callRaw(x, "owner", T.race, { conn: b }); const waited = await waitLock(pid); await a.client.query("COMMIT"); const rb = await pb; const s = await x.state(15);
    return (waited && rb.code === "unpaid" && s.checked_in_at === null) || JSON.stringify({ waited, code: rb.code, admitted: s.checked_in_at !== null }); });
  await matrix("M19", "anon: no EXECUTE and a call is refused (42501)", { scan: "baseline", ticket: "detects" }, async (x) => { const p = (await x.w.q(`select has_function_privilege('anon','${SIG[x.fn]}','EXECUTE') v`)).rows[0].v; const r = await x.call("anon", T.paid1); return (p === false && r.errcode === "42501" && (await x.admittedCount()) === 0) || JSON.stringify({ p, code: r.code, errcode: r.errcode }); });
  await matrix("M20", "no PUBLIC EXECUTE; sorted ACL is exactly {authenticated, postgres, service_role}", { scan: "baseline", ticket: "detects" }, async (x) => { const a = (await x.w.q(`select ${aclSorted("p.proacl")} a from pg_proc p where p.oid='${SIG[x.fn]}'::regprocedure`)).rows[0].a; return a === "{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}" || a; });
  await matrix("M21", "service_role (no JWT subject) executes but is refused (unauth/forbidden/invalid) and admits nothing", "baseline", async (x) => { const r = await x.call("service", T.paid1); return (r.code !== "admitted" && r.code !== "error" && (await x.admittedCount()) === 0) || JSON.stringify(r.code); });
  await matrix("M22", "NO attendee contact: responses never contain the buyer email / buyer handle / any 'buyer' key / '@' (all result codes, owner and non-owner callers)", "detects", async (x) => {
    const sc = []; sc.push(await x.call("owner", T.paid1), await x.call("owner", T.paid1), await x.call("owner", T.refunded), await x.call("owner", T.statusci), await x.call("other", T.paid2), await x.call("owner", tok("nope")), await x.call("owner", ""), await x.call("noh", T.paid2));
    const bad = sc.filter((r) => !r.json || r.json.includes(SENT_EMAIL) || r.json.includes(SENT_HANDLE) || r.json.includes("@") || /buyer|email|phone|handle/i.test(Object.keys(r.raw || {}).join(",")));
    const allowed = x.fn === "scan" ? ["ok", "result", "message", "event_title", "tier", "qty", "checked_in_at"] : ["status", "event", "tier", "qty", "checked_in", "sold", "at", "order_status"];
    const extra = sc.flatMap((r) => Object.keys(r.raw || {})).filter((k) => !allowed.includes(k));
    return (bad.length === 0 && extra.length === 0 && sc.some(adm) && sc.length === 8) || JSON.stringify({ bad: bad.map((b) => b.json), extra }); });
  await matrix("M23", "functions are SECURITY DEFINER with search_path set to empty (catalog)", "detects", async (x) => { const r = (await x.w.q(`select p.prosecdef, coalesce((select string_agg(c,',') from unnest(p.proconfig) c),'') cfg from pg_proc p where p.oid='${SIG[x.fn]}'::regprocedure`)).rows[0]; return (r.prosecdef === true && r.cfg === 'search_path=""') || JSON.stringify(r); });
  await matrix("M24", "search_path hijack: caller path 'evil, public' with look-alike tables never reaches the function", "baseline", async (x) => hijack(x, "evil"));
  await matrix("M25", "private core is not reachable: no EXECUTE/USAGE for anon, authenticated, service_role; direct call refused", "n/a", async (x) => {
    const g = (await x.w.q(`select has_function_privilege('anon','${SIG.core}','EXECUTE') a, has_function_privilege('authenticated','${SIG.core}','EXECUTE') b, has_function_privilege('service_role','${SIG.core}','EXECUTE') c, has_schema_privilege('anon','private','USAGE') d, has_schema_privilege('authenticated','private','USAGE') e, has_schema_privilege('service_role','private','USAGE') f`)).rows[0];
    const r = await req(x.w.auth, "authenticated", U.OWN, `select ${FNQ.core}($1) j`, [T.paid1]); const r2 = await req(x.w.auth, "anon", "", `select ${FNQ.core}($1) j`, [T.paid1]);
    return (Object.values(g).every((v) => v === false) && r.errcode === undefined && r.code === "42501" && r2.code === "42501" && (await x.admittedCount()) === 0) || JSON.stringify({ g, r: r.code, r2: r2.code }); }, ["core"]);
  await matrix("M26", "response codes: ticket keeps its legacy keys (status,event,tier,qty,checked_in,sold,at) minus 'buyer'", "detects", async (x) => { const r = await x.call("owner", T.paid1); const k = Object.keys(r.raw).sort().join(","); return (k === "at,checked_in,event,qty,sold,status,tier") || k; }, ["ticket"]);
  await matrix("M27", "ticket counters: checked_in/sold are aggregate counts for the event's paid orders", "baseline", async (x) => { await x.call("owner", T.paid1); const r = await x.call("owner", T.paid2); return (adm(r) && r.raw.checked_in === 3 && r.raw.sold === 9) || JSON.stringify(r.raw); }, ["ticket"]);

  /* ---- detector self-checks: mutated hardened code MUST make the concurrency / refund / hijack tests fail (proves the tests can fail) ---- */
  const mut = async (id, name, from, to, test) => structural(id, name, async () => {
    const w = await mkWorld(tplHard); try { const s = HARD.core.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"); if (!s.includes(from)) throw new Error("anchor missing"); await w.q(s.replace(from, to)); const x = wrap(w, "scan"); const v = await test(x); return v !== true ? true : "the detector did NOT detect the mutation"; } finally { await w.close(); } });
  await mut("D01", "detector: core WITHOUT 'and eo.checked_in_at is null' lets two concurrent scans both admit (race test fails as it should)", "       and eo.checked_in_at is null\n", "", (x) => race(x, T.race, 15));
  await mut("D02", "detector: core WITHOUT status='paid' in the UPDATE admits an order refunded mid-scan (M18 fails as it should)", "       and eo.status = 'paid'\n", "", async (x) => {
    const a = await x.w.conn("postgres"); await a.client.query("BEGIN"); await a.client.query("update public.event_orders set status='refunded' where id=15"); const b = await x.w.conn("authenticator"); const pid = (await b.client.query("select pg_backend_pid() p")).rows[0].p;
    const pb = callRaw(x, "owner", T.race, { conn: b }); await waitLock(pid); await a.client.query("COMMIT"); const rb = await pb; return rb.code === "unpaid" || "admitted a refunded order"; });
  await structural("D03", "detector: an UNQUALIFIED, no-SET-search_path copy of the core IS hijacked by 'evil, public' (the M24 test fails as it should); the hardened functions are not", async () => {
    const w = await mkWorld(tplHard); try {
      const ctl = HARD.core.replace("private.door_checkin_core", "ctl_unqualified").replace("\n SET search_path TO ''", "").replace(/public\./g, ""); await w.q(ctl); await w.q("grant execute on function public.ctl_unqualified(text) to authenticated");
      const x = wrap(w, "scan"); await plantEvil(w);
      const rc = await req(w.auth, "authenticated", U.NOH, "select public.ctl_unqualified($1) j", [tok("evil")], "set local search_path = evil, public");
      const rh = await callRaw(x, "noh", tok("evil"), { pre: "set local search_path = evil, public" });
      return (rc.rows && rc.rows[0].j.code === "admitted" && rh.code === "invalid") || JSON.stringify({ control: rc.rows ? rc.rows[0].j : rc.err, hardened: rh.code }); } finally { await w.close(); } });

  /* ============================ B. packs ============================ */
  await structural("P01", "static: every APPLY/ROLLBACK pack = ONE BEGIN, SET LOCAL lock_timeout 5s then advisory lock 2979301232487107403 then SET LOCAL lock_timeout 5s as the exact statements 2-4 after it (tightened from: lock is statement 2), one COMMIT last, drift guard, no data DML, no secrets", async () => {
    for (const n of [PACK.a1, PACK.a2, PACK.r2, PACK.r1]) { const s = PK(n); const code = s.replace(/^\s*--.*$/gm, "");
      const stmts = code.split(/;[ \t]*\r?\n/).map((t) => t.trim()).filter(Boolean);
      if (stmts[0] !== "BEGIN") return n + ": first statement is not BEGIN"; if (stmts[1] !== "SET LOCAL lock_timeout = '5s'" || stmts[2] !== `SELECT pg_advisory_xact_lock(${REPO_PACK_KEY})` || stmts[3] !== "SET LOCAL lock_timeout = '5s'") return n + ": statements 2-4 are not timeout/lock/timeout: " + stmts.slice(1, 4).map((t) => t.slice(0, 50)).join(" | ");
      if (stmts[stmts.length - 1] !== "COMMIT") return n + ": last statement is not COMMIT";
      if ((code.match(/^BEGIN;/gm) || []).length !== 1 || (code.match(/^COMMIT;/gm) || []).length !== 1) return n + ": BEGIN/COMMIT count";
      if (/\b(TRUNCATE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+public\.|DROP\s+TABLE|ALTER\s+TABLE|CREATE\s+POLICY|DROP\s+POLICY)\b/i.test(code.replace(/\$function\$[\s\S]*?\$function\$/g, ""))) return n + ": touches tables/data outside function bodies";
      if (!/DRIFT, ABORT/.test(s)) return n + ": no drift guard"; if (/password|secret|api[_-]?key|service_role_key|eyJ/i.test(s.replace(/service_role/g, ""))) return n + ": secret-looking text"; }
    return true; });
  await structural("P02", "generator is reproducible: build.mjs --check is clean (packs == inputs)", async () => { const files = buildAll(); for (const [n, s] of files) if (PK(n) !== s) return "drift in " + n; return files.size === 8 || "file count " + files.size; });
  await structural("P03", "replica sanity: the installed ORIGINAL functions equal the captured prod text (pg_get_functiondef == facts) and DRIFT_QUERY/POSTCHECKS(S0) read S0_original", async () => {
    const w = await mkWorld(tplOrig); try { const d1 = (await w.q(`select pg_get_functiondef('${SIG.ticket}'::regprocedure) d`)).rows[0].d, d2 = (await w.q(`select pg_get_functiondef('${SIG.scan}'::regprocedure) d`)).rows[0].d;
      if (d1.trimEnd() !== ORIG.ticket.trimEnd() || d2.trimEnd() !== ORIG.scan.trimEnd()) return "captured text != pg_get_functiondef";
      const st = await drift(w); const pc = await runPack(w.db.client, PK(PACK.pc0)); return (st === "S0_original" && pc.ok && allOk(pc.rows)) || JSON.stringify({ st, pc: pc.err }); } finally { await w.close(); } });
  await structural("P04", "APPLY-01 on the original: succeeds, retained SELECT all ok, state S1, POSTCHECKS(S1) ok; check_in_ticket still original", async () => {
    const w = await mkWorld(tplOrig); try { const r = await runPack(w.db.client, PK(PACK.a1)); if (!r.ok) return r.err; const st = await drift(w); const pc = await runPack(w.db.client, PK(PACK.pc1));
      const t = (await w.q(`select md5(prosrc) m from pg_proc where oid='${SIG.ticket}'::regprocedure`)).rows[0].m;
      return (allOk(r.rows) && r.rows.length > 20 && st === "S1_after-step1" && pc.ok && allOk(pc.rows) && t === MD5.origTicket) || JSON.stringify({ st, n: r.rows.length }); } finally { await w.close(); } });
  await structural("P05", "APPLY-02 after 01: succeeds, state S2, POSTCHECKS(S2) ok", async () => {
    const w = await mkWorld(tplOrig); try { const a = await runPack(w.db.client, PK(PACK.a1)), b = await runPack(w.db.client, PK(PACK.a2)); const st = await drift(w); const pc = await runPack(w.db.client, PK(PACK.pc2)); return (a.ok && b.ok && allOk(b.rows) && st === "S2_after-step2" && pc.ok && allOk(pc.rows)) || JSON.stringify({ a: a.err, b: b.err, st }); } finally { await w.close(); } });
  await structural("P06", "apply order is enforced: APPLY-02 on the original (core absent) refuses with DRIFT and changes nothing", async () => {
    const w = await mkWorld(tplOrig); try { const f0 = await catFp(w); const r = await runPack(w.db.client, PK(PACK.a2)); const f1 = await catFp(w); return (!r.ok && /DRIFT, ABORT/.test(r.err) && same(f0, f1)) || JSON.stringify(r); } finally { await w.close(); } });
  await structural("P07", "second run refuses cleanly: APPLY-01 twice and APPLY-02 twice (DRIFT, nothing changed)", async () => {
    const w = await mkWorld(tplOrig); try { await runPack(w.db.client, PK(PACK.a1)); const f1 = await catFp(w); const x = await runPack(w.db.client, PK(PACK.a1)); await runPack(w.db.client, PK(PACK.a2)); const f2 = await catFp(w); const y = await runPack(w.db.client, PK(PACK.a2)); const f3 = await catFp(w);
      return (!x.ok && /DRIFT, ABORT/.test(x.err) && !y.ok && /DRIFT, ABORT/.test(y.err) && same(f1, f1) && same(f2, f3)) || JSON.stringify({ x: x.err, y: y.err }); } finally { await w.close(); } });
  const driftCases = [
    ["scan body altered (comment appended)", async (w) => w.q((await w.q(`select pg_get_functiondef('${SIG.scan}'::regprocedure) d`)).rows[0].d.replace(/end \$function\$/, "end -- tampered\n$function$"))],
    ["scan ACL changed (anon granted)", (w) => w.q(`grant execute on function ${SIG.scan} to anon`)],
    ["scan search_path changed", (w) => w.q(`alter function ${SIG.scan} set search_path = public, pg_temp`)],
    ["schema private already exists", (w) => w.q("create schema private")],
    ["event_orders policy dropped", (w) => w.q("drop policy orders_anon_insert on public.event_orders")],
    ["event_orders policy added", (w) => w.q("create policy extra_p on public.event_orders for select to anon using (false)")],
    ["event_orders column added", (w) => w.q("alter table public.event_orders add column note text")],
    ["event_orders table ACL narrowed (TRUNCATE revoked from anon)", (w) => w.q("revoke truncate on public.event_orders from anon")],
    ["event_orders CHECK changed (extra status value)", (w) => w.q("alter table public.event_orders drop constraint event_orders_status_check, add constraint event_orders_status_check check (status in ('pending','paid','checked_in','refunded','cancelled','void'))")],
    ["event_orders trigger added", (w) => w.q("create function public.t_noop() returns trigger language plpgsql as $$ begin return new; end $$; create trigger t_x before update on public.event_orders for each row execute function public.t_noop()")],
    ["event_orders UNIQUE constraint added", (w) => w.q("alter table public.event_orders add constraint u_stripe unique (stripe_session_id)")],
  ];
  for (const [i, [name, mutateFn]] of driftCases.entries()) await structural("P08." + (i + 1), "drift guard aborts APPLY-01 when: " + name, async () => {
    const w = await mkWorld(tplOrig); try { await mutateFn(w); const f0 = await catFp(w); const r = await runPack(w.db.client, PK(PACK.a1)); const f1 = await catFp(w); return (!r.ok && /DRIFT, ABORT/.test(r.err) && same(f0, f1)) ? true : "ok=" + r.ok + " " + (r.err || "").slice(0, 160); } finally { await w.close(); } });
  await structural("P08.12", "drift guard aborts APPLY-01 when run by a role other than postgres", async () => {
    const w = await mkWorld(tplOrig); try { const adm = await w.conn("pgadmin"); const r = await runPack(adm.client, PK(PACK.a1)); return (!r.ok && /run as postgres/.test(r.err)) || JSON.stringify(r.err); } finally { await w.close(); } });
  await structural("P08.13", "drift guard aborts APPLY-02 when check_in_ticket body drifted (after step 1)", async () => {
    const w = await mkWorld(tplOrig); try { await runPack(w.db.client, PK(PACK.a1)); await w.q((await w.q(`select pg_get_functiondef('${SIG.ticket}'::regprocedure) d`)).rows[0].d.replace(/end;\n\$function\$/, "end;\n-- x\n$function$")); const f0 = await catFp(w); const r = await runPack(w.db.client, PK(PACK.a2)); return (!r.ok && /DRIFT, ABORT/.test(r.err) && same(f0, await catFp(w))) || JSON.stringify(r.err); } finally { await w.close(); } });
  await structural("P08.14", "drift guard aborts APPLY-02 when the core was tampered with", async () => {
    const w = await mkWorld(tplOrig); try { await runPack(w.db.client, PK(PACK.a1)); await w.q(HARD.core.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION").replace("'invalid')\n  end if;\n\n  select o2.id", "'invalid')\n  end if; -- x\n\n  select o2.id").replace("return pg_catalog.jsonb_build_object('code', 'unauth');", "return pg_catalog.jsonb_build_object('code', 'unauth'); ")); const r = await runPack(w.db.client, PK(PACK.a2)); return (!r.ok && /DRIFT, ABORT/.test(r.err)) || JSON.stringify(r.err); } finally { await w.close(); } });
  await structural("P09", "ROLLBACK restores the captured originals EXACTLY: byte-identical pg_get_functiondef and prosrc, equal sorted ACL, config, owner; private schema and core gone; data untouched", async () => {
    const w = await mkWorld(tplOrig); try { const f0 = await catFp(w); const a = await runPack(w.db.client, PK(PACK.a1)), b = await runPack(w.db.client, PK(PACK.a2)); const mid = await catFp(w); if (same(f0, mid)) return "apply changed nothing?";
      if (mid.data !== f0.data) return "apply touched order data";
      const rb2 = await runPack(w.db.client, PK(PACK.r2)), rb1 = await runPack(w.db.client, PK(PACK.r1)); const f1 = await catFp(w); const st = await drift(w);
      const rawEq = JSON.stringify(f0.acl_raw) === JSON.stringify(f1.acl_raw);
      packNotes.rawAclEqual = rawEq;
      return (a.ok && b.ok && rb2.ok && rb1.ok && allOk(rb2.rows) && allOk(rb1.rows) && same(f0, f1, ["acl_raw"]) && st === "S0_original" && f1.defs[SIG.scan] === f0.defs[SIG.scan] && f1.defs[SIG.ticket] === f0.defs[SIG.ticket]) || JSON.stringify({ a: a.err, b: b.err, rb2: rb2.err, rb1: rb1.err, st, eq: same(f0, f1, ["acl_raw"]) }); } finally { await w.close(); } });
  await structural("P10", "rollback order is enforced and rollback has its own drift guard", async () => {
    const w = await mkWorld(tplOrig); try { await runPack(w.db.client, PK(PACK.a1)); await runPack(w.db.client, PK(PACK.a2)); const f0 = await catFp(w); const r = await runPack(w.db.client, PK(PACK.r1)); const f1 = await catFp(w);
      const ok1 = !r.ok && /DRIFT, ABORT/.test(r.err) && same(f0, f1);
      await w.q((await w.q(`select pg_get_functiondef('${SIG.ticket}'::regprocedure) d`)).rows[0].d.replace(/end;\n\$function\$/, "end;\n-- x\n$function$")); const r2 = await runPack(w.db.client, PK(PACK.r2));
      return (ok1 && !r2.ok && /DRIFT, ABORT/.test(r2.err)) || JSON.stringify({ r: r.err, r2: r2.err }); } finally { await w.close(); } });
  await structural("P11", "advisory lock serialises two runs: B waits on the advisory lock while A holds the transaction open, then B refuses cleanly (DRIFT); end state S1", async () => {
    const w = await mkWorld(tplOrig); try { const a = await w.conn("postgres"), b = await w.conn("postgres"); const pidB = (await b.client.query("select pg_backend_pid() p")).rows[0].p;
      const pa = runPack(a.client, hold(PK(PACK.a1), 3)); await sleep(600); const t0 = performance.now(); const pb = runPack(b.client, PK(PACK.a1));
      let waiting = false; for (let i = 0; i < 30 && !waiting; i++) { const r = await PG.adminQuery("select wait_event_type, wait_event from pg_stat_activity where pid=$1", [pidB]); const l = await PG.adminQuery("select count(*)::int n from pg_locks where locktype='advisory' and not granted and pid=$1", [pidB]); waiting = r.rows[0] && r.rows[0].wait_event_type === "Lock" && l.rows[0].n === 1; if (!waiting) await sleep(100); }
      const ra = await pa; const rb = await pb; const dt = performance.now() - t0; const st = await drift(w);
      return (waiting && ra.ok && allOk(ra.rows) && !rb.ok && /DRIFT, ABORT/.test(rb.err) && dt > 1500 && st === "S1_after-step1") || JSON.stringify({ waiting, a: ra.ok, b: rb.err, dt, st }); } finally { await w.close(); } });
  await structural("P12", "lock is shared across packs: a concurrent ROLLBACK/APPLY of a different pack also queues (same key)", async () => {
    const w = await mkWorld(tplOrig); try { const a = await w.conn("postgres"), b = await w.conn("postgres"); const pidB = (await b.client.query("select pg_backend_pid() p")).rows[0].p;
      const pa = runPack(a.client, hold(PK(PACK.a1), 2)); await sleep(500); const pb = runPack(b.client, "BEGIN;\nSET LOCAL lock_timeout = '5s';\nSELECT pg_advisory_xact_lock(2979301232487107403);\nSET LOCAL lock_timeout = '5s';\nSELECT 1 AS ok;\nCOMMIT;");
      let waiting = false; for (let i = 0; i < 20 && !waiting; i++) { const l = await PG.adminQuery("select count(*)::int n from pg_locks where locktype='advisory' and not granted and pid=$1", [pidB]); waiting = l.rows[0].n === 1; if (!waiting) await sleep(100); } await pa; await pb; return waiting; } finally { await w.close(); } });
  await structural("P14", "TIMEOUT (lock_timeout follow-up): A (real APPLY-01) holds the pack lock ~7 s; B (the same pack) waits on the advisory lock and fails with SQLSTATE 55P03 lock_not_available after ~5 s (4.5-6.5 s), not after A's ~7 s; A is unaffected (commits, state S1); B changed nothing and holds no advisory lock afterwards", async () => {
    const w = await mkWorld(tplOrig); try { const a = await w.conn("postgres"), b = await w.conn("postgres"); const pidB = (await b.client.query("select pg_backend_pid() p")).rows[0].p;
      const pa = runPack(a.client, hold(PK(PACK.a1), 7)); await sleep(600); const t0 = performance.now(); const pb = runPack(b.client, PK(PACK.a1));
      let waiting = false; for (let i = 0; i < 30 && !waiting; i++) { const l = await PG.adminQuery("select count(*)::int n from pg_locks where locktype='advisory' and not granted and pid=$1", [pidB]); waiting = l.rows[0].n === 1; if (!waiting) await sleep(100); }
      const rb = await pb; const dtB = performance.now() - t0; const ra = await pa; const dtA = performance.now() - t0; try { await b.client.query("ROLLBACK"); } catch {}
      const left = (await PG.adminQuery("select count(*)::int n from pg_locks where locktype='advisory' and pid=$1", [pidB])).rows[0].n; const st = await drift(w);
      return (waiting && ra.ok && allOk(ra.rows) && !rb.ok && rb.code === "55P03" && dtB >= 4500 && dtB <= 6500 && dtA >= 6000 && left === 0 && st === "S1_after-step1") || JSON.stringify({ waiting, a: ra.ok, b: rb.err, code: rb.code, dtB: Math.round(dtB), dtA: Math.round(dtA), left, st }); } finally { await w.close(); } });
  await structural("P14c", "NEGATIVE CONTROL for P14: the same APPLY-01 with the PRE-lock lock_timeout removed (timeout only after the lock, the literal 'after the lock' placement) is NOT bounded: B waits out A's whole ~7 s hold and then refuses with DRIFT (not 55P03)", async () => {
    const w = await mkWorld(tplOrig); try { const a = await w.conn("postgres"), b = await w.conn("postgres");
      const postOnly = PK(PACK.a1).replace("SET LOCAL lock_timeout = '5s';\nSELECT pg_advisory_xact_lock", "SELECT pg_advisory_xact_lock"); if (postOnly === PK(PACK.a1)) return "negative control construction failed";
      const pa = runPack(a.client, hold(PK(PACK.a1), 7)); await sleep(600); const t0 = performance.now(); const pb = runPack(b.client, postOnly);
      const rb = await pb; const dtB = performance.now() - t0; await pa;
      return (!rb.ok && rb.code !== "55P03" && /DRIFT, ABORT/.test(rb.err) && dtB >= 6000) || JSON.stringify({ b: rb.err, code: rb.code, dtB: Math.round(dtB) }); } finally { await w.close(); } });
  await structural("P13", "PRECHECK-12A.sql runs read-only (READ ONLY transaction), errors on nothing, and leaks no row contents (sentinel email/handle/tokens absent from output)", async () => {
    const w = await mkWorld(tplOrig); try { const sql = rd("PRECHECK-12A.sql"); const stmts = sql.replace(/^\s*--.*$/gm, "").split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
      if (stmts.some((s) => !/^(select|with)\b/i.test(s))) return "non-SELECT statement present"; if (/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i.test(stmts.join(";").replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""'))) return "DDL/DML keyword outside literals";
      const c = await w.conn("postgres"); await c.client.query("BEGIN READ ONLY"); let out = ""; let n = 0; try { for (const s of stmts) { const r = await c.client.query(s); out += JSON.stringify(r.rows); n += r.rows.length; } } finally { await c.client.query("ROLLBACK"); }
      const leaks = [SENT_EMAIL, SENT_HANDLE, ...Object.values(T), "DoorOwner", "door.owner"].filter((s) => out.includes(s));
      return (leaks.length === 0 && stmts.length >= 10 && n > 30) || JSON.stringify({ leaks, stmts: stmts.length, n }); } finally { await w.close(); } });

  /* ============================ C. adjacent findings (replica only; NOT fixed by 12A) ============================ */
  await structural("A01", "FORGED ORDER: anon INSERTs a 'paid' order with its own qr_token for a real event (orders_anon_insert WITH CHECK true) and the door ADMITS it - on the ORIGINAL and on the HARDENED functions (12A does not and cannot fix this)", async () => {
    const res = {}; for (const [v, tpl] of [["original", tplOrig], ["hardened", tplHard]]) { const w = await mkWorld(tpl); try {
      const ins = await req(w.auth, "anon", "", "insert into public.event_orders(event_id,qty,qr_token,status,amount_cents,buyer_email) values (1,1,$1,'paid',0,'forger@example.invalid')", [tok("forged")]);
      const x = wrap(w, "scan"); const r = await x.call("owner", tok("forged")); res[v] = { inserted: !ins.err && ins.rowCount === 1, door: r.code }; } finally { await w.close(); } }
    return (res.original.inserted && res.original.door === "admitted" && res.hardened.inserted && res.hardened.door === "admitted") || JSON.stringify(res); }, adjRows);
  await structural("A02", "ORGANIZER UPDATE reaches every column: an organizer can set status='paid', rotate qr_token and even NULL checked_in_at (un-admit -> re-admit) on their orders", async () => {
    const w = await mkWorld(tplHard); try { const up = await req(w.auth, "authenticated", U.OWN, "update public.event_orders set status='paid', qr_token=$1 where id=5 returning status, qr_token", [tok("organizer-chosen")]);
      const x = wrap(w, "scan"); const a = await x.call("owner", tok("organizer-chosen")); const un = await req(w.auth, "authenticated", U.OWN, "update public.event_orders set checked_in_at=null where id=5 returning id");
      const b = await x.call("owner", tok("organizer-chosen")); const foreign = await req(w.auth, "authenticated", U.OWN, "update public.event_orders set status='paid' where id=14 returning id");
      return (up.rows.length === 1 && a.code === "admitted" && un.rows.length === 1 && b.code === "admitted" && foreign.rows.length === 0) || JSON.stringify({ up: up.err || up.rows, a: a.code, un: un.rows, b: b.code, foreign: foreign.rows }); } finally { await w.close(); } }, adjRows);
  await structural("A03", "TABLE-LEVEL ALL: anon and authenticated hold TRUNCATE (and MAINTAIN) on event_orders; RLS does not apply to TRUNCATE, so ANY anon request can empty the orders table (replica only)", async () => {
    const w = await mkWorld(tplHard); try { const p = (await w.q("select has_table_privilege('anon','public.event_orders','TRUNCATE') t, has_table_privilege('authenticated','public.event_orders','TRUNCATE') t2, has_table_privilege('anon','public.event_orders','MAINTAIN') m")).rows[0];
      const before = (await w.q("select count(*)::int n from public.event_orders")).rows[0].n; const del = await req(w.auth, "anon", "", "delete from public.event_orders");
      const tr = await req(w.auth, "anon", "", "truncate public.event_orders"); const after = (await w.q("select count(*)::int n from public.event_orders")).rows[0].n;
      return (p.t && p.t2 && p.m && before > 5 && !tr.err && after === 0 && !del.err && del.rowCount === 0) || JSON.stringify({ p, before, after, tr: tr.err }); } finally { await w.close(); } }, adjRows);
  await structural("A04", "PROPOSED follow-up sketch (FOLLOWUP-13A-14A_orders_PROPOSED_SKETCH.sql, NOT part of 12A) closes A01-A03 on the replica and keeps the door, service_role writes and organizer reads working", async () => {
    const w = await mkWorld(tplHard); try { const fu = rd("FOLLOWUP-13A-14A_orders_PROPOSED_SKETCH.sql"); await w.q("delete from public.event_orders where id=12"); await w.q(fu); const x = wrap(w, "scan");   // prod must have 0 duplicate tokens first (PRECHECK Q13)
      const forged = await req(w.auth, "anon", "", "insert into public.event_orders(event_id,qty,qr_token,status) values (1,1,$1,'paid')", [tok("forged")]);
      const forged2 = await req(w.auth, "authenticated", U.OTH, "insert into public.event_orders(event_id,qty,qr_token,status) values (1,1,$1,'paid')", [tok("forged2")]);
      const svc = await req(w.auth, "service_role", "", "insert into public.event_orders(event_id,qty,qr_token,status) values (1,1,$1,'paid') returning id", [tok("legit-webhook")]);
      const orgUp = await req(w.auth, "authenticated", U.OWN, "update public.event_orders set status='paid', qr_token='x' where id=5 returning id");
      const orgRead = await req(w.auth, "authenticated", U.OWN, "select count(*)::int n from public.event_orders");
      const tr = await req(w.auth, "anon", "", "truncate public.event_orders"); const dupTok = await req(w.auth, "service_role", "", "insert into public.event_orders(event_id,qty,qr_token,status) values (1,1,$1,'paid')", [T.paid1]);
      const door = await x.call("owner", tok("legit-webhook")); const door2 = await x.call("owner", T.paid1);
      return (forged.code === "42501" && forged2.code === "42501" && svc.rows && svc.rows.length === 1 && orgUp.code === "42501" && orgRead.rows[0].n > 5 && tr.code === "42501" && dupTok.code === "23505" && adm(door) && adm(door2)) || JSON.stringify({ f: forged.code, f2: forged2.code, svc: svc.err, org: orgUp.code, tr: tr.code, dup: dupTok.code, door: door.code, door2: door2.code }); } finally { await w.close(); } }, adjRows);
}

/* ------------------------------------------------------------------ shared test helpers */
const packNotes = {};
const adm = (r) => r.code === "admitted";
async function waitLock(pid, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await PG.adminQuery("select wait_event_type from pg_stat_activity where pid=$1", [pid]); if (r.rows[0] && r.rows[0].wait_event_type === "Lock") return true; await sleep(40); } return false; }
async function race(x, token, id) {
  const a = await x.w.conn("authenticator"), b = await x.w.conn("authenticator"); const [role, sub] = WHO.owner;
  await a.client.query("BEGIN"); await a.client.query("SET LOCAL ROLE " + role); await a.client.query("select set_config('request.jwt.claim.sub',$1,true)", [sub]);
  const ra = x.shape({ rows: (await a.client.query(call_(x.fn), [token])).rows });                 // A: admitted, transaction still OPEN (row lock held)
  const pid = (await b.client.query("select pg_backend_pid() p")).rows[0].p; const pb = callRaw(x, "owner", token, { conn: b });
  const waited = await waitLock(pid); await a.client.query("COMMIT"); const rb = await pb;         // B was blocked on A's row lock; now re-evaluates
  const n = (await x.w.q("select count(*)::int n from public.event_orders where id=$1 and checked_in_at is not null", [id])).rows[0].n;
  return (waited && ra.code === "admitted" && rb.code === "already_used" && n === 1) || JSON.stringify({ waited, a: ra.code, b: rb.code, n });
}
async function plantEvil(w) {
  await w.q(`create schema evil; grant usage on schema evil to authenticated;
   create table evil.app_users(id uuid, handle text); create table evil.events(id bigint, title text, owner_handle text); create table evil.ticket_tiers(id bigint, name text);
   create table evil.event_orders(id bigint, event_id bigint, tier_id bigint, qty int, status text, checked_in_at timestamptz, qr_token text);
   insert into evil.app_users values ('${U.NOH}','hijacker'); insert into evil.events values (900,'Evil Show','hijacker'); insert into evil.event_orders values (900,900,null,1,'paid',null,'${tok("evil")}');`);
}
async function hijack(x, v) {
  await plantEvil(x.w); const r = await callRaw(x, "noh", tok("evil"), { pre: "set local search_path = evil, public" });
  const clean = await callRaw(x, "owner", T.paid1, { pre: "set local search_path = evil, public" });   // legit scan still works with a hostile path
  const evilRow = (await x.w.q("select checked_in_at from evil.event_orders where id=900")).rows[0].checked_in_at;
  return (r.code === "invalid" && evilRow === null && adm(clean)) || JSON.stringify({ hijackedCode: r.code, evilRowTouched: evilRow !== null, cleanCode: clean.code });
}

/* ------------------------------------------------------------------ run + report */
const t0 = Date.now(); let fatal = null;
try { await main(); } catch (e) { fatal = e; console.log("FATAL", e && e.stack || e); }
finally { for (const d of [...open]) { try { await d.close(); } catch {} } try { await PG.cleanupAll(); } catch {} try { if (rolesMine) await PG.dropRoles(); } catch (e) { console.log("dropRoles: " + e.message); } try { await PG.shutdownAdmin(); } catch {} }

const mPass = results.filter((r) => r.hardened && r.controlOK !== false).length, mFail = results.length - mPass;
const pPass = packRows.filter((r) => r.pass).length, aPass = adjRows.filter((r) => r.pass).length;
const summary = { engine: "real PostgreSQL (socket)", seconds: Math.round((Date.now() - t0) / 1000), matrix: { total: results.length, pass: mPass, fail: mFail }, packs: { total: packRows.length, pass: pPass }, adjacent: { total: adjRows.length, pass: aPass }, fatal: fatal ? String(fatal.message || fatal) : null, notes: packNotes, md5: MD5 };
const outDir = join(HERE, "proof", "out"); try { (await import("node:fs")).mkdirSync(outDir, { recursive: true }); } catch {}
writeFileSync(join(outDir, only ? `results-${only}.json` : "results.json"), JSON.stringify({ summary, results, packRows, adjRows }, null, 1));
console.log("SUMMARY " + JSON.stringify(summary));
process.exit(fatal || mFail || pPass !== packRows.length || aPass !== adjRows.length ? 1 : 0);
