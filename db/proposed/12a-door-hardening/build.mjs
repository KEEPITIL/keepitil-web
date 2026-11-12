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

/* ---------- schema private (PROD HAS IT ALREADY: owner postgres, nspacl NULL, four postgres-only incident/backup tables, no functions; see ~/work/notes-pack/prod-private-schema-facts.md).
   The packs therefore NEVER require the schema to be absent and NEVER drop it. The guard accepts exactly two shapes of a PRE-apply schema:
     (a) absent (fresh database: the pack creates it), or
     (b) present and EXACTLY: owner postgres; no ACL entry for anyone but the owner (no PUBLIC / anon / authenticated / service_role); no function; only the four known tables
         (all four or none; owner postgres, relacl NULL or {postgres=arwdDxtm/postgres}, no column ACLs) plus their own indexes, owned sequences and row/array types; no default ACL
         entry in the schema that grants anything to PUBLIC / anon / authenticated / service_role.
   Anything else (an unknown table, view, function, type, a client-role grant) aborts. In state S1/S2 exactly one more object is allowed: private.door_checkin_core(text).
   Mode "ROLLBACK" / "ROLLBACK0" (override rollback packs only) skips the "no foreign objects" rule (later packs, e.g. #91, legitimately add objects to private) but keeps the
   known-table and client-access rules. */
