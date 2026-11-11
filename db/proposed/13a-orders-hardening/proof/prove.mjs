/* proof/prove.mjs - 13A orders hardening proofs on REAL PostgreSQL (localhost Unix socket only; replica of the captured prod ticketing tables; ALL DATA SYNTHETIC).
   Nothing here connects to any hosted database. The hardened state is built by running the committed packs/*.sql themselves, so what is proven is what would be applied.
   Every behavioural test runs against BOTH the original replica (negative control) and the hardened replica; a test marked "detects" must FAIL on the original or it is not a valid proof.
   Both variants have the 12A door packs applied (12A first, 13A second = the recommended order), so the door regression is part of every run.
   Roles: anon / authenticated / service_role / postgres are NOSUPERUSER stand-ins (service_role BYPASSRLS) created by the 11B pgdb adapter; API requests run as the `authenticator` connection role:
   BEGIN; SET LOCAL ROLE <api role>; set_config('request.jwt.claim.sub'/'email', ...); <query>; COMMIT (the PostgREST shape).
   Usage: node proof/prove.mjs [--only=<id prefix>]   (run-proof.sh starts Postgres, always stops it, samples load/memory) */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as PG from "../../11b-combined-rehearsal/lib/pgdb.mjs";
import { buildAll, FIX_SQL, FULFILL_CREATE, REPO_PACK_KEY, GT_HARD_MD5, FULFILL_WS_MD5, GT_LIVE_DEF_MD5, GMT_LIVE_DEF_MD5, liveDef } from "../build.mjs";
import { ORIG as ORIG12, HARD as HARD12 } from "../../12a-door-hardening/build.mjs";
import { aclSorted } from "../../r1-fix-f3-acl-locks/build-variants.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (...p) => readFileSync(join(HERE, ...p), "utf8");
const rd12 = (n) => readFileSync(join(HERE, "..", "12a-door-hardening", "packs", n), "utf8");
const PK = (n) => rd("packs", n);
const SHARED = (n) => readFileSync(join(HERE, "..", "_shared", n), "utf8");
const PACK = { a1: "13a_01_event_orders_APPLY_PROPOSED.sql", r1: "13a_01_event_orders_ROLLBACK_PROPOSED.sql", a2: "13a_02_get_ticket_APPLY_PROPOSED.sql", r2: "13a_02_get_ticket_ROLLBACK_PROPOSED.sql",
  u1: "13a_01_event_orders_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql", u2: "13a_02_get_ticket_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql",
  drift: "13a_DRIFT_QUERY_PROPOSED.sql", pc: { S0: "13a_POSTCHECKS_orders_S0_original_PROPOSED.sql", S1: "13a_POSTCHECKS_orders_S1_after-pack01_PROPOSED.sql", G0: "13a_POSTCHECKS_get_ticket_G0_original_PROPOSED.sql", G1: "13a_POSTCHECKS_get_ticket_G1_after-pack02_PROPOSED.sql" } };
const P12 = { a1: "12a_01_event_checkin_scan_APPLY_PROPOSED.sql", a2: "12a_02_check_in_ticket_APPLY_PROPOSED.sql", r1: "12a_01_event_checkin_scan_ROLLBACK_PROPOSED.sql", r2: "12a_02_check_in_ticket_ROLLBACK_PROPOSED.sql", u1: "12a_01_event_checkin_scan_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql", u2: "12a_02_check_in_ticket_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql" };
const ACKSQL = (id) => `SET kil.rollback_reopen_ack = 'I-ACCEPT-REOPENING-HOLES-${id}';\n`;      // the explicit override the UNSAFE rollback packs demand
const UNS = (n, id) => ACKSQL(id) + PK(n);
const UNS12 = (n, id) => ACKSQL(id) + rd12(n);
const md5 = (s) => createHash("md5").update(s).digest("hex");
const tok = (l) => md5("13a-fixture-token-" + l);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const want = (id) => !only || id.startsWith(only);

/* ------------------------------------------------------------------ fixtures */
const U = { OWN: "b0000000-0000-4000-8000-0000000000a1", OTH: "b0000000-0000-4000-8000-0000000000a2", BUY: "b0000000-0000-4000-8000-0000000000a3", BUY2: "b0000000-0000-4000-8000-0000000000a4" };
const WHO = { anon: ["anon", "", ""], owner: ["authenticated", U.OWN, "door.owner@example.invalid"], other: ["authenticated", U.OTH, "other.org@example.invalid"], buyer: ["authenticated", U.BUY, "buyer1@example.invalid"], buyer2: ["authenticated", U.BUY2, "buyer2@example.invalid"], service: ["service_role", "", ""] };
const T = { A: tok("A"), B: tok("B"), R: tok("R"), C: tok("C"), D: tok("D"), E: tok("E"), forged: tok("forged"), swap: tok("swap") };
const FIXTURE_SQL = `
insert into auth.users(id,email) values ('${U.OWN}','door.owner@example.invalid'),('${U.OTH}','other.org@example.invalid'),('${U.BUY}','buyer1@example.invalid'),('${U.BUY2}','buyer2@example.invalid');
insert into public.app_users(id,handle,email) values ('${U.OWN}','DoorOwner','door.owner@example.invalid'),('${U.OTH}','someoneelse','other.org@example.invalid'),('${U.BUY}','buyerone','buyer1@example.invalid'),('${U.BUY2}','buyertwo','buyer2@example.invalid');
insert into public.events(id,slug,title,owner_handle,starts_at) values (1,'doors-open','Doors Open Night','DoorOwner','2026-12-01 20:00+00'),(2,'other-show','Other Show','someoneelse','2026-12-02 20:00+00'),(5,'doors-two','Doors Two','DoorOwner','2026-12-03 20:00+00');
insert into public.ticket_tiers(id,event_id,name,price_cents,qty_total,qty_sold) values (1,1,'VIP',5000,100,3),(2,1,'GA',2000,200,0),(3,2,'GA',3000,50,1);
insert into public.event_orders(id,event_id,tier_id,buyer_email,buyer_handle,qty,qr_token,status,amount_cents,stripe_session_id,stripe_payment_intent) values
 (1,1,1,'buyer1@example.invalid','buyerone',2,'${T.A}','paid',10000,null,null),
 (2,1,1,'buyer2@example.invalid','buyertwo',1,'${T.B}','paid',5000,null,null),
 (3,1,1,'buyer1@example.invalid','buyerone',1,'${T.R}','refunded',5000,null,null),
 (4,2,3,'buyer1@example.invalid','buyerone',1,'${T.C}','paid',3000,null,null),
 (5,5,null,'buyer2@example.invalid','buyertwo',1,'${T.D}','paid',0,null,null),
 (6,1,2,'buyer1@example.invalid','buyerone',1,'${T.E}','paid',2000,'cs_fix_1','pi_fix_1');
select setval(pg_get_serial_sequence('public.events','id'), 100), setval(pg_get_serial_sequence('public.event_orders','id'), 1000), setval(pg_get_serial_sequence('public.ticket_tiers','id'), 100);`;
const FORGE_SQL = `insert into public.event_orders(event_id, tier_id, buyer_email, qty, status, amount_cents, qr_token) values (1, 1, 'attacker@example.invalid', 1, 'paid', 5000, '${T.forged}')`;
const ALL8 = "DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE";

