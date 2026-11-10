/* build.mjs - generator for the 12A door-hardening packs (PROPOSAL ONLY; nothing here touches any database).
   Inputs  : baseline/PROD-FACTS-12A.md  (live prod bodies captured read-only by KODE; the ORIGINAL function bodies are extracted from it mechanically)
             src/*.sql                    (the hardened function sources, hand-written)
   Outputs : packs/*.sql                  (APPLY/ROLLBACK/POSTCHECKS/DRIFT_QUERY; every md5/ACL literal is computed here, never typed)
   Usage   : node build.mjs            write packs/
             node build.mjs --check    exit 1 if packs/ differs from what the inputs generate */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { aclSorted, LOCK_KEY } from "../r1-fix-f3-acl-locks/build-variants.mjs";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_PACK_KEY = "2979301232487107403";
if (LOCK_KEY !== REPO_PACK_KEY) throw new Error("repo-wide pack key changed: " + LOCK_KEY);
const rd = (...p) => readFileSync(join(HERE, ...p), "utf8");
const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");

/* ---------- inputs */
const facts = rd("baseline", "PROD-FACTS-12A.md");
function factsFunction(heading) {
  const i = facts.indexOf("### " + heading); if (i < 0) throw new Error("facts heading not found: " + heading);
  const a = facts.indexOf("```\n", i), b = facts.indexOf("\n```", a + 4);
  return facts.slice(a + 4, b) + "\n";               // the full CREATE OR REPLACE FUNCTION text, as pg_get_functiondef printed it
}
export const bodyOf = (createSql) => { const a = createSql.indexOf("$function$"), b = createSql.indexOf("$function$", a + 10); if (a < 0 || b < 0) throw new Error("no $function$ pair"); return createSql.slice(a + 10, b); };   // = pg_proc.prosrc
export const ORIG = { ticket: factsFunction("public.check_in_ticket(p_qr text)"), scan: factsFunction("public.event_checkin_scan(p_qr_token text)") };
export const HARD = { scan: rd("src/event_checkin_scan.hardened.sql"), ticket: rd("src/check_in_ticket.hardened.sql"), core: rd("src/door_checkin_core.sql") };
export const MD5 = { origTicket: md5(bodyOf(ORIG.ticket)), origScan: md5(bodyOf(ORIG.scan)), hardTicket: md5(bodyOf(HARD.ticket)), hardScan: md5(bodyOf(HARD.scan)), core: md5(bodyOf(HARD.core)) };
for (const [k, v] of Object.entries(HARD)) if (/[^\x00-\x7f]/.test(v)) throw new Error(k + ": non-ASCII in hardened source (md5 parity with PG requires ASCII)");

/* ---------- captured expectations (from PROD-FACTS-12A.md; see PRECHECK-12A.sql for the live comparison) */
const ACL_ORIG_TICKET = "{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}";
const ACL_ORIG_SCAN = "{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}";
const ACL_HARD = "{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}";
const CFG_ORIG = "search_path=public", CFG_HARD = 'search_path=""';
const ORDERS_COLS = "id:bigint,event_id:bigint,tier_id:bigint,buyer_email:text,buyer_handle:text,qty:integer,referral_code:text,qr_token:text,status:text,amount_cents:integer,created_at:timestamp with time zone,stripe_session_id:text,stripe_payment_intent:text,application_fee_cents:integer,organizer_acct:text,checked_in_at:timestamp with time zone"
  .split(",").sort().join(",");
const ORDERS_POLICIES = ["event_orders_organizer_read|SELECT|authenticated|PERMISSIVE", "event_orders_organizer_update|UPDATE|authenticated|PERMISSIVE", "event_orders_owner_read|SELECT|authenticated|PERMISSIVE", "orders_anon_insert|INSERT|anon,authenticated|PERMISSIVE"].sort().join(",");
const ORDERS_ACL = "{anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}";
const ORDERS_CONSTRAINTS = ["f:events:c:event_id", "f:ticket_tiers:n:tier_id", "p:-:-:id"].sort().join(",");

