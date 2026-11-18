/* _job30/prove.mjs - proofs for the four Sentinel blockers on PR #154 (REAL PostgreSQL; replica of the captured prod tables; ALL DATA SYNTHETIC; no hosted database is ever contacted).
   (1) chain repair: the 12A/13A packs on a PROD-SHAPED replica (schema private pre-exists with the four postgres-only incident tables) and on a fresh one; pre-fix pack fails (negative control)
   (2) fail-closed rollback: default rollback refuses and leaves every hole closed; the explicit UNSAFE override needs the acknowledgement and does reopen (detector proof)
   (3) one backup definition (capture + verify + REPLAY from the capture alone), no pack changes row data, search_path '' on every definer function, default-privilege hardening
   Usage: node _job30/prove.mjs [--only=<id prefix>]   (run via _job30/run-proof.sh: starts Postgres, ALWAYS stops it, load-gated) */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as PG from "../11b-combined-rehearsal/lib/pgdb.mjs";
import { ORIG as ORIG12 } from "../12a-door-hardening/build.mjs";
import { FULFILL_CREATE } from "../13a-orders-hardening/build.mjs";
import { replaySql } from "../13a-orders-hardening/replay-from-capture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), P = join(HERE, "..");
const rd = (...p) => readFileSync(join(P, ...p), "utf8");
const p12 = (n) => rd("12a-door-hardening", "packs", n), p13 = (n) => rd("13a-orders-hardening", "packs", n);
const PK = { a1: p12("12a_01_event_checkin_scan_APPLY_PROPOSED.sql"), a2: p12("12a_02_check_in_ticket_APPLY_PROPOSED.sql"), r1: p12("12a_01_event_checkin_scan_ROLLBACK_PROPOSED.sql"), r2: p12("12a_02_check_in_ticket_ROLLBACK_PROPOSED.sql"),
  u1: p12("12a_01_event_checkin_scan_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql"), u2: p12("12a_02_check_in_ticket_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql"),
  b1: p13("13a_01_event_orders_APPLY_PROPOSED.sql"), br1: p13("13a_01_event_orders_ROLLBACK_PROPOSED.sql"), bu1: p13("13a_01_event_orders_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql"),
  b2: p13("13a_02_get_ticket_APPLY_PROPOSED.sql"), br2: p13("13a_02_get_ticket_ROLLBACK_PROPOSED.sql"), bu2: p13("13a_02_get_ticket_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql") };
const CAP = rd("13a-orders-hardening", "CAPTURE-READONLY.sql");
const ACK = (id) => `SET kil.rollback_reopen_ack = 'I-ACCEPT-REOPENING-HOLES-${id}';\n`;
const md5 = (s) => createHash("md5").update(s).digest("hex"), tok = (l) => md5("job30-" + l);
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7), want = (id) => !only || id.startsWith(only);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- fixtures */
const U = { OWN: "c0000000-0000-4000-8000-0000000000a1", OTH: "c0000000-0000-4000-8000-0000000000a2", NOH: "c0000000-0000-4000-8000-0000000000a3", BUY: "c0000000-0000-4000-8000-0000000000a4" };
const WHO = { anon: ["anon", "", ""], owner: ["authenticated", U.OWN, "owner@example.invalid"], other: ["authenticated", U.OTH, "other@example.invalid"], noh: ["authenticated", U.NOH, "noh@example.invalid"], buyer: ["authenticated", U.BUY, "buyer@example.invalid"], service: ["service_role", "", ""] };
const T = { a: tok("a"), b: tok("b"), nullowner: tok("nullowner"), forged: tok("forged"), swap: tok("swap") };
const FIXTURE_SQL = `
insert into auth.users(id,email) values ('${U.OWN}','owner@example.invalid'),('${U.OTH}','other@example.invalid'),('${U.NOH}','noh@example.invalid'),('${U.BUY}','buyer@example.invalid');
insert into public.app_users(id,handle,email) values ('${U.OWN}','DoorOwner','owner@example.invalid'),('${U.OTH}','someoneelse','other@example.invalid'),('${U.BUY}','buyerone','buyer@example.invalid');
insert into public.events(id,slug,title,owner_handle,starts_at) values (1,'doors-open','Doors Open Night','DoorOwner','2026-12-01 20:00+00'),(2,'null-owner','Null Owner Show',null,'2026-12-02 20:00+00');
insert into public.ticket_tiers(id,event_id,name,price_cents,qty_total,qty_sold) values (1,1,'VIP',5000,100,2);
insert into public.event_orders(id,event_id,tier_id,buyer_email,buyer_handle,qty,qr_token,status,amount_cents) values
 (1,1,1,'buyer@example.invalid','buyerone',1,'${T.a}','paid',5000),(2,1,1,'buyer@example.invalid','buyerone',1,'${T.b}','paid',5000),(3,2,null,'buyer@example.invalid','buyerone',1,'${T.nullowner}','paid',0);
select setval(pg_get_serial_sequence('public.events','id'), 100), setval(pg_get_serial_sequence('public.event_orders','id'), 1000);`;
const FORGE = `insert into public.event_orders(event_id, tier_id, buyer_email, qty, status, amount_cents, qr_token) values (1, 1, 'attacker@example.invalid', 1, 'paid', 5000, '${T.forged}')`;