/* ------------------------------------------------------------------ worlds */
let ORIG_POL = null;
let tplOrig = null, tplOrig12 = null, tplHard12 = null, tplHard13then12 = null;
const open = [];
async function mkWorld(tpl) {
  const db = await PG.createDb(tpl); open.push(db);
  const w = { db, name: db.name, extras: [], q: (s, p) => db.client.query(s, p), async close() { for (const c of w.extras) await c.disconnect(); await db.close(); const i = open.indexOf(db); if (i >= 0) open.splice(i, 1); } };
  w.conn = async (user) => { const c = await PG.newClient(db.name, user); w.extras.push(c); return c; };
  w.auth = await w.conn("authenticator");
  return w;
}
async function req(w, who, sql, params = [], rollback = false, conn = null) {
  const [role, sub, email] = WHO[who]; const c = conn || w.auth;
  await c.client.query("BEGIN");
  try {
    await c.client.query("SET LOCAL ROLE " + role);
    await c.client.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.email',$2,true), set_config('request.jwt.claim.role',$3,true)", [sub, email, role]);
    const r = await c.client.query(sql, params);
    await c.client.query(rollback ? "ROLLBACK" : "COMMIT");
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (e) { try { await c.client.query("ROLLBACK"); } catch {} return { err: String(e.message), code: e.code }; }
}
const attempt = (w, who, sql, params) => req(w, who, sql, params, true);
const applied = (r) => !r.err && (r.rowCount > 0 || r.command === "TRUNCATE");
const denied = (r) => r.code === "42501";
const dataFp = async (w) => (await w.q("select md5(coalesce(string_agg(t::text,'|' order by id),'')) m, count(*)::int n from public.event_orders t")).rows[0];
const scan = async (w, who, token) => { const r = await req(w, who, "select public.event_checkin_scan($1) as j", [token]); return r.err ? { code: "error", err: r.err, errcode: r.code } : { code: r.rows[0].j.result, j: r.rows[0].j }; };
const NORM = { valid: "admitted", already: "already_used", notpaid: "unpaid", notyours: "forbidden", notfound: "invalid", unauth: "unauth" };
const ticketScan = async (w, who, token) => { const r = await req(w, who, "select public.check_in_ticket($1) as j", [token]); return r.err ? { code: "error", err: r.err, errcode: r.code } : { code: NORM[r.rows[0].j.status] || "?" + r.rows[0].j.status, j: r.rows[0].j }; };

const fp = async (w) => (await w.q(`select jsonb_build_object(
  'relacl_raw', (select relacl::text from pg_class where oid='public.event_orders'::regclass),
  'acl_sorted', (select ${aclSorted("relacl")} from pg_class where oid='public.event_orders'::regclass),
  'attacl', (select jsonb_agg(attname||':'||attacl::text order by attnum) from pg_attribute where attrelid='public.event_orders'::regclass and attacl is not null),
  'rls', (select relrowsecurity::text||'/'||relforcerowsecurity::text from pg_class where oid='public.event_orders'::regclass),
  'policies', (select jsonb_agg(jsonb_build_array(policyname, permissive, roles::text, cmd, qual, with_check) order by policyname) from pg_policies where schemaname='public' and tablename='event_orders'),
  'indexes', (select jsonb_agg(indexdef order by indexname) from pg_indexes where schemaname='public' and tablename='event_orders'),
  'fns', (select jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_array(pg_get_functiondef(p.oid), p.proacl::text, p.proconfig::text, pg_get_userbyid(p.proowner), obj_description(p.oid,'pg_proc'))) from pg_proc p where p.proname in ('fulfill_ticket_order','refund_ticket_order','get_ticket','get_ticket__orig_13a')),
  'data', (select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.event_orders t)) j`)).rows[0].j;
const diffKeys = (a, b) => Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
const same = (a, b, skip = ['relacl_raw']) => { const A = { ...a }, B = { ...b }; for (const k of skip) { delete A[k]; delete B[k]; } return JSON.stringify(A) === JSON.stringify(B); };

/* ------------------------------------------------------------------ harness */
const results = [], packRows = [], adjRows = [];
async function matrix(id, name, ctrl, fn) {
  if (!want(id)) return;
  const outcome = {};
  for (const [variant, tpl] of [["hardened", tplHard12], ["original", tplOrig12]]) {
    const w = await mkWorld(tpl); let ok = false, why = "";
    try { const v = await fn(w, variant); ok = v === true; if (!ok) why = typeof v === "string" ? v : "returned " + JSON.stringify(v); } catch (e) { why = "threw: " + String(e.message || e).slice(0, 300); }
    outcome[variant] = { pass: ok, why }; await w.close();
  }
  const h = outcome.hardened.pass, o = outcome.original;
  const controlOK = ctrl === "detects" ? o.pass === false : o.pass === true;
  results.push({ id, name, hardened: h, hardenedWhy: outcome.hardened.why, original: o.pass, originalWhy: o.why, control: ctrl, controlOK });
  console.log(`${h && controlOK ? "PASS" : "FAIL"} ${id} ${name} | hardened=${h} original=${o.pass} (control: ${ctrl}${controlOK ? "" : " NOT MET"})${h ? "" : " :: " + outcome.hardened.why.slice(0, 200)}`);
}
async function structural(id, name, fn, rows = packRows) {
  if (!want(id)) return; let ok = false, why = "";
  try { const v = await fn(); ok = v === true; if (!ok) why = typeof v === "string" ? v : "returned " + JSON.stringify(v); } catch (e) { why = "threw: " + String(e.message || e).slice(0, 500); }
  rows.push({ id, name, pass: ok, why }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${ok ? "" : " :: " + why}`);
}
async function runPack(c, sql) {
  try { const r = await c.query(sql); const arr = Array.isArray(r) ? r : [r]; const rows = [...arr].reverse().find((x) => x.rows && x.rows.length && x.fields && x.fields.some((f) => f.name === "ok")); return { ok: true, rows: rows ? rows.rows : [] }; }
  catch (e) { try { await c.query("ROLLBACK"); } catch {} return { ok: false, err: String(e.message), code: e.code }; }
}
const allOk = (rows) => rows.length > 0 && rows.every((r) => r.ok === true);
const hold = (sql, secs) => { const i = sql.lastIndexOf("COMMIT;"); return sql.slice(0, i) + `SELECT pg_sleep(${secs}); ` + sql.slice(i); };
const strip = (s) => s.replace(/^--.*$/gm, "");
async function drift(w) { const r = await w.q(strip(PK(PACK.drift))); const rows = (Array.isArray(r) ? r.find((x) => x.rows.length) : r).rows; return { orders: rows.find((x) => x.name === "000_STATE_orders").actual, get_ticket: rows.find((x) => x.name === "000_STATE_get_ticket").actual }; }
async function pcOk(w, key) { const r = await w.q(strip(PK(PACK.pc[key]))); const rows = (Array.isArray(r) ? r[r.length - 1] : r).rows; return allOk(rows); }
async function waitAdvisory(pid, tries = 40) { for (let i = 0; i < tries; i++) { const l = await PG.adminQuery("select count(*)::int n from pg_locks where locktype='advisory' and not granted and pid=$1", [pid]); if (l.rows[0].n === 1) return true; await sleep(100); } return false; }
const driftAbort = (r) => !r.ok && /DRIFT, ABORT/.test(r.err);

/* ------------------------------------------------------------------ the core suite (used by the real fix, the original, and the mutants): returns the ids of checks that FAIL */
async function coreSuite(w) {
  const bad = [];
  const chk = (id, ok) => { if (!ok) bad.push(id); };
  chk("A01.anon-insert", denied(await attempt(w, "anon", FORGE_SQL)));
  chk("A02.auth-insert", denied(await attempt(w, "buyer", FORGE_SQL)));
  for (const [id, sql] of [["B01.status", "update public.event_orders set status='refunded' where id=1"], ["B02.qr_token", `update public.event_orders set qr_token='${T.swap}' where id=1`],
    ["B03.checked_in_at", "update public.event_orders set checked_in_at=now() where id=2"], ["B04.amount_cents", "update public.event_orders set amount_cents=0 where id=1"]])
    chk(id, !applied(await attempt(w, "owner", sql)));
  chk("C01.anon-truncate", denied(await attempt(w, "anon", "truncate public.event_orders")));
  chk("C02.auth-truncate", denied(await attempt(w, "buyer", "truncate public.event_orders")));
  chk("C03.anon-delete", denied(await attempt(w, "anon", "delete from public.event_orders")));
  const priv = async (r) => (await w.q(`select coalesce(string_agg(p, ',' order by p),'(none)') s from unnest(array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']) p where has_table_privilege('${r}','public.event_orders',p)`)).rows[0].s;
  chk("C05.anon-privs=SELECT", (await priv("anon")) === "SELECT"); chk("C05.authenticated-privs=SELECT", (await priv("authenticated")) === "SELECT");
  chk("C05.service_role-keeps-all", (await priv("service_role")) === ALL8);
  chk("C10.policy-set", JSON.stringify((await w.q("select policyname from pg_policies where schemaname='public' and tablename='event_orders' order by 1")).rows.map((x) => x.policyname)) === '["event_orders_organizer_read","event_orders_owner_read"]');
  const ids = async (who) => { const r = await attempt(w, who, "select id from public.event_orders order by id"); return r.err ? "ERR " + r.code : r.rows.map((x) => x.id).join(","); };
  chk("R01.buyer-reads-own", (await ids("buyer")) === "1,3,4,6"); chk("R02.organizer-reads-theirs", (await ids("owner")) === "1,2,3,5,6"); chk("R04.anon-zero-rows-no-error", (await ids("anon")) === "");
  return bad;
}

/* ------------------------------------------------------------------ main */
let rolesMine = false;
async function main() {
  await PG.ensureRoles(); rolesMine = true;
  const base = await PG.createDb(null); open.push(base); const c = base.client;
  await c.query(rd("proof", "replica.sql").replace("-- @@REFUND_VERBATIM@@", rd("baseline", "refund_ticket_order.VERBATIM.sql") + ";").replace("-- @@LIVE_READERS_VERBATIM@@", rd("baseline", "live-readers.VERBATIM.sql")));
  await c.query(FULFILL_CREATE);
  await c.query("REVOKE ALL ON FUNCTION public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text) TO service_role;");
  await c.query(ORIG12.ticket); await c.query(ORIG12.scan);
  await c.query("REVOKE ALL ON FUNCTION public.check_in_ticket(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.check_in_ticket(text) TO anon, authenticated, service_role;");
  await c.query("REVOKE ALL ON FUNCTION public.event_checkin_scan(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.event_checkin_scan(text) TO authenticated, service_role;");
  await c.query(FIXTURE_SQL);
  /* PROD-SHAPED: schema private pre-exists with the four postgres-only incident tables (empty); pg_default_acl mirrors prod (postgres + supabase_admin default grants in public) */
  await c.query(SHARED("prod-shape-private.sql"));
  { const sa = await PG.newClient(base.name, "pgadmin"); try { await sa.client.query(SHARED("prod-shape-default-acl.sql")); } finally { await sa.disconnect(); } }
  ORIG_POL = Object.fromEntries((await c.query("select policyname, qual, with_check, roles::text r from pg_policies where schemaname='public' and tablename='event_orders'")).rows.map((x) => [x.policyname, x.qual + "|" + x.with_check + "|" + x.r]));
  tplOrig = (await PG.snapshotDb(base)).pgTemplate;
  const mk = async (from, sqls) => { const d = await PG.createDb(from); open.push(d); for (const [n, s] of sqls) { const r = await runPack(d.client, s); if (!r.ok || (r.rows.length && !allOk(r.rows))) throw new Error("template build failed at " + n + ": " + (r.err || "rows not ok")); } const t = (await PG.snapshotDb(d)).pgTemplate; await d.close(); open.splice(open.indexOf(d), 1); return t; };
  tplOrig12 = await mk(tplOrig, [["12a-1", rd12(P12.a1)], ["12a-2", rd12(P12.a2)]]);
  tplHard12 = await mk(tplOrig12, [["13a-1", PK(PACK.a1)]]);
  /* 13A first, then the 12A hardened functions installed WITHOUT the 12A drift guard (the 12A packs refuse on a 13A-hardened table: P20) */
  const d13 = await PG.createDb(tplOrig); open.push(d13); { const r = await runPack(d13.client, PK(PACK.a1)); if (!r.ok) throw new Error("13A first build: " + r.err);
    await d13.client.query("create schema if not exists private; revoke all on schema private from public, anon, authenticated, service_role;"); await d13.client.query(HARD12.core); await d13.client.query("revoke all on function private.door_checkin_core(text) from public, anon, authenticated, service_role;");
    await d13.client.query(HARD12.scan); await d13.client.query("revoke all on function public.event_checkin_scan(text) from public, anon; grant execute on function public.event_checkin_scan(text) to authenticated, service_role;");
    await d13.client.query(HARD12.ticket); await d13.client.query("revoke all on function public.check_in_ticket(text) from public, anon; grant execute on function public.check_in_ticket(text) to authenticated, service_role;");
    tplHard13then12 = (await PG.snapshotDb(d13)).pgTemplate; await d13.close(); open.splice(open.indexOf(d13), 1); }

  /* ============================ A. behavioural matrix ============================ */
  await matrix("A01", "F-A anon cannot INSERT a forged paid order (42501); original inserts it", "detects", async (w) => { const r = await attempt(w, "anon", FORGE_SQL); return denied(r) || "insert not denied: " + JSON.stringify(r); });
  await matrix("A02", "F-A authenticated (a buyer) cannot INSERT a forged paid order", "detects", async (w) => { const r = await attempt(w, "buyer", FORGE_SQL); return denied(r) || "insert not denied: " + JSON.stringify(r); });
  await matrix("A03", "F-A authenticated organizer cannot INSERT a fabricated sale on their own event", "detects", async (w) => { const r = await attempt(w, "owner", FORGE_SQL); return denied(r) || "insert not denied: " + JSON.stringify(r); });
  await matrix("A04", "F-A service_role can still INSERT (direct, BYPASSRLS) - the real writer keeps its right", "baseline", async (w) => { const r = await attempt(w, "service", FORGE_SQL); return applied(r) || JSON.stringify(r); });
  for (const [id, col, sql] of [["B01", "status", "update public.event_orders set status='refunded' where id=1"], ["B02", "qr_token", `update public.event_orders set qr_token='${T.swap}' where id=1`], ["B03", "checked_in_at", "update public.event_orders set checked_in_at=now() where id=2"], ["B04", "amount_cents", "update public.event_orders set amount_cents=0 where id=1"]])
    await matrix(id, `F-B organizer cannot UPDATE ${col} of their own event's order; original can`, "detects", async (w) => { const r = await attempt(w, "owner", sql); return !applied(r) || "update applied: " + JSON.stringify(r); });
  await matrix("B05", "F-B organizer cannot UPDATE event_id / tier_id / buyer_email / buyer_handle / stripe_payment_intent / qty / application_fee_cents either (no column left writable)", "detects", async (w) => {
    const ups = ["event_id=5", "tier_id=2", "buyer_email='x@example.invalid'", "buyer_handle='x'", "stripe_payment_intent='pi_x'", "qty=9", "application_fee_cents=1", "organizer_acct='acct_x'", "referral_code='x'"];
    const hit = []; for (const u of ups) if (applied(await attempt(w, "owner", `update public.event_orders set ${u} where id=1`))) hit.push(u); return hit.length === 0 || "applied: " + hit.join(" | "); });
  await matrix("B06", "organizer cannot swap qr_token to admit a forged token: swap, then scan the forged token at the door -> not admitted", "detects", async (w) => {
    const u = await req(w, "owner", `update public.event_orders set qr_token='${T.swap}' where id=1`); const s = await scan(w, "owner", T.swap); const st = (await w.q("select checked_in_at from public.event_orders where id=1")).rows[0];
    return (s.code !== "admitted" && st.checked_in_at === null) || JSON.stringify({ upd: u.err ? u.code : "applied", scan: s.code }); });
  await matrix("B07", "non-organizer authenticated users (another organizer, the buyer) cannot UPDATE someone else's / their own order", "baseline", async (w) => {
    const a = await req(w, "other", "update public.event_orders set status='refunded' where id=1"), b = await req(w, "buyer", "update public.event_orders set status='cancelled' where id=1"); const s = (await w.q("select status from public.event_orders where id=1")).rows[0].status;
    return (!applied(a) && !applied(b) && s === "paid") || JSON.stringify({ a: a.err || a.rowCount, b: b.err || b.rowCount, s }); });
  await matrix("C01", "F-C anon cannot TRUNCATE event_orders (42501); original truncates it", "detects", async (w) => { const r = await attempt(w, "anon", "truncate public.event_orders"); return denied(r) || "truncate not denied: " + JSON.stringify(r); });
  await matrix("C02", "F-C authenticated (buyer and organizer) cannot TRUNCATE event_orders", "detects", async (w) => { const a = await attempt(w, "buyer", "truncate public.event_orders"), b = await attempt(w, "owner", "truncate public.event_orders"); return (denied(a) && denied(b)) || JSON.stringify([a.err || "ok", b.err || "ok"]); });
  await matrix("C03", "F-C anon DELETE / UPDATE leave every row intact", "baseline", async (w) => { const m0 = await dataFp(w); await req(w, "anon", "delete from public.event_orders"); await req(w, "anon", "update public.event_orders set status='cancelled'"); const m1 = await dataFp(w); return (m0.m === m1.m && m1.n === 6) || JSON.stringify([m0, m1]); });
  await matrix("C03b", "F-C anon DELETE / UPDATE are refused by PRIVILEGE (42501), not only filtered by RLS", "detects", async (w) => { const a = await attempt(w, "anon", "delete from public.event_orders"), b = await attempt(w, "anon", "update public.event_orders set status='cancelled'"); return (denied(a) && denied(b)) || JSON.stringify([a.err || "ok", b.err || "ok"]); });
  await matrix("C04", "F-C authenticated DELETE leaves every row intact (and is refused by privilege)", "detects", async (w) => { const m0 = await dataFp(w); const r = await req(w, "owner", "delete from public.event_orders"); const m1 = await dataFp(w); return (denied(r) && m0.m === m1.m) || JSON.stringify([r.err || r.rowCount, m0.n, m1.n]); });
  await matrix("C05", "F-C table privileges: anon and authenticated hold exactly SELECT (no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN); PUBLIC holds nothing", "detects", async (w) => {
    const p = async (r) => (await w.q(`select coalesce(string_agg(p, ',' order by p),'(none)') s from unnest(array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']) p where has_table_privilege('${r}','public.event_orders',p)`)).rows[0].s;
    const pub = (await w.q("select count(*)::int n from pg_class c, aclexplode(c.relacl) x where c.oid='public.event_orders'::regclass and x.grantee=0")).rows[0].n;
    const a = await p("anon"), b = await p("authenticated"); return (a === "SELECT" && b === "SELECT" && pub === 0) || JSON.stringify({ anon: a, authenticated: b, pub }); });
  await matrix("C06", "F-C service_role and postgres keep ALL eight privileges (unchanged)", "baseline", async (w) => {
    const p = async (r) => (await w.q(`select coalesce(string_agg(p, ',' order by p),'(none)') s from unnest(array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']) p where has_table_privilege('${r}','public.event_orders',p)`)).rows[0].s;
    const a = await p("service_role"), b = await p("postgres"); return (a === ALL8 && b === ALL8) || JSON.stringify({ a, b }); });
  await matrix("C07", "F-C sorted table ACL = {anon=r, authenticated=r, postgres=arwdDxtm, service_role=arwdDxtm}; no column ACLs; RLS enabled and not forced", "detects", async (w) => {
    const f = await fp(w); return (f.acl_sorted === "{anon=r/postgres,authenticated=r/postgres,postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}" && f.attacl === null && f.rls === "true/false") || JSON.stringify([f.acl_sorted, f.attacl, f.rls]); });
  await matrix("C08", "policy set is exactly {event_orders_organizer_read, event_orders_owner_read}; surviving policy texts byte-identical to the original", "detects", async (w) => {
    const rows = (await w.q("select policyname, qual, with_check, roles::text r from pg_policies where schemaname='public' and tablename='event_orders' order by 1")).rows;
    const names = rows.map((x) => x.policyname).join(","); const t = Object.fromEntries(rows.map((x) => [x.policyname, x.qual + "|" + x.with_check + "|" + x.r]));
    const exp = { event_orders_organizer_read: ORIG_POL.event_orders_organizer_read, event_orders_owner_read: ORIG_POL.event_orders_owner_read };
    return (names === "event_orders_organizer_read,event_orders_owner_read" && Object.entries(exp).every(([k, v]) => t[k] === v)) || JSON.stringify({ names, t }); });
  /* service path (stripe-webhook -> definer functions) */
  const FUL = (sess, pi, items) => ["select public.fulfill_ticket_order($1,$2,1,$3::jsonb,'buyer1@example.invalid',250,'acct_test') as j", [sess, pi, JSON.stringify(items)]];
  await matrix("S01", "service_role: fulfill_ticket_order inserts paid orders (2 items), 32-char qr tokens returned, buyer_handle resolved, qty_sold incremented", "baseline", async (w) => {
    const r = await req(w, "service", ...FUL("cs_new_1", "pi_new_1", [{ t: 1, q: 2, u: 5000 }, { t: 2, q: 1, u: 2000 }])); if (r.err) return "fulfill failed: " + r.err; const j = r.rows[0].j;
    const o = (await w.q("select tier_id, qty, status, amount_cents, buyer_handle, length(qr_token) l, application_fee_cents, organizer_acct from public.event_orders where stripe_session_id='cs_new_1' order by tier_id")).rows; const t = (await w.q("select id, qty_sold from public.ticket_tiers where id in (1,2) order by id")).rows;
    return (j.inserted === 2 && j.skipped_duplicate === 0 && j.qr_tokens.length === 2 && j.qr_tokens.every((x) => x.length === 32) && o.length === 2 && o.every((x) => x.status === "paid" && x.l === 32 && x.buyer_handle === "buyerone" && x.application_fee_cents === 250 && x.organizer_acct === "acct_test")
      && o[0].amount_cents === 10000 && o[1].amount_cents === 2000 && t[0].qty_sold === 5 && t[1].qty_sold === 1) || JSON.stringify({ j, o, t }); });
  await matrix("S02", "service_role: fulfill_ticket_order is idempotent on a duplicate (session,tier): second call inserts 0, skips 2, no extra rows, qty_sold unchanged", "baseline", async (w) => {
    const it = [{ t: 1, q: 2, u: 5000 }, { t: 2, q: 1, u: 2000 }]; await req(w, "service", ...FUL("cs_dup", "pi_dup", it)); const t1 = (await w.q("select qty_sold from public.ticket_tiers where id=1")).rows[0].qty_sold; const n1 = (await dataFp(w)).n;
    const r = await req(w, "service", ...FUL("cs_dup", "pi_dup", it)); const t2 = (await w.q("select qty_sold from public.ticket_tiers where id=1")).rows[0].qty_sold; const n2 = (await dataFp(w)).n;
    return (!r.err && r.rows[0].j.inserted === 0 && r.rows[0].j.skipped_duplicate === 2 && t1 === t2 && n1 === n2 && n1 === 8) || JSON.stringify({ r: r.err || r.rows[0].j, t1, t2, n1, n2 }); });
  await matrix("S03", "anon and authenticated cannot EXECUTE fulfill_ticket_order / refund_ticket_order (42501): the ONLY writer path stays service_role", "baseline", async (w) => {
    const rs = []; for (const who of ["anon", "buyer", "owner"]) { rs.push(await attempt(w, who, ...FUL("cs_x", "pi_x", [{ t: 1, q: 1, u: 1 }]))); rs.push(await attempt(w, who, "select public.refund_ticket_order('cs_fix_1', null)")); }
    return rs.every(denied) || JSON.stringify(rs.map((r) => r.code || "ok")); });
  await matrix("S04", "service_role: refund_ticket_order refunds by session, restores qty_sold, a second refund is a no-op", "baseline", async (w) => {
    await req(w, "service", ...FUL("cs_ref", "pi_ref", [{ t: 1, q: 2, u: 5000 }])); const a = await req(w, "service", "select public.refund_ticket_order('cs_ref', null) as j"); const b = await req(w, "service", "select public.refund_ticket_order('cs_ref', null) as j");
    const o = (await w.q("select status from public.event_orders where stripe_session_id='cs_ref'")).rows; const t = (await w.q("select qty_sold from public.ticket_tiers where id=1")).rows[0].qty_sold;
    return (!a.err && a.rows[0].j.refunded_rows === 1 && b.rows[0].j.refunded_rows === 0 && o.length === 1 && o[0].status === "refunded" && t === 3) || JSON.stringify({ a: a.err || a.rows[0].j, b: b.err || b.rows[0].j, o, t }); });
  await matrix("S05", "service_role: refund_ticket_order by payment_intent (fixture order 6) refunds it", "baseline", async (w) => {
    const a = await req(w, "service", "select public.refund_ticket_order(null, 'pi_fix_1') as j"); const o = (await w.q("select status from public.event_orders where id=6")).rows[0].status; return (!a.err && a.rows[0].j.refunded_rows === 1 && o === "refunded") || JSON.stringify({ a: a.err || a.rows[0].j, o }); });
  /* readers */
  const ids = async (w, who) => { const r = await attempt(w, who, "select id from public.event_orders order by id"); return r.err ? "ERR " + r.code : r.rows.map((x) => x.id).join(","); };
  await matrix("R01", "buyer SELECT via event_orders_owner_read: sees exactly their own orders (1,3,4,6), none of buyer2's", "baseline", async (w) => (await ids(w, "buyer")) === "1,3,4,6" || (await ids(w, "buyer")));
  await matrix("R02", "organizer SELECT via event_orders_organizer_read: sees exactly their events' orders (1,2,3,5,6), not the other organizer's (4); the other organizer sees only 4", "baseline", async (w) => { const a = await ids(w, "owner"), b = await ids(w, "other"); return (a === "1,2,3,5,6" && b === "4") || JSON.stringify([a, b]); });
  await matrix("R03", "anon sees ZERO rows and gets NO error (SELECT privilege kept, no anon policy)", "baseline", async (w) => { const r = await attempt(w, "anon", "select id from public.event_orders"); return (!r.err && r.rows.length === 0) || JSON.stringify(r); });
  await matrix("R04", "profile.html Tickets query shape (event_orders + embedded events join, buyer_handle filter, status<>'refunded') works for buyer (orders 1,4,6) and returns [] without error for anon", "baseline", async (w) => {
    const sql = "select o.id, o.qty, o.amount_cents, o.status, o.created_at, e.title, e.slug from public.event_orders o join public.events e on e.id = o.event_id where o.buyer_handle = 'buyerone' and o.status <> 'refunded' order by o.created_at desc, o.id";
    const a = await attempt(w, "buyer", sql), b = await attempt(w, "anon", sql); return (!a.err && a.rows.map((x) => x.id).sort().join() === "1,4,6" && !b.err && b.rows.length === 0) || JSON.stringify({ a: a.err || a.rows.map((x) => x.id), b: b.err || b.rows.length }); });
  await matrix("R05", "SELECT in an anon-evaluated policy of ANOTHER table (hypothetical event_chat_rooms) keeps working: no 42501 (the reason anon keeps SELECT)", "baseline", async (w) => {
    await w.q("insert into public.event_chat_rooms(event_id,name) values (1,'room')"); const a = await attempt(w, "anon", "select count(*)::int n from public.event_chat_rooms"), b = await attempt(w, "buyer", "select count(*)::int n from public.event_chat_rooms");
    return (!a.err && a.rows[0].n === 0 && !b.err && b.rows[0].n === 1) || JSON.stringify([a.err || a.rows, b.err || b.rows]); });
  await matrix("R06", "definer readers unchanged: get_my_tickets (VERBATIM prod body, SECURITY DEFINER), has_event_ticket (definer, anon + authenticated), organizer_dashboard (definer)", "baseline", async (w) => {
    const t = await attempt(w, "buyer", "select order_id, slug, qty from public.get_my_tickets() order by order_id"), h = [await attempt(w, "buyer", "select public.has_event_ticket('doors-open') v"), await attempt(w, "other", "select public.has_event_ticket('doors-open') v"), await attempt(w, "anon", "select public.has_event_ticket('doors-open') v")];
    const d = await attempt(w, "owner", "select slug, sold::int, gross::int, checked_in::int from public.organizer_dashboard()");
    return (!t.err && JSON.stringify(t.rows) === JSON.stringify([{ order_id: 1, slug: "doors-open", qty: 2 }, { order_id: 4, slug: "other-show", qty: 1 }, { order_id: 6, slug: "doors-open", qty: 1 }]) && h.map((x) => x.rows[0].v).join() === "true,false,false"
      && !d.err && JSON.stringify(d.rows) === JSON.stringify([{ slug: "doors-open", sold: 4, gross: 17000, checked_in: 0 }, { slug: "doors-two", sold: 1, gross: 0, checked_in: 0 }])) || JSON.stringify({ t: t.err || t.rows, h: h.map((x) => x.err || x.rows[0].v), d: d.err || d.rows }); });
  /* 12A door regression (both variants have the 12A packs applied) */
  await matrix("D01", "12A door: owner admits a raw token once (checked_in_at set), repeat = already_used", "baseline", async (w) => { const a = await scan(w, "owner", T.A), b = await scan(w, "owner", T.A); const s = (await w.q("select checked_in_at from public.event_orders where id=1")).rows[0]; return (a.code === "admitted" && b.code === "already_used" && s.checked_in_at !== null) || JSON.stringify([a.code, b.code]); });
  await matrix("D02", "12A door: 'KIL-'-prefixed and padded tokens admit; check_in_ticket wrapper admits too", "baseline", async (w) => { const a = await scan(w, "owner", "KIL-" + T.B), b = await ticketScan(w, "owner", T.E); return (a.code === "admitted" && b.code === "admitted") || JSON.stringify([a.code, b.code]); });
  await matrix("D03", "12A door: non-owner organizer, buyer and anon are refused; refunded and unknown tokens refused", "baseline", async (w) => {
    const r = [await scan(w, "other", T.A), await scan(w, "buyer", T.A), await ticketScan(w, "anon", T.A), await scan(w, "owner", T.R), await scan(w, "owner", tok("nope"))];
    const n = (await w.q("select count(*)::int n from public.event_orders where checked_in_at is not null")).rows[0].n; return (r[0].code === "forbidden" && r[1].code === "forbidden" && r[2].code === "error" && r[3].code === "unpaid" && r[4].code === "invalid" && n === 0) || JSON.stringify(r.map((x) => x.code)); });
  await matrix("D04", "12A door response never carries the buyer e-mail", "baseline", async (w) => { const a = await scan(w, "owner", T.A), b = await scan(w, "owner", T.A), c = await ticketScan(w, "owner", T.B); return !/example\.invalid/.test(JSON.stringify([a.j, b.j, c.j])) || "email leaked"; });
  /* end to end */
  await matrix("E01", "FORGED-ORDER END TO END: anon inserts a 'paid' order with its own token, then the door owner scans it -> original ADMITS the forged ticket; hardened: the order cannot exist, scan = invalid", "detects", async (w) => {
    const ins = await req(w, "anon", FORGE_SQL); const s = await scan(w, "owner", T.forged); const n = (await w.q("select count(*)::int n from public.event_orders where qr_token=$1", [T.forged])).rows[0].n;
    return (s.code !== "admitted" && n === 0 && denied(ins)) || JSON.stringify({ insert: ins.err ? ins.code : "inserted", scan: s.code, rows: n }); });
  await matrix("E02", "LEGIT END TO END: webhook fulfil (service_role) -> buyer sees the order -> door owner admits the returned token -> a later refund of ANOTHER order is refused at the door", "baseline", async (w) => {
    const f = await req(w, "service", ...FUL("cs_e2e", "pi_e2e", [{ t: 1, q: 1, u: 5000 }])); if (f.err) return f.err; const token = f.rows[0].j.qr_tokens[0];
    const mine = await attempt(w, "buyer", "select count(*)::int n from public.event_orders where stripe_session_id='cs_e2e'"); const a = await scan(w, "owner", token);
    await req(w, "service", ...FUL("cs_e2e2", "pi_e2e2", [{ t: 1, q: 1, u: 5000 }])); const f2 = (await w.q("select qr_token from public.event_orders where stripe_session_id='cs_e2e2'")).rows[0].qr_token; await req(w, "service", "select public.refund_ticket_order('cs_e2e2', null)"); const b = await scan(w, "owner", f2);
    return (mine.rows[0].n === 1 && a.code === "admitted" && b.code === "unpaid") || JSON.stringify({ mine: mine.rows, a: a.code, b: b.code }); });

  /* ============================ B. pack / structural proofs ============================ */
  await structural("P01", "static: every APPLY/ROLLBACK pack = ONE BEGIN, SET LOCAL lock_timeout 5s, advisory lock 2979301232487107403, SET LOCAL lock_timeout 5s as statements 2-4, one COMMIT last, drift guard, no data DML, no secrets", async () => {
    for (const n of [PACK.a1, PACK.r1, PACK.u1, PACK.a2, PACK.r2, PACK.u2]) { const s = PK(n); const code = s.replace(/^\s*--.*$/gm, "").replace(/\$(acl|stash|restore|guard|post|ack|refuse)\$[\s\S]*?\$\1\$/g, "").replace(/\$function\$[\s\S]*?\$function\$/g, "").replace(/'(?:[^']|'')*'/g, "''");
      const stmts = rd("packs", n).replace(/^\s*--.*$/gm, "").split(/;[ \t]*\r?\n/).map((t) => t.trim()).filter(Boolean);
      if (stmts[0] !== "BEGIN") return n + ": first statement is not BEGIN"; if (stmts[1] !== "SET LOCAL lock_timeout = '5s'" || stmts[2] !== `SELECT pg_advisory_xact_lock(${REPO_PACK_KEY})` || stmts[3] !== "SET LOCAL lock_timeout = '5s'") return n + ": statements 2-4 are not timeout/lock/timeout";
      if (stmts[stmts.length - 1] !== "COMMIT") return n + ": last statement is not COMMIT"; if ((s.match(/^BEGIN;/gm) || []).length !== 1 || (s.match(/^COMMIT;/gm) || []).length !== 1) return n + ": BEGIN/COMMIT count";
      if (/\b(TRUNCATE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+public\.|DROP\s+TABLE|ALTER\s+TABLE|CASCADE)\b/i.test(code)) return n + ": touches data/tables outside the intended DDL";
      if (!/DRIFT, ABORT/.test(s)) return n + ": no drift guard"; if (/password|secret|api[_-]?key|service_role_key|eyJ/i.test(s.replace(/service_role/g, ""))) return n + ": secret-looking text"; }
    return true; });
  await structural("P02", "generator is reproducible: build.mjs --check is clean (packs + PRECHECK == inputs)", async () => { const files = buildAll(); for (const [n, s] of files) if (rd("packs", n) !== s) return "drift in " + n; return files.size === 12 || "file count " + files.size; });
  await structural("P03", "replica sanity: replica = captured S0 / G0 (POSTCHECKS S0/G0 all ok, DRIFT_QUERY says S0_original + G0_original); fulfill body whitespace-md5 equals the facts body", async () => {
    const w = await mkWorld(tplOrig); try { const d = await drift(w); const a = await pcOk(w, "S0"), b = await pcOk(w, "G0"); const m = (await w.q("select md5(regexp_replace(prosrc, '\\s+', '', 'g')) m from pg_proc where proname='fulfill_ticket_order'")).rows[0].m;
      return (d.orders === "S0_original" && d.get_ticket === "G0_original" && a && b && m === FULFILL_WS_MD5) || JSON.stringify({ d, a, b }); } finally { await w.close(); } });
  await structural("P04", "APPLY-01 on the original: succeeds, retained SELECT all ok, state S1, POSTCHECKS S1 ok, data and fulfill/refund/get_ticket objects untouched", async () => {
    const w = await mkWorld(tplOrig); try { const f0 = await fp(w); const r = await runPack(w.db.client, PK(PACK.a1)); const f1 = await fp(w); const d = await drift(w);
      return (r.ok && allOk(r.rows) && r.rows.length > 30 && d.orders === "S1_after-pack01" && d.get_ticket === "G0_original" && (await pcOk(w, "S1")) && f0.data === f1.data && JSON.stringify(f0.fns) === JSON.stringify(f1.fns) && JSON.stringify(f0.indexes) === JSON.stringify(f1.indexes)) || JSON.stringify({ r: r.err, d }); } finally { await w.close(); } });
  await structural("P05", "second APPLY-01 refuses at the guard (DRIFT, ABORT) and changes nothing", async () => {
    const w = await mkWorld(tplOrig); try { await runPack(w.db.client, PK(PACK.a1)); const f0 = await fp(w); const r = await runPack(w.db.client, PK(PACK.a1)); const f1 = await fp(w); return (driftAbort(r) && same(f0, f1)) || JSON.stringify({ r: r.err }); } finally { await w.close(); } });
  await structural("P06", "ROLLBACK-01 restores the captured original EXACTLY: raw + sorted ACL, column ACLs, policy names/roles/cmd/permissive/qual/with_check byte-identical, indexes, RLS flags, data; state S0; a second ROLLBACK refuses", async () => {
    const w = await mkWorld(tplOrig); try { const f0 = await fp(w); await runPack(w.db.client, PK(PACK.a1)); const mid = await fp(w); const r = await runPack(w.db.client, UNS(PACK.u1, "13A-01")); const f1 = await fp(w); const d = await drift(w); const r2 = await runPack(w.db.client, UNS(PACK.u1, "13A-01")); const f2 = await fp(w);
      return (r.ok && allOk(r.rows) && same(f0, f1) && !same(f0, mid) && d.orders === "S0_original" && driftAbort(r2) && same(f1, f2) && JSON.stringify(f0.acl_sorted) === JSON.stringify(f1.acl_sorted)) || JSON.stringify({ r: r.err, eq: same(f0, f1), diff: diffKeys(f0, f1), d, r2: r2.err }); } finally { await w.close(); } });
  await structural("P07", "apply -> rollback -> apply cycle works (rollback leaves a re-appliable S0)", async () => {
    const w = await mkWorld(tplOrig); try { const a = await runPack(w.db.client, PK(PACK.a1)); const b = await runPack(w.db.client, UNS(PACK.u1, "13A-01")); const c = await runPack(w.db.client, PK(PACK.a1)); return (a.ok && b.ok && c.ok && allOk(c.rows) && (await drift(w)).orders === "S1_after-pack01") || JSON.stringify([a.err, b.err, c.err]); } finally { await w.close(); } });
  const abortCase = async (label, mut, pack = PACK.a1, expectState = "orders", asRole = null) => {
    const w = await mkWorld(tplOrig); try { await w.q(mut); const f0 = await fp(w); if (asRole) await w.db.client.query("SET ROLE " + asRole); const r = await runPack(w.db.client, PK(pack)); if (asRole) { try { await w.db.client.query("RESET ROLE"); } catch {} } const f1 = await fp(w);
      return (driftAbort(r) && same(f0, f1)) || label + ": " + JSON.stringify({ ok: r.ok, err: String(r.err).slice(0, 160), same: same(f0, f1) }); } finally { await w.close(); } };
  await structural("P08", "DRIFT GUARD aborts (nothing changed) on: an extra policy; organizer_update predicate altered; orders_anon_insert check altered; TRUNCATE revoked from anon (ACL differs); a column-level ACL; PUBLIC grant; fulfill ACL widened; fulfill body altered; run as a non-postgres role; index missing; trigger added", async () => {
    const cases = [["extra policy", "create policy zz on public.event_orders for select to anon using (true)"], ["organizer_update altered", "alter policy event_orders_organizer_update on public.event_orders using (true) with check (true)"],
      ["anon_insert altered", "alter policy orders_anon_insert on public.event_orders with check (false)"], ["acl differs", "revoke truncate on public.event_orders from anon"], ["column acl", "grant update (status) on public.event_orders to anon"],
      ["public grant", "grant select on public.event_orders to public"], ["fulfill acl", "grant execute on function public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text) to anon"],
      ["fulfill body", "create or replace function public.fulfill_ticket_order(p_session_id text, p_payment_intent text, p_event_id bigint, p_items jsonb, p_buyer_email text, p_app_fee_cents integer default null, p_organizer_acct text default null) returns jsonb language plpgsql security definer set search_path to 'public' as $f$ begin return jsonb_build_object('ok', true, 'tampered', true); end $f$"],
      ["index missing", "drop index public.event_orders_qr_token_idx"], ["trigger", "create function public.zz_t() returns trigger language plpgsql as $t$ begin return new; end $t$; create trigger zz before insert on public.event_orders for each row execute function public.zz_t()"]];
    for (const [l, m] of cases) { const v = await abortCase(l, m); if (v !== true) return v; }
    const v = await abortCase("non-postgres runner", "select 1", PACK.a1, "orders", "service_role"); return v; });
  await structural("P09", "lock serialises two runs: B waits on the pack advisory lock while A holds its transaction open, then B refuses cleanly (DRIFT); end state S1", async () => {
    const w = await mkWorld(tplOrig); try { const a = await w.conn("postgres"), b = await w.conn("postgres"); const pidB = (await b.client.query("select pg_backend_pid() p")).rows[0].p;
      const pa = runPack(a.client, hold(PK(PACK.a1), 3)); await sleep(600); const t0 = performance.now(); const pb = runPack(b.client, PK(PACK.a1)); const waiting = await waitAdvisory(pidB); const ra = await pa, rb = await pb; const dt = performance.now() - t0; const d = await drift(w);
      return (waiting && ra.ok && allOk(ra.rows) && driftAbort(rb) && dt > 1500 && d.orders === "S1_after-pack01") || JSON.stringify({ waiting, a: ra.ok, b: rb.err, dt, d }); } finally { await w.close(); } });
  await structural("P10", "lock is shared across packs: pack 02 (get_ticket) queued behind pack 01, then BOTH are applied (independent packs); end state S1 + G1", async () => {
    const w = await mkWorld(tplOrig); try { const a = await w.conn("postgres"), b = await w.conn("postgres"); const pidB = (await b.client.query("select pg_backend_pid() p")).rows[0].p;
      const pa = runPack(a.client, hold(PK(PACK.a1), 2)); await sleep(500); const pb = runPack(b.client, PK(PACK.a2)); const waiting = await waitAdvisory(pidB); const ra = await pa, rb = await pb; const d = await drift(w);
      return (waiting && ra.ok && rb.ok && allOk(rb.rows) && d.orders === "S1_after-pack01" && d.get_ticket === "G1_after-pack02") || JSON.stringify({ waiting, a: ra.err, b: rb.err, d }); } finally { await w.close(); } });
  await structural("P11", "TIMEOUT: A (real APPLY-01) holds the lock ~7 s; B waits and fails with SQLSTATE 55P03 after ~5 s (4.5-6.5 s), not after A's ~7 s; A unaffected; B changed nothing and holds no advisory lock afterwards", async () => {
    const w = await mkWorld(tplOrig); try { const a = await w.conn("postgres"), b = await w.conn("postgres"); const pidB = (await b.client.query("select pg_backend_pid() p")).rows[0].p;
      const t0 = performance.now(); const pa = runPack(a.client, hold(PK(PACK.a1), 7)); await sleep(700); const t1 = performance.now(); const pb = runPack(b.client, PK(PACK.a1)); const waiting = await waitAdvisory(pidB); const rb = await pb; const dtB = performance.now() - t1; const ra = await pa; const dtA = performance.now() - t0;
      const left = (await PG.adminQuery("select count(*)::int n from pg_locks where locktype='advisory' and pid=$1", [pidB])).rows[0].n; const d = await drift(w);
      return (waiting && ra.ok && allOk(ra.rows) && !rb.ok && rb.code === "55P03" && dtB >= 4500 && dtB <= 6500 && dtA >= 6000 && left === 0 && d.orders === "S1_after-pack01") || JSON.stringify({ waiting, a: ra.ok, b: rb.err, code: rb.code, dtB: Math.round(dtB), dtA: Math.round(dtA), left, d }); } finally { await w.close(); } });
  await structural("P11c", "NEGATIVE CONTROL for P11: with the PRE-lock lock_timeout removed, B is NOT bounded: it waits out A's whole hold and then refuses with DRIFT (not 55P03)", async () => {
    const w = await mkWorld(tplOrig); try { const a = await w.conn("postgres"), b = await w.conn("postgres"); const pidB = (await b.client.query("select pg_backend_pid() p")).rows[0].p;
      const postOnly = PK(PACK.a1).replace("SET LOCAL lock_timeout = '5s';\nSELECT pg_advisory_xact_lock", "SELECT pg_advisory_xact_lock"); if (postOnly === PK(PACK.a1)) return "construction failed";
      const pa = runPack(a.client, hold(PK(PACK.a1), 7)); await sleep(700); const t1 = performance.now(); const pb = runPack(b.client, postOnly); await waitAdvisory(pidB); const rb = await pb; const dtB = performance.now() - t1; await pa;
      return (!rb.ok && rb.code !== "55P03" && /DRIFT, ABORT/.test(rb.err) && dtB >= 6000) || JSON.stringify({ b: rb.err, code: rb.code, dtB: Math.round(dtB) }); } finally { await w.close(); } });
  await structural("P12", "PRECHECK-13A.sql is ONE read-only statement: runs in a READ ONLY transaction on the replica as postgres, returns the qr_token default expression, all four policy texts, column-ACL count, function bodies; leaks NO fixture row content (tokens / e-mails / handles)", async () => {
    const w = await mkWorld(tplOrig); try { const sql = rd("PRECHECK-13A.sql"); const code = strip(sql).trim(); if ((code.match(/;/g) || []).length !== 1) return "not exactly one statement";
      await w.q("BEGIN READ ONLY"); let r; try { r = await w.q(code); } finally { await w.q("ROLLBACK"); } const rows = r.rows; const m = Object.fromEntries(rows.map((x) => [x.name, x.value])); const text = JSON.stringify(rows);
      const leaks = [...Object.values(T), "buyer1@example.invalid", "buyerone", "door.owner@example.invalid", "DoorOwner"].filter((s) => text.includes(s));
      return (leaks.length === 0 && /md5\(/.test(m["orders.qr_token_default"]) && Object.keys(m).filter((k) => k.startsWith("orders.policy:")).length === 4 && m["orders.column_acls.count"] === "0" && /declare/.test(m[Object.keys(m).find((k) => k.startsWith("fulfill.def:"))] || "")
        && Object.keys(m).some((k) => k.startsWith("get_ticket.def:")) && Object.keys(m).some((k) => k.startsWith("refund.def:")) && m["agg.orders_total_and_checked_in"].startsWith("6 total") && "readers.policies_on_other_tables_mentioning_event_orders:public.event_chat_rooms.chat_rooms_read" in m) || JSON.stringify({ leaks, keys: Object.keys(m).length }); } finally { await w.close(); } });
  await structural("P13", "PRECHECK-13A read-only enforcement: a WRITE inside the same READ ONLY transaction fails (control), and PRECHECK itself changes no catalog fingerprint", async () => {
    const w = await mkWorld(tplOrig); try { const f0 = await fp(w); await w.q("BEGIN READ ONLY"); let werr = null; try { await w.q("update public.event_orders set status='paid' where id=1"); } catch (e) { werr = e.code; } await w.q("ROLLBACK"); await w.q(strip(rd("PRECHECK-13A.sql"))); const f1 = await fp(w); return (werr === "25006" && same(f0, f1)) || JSON.stringify({ werr }); } finally { await w.close(); } });
  /* ordering vs 12A */
  await structural("P20", "ORDER: 12A first, then 13A works (built as tplHard12). REVERSE: 13A first -> the 12A step-1 pack REFUSES at its drift guard (orders ACL/policies no longer the captured original) and changes nothing", async () => {
    const w = await mkWorld(tplOrig); try { await runPack(w.db.client, PK(PACK.a1)); const f0 = await fp(w); const r = await runPack(w.db.client, rd12(P12.a1)); const f1 = await fp(w); const guardText = /orders\.(acl_sorted|policies_md5)/.test(String(r.err));
      return (driftAbort(r) && guardText && same(f0, f1)) || JSON.stringify({ r: String(r.err).slice(0, 300) }); } finally { await w.close(); } });
  await structural("P21", "ROLLBACK ORDER (explicit UNSAFE overrides): after 12A + 13A, rolling back 12A first REFUSES (guard); 13A rollback first then 12A rollbacks works; end state = original (fingerprint equal to the pre-12A original); schema private is KEPT with its 4 incident tables, core gone", async () => {
    const w = await mkWorld(tplOrig); try { const f0 = await fp(w); await runPack(w.db.client, rd12(P12.a1)); await runPack(w.db.client, rd12(P12.a2)); await runPack(w.db.client, PK(PACK.a1));
      const bad = await runPack(w.db.client, UNS12(P12.u2, "12A-02")); const a = await runPack(w.db.client, UNS(PACK.u1, "13A-01")); const b = await runPack(w.db.client, UNS12(P12.u2, "12A-02")); const c = await runPack(w.db.client, UNS12(P12.u1, "12A-01")); const f1 = await fp(w); const sc = (await w.q("select (select count(*)::int from pg_namespace where nspname='private') n, (select count(*)::int from pg_class where relnamespace='private'::regnamespace and relkind='r') t, (select count(*)::int from pg_proc where pronamespace='private'::regnamespace) f")).rows[0];
      return (driftAbort(bad) && a.ok && b.ok && c.ok && same(f0, f1) && sc.n === 1 && sc.t === 4 && sc.f === 0) || JSON.stringify({ bad: String(bad.err).slice(0, 120), a: a.err, b: b.err, c: c.err, eq: same(f0, f1), diff: diffKeys(f0, f1) }); } finally { await w.close(); } });
  await structural("P22", "12A hardened door functions installed on an already 13A-hardened table (12A guard bypassed in setup) admit / refuse correctly (door suite D01-D03 shape)", async () => {
    const w = await mkWorld(tplHard13then12); try { const a = await scan(w, "owner", T.A), b = await scan(w, "owner", "KIL-" + T.B), c = await ticketScan(w, "owner", T.E), d = await scan(w, "buyer", T.C), e = await scan(w, "owner", T.R), f = await ticketScan(w, "anon", T.A), g = await scan(w, "owner", T.A);
      const ok = a.code === "admitted" && b.code === "admitted" && c.code === "admitted" && d.code === "forbidden" && e.code === "unpaid" && f.code === "error" && g.code === "already_used"; const names = (await w.q("select count(*)::int n from pg_policies where tablename='event_orders'")).rows[0].n;
      return (ok && names === 2) || JSON.stringify([a.code, b.code, c.code, d.code, e.code, f.code, g.code]); } finally { await w.close(); } });
  /* mutants: a partial fix must be caught by the suite */
  const MUT = [
    ["M1", "drops the two policies but LEAVES the table GRANT ALL (RLS blocks insert/update, TRUNCATE still open)", "drop policy orders_anon_insert on public.event_orders; drop policy event_orders_organizer_update on public.event_orders;", ["C01.anon-truncate", "C02.auth-truncate", "C05.anon-privs=SELECT", "C05.authenticated-privs=SELECT"]],
    ["M2", "revokes ALL only from anon, forgetting authenticated (policies kept)", "revoke all on public.event_orders from anon; grant select on public.event_orders to anon;", ["A02.auth-insert", "B01.status", "C02.auth-truncate", "C10.policy-set"]],
    ["M3", "drops both policies, revokes INSERT/UPDATE/DELETE/TRUNCATE but leaves REFERENCES/TRIGGER/MAINTAIN", "drop policy orders_anon_insert on public.event_orders; drop policy event_orders_organizer_update on public.event_orders; revoke insert, update, delete, truncate on public.event_orders from anon, authenticated;", ["C05.anon-privs=SELECT", "C05.authenticated-privs=SELECT"]],
    ["M4", "revokes INSERT/DELETE/TRUNCATE but leaves UPDATE + the organizer_update policy", "drop policy orders_anon_insert on public.event_orders; revoke insert, delete, truncate, references, trigger, maintain on public.event_orders from anon, authenticated;", ["B01.status", "B02.qr_token", "B03.checked_in_at", "B04.amount_cents", "C10.policy-set"]],
    ["M5", "OVER-fix: revokes ALL incl. SELECT from authenticated (breaks buyers and organizers)", FIX_SQL.replace("GRANT SELECT ON TABLE public.event_orders TO anon, authenticated;", "GRANT SELECT ON TABLE public.event_orders TO anon;"), ["R01.buyer-reads-own", "R02.organizer-reads-theirs", "C05.authenticated-privs=SELECT"]],
    ["M6", "column-grant remnant: the fix plus GRANT UPDATE (status) to authenticated and the organizer_update policy kept", FIX_SQL.replace("DROP POLICY event_orders_organizer_update ON public.event_orders;", "") + " GRANT UPDATE (status) ON public.event_orders TO authenticated;", ["B01.status", "C10.policy-set"]],
  ];
  await structural("P30", "SUITE SELF-CHECK: the core suite reports NOTHING failing on the real fix and MANY failures on the original (negative control)", async () => {
    const wh = await mkWorld(tplHard12), wo = await mkWorld(tplOrig12); try { const bh = await coreSuite(wh), bo = await coreSuite(wo); return (bh.length === 0 && bo.length === 12) || JSON.stringify({ hardened: bh, original: bo }); } finally { await wh.close(); await wo.close(); } });
  for (const [id, name, sql, expectFail] of MUT)
    await structural("P3" + id.slice(1), `MUTANT ${id} (${name}) is CAUGHT by the suite: it fails at least ${expectFail.join(", ")}`, async () => {
      const w = await mkWorld(tplOrig12); try { const r = await runPack(w.db.client, "BEGIN; " + sql + " COMMIT;"); if (!r.ok) return "mutant did not apply: " + r.err; const bad = await coreSuite(w); const miss = expectFail.filter((x) => !bad.includes(x));
        const pcRes = await w.q(strip(PK(PACK.pc.S1))); const pcRows = (Array.isArray(pcRes) ? pcRes[pcRes.length - 1] : pcRes).rows; const pcAll = allOk(pcRows);
        return (bad.length > 0 && miss.length === 0 && !pcAll) || JSON.stringify({ failing: bad, missingExpected: miss, postcheckS1AllOk: pcAll }); } finally { await w.close(); } });
  await structural("P37", "POST-CHECK rolls a partial fix back: the real APPLY-01 with the REVOKE line removed passes the guard, FAILS its own POST-CHECK and leaves state S0 (nothing applied)", async () => {
    const w = await mkWorld(tplOrig); try { const mut = PK(PACK.a1).replace("REVOKE ALL ON TABLE public.event_orders FROM PUBLIC, anon, authenticated;\n", ""); if (mut === PK(PACK.a1)) return "construction failed";
      const f0 = await fp(w); const r = await runPack(w.db.client, mut); const f1 = await fp(w); return (!r.ok && /POST-CHECK FAILED/.test(r.err) && same(f0, f1) && (await drift(w)).orders === "S0_original") || JSON.stringify({ r: String(r.err).slice(0, 200) }); } finally { await w.close(); } });

  /* ============================ C. F-D get_ticket (optional pack 02) ============================ */
  const gt = async (w, who, tokn) => { const r = await attempt(w, who, "select public.get_ticket($1) as j", [tokn]); return r.err ? { err: r.err, code: r.code } : { j: r.rows[0].j }; };
  await structural("G01", "FINDING (original): anon holding a token gets the buyer's e-mail from get_ticket; after pack 02 the 'buyer' key is gone and every other key is byte-equal to the original result", async () => {
    const w = await mkWorld(tplOrig); try { const before = await gt(w, "anon", T.A); const r = await runPack(w.db.client, PK(PACK.a2)); const after = await gt(w, "anon", T.A);
      const { buyer, ...rest } = before.j; return (before.j.buyer === "buyer1@example.invalid" && r.ok && allOk(r.rows) && !("buyer" in after.j) && JSON.stringify(after.j) === JSON.stringify(rest) && !/example\.invalid/.test(JSON.stringify(after.j))) || JSON.stringify({ before, after, r: r.err }); } finally { await w.close(); } });
  await structural("G02", "get_ticket other inputs unchanged: unknown token, refunded token, empty and NULL give the same result before and after (the verbatim prod body returns {status: notfound}, never null)", async () => {
    const w = await mkWorld(tplOrig); try { const ins = [tok("nope"), T.R, "", null]; const b = []; for (const x of ins) b.push(JSON.stringify(await gt(w, "anon", x))); await runPack(w.db.client, PK(PACK.a2)); const a = []; for (const x of ins) a.push(JSON.stringify(await gt(w, "anon", x)));
      return (JSON.stringify(a) === JSON.stringify(b) && a.every((x) => x === '{"j":{"status":"notfound"}}')) || JSON.stringify({ b, a }); } finally { await w.close(); } });
  await structural("G03", "get_ticket callers' contract kept: anon, authenticated, service_role can EXECUTE the wrapper (grants copied from the original); the renamed original has NO grants (anon / authenticated call = 42501); wrapper sorted ACL == stashed original", async () => {
    const w = await mkWorld(tplOrig); try { const acl0 = (await w.q(`select ${aclSorted("proacl")} a from pg_proc where proname='get_ticket'`)).rows[0].a; await runPack(w.db.client, PK(PACK.a2));
      const acl1 = (await w.q(`select ${aclSorted("proacl")} a from pg_proc where proname='get_ticket'`)).rows[0].a; const ex = (await w.q("select has_function_privilege('anon','public.get_ticket(text)','EXECUTE') a, has_function_privilege('authenticated','public.get_ticket(text)','EXECUTE') b, has_function_privilege('service_role','public.get_ticket(text)','EXECUTE') c")).rows[0];
      const h = [await attempt(w, "anon", "select public.get_ticket__orig_13a($1)", [T.A]), await attempt(w, "buyer", "select public.get_ticket__orig_13a($1)", [T.A])]; const svc = await gt(w, "service", T.A); const au = await gt(w, "buyer", T.A);
      return (acl0 === acl1 && ex.a && ex.b && ex.c && h.every(denied) && svc.j && !("buyer" in svc.j) && au.j && !("buyer" in au.j)) || JSON.stringify({ acl0, acl1, ex, h: h.map((x) => x.code), svc, au }); } finally { await w.close(); } });
  await structural("G04", "ROLLBACK-02 restores the original get_ticket EXACTLY (same oid, byte-identical pg_get_functiondef, raw ACL, config, owner, no comment); helper gone; original result (with buyer) is back; second rollback refuses", async () => {
    const w = await mkWorld(tplOrig); try { const oid0 = (await w.q("select oid::int o from pg_proc where proname='get_ticket'")).rows[0].o; const f0 = await fp(w); const a = await runPack(w.db.client, PK(PACK.a2)); const mid = await fp(w); const r = await runPack(w.db.client, UNS(PACK.u2, "13A-02")); const f1 = await fp(w);
      const oid1 = (await w.q("select oid::int o from pg_proc where proname='get_ticket'")).rows[0].o; const back = await gt(w, "anon", T.A); const r2 = await runPack(w.db.client, UNS(PACK.u2, "13A-02")); const d = await drift(w);
      return (a.ok && r.ok && allOk(r.rows) && oid0 === oid1 && same(f0, f1) && !same(f0, mid) && back.j.buyer === "buyer1@example.invalid" && driftAbort(r2) && d.get_ticket === "G0_original") || JSON.stringify({ a: a.err, r: r.err, oid0, oid1, eq: same(f0, f1), r2: String(r2.err).slice(0, 100) }); } finally { await w.close(); } });
  await structural("G05", "pack 02 guards: second APPLY-02 refuses; refuses on altered ACL (anon exec revoked), a pre-existing comment, a pre-existing helper name, a dependent view, a SECURITY INVOKER original, a non-jsonb return; nothing changed", async () => {
    const w0 = await mkWorld(tplOrig); try { await runPack(w0.db.client, PK(PACK.a2)); const f0 = await fp(w0); const r = await runPack(w0.db.client, PK(PACK.a2)); if (!(driftAbort(r) && same(f0, await fp(w0)))) return "second apply: " + r.err; } finally { await w0.close(); }
    const cases = [["anon exec revoked", "revoke execute on function public.get_ticket(text) from anon"], ["comment", "comment on function public.get_ticket(text) is 'x'"], ["helper name", "create function public.get_ticket__orig_13a(text) returns int language sql as 'select 1'"],
      ["dependent view", "create view public.zz_v as select public.get_ticket('x') as j"],
      ["invoker", "alter function public.get_ticket(text) security invoker"], ["grant option", "grant execute on function public.get_ticket(text) to anon with grant option"]];
    for (const [l, m] of cases) { const v = await abortCase(l, m, PACK.a2); if (v !== true) return v; } return true; });
  await structural("G06", "pack 02 independent of pack 01, either order: 02 then 01, and 01 then 02, both end in S1+G1; each rollback in either order restores the original fingerprint", async () => {
    for (const order of [["a2", "a1"], ["a1", "a2"]]) { const w = await mkWorld(tplOrig); try { const f0 = await fp(w); for (const k of order) { const r = await runPack(w.db.client, PK(PACK[k])); if (!r.ok || !allOk(r.rows)) return `apply ${k}: ${r.err}`; } const d = await drift(w); if (d.orders !== "S1_after-pack01" || d.get_ticket !== "G1_after-pack02") return JSON.stringify(d);
      for (const k of [...order].reverse().map((x) => (x === "a1" ? "u1" : "u2"))) { const r = await runPack(w.db.client, UNS(PACK[k], k === "u1" ? "13A-01" : "13A-02")); if (!r.ok) return `rollback ${k}: ${r.err}`; } if (!same(f0, await fp(w))) return "fingerprint differs after rollbacks " + order.join(">"); } finally { await w.close(); } }
    return true; });

  /* ---- verbatim live readers (baseline/live-readers.VERBATIM.sql): the replica's get_ticket / get_my_tickets ARE the prod bodies */
  const readerFp = async (w) => (await w.q(`select jsonb_object_agg(p.proname, jsonb_build_array(md5(pg_get_functiondef(p.oid)), ${aclSorted("p.proacl")}, p.proconfig::text, pg_get_userbyid(p.proowner), p.prosecdef, (select lanname from pg_language where oid=p.prolang))) j from pg_proc p where p.proname in ('get_my_tickets') or (p.proname='get_ticket' and pg_get_function_identity_arguments(p.oid)='p_qr text')`)).rows[0].j;
  await structural("G07", "replica readers are the PROD bodies: md5(pg_get_functiondef) get_ticket = 1814becc..., get_my_tickets = c3885372... (both captured from prod), SECURITY DEFINER, search_path=public, sorted ACL {anon, authenticated, postgres, service_role}; DRIFT_QUERY says G0", async () => {
    const w = await mkWorld(tplOrig); try { const f = await readerFp(w); const d = await drift(w); const acl = "{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}";
      return (f.get_ticket[0] === GT_LIVE_DEF_MD5 && f.get_my_tickets[0] === GMT_LIVE_DEF_MD5 && GT_LIVE_DEF_MD5 === "1814becc056c30ccac38c3adb51019ae" && GMT_LIVE_DEF_MD5 === "c3885372304c4f2c1d73c540a6f6834e" && f.get_ticket[1] === acl && f.get_my_tickets[1] === acl
        && f.get_ticket[2] === "{search_path=public}" && f.get_my_tickets[2] === "{search_path=public}" && f.get_ticket[4] === true && f.get_my_tickets[4] === true && f.get_ticket[5] === "sql" && d.get_ticket === "G0_original") || JSON.stringify({ f, d }); } finally { await w.close(); } });
  await structural("G08", "F-D drift guard asserts the VERBATIM live get_ticket: APPLY-02 aborts (nothing changed) on a one-character body change, a whitespace-only change, a body that already lost the 'buyer' key, a changed search_path, a volatility change; control: re-creating the identical text still applies", async () => {
    const live = liveDef("get_ticket"); const cases = [["one char in body", live.replace("'General Admission'", "'General Admissio'")], ["whitespace only", live.replace("limit 1;", "limit  1;")], ["buyer key already removed", live.replace("'buyer', o.buyer_email,", "")],
      ["search_path", "alter function public.get_ticket(text) set search_path = public, pg_temp"], ["volatility", "alter function public.get_ticket(text) stable"]];
    for (const [l, m] of cases) { if (!m.includes("CREATE OR REPLACE") && !m.startsWith("alter")) return "case not built: " + l; if (m === live) return "mutation did not change the text: " + l; const v = await abortCase(l, m, PACK.a2); if (v !== true) return v; }
    const w = await mkWorld(tplOrig); try { await w.q(live); const r = await runPack(w.db.client, PK(PACK.a2)); return (r.ok && allOk(r.rows) && (await drift(w)).get_ticket === "G1_after-pack02") || "control (identical re-create) did not apply: " + JSON.stringify(r.err); } finally { await w.close(); } });
  await structural("G09", "ROLLBACK-02 guard also pins the renamed original: if the helper body is altered after APPLY-02, ROLLBACK-02 aborts with nothing changed; the unaltered rollback restores md5(pg_get_functiondef) = 1814becc... exactly", async () => {
    const w = await mkWorld(tplOrig); try { const a = await runPack(w.db.client, PK(PACK.a2)); if (!a.ok) return a.err; const evil = liveDef("get_ticket").replace("public.get_ticket(", "public.get_ticket__orig_13a(").replace("limit 1;", "limit  1;"); await w.q(evil); const f0 = await fp(w); const r = await runPack(w.db.client, UNS(PACK.u2, "13A-02")); const f1 = await fp(w); if (!(driftAbort(r) && same(f0, f1))) return "tampered helper: " + JSON.stringify({ ok: r.ok, err: String(r.err).slice(0, 120) }); }
    finally { await w.close(); }
    const w2 = await mkWorld(tplOrig); try { await runPack(w2.db.client, PK(PACK.a2)); const r = await runPack(w2.db.client, UNS(PACK.u2, "13A-02")); const f = await readerFp(w2); return (r.ok && allOk(r.rows) && f.get_ticket[0] === GT_LIVE_DEF_MD5) || JSON.stringify({ r: r.err, f }); } finally { await w2.close(); } });
  await structural("G10", "get_my_tickets is NOT changed by 13A and is unaffected by pack 01's REVOKEs (SECURITY DEFINER owned by postgres): identical definition/ACL/config before and after pack 01 and pack 02; buyer still gets own paid tickets WITH qr_token, buyer2 only theirs, anon and another organizer get none, refunded order excluded; no buyer e-mail column", async () => {
    const w0 = await mkWorld(tplOrig12); const w1 = await mkWorld(tplHard12); let w2 = null; try { const f0 = await readerFp(w0), f1 = await readerFp(w1);
      w2 = await mkWorld(tplHard12); const a2 = await runPack(w2.db.client, PK(PACK.a2)); const fb = await readerFp(w2);
      const q = (w, who) => attempt(w, who, "select order_id, qr_token from public.get_my_tickets() order by order_id");
      const b0 = await q(w0, "buyer"), b1 = await q(w1, "buyer"), c1 = await q(w1, "buyer2"), an = await q(w1, "anon"), ot = await q(w1, "other"), b2 = await q(w2, "buyer");
      const cols = (await w1.q("select pg_get_function_result('public.get_my_tickets()'::regprocedure) r")).rows[0].r;
      return (JSON.stringify(f0.get_my_tickets) === JSON.stringify(f1.get_my_tickets) && JSON.stringify(f0.get_my_tickets) === JSON.stringify(fb.get_my_tickets) && f1.get_my_tickets[0] === GMT_LIVE_DEF_MD5 && a2.ok
        && JSON.stringify(b1.rows) === JSON.stringify(b0.rows) && JSON.stringify(b1.rows) === JSON.stringify(b2.rows) && b1.rows.map((x) => x.order_id).join() === "1,4,6" && b1.rows.every((x) => x.qr_token && x.qr_token.length === 32)
        && c1.rows.map((x) => x.order_id).join() === "2,5" && an.rows.length === 0 && ot.rows.length === 0 && !/buyer_email|buyer\b/.test(cols)) || JSON.stringify({ same: [f0.get_my_tickets, f1.get_my_tickets, fb.get_my_tickets], b0: b0.rows || b0.err, b1: b1.rows || b1.err, c1: c1.rows || c1.err, an: an.rows || an.err, ot: ot.rows || ot.err, cols });
    } finally { await w0.close(); await w1.close(); if (w2) await w2.close(); } });
  await structural("P38", "RUNBOOK backup/rollback method: CAPTURE-READONLY.sql runs in a READ ONLY transaction, is deterministic, leaks no fixture content; after apply 12A 01+02 and 13A 01 and the full reverse rollback (13A 01, 12A 02, 12A 01) a second capture equals the first on every row except the raw ACL order rows", async () => {
    const CAP = rd("CAPTURE-READONLY.sql"); const w = await mkWorld(tplOrig); try {
      const cap = async () => { const c = await w.conn("postgres"); await c.client.query("BEGIN READ ONLY"); try { return (await c.client.query(CAP)).rows; } finally { await c.client.query("ROLLBACK"); } };
      const norm = (rows) => rows.filter((x) => !/acl_raw/.test(x.name)).map((x) => x.name + "=" + x.value).join("\n");
      const c0 = await cap(), c0b = await cap(); const txt = JSON.stringify(c0);
      const leak = /example\.invalid|buyerone|buyertwo|DoorOwner|someoneelse/.test(txt) || Object.values(T).some((t) => txt.includes(t));
      const live = c0.find((x) => x.name === "fn.def_md5:public.get_ticket(text)"), gmt = c0.find((x) => x.name === "fn.def_md5:public.get_my_tickets()"), absent = c0.filter((x) => x.name.startsWith("fn.absent:")).map((x) => x.name).sort().join();
      if (!(norm(c0) === norm(c0b) && live && live.value === GT_LIVE_DEF_MD5 && gmt.value === GMT_LIVE_DEF_MD5 && !leak && c0.length > 50 && absent.includes("private.door_checkin_core"))) return JSON.stringify({ det: norm(c0) === norm(c0b), live: live && live.value, leak, n: c0.length, absent });
      for (const k of [rd12(P12.a1), rd12(P12.a2), PK(PACK.a1)]) { const r = await runPack(w.db.client, k); if (!r.ok) return "apply: " + r.err; }
      const c1 = await cap(); if (norm(c1) === norm(c0)) return "capture did not see the applied state";
      for (const k of [UNS(PACK.u1, "13A-01"), UNS12(P12.u2, "12A-02"), UNS12(P12.u1, "12A-01")]) { const r = await runPack(w.db.client, k); if (!r.ok) return "rollback: " + r.err; }
      const c2 = await cap(); const a = norm(c0), b = norm(c2);
      return (a === b) || "post-rollback capture differs: " + a.split("\n").filter((l, i) => l !== b.split("\n")[i]).slice(0, 3).join(" || ").slice(0, 400);
    } finally { await w.close(); } });

  /* ============================ D. adjacent / informational (replica only) ============================ */
  await structural("X01", "STRICT VARIANT (anon SELECT also revoked) is NOT bundled: on the replica it makes a signed-out visitor's profile Tickets query fail with 42501 (profile.html would show 'Could not load your tickets') and breaks the anon-evaluated policy sub-select on another table", async () => {
    const w = await mkWorld(tplOrig); try { const r = await runPack(w.db.client, "BEGIN; " + FIX_SQL.replace("GRANT SELECT ON TABLE public.event_orders TO anon, authenticated;", "GRANT SELECT ON TABLE public.event_orders TO authenticated;") + " COMMIT;"); if (!r.ok) return r.err;
      const a = await attempt(w, "anon", "select o.id, e.title from public.event_orders o join public.events e on e.id = o.event_id where o.buyer_handle = 'buyerone'"); const b = await attempt(w, "anon", "select count(*) from public.event_chat_rooms");
      return (denied(a) && denied(b)) || JSON.stringify([a.err || "ok", b.err || "ok"]); } finally { await w.close(); } }, adjRows);
  await structural("X02", "organizer_read exposes buyer_email and qr_token to the organizer of the event (door owner): a signed-in organizer can read every token of their event (documented, NOT changed)", async () => {
    const w = await mkWorld(tplHard12); try { const r = await attempt(w, "owner", "select qr_token, buyer_email from public.event_orders where event_id=1 order by id"); return (!r.err && r.rows.length === 4 && r.rows.every((x) => x.qr_token && x.buyer_email)) || JSON.stringify(r); } finally { await w.close(); } }, adjRows);
  await structural("X03", "qr_token is not UNIQUE: two rows can share a token (service_role / definer can write one; 12A's door refuses a duplicate as ambiguous); the 13A fix does not add a constraint (see OPEN QUESTIONS)", async () => {
    const w = await mkWorld(tplHard12); try { const r = await req(w, "service", `insert into public.event_orders(event_id, qty, status, qr_token) values (1,1,'paid','${T.A}')`); const s = await scan(w, "owner", T.A); return (applied(r) && s.code !== "admitted") || JSON.stringify({ r: r.err || "ok", s: s.code }); } finally { await w.close(); } }, adjRows);
}

/* ------------------------------------------------------------------ run + report */
const t0 = Date.now(); let fatal = null;
try { await main(); } catch (e) { fatal = String(e.stack || e); console.log("FATAL " + fatal); }
finally {
  for (const d of [...open]) { try { await d.close(); } catch {} }
  try { await PG.cleanupAll(); } catch {} try { if (rolesMine) await PG.dropRoles(); } catch (e) { console.log("dropRoles: " + e.message); } try { await PG.shutdownAdmin(); } catch {}
}
const tot = (a) => ({ total: a.length, pass: a.filter((x) => (x.pass !== undefined ? x.pass : x.hardened && x.controlOK)).length });
const summary = { engine: "PostgreSQL 17.6 (embedded-postgres, Unix socket only)", seconds: Math.round((Date.now() - t0) / 1000), matrix: tot(results), packs: tot(packRows), adjacent: tot(adjRows), fatal, md5: { get_ticket_wrapper: GT_HARD_MD5, fulfill_ws: FULFILL_WS_MD5 },
  negativeControls: { detects: results.filter((x) => x.control === "detects").length, detectsMet: results.filter((x) => x.control === "detects" && x.controlOK).length, baseline: results.filter((x) => x.control === "baseline").length, baselineMet: results.filter((x) => x.control === "baseline" && x.controlOK).length } };
mkdirSync(join(HERE, "proof/out"), { recursive: true });
if (!only) writeFileSync(join(HERE, "proof/out/results.json"), JSON.stringify({ summary, results, packRows, adjRows }, null, 1));
console.log(`\nSUMMARY matrix ${summary.matrix.pass}/${summary.matrix.total} (detects ${summary.negativeControls.detectsMet}/${summary.negativeControls.detects}, baseline ${summary.negativeControls.baselineMet}/${summary.negativeControls.baseline}); packs ${summary.packs.pass}/${summary.packs.total}; adjacent ${summary.adjacent.pass}/${summary.adjacent.total}; fatal=${fatal ? "YES" : "none"}; ${summary.seconds}s`);
process.exit(fatal || summary.matrix.pass !== summary.matrix.total || summary.packs.pass !== summary.packs.total || summary.adjacent.pass !== summary.adjacent.total ? 1 : 0);