/* ---------- fact expressions: each returns ONE text value */
const F = (sig) => `to_regprocedure('${sig}')`;
const fnx = (sig, sel) => `(SELECT ${sel} FROM pg_proc p WHERE p.oid = ${F(sig)})`;
const aclx = (expr) => `coalesce(${aclSorted(expr)},'(default)')`;
function fnFacts(prefix, sig, name, e) {
  const nsp = sig.split(".")[0];
  return [
    [`${prefix}.overloads`, `(SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = to_regnamespace('${nsp}') AND p.proname = '${name}')`, e.overloads],
    [`${prefix}.src_md5`, fnx(sig, "md5(p.prosrc)"), e.md5],
    [`${prefix}.config`, fnx(sig, "coalesce((SELECT string_agg(c,',') FROM unnest(p.proconfig) c),'(none)')"), e.cfg],
    [`${prefix}.secdef`, fnx(sig, "p.prosecdef::text"), e.secdef],
    [`${prefix}.owner`, fnx(sig, "pg_get_userbyid(p.proowner)::text"), e.owner],
    [`${prefix}.lang_ret`, fnx(sig, "(SELECT l.lanname FROM pg_language l WHERE l.oid=p.prolang)::text||'/'||p.prorettype::regtype::text"), e.langret],
    ...(e.acl ? [[`${prefix}.acl_sorted`, fnx(sig, aclx("p.proacl")), e.acl]] : [[`${prefix}.nonowner_grants`, fnx(sig, "(SELECT count(*) FROM aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) x WHERE x.grantee <> p.proowner)::text"), "0"]]),
    ...(e.exec ? ["anon", "authenticated", "service_role"].map((r, i) => [`${prefix}.exec_${r}`, fnx(sig, `has_function_privilege('${r}', p.oid, 'EXECUTE')::text`), e.exec[i]]) : []),
    ...(e.exec ? [[`${prefix}.exec_public`, fnx(sig, "coalesce((SELECT bool_or(x.grantee = 0) FROM aclexplode(p.proacl) x), false)::text"), "false"]] : []),
  ];
}
const ABS = "ABSENT";
export function facts12(state) {            // state: S0 original | S1 scan hardened + core | S2 both hardened
  const hs = state !== "S0", ht = state === "S2";
  const scan = fnFacts("scan", "public.event_checkin_scan(text)", "event_checkin_scan",
    { overloads: "1", md5: hs ? MD5.hardScan : MD5.origScan, cfg: hs ? CFG_HARD : CFG_ORIG, secdef: "true", owner: "postgres", langret: "plpgsql/jsonb", acl: hs ? ACL_HARD : ACL_ORIG_SCAN, exec: ["false", "true", "true"] });
  const ticket = fnFacts("ticket", "public.check_in_ticket(text)", "check_in_ticket",
    { overloads: "1", md5: ht ? MD5.hardTicket : MD5.origTicket, cfg: ht ? CFG_HARD : CFG_ORIG, secdef: "true", owner: "postgres", langret: "plpgsql/jsonb", acl: ht ? ACL_HARD : ACL_ORIG_TICKET, exec: [ht ? "false" : "true", "true", "true"] });
  const core = hs
    ? fnFacts("core", "private.door_checkin_core(text)", "door_checkin_core", { overloads: "1", md5: MD5.core, cfg: CFG_HARD, secdef: "true", owner: "postgres", langret: "plpgsql/jsonb" })
        .concat([["core.exec_anon", fnx("private.door_checkin_core(text)", "has_function_privilege('anon', p.oid, 'EXECUTE')::text"), "false"], ["core.exec_authenticated", fnx("private.door_checkin_core(text)", "has_function_privilege('authenticated', p.oid, 'EXECUTE')::text"), "false"], ["core.exec_service_role", fnx("private.door_checkin_core(text)", "has_function_privilege('service_role', p.oid, 'EXECUTE')::text"), "false"]])
    : [["core.overloads", "(SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = to_regnamespace('private') AND p.proname = 'door_checkin_core')", "0"]];
  const schema = [
    ["private.schema_exists", "(to_regnamespace('private') IS NOT NULL)::text", hs ? "true" : "false"],
    ["private.schema_objects", "(SELECT ((SELECT count(*) FROM pg_proc WHERE pronamespace = n.nsp) + (SELECT count(*) FROM pg_class WHERE relnamespace = n.nsp) + (SELECT count(*) FROM pg_type WHERE typnamespace = n.nsp AND typtype <> 'c'))::text FROM (SELECT to_regnamespace('private')::oid AS nsp) n WHERE n.nsp IS NOT NULL)", hs ? "1" : ABS],
    ["private.schema_open_grants", "(SELECT count(*) FROM pg_namespace n, aclexplode(n.nspacl) x WHERE n.oid = to_regnamespace('private') AND x.grantee <> n.nspowner)::text", "0"],
  ];
  const O = "'public.event_orders'::regclass";
  const tables = [
    ["orders.relkind_rls", `(SELECT c.relkind::text||'/'||c.relrowsecurity::text||'/'||c.relforcerowsecurity::text FROM pg_class c WHERE c.oid = ${O})`, "r/true/false"],
    ["orders.columns_md5", `(SELECT md5(string_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod), ',' ORDER BY a.attname::text COLLATE "C")) FROM pg_attribute a WHERE a.attrelid = ${O} AND a.attnum > 0 AND NOT a.attisdropped)`, md5(ORDERS_COLS)],
    ["orders.acl_sorted", `(SELECT ${aclx("c.relacl")} FROM pg_class c WHERE c.oid = ${O})`, ORDERS_ACL],
    ["orders.policies_md5", `(SELECT md5(string_agg(x, ',' ORDER BY x COLLATE "C")) FROM (SELECT p.policyname::text||'|'||p.cmd||'|'||(SELECT string_agg(r::text, ',' ORDER BY r::text COLLATE "C") FROM unnest(p.roles) r)||'|'||p.permissive AS x FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'event_orders') s)`, md5(ORDERS_POLICIES)],
    ["orders.constraints", `(SELECT string_agg(x, ',' ORDER BY x COLLATE "C") FROM (SELECT c.contype::text||':'||coalesce((SELECT relname::text FROM pg_class WHERE oid = c.confrelid),'-')||':'||coalesce(nullif(c.confdeltype::text,' '),'-')||':'||(SELECT string_agg(a.attname::text, '+' ORDER BY a.attname::text COLLATE "C") FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) AS x FROM pg_constraint c WHERE c.conrelid = ${O} AND c.contype IN ('p','f','u','x')) s)`, ORDERS_CONSTRAINTS],
    ["orders.status_check", `(SELECT count(*)::text FROM pg_constraint c WHERE c.conrelid = ${O} AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ~ 'pending' AND pg_get_constraintdef(c.oid) ~ 'paid' AND pg_get_constraintdef(c.oid) ~ 'checked_in' AND pg_get_constraintdef(c.oid) ~ 'refunded' AND pg_get_constraintdef(c.oid) ~ 'cancelled' AND (SELECT count(*) FROM regexp_matches(pg_get_constraintdef(c.oid), '''[^'']*''', 'g')) = 5)`, "1"],
    ["orders.check_count", `(SELECT count(*)::text FROM pg_constraint c WHERE c.conrelid = ${O} AND c.contype = 'c')`, "1"],
    ["orders.user_triggers", `(SELECT count(*)::text FROM pg_trigger t WHERE t.tgrelid = ${O} AND NOT t.tgisinternal)`, "0"],
    ["deps.columns_present", `(SELECT count(*)::text FROM (VALUES ('events','id'),('events','slug'),('events','title'),('events','owner_handle'),('app_users','id'),('app_users','handle'),('ticket_tiers','id'),('ticket_tiers','name')) v(t,c) WHERE EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.'||v.t) AND a.attname = v.c AND NOT a.attisdropped))`, "8"],
    ["deps.auth_uid", `(SELECT count(*)::text FROM pg_proc p WHERE p.oid = ${F("auth.uid()")})`, "1"],
  ];
  return [...scan, ...ticket, ...core, ...schema, ...tables];
}