/* ---------------- harness */
const open = [], results = [];
async function mkWorld(tpl) {
  const db = await PG.createDb(tpl); open.push(db); const notices = []; db.client.on("notice", (m) => notices.push(m.message));
  const w = { db, name: db.name, notices, extras: [], q: (s, p) => db.client.query(s, p), async close() { for (const c of w.extras) await c.disconnect(); await db.close(); const i = open.indexOf(db); if (i >= 0) open.splice(i, 1); } };
  w.conn = async (u) => { const c = await PG.newClient(db.name, u); w.extras.push(c); return c; }; w.auth = await w.conn("authenticator");
  w.admin = async (sql) => { const c = await PG.newClient(db.name, "pgadmin"); try { return await c.client.query(sql); } finally { await c.disconnect(); } };
  return w;
}
async function req(w, who, sql, params = [], rollback = false) {
  const [role, sub, email] = WHO[who], c = w.auth; await c.client.query("BEGIN");
  try { await c.client.query("SET LOCAL ROLE " + role); await c.client.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.email',$2,true), set_config('request.jwt.claim.role',$3,true)", [sub, email, role]);
    const r = await c.client.query(sql, params); await c.client.query(rollback ? "ROLLBACK" : "COMMIT"); return { rows: r.rows, rowCount: r.rowCount, command: r.command };
  } catch (e) { try { await c.client.query("ROLLBACK"); } catch {} return { err: String(e.message), code: e.code }; }
}
async function run(w, sql) { try { const r = await w.db.client.query(sql); const arr = Array.isArray(r) ? r : [r]; const rows = [...arr].reverse().find((x) => x.rows && x.rows.length && x.fields && x.fields.some((f) => f.name === "ok")); return { ok: true, rows: rows ? rows.rows : [] }; } catch (e) { try { await w.db.client.query("ROLLBACK"); } catch {} return { ok: false, err: String(e.message), code: e.code }; } }
const allOk = (r) => r.ok && r.rows.length > 0 && r.rows.every((x) => x.ok === true);
const applyAll = async (w, list) => { for (const k of list) { const r = await run(w, PK[k]); if (!allOk(r)) throw new Error("apply " + k + " failed: " + (r.err || JSON.stringify(r.rows.filter((x) => !x.ok).slice(0, 3)))); } };
const capture = async (w) => { const c = await w.conn("postgres"); await c.client.query("BEGIN READ ONLY"); try { return (await c.client.query(CAP)).rows; } finally { await c.client.query("ROLLBACK"); } };
const norm = (rows) => rows.filter((x) => !/acl_raw/.test(x.name)).map((x) => x.name + "=" + x.value).join("\n");     // sorted-ACL fingerprints; raw ACL entry ORDER legitimately differs after a rollback
const fp = async (w) => norm(await capture(w));
const rowFp = async (w) => (await w.q(`select jsonb_build_object('orders',(select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.event_orders t),'events',(select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.events t),'users',(select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.app_users t),'tiers',(select md5(coalesce(string_agg(t::text,'|' order by id),'')) from public.ticket_tiers t),
  'n_orders',(select count(*) from public.event_orders),'n_events',(select count(*) from public.events),'n_users',(select count(*) from public.app_users),
  'private_rows',(select coalesce(sum(n),0) from (select (xpath('/row/c/text()', query_to_xml('select count(*) as c from '||c.oid::regclass, false, true, '')))[1]::text::int n from pg_class c where c.relnamespace='private'::regnamespace and c.relkind='r') z)) j`)).rows[0].j;