export const PRIV_KNOWN = ["incident_auth_counts_20261106", "incident_session_ids_20261106", "incident_refresh_ids_20261106", "qr_token_backup_20261106"];
const KN = `ARRAY[${PRIV_KNOWN.map((n) => "'" + n + "'").join(",")}]::name[]`;
const PSCH = "to_regnamespace('private')";
export const PRIV_FP = `(SELECT md5(coalesce(string_agg(x, E'\\n' ORDER BY x COLLATE "C"), '')) FROM (SELECT c.relname::text || '|' || c.relkind::text || '|' || pg_get_userbyid(c.relowner)::text || '|' || coalesce(c.relacl::text, '-') || '|' || coalesce((SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || coalesce(a.attacl::text, '-'), ',' ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped), '') AS x FROM pg_class c WHERE c.relnamespace = ${PSCH} AND c.relkind = 'r' AND c.relname = ANY (${KN})) z)`;
export const PRIV_NSPACL = `coalesce((SELECT coalesce(n.nspacl::text, '(null)') FROM pg_namespace n WHERE n.oid = ${PSCH}), '${ABS}')`;
const CLIENT_ROLES = "(SELECT rolname::text AS r FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) cr";
function privContentsExpr(mode) {
  const allowCore = mode === "S1" || mode === "ROLLBACK", strict = mode === "S0" || mode === "S1";
  const rel = `c.relnamespace = s.oid AND NOT ((c.relkind = 'r' AND c.relname = ANY (${KN})) OR (c.relkind = 'i' AND EXISTS (SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid WHERE i.indexrelid = c.oid AND t.relnamespace = s.oid AND t.relname = ANY (${KN}))) OR (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d JOIN pg_class t ON t.oid = d.refobjid WHERE d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a','i') AND t.relnamespace = s.oid AND t.relname = ANY (${KN}))))`;
  const typ = `ty.typnamespace = s.oid AND NOT ((ty.typtype = 'c' AND EXISTS (SELECT 1 FROM pg_class t WHERE t.oid = ty.typrelid AND t.relnamespace = s.oid)) OR (ty.typcategory = 'A' AND EXISTS (SELECT 1 FROM pg_type e WHERE e.oid = ty.typelem AND e.typtype = 'c' AND e.typnamespace = s.oid)))`;
  const parts = [
    `CASE WHEN s.nspowner <> to_regrole('postgres') THEN 'schema owner is not postgres' END`,
    `(SELECT 'known incident tables partially present (' || count(*) || ' of 4)' FROM pg_class c WHERE c.relnamespace = s.oid AND c.relkind = 'r' AND c.relname = ANY (${KN}) HAVING count(*) NOT IN (0, 4))`,
    `(SELECT 'known incident table(s) with unexpected owner / ACL / column ACL: ' || string_agg(c.relname::text, ', ' ORDER BY c.relname::text) FROM pg_class c WHERE c.relnamespace = s.oid AND c.relkind = 'r' AND c.relname = ANY (${KN}) AND (c.relowner <> to_regrole('postgres') OR coalesce(c.relacl::text, '{postgres=arwdDxtm/postgres}') <> '{postgres=arwdDxtm/postgres}' OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attacl IS NOT NULL)))`,
  ];
  if (strict) parts.push(
    `(SELECT 'unexpected function(s): ' || string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace = s.oid${allowCore ? " AND p.oid <> to_regprocedure('private.door_checkin_core(text)')" : ""})`,
    `(SELECT 'unexpected relation(s): ' || string_agg(c.relname::text || '/' || c.relkind::text, ', ' ORDER BY c.relname::text) FROM pg_class c WHERE ${rel})`,
    `(SELECT 'unexpected type(s): ' || string_agg(ty.typname::text, ', ' ORDER BY ty.typname::text) FROM pg_type ty WHERE ${typ})`,
    `(SELECT 'unexpected collation / operator / conversion / statistics object(s): ' || ((SELECT count(*) FROM pg_collation WHERE collnamespace = s.oid) + (SELECT count(*) FROM pg_operator WHERE oprnamespace = s.oid) + (SELECT count(*) FROM pg_conversion WHERE connamespace = s.oid) + (SELECT count(*) FROM pg_statistic_ext WHERE stxnamespace = s.oid))::text WHERE (SELECT count(*) FROM pg_collation WHERE collnamespace = s.oid) + (SELECT count(*) FROM pg_operator WHERE oprnamespace = s.oid) + (SELECT count(*) FROM pg_conversion WHERE connamespace = s.oid) + (SELECT count(*) FROM pg_statistic_ext WHERE stxnamespace = s.oid) > 0)`);
  return `coalesce((SELECT nullif(concat_ws(' ; ',\n    ${parts.join(",\n    ")}), '') FROM pg_namespace s WHERE s.oid = ${PSCH}), 'ok')`;
}
const privClientAccess = `coalesce(nullif(concat_ws(' ; ',
    (SELECT 'schema privilege ' || string_agg(cr.r || ':' || p, ',') FROM ${CLIENT_ROLES}, unnest(ARRAY['USAGE','CREATE']) p WHERE has_schema_privilege(cr.r, ${PSCH}::oid, p)),
    (SELECT 'schema ACL names PUBLIC' FROM pg_namespace n, aclexplode(n.nspacl) x WHERE n.oid = ${PSCH} AND x.grantee = 0 LIMIT 1),
    (SELECT 'relation privilege ' || string_agg(DISTINCT c.relname::text || '/' || cr.r, ',') FROM pg_class c, ${CLIENT_ROLES} WHERE c.relnamespace = ${PSCH} AND c.relkind IN ('r','v','m','S','p','f') AND has_table_privilege(cr.r, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
    (SELECT 'relation ACL names PUBLIC: ' || string_agg(DISTINCT c.relname::text, ',') FROM pg_class c, aclexplode(c.relacl) x WHERE c.relnamespace = ${PSCH} AND x.grantee = 0),
    (SELECT 'default ACL entries in private granting to PUBLIC / client roles: ' || count(*)::text FROM pg_default_acl d, aclexplode(d.defaclacl) x WHERE d.defaclnamespace = ${PSCH} AND (x.grantee = 0 OR x.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))) HAVING count(*) > 0)), ''), 'none')`;