/* ---------- SQL fragments */
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const BANNER = (title, extra = "") => `-- ${title}
-- 12A DOOR HARDENING: PROPOSAL ONLY. NOT APPLIED ANYWHERE. GENERATED by db/proposed/12a-door-hardening/build.mjs (node build.mjs --check fails if this file drifts from its inputs).
-- Apply gate: NO prod SQL without Joe's relayed yes + a Sentinel pass + a backup. Sentinel's conditions in atlas/checkin-scan-fix.md were NOT available and are UNREVIEWED.
-- Run as postgres, ONE transaction, ON_ERROR_STOP (psql -v ON_ERROR_STOP=1) or a single-call SQL executor; right after BEGIN come SET LOCAL lock_timeout = '5s', the repo-wide pack advisory lock, and SET LOCAL lock_timeout = '5s' again.
${extra}`;
const LOCK = `-- repo-wide pack key (same as R1 #136): serialises every pack run; transaction-scoped; a second run waits for a running pack to commit or roll back, for at most 5 s:
-- lock_timeout is set BEFORE the lock (so the lock wait itself is bounded; a timeout set after a lock statement cannot bound that statement) and again right after it (every later lock wait). Expiry = SQLSTATE 55P03, nothing changed.
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(${REPO_PACK_KEY});
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';`;
/* guard: abort (RAISE) when ANY listed fact differs from the expected literal. `keep` selects the facts to check. */
function guardDo(tag, label, list) {
  const rows = list.map(([n, x, e]) => `  v := coalesce(${x}, ${q(ABS)});\n  IF v IS DISTINCT FROM ${q(e)} THEN f := f || (${q(n + ": expected " + e + " but live is ")} || v); END IF;`).join("\n");
  return `DO $${tag}$
DECLARE
  f text[] := ARRAY[]::text[];
  v text;
BEGIN
  IF current_user <> 'postgres' THEN f := f || ('run as postgres; current_user=' || current_user); END IF;
${rows}
  IF array_length(f, 1) IS NOT NULL THEN
    RAISE EXCEPTION '12A ${label}: DRIFT, ABORT, nothing applied. % mismatch(es): %', array_length(f, 1), array_to_string(f, ' ; ');
  END IF;
END
$${tag}$;`;
}
/* evidence SELECT: one row per fact with expected/actual/ok, plus a summary row. Retained output. */
function rowsCte(state, filter = () => true) {
  const list = facts12(state).filter(([n]) => filter(n));
  const a = list.map(([n, x]) => `SELECT ${q(n)} AS name, coalesce(${x}, ${q(ABS)}) AS actual`).join("\n  UNION ALL ");
  const e = list.map(([n, , ex]) => `(${q(n)}, ${q(ex)})`).join(",\n  ");
  return `WITH a(name, actual) AS (
  ${a}
), e(name, expected) AS (VALUES
  ${e}
), r AS (SELECT e.name, e.expected, a.actual, (a.actual IS NOT DISTINCT FROM e.expected) AS ok FROM e LEFT JOIN a USING (name))`;
}
export function evidenceSql(state, filter) {
  return `${rowsCte(state, filter)}
SELECT '000_ALL_OK' AS name, ${q(state)} AS expected, ${q(state)} AS actual, bool_and(ok) AS ok FROM r
UNION ALL SELECT name, expected, actual, ok FROM r
ORDER BY 1;`;
}
const assertAllOk = (tag, label, state, filter) => `DO $${tag}$
DECLARE bad text;
BEGIN
  SELECT string_agg(name || ' (expected ' || expected || ', got ' || actual || ')', ' ; ') INTO bad FROM (
${rowsCte(state, filter)}
SELECT name, expected, actual, ok FROM r
  ) z WHERE NOT ok;
  IF bad IS NOT NULL THEN RAISE EXCEPTION '12A ${label}: POST-CHECK FAILED (transaction rolls back): %', bad; END IF;
END
$${tag}$;`;