async function t(id, name, fn) {
  if (!want(id)) return; let ok = false, why = ""; try { const v = await fn(); ok = v === true; if (!ok) why = typeof v === "string" ? v : "returned " + JSON.stringify(v); } catch (e) { why = "threw: " + String(e.message || e).slice(0, 500); }
  results.push({ id, name, pass: ok, why }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${ok ? "" : " :: " + why}`);
}
/* holes: each returns true when the hole is CLOSED */
const holes = {
  forgedInsert: async (w) => (await req(w, "anon", FORGE, [], true)).code === "42501" && (await req(w, "buyer", FORGE, [], true)).code === "42501",
  organizerUpdate: async (w) => { const a = await req(w, "owner", "update public.event_orders set status='paid', qr_token='x' where id=1", [], true); const b = await req(w, "owner", "update public.event_orders set checked_in_at=null where id=1", [], true); return !(a.rowCount > 0) && !(b.rowCount > 0); },
  anonTruncate: async (w) => (await req(w, "anon", "truncate public.event_orders", [], true)).code === "42501",
  anonExecCheckIn: async (w) => (await w.q("select has_function_privilege('anon','public.check_in_ticket(text)','EXECUTE') v")).rows[0].v === false && (await req(w, "anon", "select public.check_in_ticket($1)", [T.a], true)).code === "42501",
  nullOwner: async (w) => { const r = await req(w, "noh", "select public.check_in_ticket($1) j", [T.nullowner], true); const s = await req(w, "noh", "select public.event_checkin_scan($1) j", [T.nullowner], true); return r.rows?.[0]?.j?.status !== "valid" && s.rows?.[0]?.j?.result !== "admitted"; },
};
const closed = async (w) => { const o = {}; for (const [k, f] of Object.entries(holes)) o[k] = await f(w); return o; };
const allClosed = (o) => Object.values(o).every(Boolean), allOpen = (o) => Object.values(o).every((v) => !v);

/* ---------------- main */
async function main() {
  await PG.ensureRoles();
  const base = await PG.createDb(null); open.push(base); const c = base.client;
  await c.query(rd("13a-orders-hardening", "proof", "replica.sql").replace("-- @@REFUND_VERBATIM@@", rd("13a-orders-hardening", "baseline", "refund_ticket_order.VERBATIM.sql") + ";").replace("-- @@LIVE_READERS_VERBATIM@@", rd("13a-orders-hardening", "baseline", "live-readers.VERBATIM.sql")));
  await c.query(FULFILL_CREATE); await c.query("REVOKE ALL ON FUNCTION public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text) TO service_role;");
  await c.query(ORIG12.ticket); await c.query(ORIG12.scan);
  await c.query("REVOKE ALL ON FUNCTION public.check_in_ticket(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.check_in_ticket(text) TO anon, authenticated, service_role;");
  await c.query("REVOKE ALL ON FUNCTION public.event_checkin_scan(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.event_checkin_scan(text) TO authenticated, service_role;");
  await c.query(FIXTURE_SQL);
  await c.query(rd("_shared", "prod-shape-private.sql"));
  { const sa = await PG.newClient(base.name, "pgadmin"); try { await sa.client.query(rd("_shared", "prod-shape-default-acl.sql")); } finally { await sa.disconnect(); } }
  const snap = async (db) => { const s = (await PG.snapshotDb(db)).pgTemplate; return s; };
  const tplO = await snap(base);                                           // PROD-SHAPED original
  const derive = async (from, fn) => { const d = await PG.createDb(from); open.push(d); try { await fn(d); return await snap(d); } finally { await d.close(); open.splice(open.indexOf(d), 1); } };
  const tplF = await derive(tplO, async (d) => { const a = await PG.newClient(d.name, "pgadmin"); try { await a.client.query("drop schema private cascade"); } finally { await a.disconnect(); } });      // FRESH (no private)
  const chain = (tpl, list) => derive(tpl, async (d) => { const w = { db: d }; for (const k of list) { const r = await run(w, PK[k]); if (!allOk(r)) throw new Error("template " + k + ": " + (r.err || "rows not ok")); } });
  const tplA = await chain(tplO, ["a1", "a2", "b1"]), tplA2 = await chain(tplA, ["b2"]), tplFA = await chain(tplF, ["a1", "a2", "b1"]), tpl12 = await chain(tplO, ["a1", "a2"]), tplF12 = await chain(tplF, ["a1", "a2"]), tpl1 = await chain(tplO, ["a1"]);

  /* ================= (1) CHAIN REPAIR ================= */
  await t("J01", "PROD-SHAPED replica: 12A 01 -> 12A 02 -> 13A 01 all apply (every evidence row ok); the four incident tables (owner, relacl, columns) and the schema ACL (NULL) are fingerprint-identical before and after; no pack changed any row", async () => {
    const w = await mkWorld(tplO); try { const f0 = await capture(w), r0 = await rowFp(w); const pre = f0.filter((x) => x.name.startsWith("private.relation:")).length;
      await applyAll(w, ["a1", "a2", "b1"]); const f1 = await capture(w), r1 = await rowFp(w); const g = (rows, n) => rows.find((x) => x.name === n)?.value; const rel = (rows) => rows.filter((x) => x.name.startsWith("private.relation")).map((x) => x.name + "=" + x.value).sort().join("\n");
      return (pre >= 4 && g(f0, "private.known_tables_fingerprint") === g(f1, "private.known_tables_fingerprint") && rel(f0) === rel(f1) && g(f0, "private.schema") === g(f1, "private.schema") && /acl_raw=\(null\)/.test(g(f1, "private.schema")) && JSON.stringify(r0) === JSON.stringify(r1) && g(f1, "schema.private.functions") === "door_checkin_core" && !/absent/.test(g(f1, "fn.absent:private.door_checkin_core(text)") || "")) || JSON.stringify({ pre, same: rel(f0) === rel(f1), r0, r1 }); } finally { await w.close(); } });
  await t("J02", "FRESH variant (database without schema private): the same chain applies; the pack creates private with no client access", async () => {
    const w = await mkWorld(tplF); try { const had = (await w.q("select count(*)::int n from pg_namespace where nspname='private'")).rows[0].n; await applyAll(w, ["a1", "a2", "b1"]);
      const x = (await w.q("select (select nspacl::text from pg_namespace where nspname='private') acl, has_schema_privilege('anon','private','USAGE') a, has_schema_privilege('authenticated','private','USAGE') b, has_schema_privilege('service_role','private','USAGE') s, (select count(*)::int from pg_proc where pronamespace='private'::regnamespace) f")).rows[0];
      return (had === 0 && x.a === false && x.b === false && x.s === false && x.f === 1 && w.notices.some((n) => /fresh-database branch/.test(n))) || JSON.stringify({ had, x, n: w.notices.slice(0, 4) }); } finally { await w.close(); } });
  await t("J03", "NEGATIVE CONTROL: the PRE-FIX pack (verbatim ffa7f357 version, the one Sentinel FAILED) ABORTS on the prod-shaped replica (private already exists) and changes nothing; on the fresh replica it still applies", async () => {
    const raw = readFileSync(join(HERE, "fixtures", "prefix-12a_01_event_checkin_scan_APPLY_ffa7f357.sql"), "utf8"); const body = raw.slice(raw.indexOf("\n") + 1);
    if (md5(body) !== "02ddec7ce99f5b5a6994051210d800fb") return "fixture is not the verbatim ffa7f357 pack";
    const w = await mkWorld(tplO); const w2 = await mkWorld(tplF); try { const f0 = await fp(w); const r = await run(w, body); const f1 = await fp(w); const r2 = await run(w2, body);
      return (!r.ok && /private\.schema_exists: expected false/.test(r.err) && f0 === f1 && r2.ok && allOk(r2)) || JSON.stringify({ ok: r.ok, err: String(r.err).slice(0, 200), same: f0 === f1, fresh: r2.ok }); } finally { await w.close(); await w2.close(); } });
  const hazards = [
    ["an UNEXPECTED table in private", "create table private.zz_unexpected(x int)"], ["an UNEXPECTED function in private", "create function private.zz_f() returns int language sql as 'select 1'"],
    ["an UNEXPECTED view in private", "create view private.zz_v as select 1 as x"], ["an UNEXPECTED type in private", "create type private.zz_t as enum ('a')"],
    ["USAGE on schema private granted to anon", "grant usage on schema private to anon"], ["USAGE on schema private granted to PUBLIC", "grant usage on schema private to public"],
    ["SELECT on a known incident table granted to authenticated", "grant select on private.qr_token_backup_20261106 to authenticated"], ["a known incident table owned by someone else", "alter table private.qr_token_backup_20261106 owner to authenticator"],
    ["only 3 of the 4 known incident tables present", "drop table private.incident_refresh_ids_20261106"], ["a column ACL on a known incident table", "grant select (qr_token) on private.qr_token_backup_20261106 to anon"],
    ["a default ACL in private granting to anon (role postgres)", "alter default privileges for role postgres in schema private grant execute on functions to anon"],
  ];
  for (const [i, [name, sql]] of hazards.entries()) await t("J04." + (i + 1), "NEGATIVE CONTROL: 12A 01 aborts (DRIFT, nothing changed) when private has " + name, async () => {
    const w = await mkWorld(tplO); try { await w.admin(sql); const f0 = await fp(w); const r = await run(w, PK.a1); const f1 = await fp(w); return (!r.ok && /DRIFT, ABORT/.test(r.err) && /private\.(contents|client_access)/.test(r.err) && f0 === f1) || JSON.stringify({ ok: r.ok, err: String(r.err).slice(0, 220), same: f0 === f1 }); } finally { await w.close(); } });
  await t("J04.12", "NEGATIVE CONTROL: a default ACL for role supabase_admin in private that grants to authenticated also aborts (hazard the apply role could not repair itself)", async () => {
    const w = await mkWorld(tplO); try { await w.admin("alter default privileges for role supabase_admin in schema private grant execute on functions to authenticated"); const r = await run(w, PK.a1); return (!r.ok && /DRIFT, ABORT/.test(r.err) && /default ACL entries in private/.test(r.err)) || JSON.stringify(r.err); } finally { await w.close(); } });
  await t("J05", "apply order and second runs on the prod-shaped replica: 12A 02 before 01 refuses; 12A 01 twice refuses; 13A first then 12A 01 refuses (12A's guard expects the original orders ACL/policies); 13A 01 accepts the post-12A state", async () => {
    const w = await mkWorld(tplO), w2 = await mkWorld(tplO), w3 = await mkWorld(tpl12); try { const a = await run(w, PK.a2); await applyAll(w, ["a1"]); const b = await run(w, PK.a1);
      const c0 = await run(w2, PK.b1); const c = await run(w2, PK.a1); const d = await run(w3, PK.b1);
      return (!a.ok && /DRIFT, ABORT/.test(a.err) && !b.ok && /DRIFT, ABORT/.test(b.err) && c0.ok && !c.ok && /DRIFT, ABORT/.test(c.err) && d.ok && allOk(d)) || JSON.stringify({ a: a.err?.slice(0, 80), b: b.err?.slice(0, 80), c: c.err?.slice(0, 80), d: d.err }); } finally { await w.close(); await w2.close(); await w3.close(); } });
  await t("J06", "the DRIFT_QUERY / POSTCHECKS read S0_original on the prod-shaped replica and S2_after-step2 after the 12A chain (private facts are shape-independent: fresh and prod-shaped read the same)", async () => {
    const dq = async (w) => { const r = await w.q(rd("12a-door-hardening", "packs", "12a_DRIFT_QUERY_PROPOSED.sql").replace(/^--.*$/gm, "")); const rows = (Array.isArray(r) ? r.find((x) => x.rows.length) : r).rows; return rows.find((x) => x.name === "000_STATE").actual; };
    const a = await mkWorld(tplO), b = await mkWorld(tplF), c = await mkWorld(tpl12), d = await mkWorld(tplF12); try { const s = [await dq(a), await dq(b), await dq(c), await dq(d)]; return (s[0] === "S0_original" && s[1] === "S0_original" && s[2] === "S2_after-step2" && s[3] === "S2_after-step2") || JSON.stringify(s); } finally { for (const x of [a, b, c, d]) await x.close(); } });
  await t("J07", "OTHER packs and `private`: every CREATE SCHEMA private in db/proposed is IF NOT EXISTS (or inside a guarded DO that checks for absence); no pack drops schema private (only a comment saying so); the R1 #91 rollback keeps the schema", async () => {
    const files = []; (function walk(d) { for (const e of readdirSync(d)) { const f = join(d, e); if (statSync(f).isDirectory()) { if (e !== "proof" && e !== "node_modules" && e !== "fixtures" && e !== "_shared") walk(f); } else if (f.endsWith(".sql")) files.push(f); } })(P);
    const bad = []; for (const f of files) { const code = readFileSync(f, "utf8").replace(/^\s*--.*$/gm, ""); const cs = code.match(/CREATE\s+SCHEMA\s+(?!IF\s+NOT\s+EXISTS)private\b/gi); if (cs && !/IF to_regnamespace\('private'\) IS NULL THEN\s+CREATE SCHEMA private/.test(code)) bad.push(relative(P, f) + ": unguarded CREATE SCHEMA private"); if (/DROP\s+SCHEMA\s+(IF\s+EXISTS\s+)?private\b/i.test(code)) bad.push(relative(P, f) + ": DROP SCHEMA private"); }
    return bad.length === 0 || bad.join(" | "); });

  /* ================= (2) FAIL-CLOSED ROLLBACK ================= */
  const rbDefault = [["12A-02 default", "r2"], ["12A-01 default", "r1"], ["13A-01 default", "br1"]];
  await t("J10", "DEFAULT rollbacks REFUSE with 'fail closed' and change nothing: 13A-01 on the fully applied prod-shaped DB (12A 01+02, 13A 01), 12A-02 on the 12A-complete DB, 12A-01 on the step-1-only DB; on the full DB the 12A defaults are also refused (DRIFT: 13A must be rolled back first); sorted-ACL fingerprint and row data unchanged; every hole stays CLOSED (forged INSERT 42501, organizer UPDATE refused, anon TRUNCATE 42501, anon cannot EXECUTE check_in_ticket, null-owner scan refused)", async () => {
    const w = await mkWorld(tplA), w12 = await mkWorld(tpl12), w1 = await mkWorld(tpl1); try { const f0 = await fp(w), r0 = await rowFp(w), g0 = await fp(w12), h0 = await fp(w1);
      const a = await run(w, PK.br1), b = await run(w, PK.r2), c = await run(w, PK.r1), d = await run(w12, PK.r2), e = await run(w1, PK.r1);
      const cl = await closed(w), cl12 = (await holes.anonExecCheckIn(w12)) && (await holes.nullOwner(w12)), cl1 = (await req(w1, "noh", "select public.event_checkin_scan($1) j", [T.nullowner], true)).rows?.[0]?.j?.result !== "admitted";
      const fc = (r) => !r.ok && /REFUSED \(fail closed\)/.test(r.err);
      return (fc(a) && !b.ok && /DRIFT, ABORT/.test(b.err) && !c.ok && /DRIFT, ABORT/.test(c.err) && fc(d) && fc(e) && f0 === await fp(w) && g0 === await fp(w12) && h0 === await fp(w1) && JSON.stringify(r0) === JSON.stringify(await rowFp(w)) && allClosed(cl) && cl12 && cl1) || JSON.stringify({ a: a.err?.slice(0, 80), b: b.err?.slice(0, 60), c: c.err?.slice(0, 60), d: d.err?.slice(0, 80), e: e.err?.slice(0, 80), cl, cl12, cl1 }); } finally { await w.close(); await w12.close(); await w1.close(); } });
  await t("J10b", "DEFAULT rollback of 13A pack 02 (F-D wrapper) refuses on the applied state and the wrapper stays (buyer key still dropped)", async () => {
    const w = await mkWorld(tplA2); try { const f0 = await fp(w); const r = await run(w, PK.br2); const f1 = await fp(w); const g = await req(w, "anon", "select public.get_ticket($1) j", [T.a], true);
      return (!r.ok && /REFUSED \(fail closed\)/.test(r.err) && f0 === f1 && g.rows?.[0]?.j && !("buyer" in g.rows[0].j)) || JSON.stringify({ err: String(r.err).slice(0, 100), g: g.err || g.rows?.[0]?.j }); } finally { await w.close(); } });
  await t("J11", "OVERRIDE packs refuse without the exact acknowledgement (missing, wrong id, wrong text) and change nothing", async () => {
    const w = await mkWorld(tplA); try { const f0 = await fp(w); const outs = [];
      for (const [k, id] of [["u2", "12A-02"], ["u1", "12A-01"], ["bu1", "13A-01"]]) { outs.push(await run(w, PK[k])); outs.push(await run(w, ACK("WRONG") + PK[k])); outs.push(await run(w, ACK(id === "12A-02" ? "13A-01" : "12A-02") + PK[k])); }
      await w.q("reset kil.rollback_reopen_ack"); return (outs.every((r) => !r.ok && /acknowledgement is missing or wrong/.test(r.err)) && f0 === await fp(w) && allClosed(await closed(w))) || JSON.stringify(outs.map((r) => r.ok || String(r.err).slice(0, 60))); } finally { await w.close(); } });
  await t("J12", "OVERRIDE with the acknowledgement REOPENS the holes (detector proof): 13A-01 override -> forged INSERT succeeds, organizer UPDATE applies, anon TRUNCATE allowed; 12A overrides (02 then 01) -> anon can EXECUTE check_in_ticket and the null-owner hole admits; a WARNING banner is raised each time", async () => {
    const w = await mkWorld(tplA); try { const before = await closed(w); const a = await run(w, ACK("13A-01") + PK.bu1); const mid = await closed(w);
      const b = await run(w, ACK("12A-02") + PK.u2), c = await run(w, ACK("12A-01") + PK.u1); const after = await closed(w); const warns = w.notices.filter((n) => /UNSAFE ROLLBACK/.test(n)).length;
      return (allClosed(before) && a.ok && b.ok && c.ok && !mid.forgedInsert && !mid.organizerUpdate && !mid.anonTruncate && !after.anonExecCheckIn && !after.nullOwner && allOpen(after) && warns === 3) || JSON.stringify({ before, a: a.err, b: b.err, c: c.err, mid, after, warns }); } finally { await w.close(); } });
  await t("J13", "override rollback restores the ORIGINAL state exactly (sorted-ACL fingerprint equal to the pre-apply capture) in the documented order 13A-01, 12A-02, 12A-01; schema private and its 4 incident tables are KEPT; core is gone; no row changed", async () => {
    const w = await mkWorld(tplO); try { const f0 = await fp(w), r0 = await rowFp(w); await applyAll(w, ["a1", "a2", "b1"]); const a = await run(w, ACK("13A-01") + PK.bu1), b = await run(w, ACK("12A-02") + PK.u2), c = await run(w, ACK("12A-01") + PK.u1); const f1 = await fp(w), r1 = await rowFp(w);
      return (a.ok && b.ok && c.ok && allOk(a) && allOk(b) && allOk(c) && f0 === f1 && JSON.stringify(r0) === JSON.stringify(r1)) || JSON.stringify({ a: a.err, b: b.err, c: c.err, same: f0 === f1 }); } finally { await w.close(); } });
  await t("J14", "rollback on a DB NOT in the post-apply state aborts with DRIFT: original DB (all four rollbacks, default and override); 12A-only DB (13A rollbacks); 12A+13A DB (12A-01 override before 12A-02 / before 13A-01)", async () => {
    const bad = []; const chk = async (tpl, list, label) => { const w = await mkWorld(tpl); try { const f0 = await fp(w); for (const [k, id] of list) { const r = await run(w, (id ? ACK(id) : "") + PK[k]); if (!(!r.ok && /DRIFT, ABORT/.test(r.err))) bad.push(label + ":" + k + ":" + String(r.err).slice(0, 80)); } if (f0 !== await fp(w)) bad.push(label + ": state changed"); } finally { await w.close(); } };
    await chk(tplO, [["r2"], ["r1"], ["br1"], ["u2", "12A-02"], ["u1", "12A-01"], ["bu1", "13A-01"]], "original");
    await chk(tpl12, [["br1"], ["bu1", "13A-01"]], "12A-only"); await chk(tpl1, [["r2"], ["u2", "12A-02"]], "12A-step1-only");
    await chk(tplA, [["u1", "12A-01"]], "12A+13A (12A-01 before 12A-02)"); await chk(tplA, [["u2", "12A-02"]], "12A+13A (12A-02 while orders hardened)"); return bad.length === 0 || bad.join(" | "); });
  await t("J15", "partial apply behaves: after 12A only, the default 12A rollbacks refuse (fail closed) and the 12A holes stay closed; the override of 12A-02 then 12A-01 restores the original", async () => {
    const w = await mkWorld(tpl12); try { const a = await run(w, PK.r2), b = await run(w, PK.r2); const cl = await holes.anonExecCheckIn(w) && await holes.nullOwner(w); const u2 = await run(w, ACK("12A-02") + PK.u2); const r1 = await run(w, PK.r1); const u1 = await run(w, ACK("12A-01") + PK.u1);
      return (!a.ok && /REFUSED/.test(a.err) && !b.ok && cl && u2.ok && !r1.ok && /REFUSED/.test(r1.err) && u1.ok) || JSON.stringify({ a: a.err?.slice(0, 60), u2: u2.err, r1: r1.err?.slice(0, 60), u1: u1.err }); } finally { await w.close(); } });
  await t("J16", "static: every default rollback pack contains NO restoring DDL (no CREATE POLICY / GRANT / CREATE OR REPLACE FUNCTION / DROP) outside its guard and refusal; every UNSAFE pack checks kil.rollback_reopen_ack BEFORE its drift guard and raises a WARNING banner; no pack file drops schema private", async () => {
    const bad = []; for (const k of ["r1", "r2", "br1", "br2"]) { const code = PK[k].replace(/^\s*--.*$/gm, "").replace(/\$(\w+)\$[\s\S]*?\$\1\$/g, ""); if (/\b(CREATE|GRANT|REVOKE|DROP|ALTER)\b/i.test(code)) bad.push(k + ": DDL outside guard/refuse"); if (!/REFUSED \(fail closed\)/.test(PK[k])) bad.push(k + ": no refusal"); }
    for (const k of ["u1", "u2", "bu1", "bu2"]) { const s = PK[k]; if (!(s.indexOf("kil.rollback_reopen_ack") < s.indexOf("DRIFT, ABORT")) || !/RAISE WARNING '\*\*\* UNSAFE ROLLBACK/.test(s)) bad.push(k + ": ack/warning order"); }
    return bad.length === 0 || bad.join(" | "); });

  /* ================= (3) BACKUP, REPLAY, DATA, SEARCH_PATH, DEFAULT PRIVILEGES ================= */
  await t("J20", "BACKUP VERIFY: CAPTURE-READONLY.sql run twice is byte-identical including its 000_capture.summary row (rows=N md5=...); contains the private schema, the four incident tables and default ACL rows; READ ONLY transaction; leaks no fixture content", async () => {
    const w = await mkWorld(tplO); try { const a = await capture(w), b = await capture(w); const txt = JSON.stringify(a); const sum = a.find((x) => x.name === "000_capture.summary")?.value;
      return (JSON.stringify(a.map((x) => [x.name, x.value])) === JSON.stringify(b.map((x) => [x.name, x.value])) && /^rows=\d+ md5=[0-9a-f]{32}$/.test(sum) && a.filter((x) => x.name.startsWith("private.relation:")).length >= 4 && a.some((x) => x.name.startsWith("default_acl:supabase_admin:public")) && !/example\.invalid|buyerone|DoorOwner/.test(txt) && !Object.values(T).some((v) => txt.includes(v))) || JSON.stringify({ sum, n: a.length }); } finally { await w.close(); } });
  await t("J21", "REPLAY: from the S0 capture ALONE (rows saved before the first write) the original state is restored after the full chain (12A 01+02, 13A 01) and rollback-to-original works without any ROLLBACK pack; the post-replay capture equals the pre-apply capture (sorted-ACL fingerprints); a replay of a DIFFERENT (S1) capture does not equal it (negative control)", async () => {
    const w = await mkWorld(tplO); try { const c0 = await capture(w); const f0 = norm(c0); await applyAll(w, ["a1", "a2", "b1"]); const c1 = await capture(w); const sql = replaySql(c0); const r = await run(w, sql); const f1 = await fp(w);
      const w2 = await mkWorld(tplO); let neg; try { await applyAll(w2, ["a1", "a2", "b1"]); const bad = replaySql(c1); await run(w2, bad); neg = (await fp(w2)) !== f0; } finally { await w2.close(); }
      return (r.ok && f0 === f1 && norm(c1) !== f0 && neg) || JSON.stringify({ ok: r.ok, err: String(r.err).slice(0, 200), eq: f0 === f1, neg, diff: f0.split("\n").filter((l, i) => l !== f1.split("\n")[i]).slice(0, 3) }); } finally { await w.close(); } });
  await t("J22", "NO PACK CHANGES ROW DATA: row counts and md5 checksums of event_orders / events / app_users / ticket_tiers and the (empty) incident tables are identical across apply (12A 01+02, 13A 01+02) and the full override rollback; static: no pack file has INSERT / UPDATE / DELETE / TRUNCATE outside function bodies", async () => {
    const w = await mkWorld(tplO); try { const r0 = await rowFp(w); await applyAll(w, ["a1", "a2", "b1", "b2"]); const r1 = await rowFp(w); for (const [k, id] of [["bu2", "13A-02"], ["bu1", "13A-01"], ["u2", "12A-02"], ["u1", "12A-01"]]) { const r = await run(w, ACK(id) + PK[k]); if (!r.ok) return k + ": " + r.err; } const r2 = await rowFp(w);
      const bad = []; for (const k of Object.keys(PK)) { const code = PK[k].replace(/^\s*--.*$/gm, "").replace(/\$(\w+)\$[\s\S]*?\$\1\$/g, ""); if (code.split(/;[ \t]*\r?\n/).some((s) => /^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(s))) bad.push(k); }
      return (JSON.stringify(r0) === JSON.stringify(r1) && JSON.stringify(r0) === JSON.stringify(r2) && r0.n_orders === 3 && bad.length === 0) || JSON.stringify({ r0, r1, r2, bad }); } finally { await w.close(); } });
  await t("J23", "DOC CONSISTENCY: the backup is defined in ONE place (RUNBOOK section 2); the apply-order doc, both READMEs, the Sentinel checklist and the VERIFY/CAPTURE comments point to it and none still says the dashboard backup 'must precede the first write' or implies a pg_dump", async () => {
    const R = rd("13a-orders-hardening", "RUNBOOK-APPLY-BACKUP-ROLLBACK.md"); const docs = { ao: readFileSync(join(P, "..", "..", "docs", "db-apply-order", "APPLY-ORDER-2026-11-10.md"), "utf8"), r12: rd("12a-door-hardening", "README.md"), r13: rd("13a-orders-hardening", "README.md"), sc: rd("12a-door-hardening", "SENTINEL-CHECKLIST-12A.md") };
    const bad = []; if ((R.match(/^## 2\. /gm) || []).length !== 1 || !/BACKUP = /.test(R)) bad.push("runbook: no single section 2 definition");
    for (const [k, v] of Object.entries(docs)) { if (!/RUNBOOK-APPLY-BACKUP-ROLLBACK\.md/.test(v)) bad.push(k + ": no link to the single backup definition"); if (/must precede the first write/.test(v)) bad.push(k + ": stale 'must precede the first write'"); if (/pg_dump/i.test(v.replace(/no `?pg_dump`?|not a `?pg_dump`?|`pg_dump`[^.]*not/gi, ""))) bad.push(k + ": mentions pg_dump positively"); }
    return bad.length === 0 || bad.join(" | "); });
  await t("J30", "SEARCH_PATH SCAN (dynamic): after 12A 01+02, 13A 01+02 every SECURITY DEFINER function the packs create or replace has proconfig exactly search_path=\"\" (core, scan, check_in_ticket, get_ticket wrapper); the ONLY other definer touched is the renamed original get_ticket__orig_13a (pre-existing prod body, search_path=public) and it has NO non-owner EXECUTE", async () => {
    const w = await mkWorld(tplA2); try { const rows = (await w.q(`select (select nspname from pg_namespace where oid=p.pronamespace)||'.'||p.proname f, (p.proconfig = array['search_path=""']) c, (select count(*)::int from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) x where x.grantee <> p.proowner) g from pg_proc p where p.prosecdef and p.oid = any(array[to_regprocedure('private.door_checkin_core(text)'),to_regprocedure('public.event_checkin_scan(text)'),to_regprocedure('public.check_in_ticket(text)'),to_regprocedure('public.get_ticket(text)'),to_regprocedure('public.get_ticket__orig_13a(text)')]::oid[])`)).rows;
      const m = Object.fromEntries(rows.map((r) => [r.f, r])); const mine = ["private.door_checkin_core", "public.event_checkin_scan", "public.check_in_ticket", "public.get_ticket"];
      return (mine.every((f) => m[f] && m[f].c === true) && m["public.get_ticket__orig_13a"].c === false && m["public.get_ticket__orig_13a"].g === 0 && rows.length === 5) || JSON.stringify(rows); } finally { await w.close(); } });
  await t("J31", "NEGATIVE CONTROL for J30: a SECURITY DEFINER function created with search_path=public (or none) is flagged by the same scan", async () => {
    const w = await mkWorld(tplA); try { await w.q("create function public.zz_bad1(x int) returns int language sql security definer set search_path = public as 'select x'; create function public.zz_bad2(x int) returns int language sql security definer as 'select x'");
      const flagged = (await w.q(`select p.oid::regprocedure::text f from pg_proc p where p.prosecdef and p.pronamespace in ('public'::regnamespace,'private'::regnamespace) and p.proname like 'zz_bad%' and coalesce(p.proconfig::text,'') is distinct from '{search_path=""}'`)).rows.length; return flagged === 2 || flagged; } finally { await w.close(); } });
  await t("J32", "SEARCH_PATH SCAN (static): in every APPLY / FORWARD pack under db/proposed (12A, 13A, R1 locked #91/#92/10A/11A, F3) each CREATE [OR REPLACE] FUNCTION that is SECURITY DEFINER pins search_path to '' ; rollback / override packs are exempt only because they restore CAPTURED originals (listed)", async () => {
    const files = []; (function walk(d) { for (const e of readdirSync(d)) { const f = join(d, e); if (statSync(f).isDirectory()) { if (!["proof", "node_modules", "fixtures", "baseline"].includes(e)) walk(f); } else if (f.endsWith(".sql")) files.push(f); } })(P);
    const bad = [], exempt = [], seen = []; for (const f of files) { const rel = relative(P, f), isRb = /ROLLBACK/i.test(rel); const s = readFileSync(f, "utf8"); const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w."]+)\s*\(([\s\S]*?)\bAS\s+\$/gi; let m;
      while ((m = re.exec(s))) { const head = m[0]; if (!/SECURITY\s+DEFINER/i.test(head)) continue; const ok = /SET\s+search_path\s*(=|TO)\s*(''|"")/i.test(head); (isRb ? exempt : seen).push(rel + ":" + m[1] + (ok ? "" : " [search_path NOT pinned]")); if (!isRb && !ok) bad.push(rel + ":" + m[1]); } }
    console.log("   J32 definer functions in apply/forward packs: " + seen.length + "; in rollback/override packs (restore captured originals, exempt): " + exempt.length + " -> " + exempt.join(", ")); return (bad.length === 0 && seen.length >= 20) || JSON.stringify({ bad, n: seen.length }); });
  await t("J40", "DEFAULT-PRIVILEGE HAZARD reproduced (prod-like pg_default_acl for postgres AND supabase_admin in public): a NEW function created in public by postgres is born executable by anon / authenticated / service_role; one created by supabase_admin too; in private it carries PUBLIC EXECUTE (anon 'has' it via PUBLIC) but the schema is unreachable (no USAGE)", async () => {
    const w = await mkWorld(tplO); try { await w.q("create function public.zz_new() returns int language sql as 'select 1'"); await w.admin("grant create on schema public to supabase_admin"); await w.admin("set role supabase_admin; create function public.zz_new_sa() returns int language sql as 'select 1'");
      const sa = (await w.q("select has_function_privilege('anon','public.zz_new_sa()','EXECUTE') a, has_function_privilege('authenticated','public.zz_new_sa()','EXECUTE') b")).rows[0];
      const x = (await w.q("select has_function_privilege('anon','public.zz_new()','EXECUTE') a, has_function_privilege('authenticated','public.zz_new()','EXECUTE') b, has_function_privilege('service_role','public.zz_new()','EXECUTE') c")).rows[0];
      await w.q("create function private.zz_new_p() returns int language sql as 'select 1'"); const y = (await w.q("select has_function_privilege('anon','private.zz_new_p()','EXECUTE') a, has_schema_privilege('anon','private','USAGE') u")).rows[0];
      return (x.a && x.b && x.c && sa.a && sa.b && y.a === true && y.u === false) || JSON.stringify({ x, sa, y }); } finally { await w.close(); } });
  await t("J41", "HARDENING HOLDS under those default ACLs: after the packs every function they create/replace has exactly its intended EXECUTE: core = none; scan, check_in_ticket = authenticated + service_role; get_ticket wrapper = anon + authenticated + service_role (the original's grants); get_ticket__orig_13a = none; no PUBLIC EXECUTE on any of them", async () => {
    const w = await mkWorld(tplA2); try { const rows = (await w.q(`select (select nspname from pg_namespace where oid=p.pronamespace)||'.'||p.proname f, has_function_privilege('anon',p.oid,'EXECUTE') a, has_function_privilege('authenticated',p.oid,'EXECUTE') b, has_function_privilege('service_role',p.oid,'EXECUTE') c, coalesce((select bool_or(x.grantee=0) from aclexplode(p.proacl) x),false) pub from pg_proc p where p.oid = any(array[to_regprocedure('private.door_checkin_core(text)'),to_regprocedure('public.event_checkin_scan(text)'),to_regprocedure('public.check_in_ticket(text)'),to_regprocedure('public.get_ticket(text)'),to_regprocedure('public.get_ticket__orig_13a(text)')]::oid[])`)).rows;
      const want_ = { "private.door_checkin_core": "f/f/f", "public.event_checkin_scan": "f/t/t", "public.check_in_ticket": "f/t/t", "public.get_ticket": "t/t/t", "public.get_ticket__orig_13a": "f/f/f" }; const got = Object.fromEntries(rows.map((r) => [r.f, [r.a, r.b, r.c].map((v) => (v ? "t" : "f")).join("/") + (r.pub ? "+PUBLIC" : "")]));
      const srt = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort())); return (srt(got) === srt(want_) && rows.length === 5) || JSON.stringify(got); } finally { await w.close(); } });
  await t("J42", "NEGATIVE CONTROL: 12A 01 with the explicit REVOKE on the core REMOVED fails its own post-check (the core would carry PUBLIC EXECUTE by PostgreSQL default) and rolls back; with the REVOKE it applies", async () => {
    const w = await mkWorld(tplO); try { const bad = PK.a1.replace("REVOKE ALL ON FUNCTION private.door_checkin_core(text) FROM PUBLIC, anon, authenticated, service_role;", ""); if (bad === PK.a1) return "construction failed"; const f0 = await fp(w); const r = await run(w, bad); const f1 = await fp(w);
      return (!r.ok && /POST-CHECK FAILED/.test(r.err) && /core\.exec_/.test(r.err) && f0 === f1) || JSON.stringify({ ok: r.ok, err: String(r.err).slice(0, 200), same: f0 === f1 }); } finally { await w.close(); } });
  await t("J43", "ALTER DEFAULT PRIVILEGES branch: as the stand-in postgres (NOT a member of supabase_admin) the pack applies and says it skipped the supabase_admin statement; when postgres IS a member (granted by the cluster superuser) it applies the supabase_admin statements too; in BOTH cases no default ACL entry in private grants to PUBLIC / client roles afterwards", async () => {
    const a = await mkWorld(tplO), b = await mkWorld(tplO); try { await applyAll(a, ["a1"]); await b.admin("grant supabase_admin to postgres"); try { await applyAll(b, ["a1"]); } finally { await b.admin("revoke supabase_admin from postgres"); }
      const n = async (w) => (await w.q("select count(*)::int n from pg_default_acl d, aclexplode(d.defaclacl) x where d.defaclnamespace='private'::regnamespace and (x.grantee=0 or x.grantee in (select oid from pg_roles where rolname in ('anon','authenticated','service_role')))")).rows[0].n;
      return (a.notices.some((m) => /skipped/.test(m)) && b.notices.some((m) => /for role supabase_admin in schema private revoked/.test(m)) && (await n(a)) === 0 && (await n(b)) === 0) || JSON.stringify({ a: a.notices.slice(-3), b: b.notices.slice(-3) }); } finally { await a.close(); await b.close(); } });
  await t("J44", "FINDING (documented, tested): an in-schema ALTER DEFAULT PRIVILEGES ... REVOKE cannot remove PostgreSQL's global PUBLIC EXECUTE default, so a function created in private LATER still carries PUBLIC EXECUTE after the pack; the explicit per-object REVOKE (J41/J42) is the real control and the schema stays unreachable (no USAGE for any client role)", async () => {
    const w = await mkWorld(tplA); try { await w.q("create function private.zz_later() returns int language sql as 'select 1'"); const y = (await w.q("select has_function_privilege('anon','private.zz_later()','EXECUTE') pub, has_schema_privilege('anon','private','USAGE') u1, has_schema_privilege('authenticated','private','USAGE') u2, has_schema_privilege('service_role','private','USAGE') u3")).rows[0]; const r = await req(w, "anon", "select private.zz_later()", [], true);
      return (y.pub === true && !y.u1 && !y.u2 && !y.u3 && r.code === "42501") || JSON.stringify({ y, code: r.code }); } finally { await w.close(); } });
}

let fatal = null; const t0 = Date.now();
try { await main(); } catch (e) { fatal = e; console.log("FATAL", e?.stack || e); }
finally { for (const d of [...open]) { try { await d.close(); } catch {} } try { await PG.cleanupAll(); } catch {} try { await PG.dropRoles(); } catch (e) { console.log("dropRoles: " + e.message); } try { await PG.shutdownAdmin(); } catch {} }
const pass = results.filter((r) => r.pass).length, summary = { engine: "real PostgreSQL (socket/TCP)", seconds: Math.round((Date.now() - t0) / 1000), total: results.length, pass, fatal: fatal ? String(fatal.message || fatal) : null };
const out = join(HERE, "out"); mkdirSync(out, { recursive: true }); writeFileSync(join(out, only ? `results-${only}.json` : "results.json"), JSON.stringify({ summary, results }, null, 1));
console.log("SUMMARY " + JSON.stringify(summary)); process.exit(fatal || pass !== results.length ? 1 : 0);