function privFacts(mode) {
  return [["private.contents", privContentsExpr(mode), "ok"], ["private.client_access", privClientAccess, "none"]];
}
export function facts12(state, opts = {}) {            // state: S0 original | S1 scan hardened + core | S2 both hardened; opts.rollback = relaxed private-schema policing (foreign objects of LATER packs allowed)
  const hs = state !== "S0", ht = state === "S2";
  const scan = fnFacts("scan", "public.event_checkin_scan(text)", "event_checkin_scan",
    { overloads: "1", md5: hs ? MD5.hardScan : MD5.origScan, cfg: hs ? CFG_HARD : CFG_ORIG, secdef: "true", owner: "postgres", langret: "plpgsql/jsonb", acl: hs ? ACL_HARD : ACL_ORIG_SCAN, exec: ["false", "true", "true"] });
  const ticket = fnFacts("ticket", "public.check_in_ticket(text)", "check_in_ticket",
    { overloads: "1", md5: ht ? MD5.hardTicket : MD5.origTicket, cfg: ht ? CFG_HARD : CFG_ORIG, secdef: "true", owner: "postgres", langret: "plpgsql/jsonb", acl: ht ? ACL_HARD : ACL_ORIG_TICKET, exec: [ht ? "false" : "true", "true", "true"] });
  const core = hs
    ? fnFacts("core", "private.door_checkin_core(text)", "door_checkin_core", { overloads: "1", md5: MD5.core, cfg: CFG_HARD, secdef: "true", owner: "postgres", langret: "plpgsql/jsonb" })
        .concat([["core.exec_anon", fnx("private.door_checkin_core(text)", "has_function_privilege('anon', p.oid, 'EXECUTE')::text"), "false"], ["core.exec_authenticated", fnx("private.door_checkin_core(text)", "has_function_privilege('authenticated', p.oid, 'EXECUTE')::text"), "false"], ["core.exec_service_role", fnx("private.door_checkin_core(text)", "has_function_privilege('service_role', p.oid, 'EXECUTE')::text"), "false"]])
    : [["core.overloads", "(SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = to_regnamespace('private') AND p.proname = 'door_checkin_core')", "0"]];
  const schema = privFacts(hs ? (opts.rollback ? "ROLLBACK" : "S1") : (opts.rollback ? "ROLLBACK0" : "S0"));

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
-- Apply gate: NO prod SQL without Joe's relayed yes + a Sentinel pass at the exact commit + a VERIFIED backup (single definition: db/proposed/13a-orders-hardening/RUNBOOK-APPLY-BACKUP-ROLLBACK.md section 2). Sentinel's conditions in atlas/checkin-scan-fix.md were NOT available and are UNREVIEWED.
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
function rowsCte(state, filter = () => true, opts = {}) {
  const list = facts12(state, opts).filter(([n]) => filter(n));
  const a = list.map(([n, x]) => `SELECT ${q(n)} AS name, coalesce(${x}, ${q(ABS)}) AS actual`).join("\n  UNION ALL ");
  const e = list.map(([n, , ex]) => `(${q(n)}, ${q(ex)})`).join(",\n  ");
  return `WITH a(name, actual) AS (
  ${a}
), e(name, expected) AS (VALUES
  ${e}
), r AS (SELECT e.name, e.expected, a.actual, (a.actual IS NOT DISTINCT FROM e.expected) AS ok FROM e LEFT JOIN a USING (name))`;
}
export function evidenceSql(state, filter, opts = {}) {
  return `${rowsCte(state, filter, opts)}
SELECT '000_ALL_OK' AS name, ${q(state)} AS expected, ${q(state)} AS actual, bool_and(ok) AS ok FROM r
UNION ALL SELECT name, expected, actual, ok FROM r
ORDER BY 1;`;
}
const assertAllOk = (tag, label, state, filter, opts = {}) => `DO $${tag}$
DECLARE bad text;
BEGIN
  SELECT string_agg(name || ' (expected ' || expected || ', got ' || actual || ')', ' ; ') INTO bad FROM (
${rowsCte(state, filter, opts)}
SELECT name, expected, actual, ok FROM r
  ) z WHERE NOT ok;
  IF bad IS NOT NULL THEN RAISE EXCEPTION '12A ${label}: POST-CHECK FAILED (transaction rolls back): %', bad; END IF;
END
$${tag}$;`;

/* every function the packs create or replace: EXECUTE is revoked from PUBLIC and from EVERY client role explicitly (so the default ACLs of postgres / supabase_admin in public, which grant EXECUTE on
   NEW functions to anon / authenticated / service_role, cannot leak), then exactly the intended EXECUTE is granted back. */
const REV_PRIV = (sig, grantTo = "authenticated, service_role") => `REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated, service_role;\nGRANT EXECUTE ON FUNCTION ${sig} TO ${grantTo};`;
const REV_ALL = (sig) => `REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated, service_role;`;
const ADP = `-- default-privilege hardening for objects created in schema private LATER (belt and braces: PostgreSQL cannot remove the global PUBLIC EXECUTE default with an in-schema REVOKE, so the real control is the explicit
-- REVOKE on every object this pack creates; this block makes sure no in-schema default can ever hand out anything to the client roles, and the guard/post-check verify that none exists).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
-- the same for role supabase_admin: PostgreSQL allows it only to a superuser or a member of supabase_admin. If the apply role is neither, the pack says so (NOTICE) instead of failing:
-- supabase_admin objects in schema private cannot arise from this pack anyway (it creates everything as postgres), and the post-check proves no client default ACL exists in private.
DO $adp$
BEGIN
  IF to_regrole('supabase_admin') IS NOT NULL AND pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA private REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role';
    RAISE NOTICE '12A: default privileges for role supabase_admin in schema private revoked';
  ELSE
    RAISE NOTICE '12A: current_user is not a member of supabase_admin (or that role does not exist): ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin skipped; verified instead (post-check private.client_access) that no default ACL entry in schema private grants anything to PUBLIC or a client role';
  END IF;
END
$adp$;`;
const FP_RECORD = (tag) => `DO $${tag}$
BEGIN
  -- remember the pre-existing private objects exactly as they are NOW (inside this transaction only); the post-check compares
  PERFORM set_config('kil.pack12a.private_fp', ${PRIV_FP}, true);
  PERFORM set_config('kil.pack12a.private_nspacl', ${PRIV_NSPACL}, true);
END
$${tag}$;`;
const FP_CHECK = (tag, label) => `DO $${tag}$
BEGIN
  IF ${PRIV_FP} IS DISTINCT FROM current_setting('kil.pack12a.private_fp', true) THEN
    RAISE EXCEPTION '12A ${label}: POST-CHECK FAILED (transaction rolls back): the pre-existing private.* tables (owner / ACL / column list) differ from their state at the start of this pack';
  END IF;
  IF current_setting('kil.pack12a.private_nspacl', true) IS DISTINCT FROM '${ABS}' AND ${PRIV_NSPACL} IS DISTINCT FROM current_setting('kil.pack12a.private_nspacl', true) THEN
    RAISE EXCEPTION '12A ${label}: POST-CHECK FAILED (transaction rolls back): the ACL of the pre-existing schema private changed';
  END IF;
END
$${tag}$;`;
const sqlLit = (t) => t.replace(/'/g, "''").replace(/%/g, "%%");
const ACK = (id, what0) => { const what = sqlLit(what0); return `-- EXPLICIT OVERRIDE REQUIRED. This pack REOPENS security holes (${what}). It refuses to run unless the same session has executed, BEFORE this file:
--     SET kil.rollback_reopen_ack = 'I-ACCEPT-REOPENING-HOLES-${id}';
-- (psql: -c "SET kil.rollback_reopen_ack = '...'" -f <this file>, same invocation = same session; single-call executors: put that statement in front of this text in the same call).
DO $ack$
BEGIN
  IF coalesce(current_setting('kil.rollback_reopen_ack', true), '') IS DISTINCT FROM 'I-ACCEPT-REOPENING-HOLES-${id}' THEN
    RAISE EXCEPTION '12A ROLLBACK-${id} (REOPEN HOLES, UNSAFE): refused. The acknowledgement is missing or wrong. This pack reopens: ${what}. Nothing was changed. The default rollback pack keeps every hole closed; read the RUNBOOK before overriding.';
  END IF;
  RAISE WARNING '*** UNSAFE ROLLBACK ${id}: REOPENING SECURITY HOLES ON PURPOSE (${what}). Acknowledged via kil.rollback_reopen_ack. Re-apply the APPLY pack as soon as the reason for this back-out is fixed. ***';
END
$ack$;`; };
const REFUSE = (id, holes0) => { const holes = sqlLit(holes0); return `DO $refuse$
BEGIN
  RAISE EXCEPTION '12A ROLLBACK-${id} REFUSED (fail closed): the live state is the hardened state, and every change of this step closes a hole; undoing it would REOPEN: ${holes}. NOTHING WAS CHANGED. If a functional regression forces a back-out, fix forward (the hardened functions are small and fully proven). To restore the captured original ON PURPOSE use ${id === "02" ? "12a_02_check_in_ticket" : "12a_01_event_checkin_scan"}_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql with its explicit acknowledgement (see RUNBOOK-APPLY-BACKUP-ROLLBACK.md section 5).';
END
$refuse$;`; };
const HOLES_TICKET = "(1) anon EXECUTE on public.check_in_ticket (the original ACL grants anon); (2) the null-owner / empty-handle admission hole (a signed-in caller without a handle is admitted at an event with no owner); (3) a case-sensitive owner compare; (4) the attendee e-mail in the response; (5) an unqualified SECURITY DEFINER body running with search_path=public (hijackable)";
const HOLES_SCAN = "(1) the empty-string handle admission hole; (2) a duplicated qr_token being guessed instead of refused; (3) the refund race (an order refunded mid-scan could still be admitted); (4) the attendee contact fields in the response; (5) an unqualified SECURITY DEFINER body running with search_path=public (hijackable)";

/* ---------- packs */
export function buildAll() {
  const out = new Map();
  /* 01 APPLY: private schema (created only if absent) + core + event_checkin_scan */
  out.set("12a_01_event_checkin_scan_APPLY_PROPOSED.sql", `${BANNER("12A step 1 of 2 APPLY: private.door_checkin_core (new, no grants) + hardened public.event_checkin_scan", "-- Creates: private.door_checkin_core(text); creates schema private ONLY if it does not exist (prod HAS it: four postgres-only incident tables, which are left untouched and fingerprint-checked). Replaces: public.event_checkin_scan(text). Does NOT touch check_in_ticket (step 2).\n-- Run it a second time and it refuses at the guard (scan no longer original) with nothing changed.")}
BEGIN;
${LOCK}

-- 1. DRIFT GUARD: live state must be EXACTLY the captured prod state S0 (scan body md5, config, ACL; event_orders columns/ACL/policies/constraints; schema private either absent or exactly the four known postgres-only tables with no client access and nothing else).
${guardDo("guard", "APPLY-01", facts12("S0").filter(([n]) => !n.startsWith("ticket.")))}

-- 2. remember the pre-existing private objects (fingerprint of the four known tables + the schema ACL); compared again in the post-check.
${FP_RECORD("fp")}

-- 3. schema private: CREATE it only when absent (fresh database); an existing schema (prod) is NOT touched. Never dropped by any pack.
DO $schema$
BEGIN
  IF to_regnamespace('private') IS NULL THEN
    CREATE SCHEMA private;
    REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
    RAISE NOTICE '12A: schema private did not exist: created (fresh-database branch)';
  ELSE
    RAISE NOTICE '12A: schema private exists (prod-shaped branch): left untouched; the guard proved its contents';
  END IF;
END
$schema$;
${ADP}

-- 4. private.door_checkin_core: no grants to anyone but the owner (the two public wrappers are SECURITY DEFINER and run as the owner).
${HARD.core.trim()};
${REV_ALL("private.door_checkin_core(text)")}

-- 5. hardened public.event_checkin_scan (CREATE OR REPLACE keeps owner; ACL is set explicitly: every client role revoked, then the intended EXECUTE granted)
${HARD.scan.trim()};
${REV_PRIV("public.event_checkin_scan(text)")}

-- 6. POST-CHECKS (assert; a failure rolls the whole transaction back). State S1 = scan hardened + core present, ticket still ORIGINAL; private holds only its pre-existing objects + the core; the pre-existing tables are unchanged.
${assertAllOk("post", "APPLY-01", "S1")}
${FP_CHECK("fpcheck", "APPLY-01")}

-- 7. RETAINED OUTPUT: keep this result set with the change record (ok must be true on every row).
${evidenceSql("S1")}
COMMIT;
`);
  /* 02 APPLY: check_in_ticket */
  out.set("12a_02_check_in_ticket_APPLY_PROPOSED.sql", `${BANNER("12A step 2 of 2 APPLY: hardened public.check_in_ticket (delegates to private.door_checkin_core)", "-- Requires step 1 applied and verified (state S1). Aborts at the guard otherwise (including if run twice).")}
BEGIN;
${LOCK}

-- 1. DRIFT GUARD: state must be exactly S1 (scan hardened, core present and ungranted, ticket still the captured original, tables unchanged, private unchanged).
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
  /* ROLLBACK 02 (DEFAULT = FAIL CLOSED) */
  out.set("12a_02_check_in_ticket_ROLLBACK_PROPOSED.sql", `${BANNER("12A ROLLBACK of step 2, DEFAULT = FAIL CLOSED: refuses, because undoing step 2 would reopen security holes", "-- This default rollback never reopens a hole. Every change of step 2 (anon EXECUTE revoked, null-owner / empty-handle hole closed, buyer e-mail dropped, search_path pinned) is security-closing and the only helper (private.door_checkin_core) is still called by the hardened wrapper, so there is NOTHING in step 2 that can be reverted without reopening a hole: the pack verifies the state (so a wrong-state run says DRIFT) and then ABORTS with nothing changed.\n-- Restoring the captured original on purpose: 12a_02_check_in_ticket_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql (explicit acknowledgement).")}
BEGIN;
${LOCK}

${guardDo("guard", "ROLLBACK-02", facts12("S2", { rollback: true }))}

${REFUSE("02", HOLES_TICKET)}

COMMIT;
`);
  out.set("12a_02_check_in_ticket_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql", `${BANNER("12A ROLLBACK of step 2 (REOPEN HOLES, UNSAFE): restore the captured ORIGINAL public.check_in_ticket body and ACL exactly", "-- UNSAFE: restores the prod-captured body verbatim, INCLUDING its defects (anon EXECUTE, null-owner / empty-handle hole, buyer e-mail, search_path=public). Requires the explicit acknowledgement below. Run BEFORE the step-1 override rollback.")}
BEGIN;
${LOCK}

${ACK("12A-02", "anon EXECUTE on check_in_ticket, the null-owner / empty-handle admission hole, the buyer e-mail in the response, an unqualified definer body under search_path=public")}

${guardDo("guard", "ROLLBACK-02-UNSAFE", facts12("S2", { rollback: true }))}

${ORIG.ticket.trim()};
REVOKE ALL ON FUNCTION public.check_in_ticket(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text) TO anon, authenticated, service_role;

${assertAllOk("post", "ROLLBACK-02-UNSAFE", "S1", undefined, { rollback: true })}

${evidenceSql("S1", undefined, { rollback: true })}
COMMIT;
`);
  /* ROLLBACK 01 (DEFAULT = FAIL CLOSED) */
  out.set("12a_01_event_checkin_scan_ROLLBACK_PROPOSED.sql", `${BANNER("12A ROLLBACK of step 1, DEFAULT = FAIL CLOSED: refuses, because undoing step 1 would reopen security holes", "-- This default rollback never reopens a hole and never drops schema private. The only objects step 1 created are private.door_checkin_core (still required by the hardened event_checkin_scan; the hardened check_in_ticket of step 2 also calls it) and, on a fresh database only, an empty schema private; nothing in step 1 can be reverted without reopening a hole or breaking the hardened callers, so the pack verifies the state (wrong state = DRIFT) and then ABORTS with nothing changed.\n-- Restoring the captured original on purpose: 12a_01_event_checkin_scan_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql (explicit acknowledgement; requires check_in_ticket to be original = state S1).")}
BEGIN;
${LOCK}

${guardDo("guard", "ROLLBACK-01", facts12("S1", { rollback: true }))}

${REFUSE("01", HOLES_SCAN)}

COMMIT;
`);
  out.set("12a_01_event_checkin_scan_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql", `${BANNER("12A ROLLBACK of step 1 (REOPEN HOLES, UNSAFE): restore the captured ORIGINAL public.event_checkin_scan and drop private.door_checkin_core; schema private is NEVER dropped", "-- UNSAFE: restores the prod-captured scan body verbatim, INCLUDING its defects. Requires the explicit acknowledgement below and check_in_ticket already original (state S1: the guard refuses otherwise). Drops ONLY private.door_checkin_core; the schema and every other object in it stay (the four incident tables are fingerprint-checked before/after).")}
BEGIN;
${LOCK}

${ACK("12A-01", "the empty-string handle admission hole, ambiguous duplicate tokens being guessed, the refund race, attendee contact in the response, an unqualified definer body under search_path=public")}

${guardDo("guard", "ROLLBACK-01-UNSAFE", facts12("S1", { rollback: true }))}

${FP_RECORD("fp")}

${ORIG.scan.trim()};
REVOKE ALL ON FUNCTION public.event_checkin_scan(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_checkin_scan(text) TO authenticated, service_role;
DROP FUNCTION private.door_checkin_core(text);   -- the ONLY object dropped. No DROP SCHEMA, ever: prod's private schema pre-existed this pack and holds the incident backups.

${assertAllOk("post", "ROLLBACK-01-UNSAFE", "S0", undefined, { rollback: true })}
${FP_CHECK("fpcheck", "ROLLBACK-01-UNSAFE")}

${evidenceSql("S0", undefined, { rollback: true })}
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