const REV_PRIV = (sig) => `REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION ${sig} TO authenticated, service_role;`;

/* ---------- packs */
export function buildAll() {
  const out = new Map();
  /* 01 APPLY: private schema + core + event_checkin_scan */
  out.set("12a_01_event_checkin_scan_APPLY_PROPOSED.sql", `${BANNER("12A step 1 of 2 APPLY: private.door_checkin_core (new, no grants) + hardened public.event_checkin_scan", "-- Creates: schema private (aborts if it already exists), private.door_checkin_core(text). Replaces: public.event_checkin_scan(text). Does NOT touch check_in_ticket (step 2).\n-- Run it a second time and it refuses at the guard (private already exists / scan no longer original) with nothing changed.")}
BEGIN;
${LOCK}

-- 1. DRIFT GUARD: live state must be EXACTLY the captured prod state S0 (scan body md5, config, ACL; event_orders columns/ACL/policies/constraints; private absent). Aborts the whole transaction otherwise.
${guardDo("guard", "APPLY-01", facts12("S0").filter(([n]) => !n.startsWith("ticket.")))}

-- 2. private schema + core. No grants to anyone but the owner. (The two public wrappers are SECURITY DEFINER and run as the owner.)
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
${HARD.core.trim()};
REVOKE ALL ON FUNCTION private.door_checkin_core(text) FROM PUBLIC, anon, authenticated, service_role;

-- 3. hardened public.event_checkin_scan (CREATE OR REPLACE keeps owner; ACL is set explicitly below)
${HARD.scan.trim()};
${REV_PRIV("public.event_checkin_scan(text)")}

-- 4. POST-CHECKS (assert; a failure rolls the whole transaction back). State S1 = scan hardened + core present, ticket still ORIGINAL.
${assertAllOk("post", "APPLY-01", "S1")}

-- 5. RETAINED OUTPUT: keep this result set with the change record (ok must be true on every row).
${evidenceSql("S1")}
COMMIT;
`);
  /* 02 APPLY: check_in_ticket */
  out.set("12a_02_check_in_ticket_APPLY_PROPOSED.sql", `${BANNER("12A step 2 of 2 APPLY: hardened public.check_in_ticket (delegates to private.door_checkin_core)", "-- Requires step 1 applied and verified (state S1). Aborts at the guard otherwise (including if run twice).")}
BEGIN;
${LOCK}

-- 1. DRIFT GUARD: state must be exactly S1 (scan hardened, core present and ungranted, ticket still the captured original, tables unchanged).
${guardDo("guard", "APPLY-02", facts12("S1"))}

-- 2. hardened public.check_in_ticket: anon EXECUTE revoked, search_path empty, buyer email gone, null-owner hole closed (inside the core).
${HARD.ticket.trim()};
${REV_PRIV("public.check_in_ticket(text)")}

-- 3. POST-CHECKS (assert). State S2 = both hardened.
${assertAllOk("post", "APPLY-02", "S2")}

-- 4. RETAINED OUTPUT
${evidenceSql("S2")}
COMMIT;
`);
  /* ROLLBACK 02 */
  out.set("12a_02_check_in_ticket_ROLLBACK_PROPOSED.sql", `${BANNER("12A ROLLBACK of step 2: restore the captured ORIGINAL public.check_in_ticket body and ACL exactly", "-- Restores the prod-captured body verbatim (including the defects: anon EXECUTE, null-owner hole, buyer email). Use only to back out; run BEFORE the step-1 rollback.")}
BEGIN;
${LOCK}

${guardDo("guard", "ROLLBACK-02", facts12("S2"))}

${ORIG.ticket.trim()};
REVOKE ALL ON FUNCTION public.check_in_ticket(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text) TO anon, authenticated, service_role;

${assertAllOk("post", "ROLLBACK-02", "S1")}

${evidenceSql("S1")}
COMMIT;
`);
  /* ROLLBACK 01 */
  out.set("12a_01_event_checkin_scan_ROLLBACK_PROPOSED.sql", `${BANNER("12A ROLLBACK of step 1: restore the captured ORIGINAL public.event_checkin_scan, drop private.door_checkin_core and schema private", "-- Requires check_in_ticket already rolled back (state S1): the guard refuses otherwise, because the hardened ticket function depends on the core.")}
BEGIN;
${LOCK}

${guardDo("guard", "ROLLBACK-01", facts12("S1"))}

${ORIG.scan.trim()};
REVOKE ALL ON FUNCTION public.event_checkin_scan(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_checkin_scan(text) TO authenticated, service_role;
DROP FUNCTION private.door_checkin_core(text);
DROP SCHEMA private;            -- no CASCADE: fails (and rolls back) if anything else lives there

${assertAllOk("post", "ROLLBACK-01", "S0")}

${evidenceSql("S0")}
COMMIT;
`);
  for (const [st, nm] of [["S0", "S0_original"], ["S1", "S1_after-step1"], ["S2", "S2_after-step2"]])
    out.set(`12a_POSTCHECKS_${nm}_PROPOSED.sql`, `${BANNER(`12A POSTCHECKS for state ${st}: one read-only statement; ok must be true on every row`, "-- Read-only (a single SELECT over the catalog). 000_ALL_OK is the summary row.")}
${evidenceSql(st)}
`);
  {
    const l = facts12("S0"), l1 = facts12("S1"), l2 = facts12("S2");
    const byName = (arr) => new Map(arr.map(([n, x, e]) => [n, { x, e }]));
    const m0 = byName(l), m1 = byName(l1), m2 = byName(l2);
    const names = [...new Set([...l, ...l1, ...l2].map(([n]) => n))];
    const expr = (n) => (m2.get(n) || m1.get(n) || m0.get(n)).x;
    const A = names.map((n) => `SELECT ${q(n)} AS name, coalesce(${expr(n)}, ${q(ABS)}) AS actual`).join("\n  UNION ALL ");
    const ex = (m, n) => (m.has(n) ? m.get(n).e : ABS);
    const E = names.map((n) => `(${q(n)}, ${q(ex(m0, n))}, ${q(ex(m1, n))}, ${q(ex(m2, n))})`).join(",\n  ");
    out.set("12a_DRIFT_QUERY_PROPOSED.sql", `${BANNER("12A DRIFT_QUERY: read-only; classifies the live state as S0_original | S1_after-step1 | S2_after-step2 | DRIFT and lists every guarded fact", "-- Safe to run any time, as any role that can read the catalog (pg_proc/pg_class/pg_policies are readable by default). Reads NO row of any table.\n-- Expected before any apply: first row = S0_original.")}
WITH a(name, actual) AS (
  ${A}
), e(name, s0, s1, s2) AS (VALUES
  ${E}
), r AS (SELECT e.name, e.s0, e.s1, e.s2, a.actual FROM e LEFT JOIN a USING (name))
SELECT '000_STATE' AS name,
  CASE WHEN bool_and(actual IS NOT DISTINCT FROM s0) THEN 'S0_original'
       WHEN bool_and(actual IS NOT DISTINCT FROM s1) THEN 'S1_after-step1'
       WHEN bool_and(actual IS NOT DISTINCT FROM s2) THEN 'S2_after-step2'
       ELSE 'DRIFT' END AS actual, NULL::text AS s0, NULL::text AS s1, NULL::text AS s2 FROM r
UNION ALL SELECT name, actual, s0, s1, s2 FROM r
ORDER BY 1;
`);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check"); let bad = 0;
  const files = buildAll();
  for (const [name, content] of files) {
    const p = join(HERE, "packs", name);
    if (check) { if (!existsSync(p) || readFileSync(p, "utf8") !== content) { console.log("DRIFT " + name); bad++; } }
    else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); }
  }
  console.log(`${check ? "checked" : "wrote"} ${files.size} files; md5 ${JSON.stringify(MD5)}${bad ? "; " + bad + " drifted" : ""}`);
  process.exit(bad ? 1 : 0);
}
