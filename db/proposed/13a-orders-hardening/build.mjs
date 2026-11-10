/* build.mjs - generator for the 13A orders-hardening packs (PROPOSAL ONLY; nothing here touches any database).
   Inputs  : baseline/PROD-FACTS-13A.md (live prod facts captured read-only by KODE; fulfill_ticket_order body extracted mechanically)
             src/get_ticket.hardened.sql
   Outputs : packs/*.sql and PRECHECK-13A.sql (every md5/ACL literal is computed here, never typed)
   Pack 01 (F-A + F-B + F-C, one transaction): drop orders_anon_insert + event_orders_organizer_update, REVOKE ALL from PUBLIC/anon/authenticated, GRANT SELECT back.
   Pack 02 (F-D, OPTIONAL, independent of 01): get_ticket wrapper that drops the buyer e-mail.
   Usage: node build.mjs            write packs/ + PRECHECK-13A.sql
          node build.mjs --check    exit 1 if the committed files differ from what the inputs generate */
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
export const bodyOf = (createSql) => { const a = createSql.indexOf("$function$"), b = createSql.indexOf("$function$", a + 10); if (a < 0 || b < 0) throw new Error("no $function$ pair"); return createSql.slice(a + 10, b); };

/* ---------- inputs */
const facts = rd("baseline", "PROD-FACTS-13A.md");
function factsBlock(heading) { const i = facts.indexOf(heading); if (i < 0) throw new Error("facts heading not found: " + heading); const a = facts.indexOf("```\n", i), b = facts.indexOf("\n```", a + 4); return facts.slice(a + 4, b); }
const FULFILL_BODY = "\n" + factsBlock("## fulfill_ticket_order(") + "\n";      // prosrc as stored: starts with a newline after $function$
export const FULFILL_SIG = "public.fulfill_ticket_order(p_session_id text, p_payment_intent text, p_event_id bigint, p_items jsonb, p_buyer_email text, p_app_fee_cents integer DEFAULT NULL::integer, p_organizer_acct text DEFAULT NULL::text)";
export const FULFILL_CREATE = `CREATE OR REPLACE FUNCTION ${FULFILL_SIG}\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$${FULFILL_BODY}$function$\n`;
const wsMd5 = (s) => md5(s.replace(/\s+/g, ""));
export const FULFILL_WS_MD5 = wsMd5(FULFILL_BODY);
export const GT_HARD = rd("src", "get_ticket.hardened.sql");
for (const [k, v] of Object.entries({ GT_HARD, FULFILL_CREATE })) if (/[^\x00-\x7f]/.test(v)) throw new Error(k + ": non-ASCII (md5 parity with PG requires ASCII)");
export const GT_HARD_MD5 = md5(bodyOf(GT_HARD));

/* ---------- captured expectations (PROD-FACTS-13A.md + 12a-prod-facts) */
const ORDERS_COLS = ["id:bigint", "event_id:bigint", "tier_id:bigint", "buyer_email:text", "buyer_handle:text", "qty:integer", "referral_code:text", "qr_token:text", "status:text", "amount_cents:integer",
  "created_at:timestamp with time zone", "stripe_session_id:text", "stripe_payment_intent:text", "application_fee_cents:integer", "organizer_acct:text", "checked_in_at:timestamp with time zone"].sort().join(",");
const ALL8 = "DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE";
const ACL_S0 = "{anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}";
const ACL_S1 = "{anon=r/postgres,authenticated=r/postgres,postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}";
const POL_S0 = ["event_orders_organizer_read|SELECT|authenticated|PERMISSIVE", "event_orders_organizer_update|UPDATE|authenticated|PERMISSIVE", "event_orders_owner_read|SELECT|authenticated|PERMISSIVE", "orders_anon_insert|INSERT|anon,authenticated|PERMISSIVE"].sort().join(",");
const POL_S1 = ["event_orders_organizer_read|SELECT|authenticated|PERMISSIVE", "event_orders_owner_read|SELECT|authenticated|PERMISSIVE"].sort().join(",");
const IDX = "event_orders_pkey,event_orders_qr_token_idx,event_orders_session_tier_uidx,orders_event_idx";
const CONSTR = ["f:events:c:event_id", "f:ticket_tiers:n:tier_id", "p:-:-:id"].sort().join(",");
const ABS = "ABSENT";

/* ---------- fact expressions: each returns ONE text value */
const O = "'public.event_orders'::regclass";
const aclx = (expr) => `coalesce(${aclSorted(expr)},'(default)')`;
const privs = (role) => `(SELECT coalesce(string_agg(p, ',' ORDER BY p),'(none)') FROM unnest(ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']) p WHERE has_table_privilege('${role}', ${O}, p))`;
const POLW = "p.schemaname = 'public' AND p.tablename = 'event_orders'";
const pol = (name, cond) => `(SELECT (${cond})::text FROM pg_policies p WHERE ${POLW} AND p.policyname = '${name}')`;
const F = (sig) => `to_regprocedure('${sig}')`;
const fnx = (sig, sel) => `(SELECT ${sel} FROM pg_proc p WHERE p.oid = ${F(sig)})`;
function svcFn(prefix, sig, name, extra = []) {      // SECURITY DEFINER, owner postgres, search_path=public, ACL postgres+service_role only
  return [
    [`${prefix}.overloads`, `(SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = to_regnamespace('public') AND p.proname = '${name}')`, "1"],
    [`${prefix}.secdef`, fnx(sig, "p.prosecdef::text"), "true"],
    [`${prefix}.owner`, fnx(sig, "pg_get_userbyid(p.proowner)::text"), "postgres"],
    [`${prefix}.config`, fnx(sig, "coalesce((SELECT string_agg(c,',') FROM unnest(p.proconfig) c),'(none)')"), "search_path=public"],
    [`${prefix}.lang_ret`, fnx(sig, "(SELECT l.lanname FROM pg_language l WHERE l.oid=p.prolang)::text||'/'||p.prorettype::regtype::text"), "plpgsql/jsonb"],
    [`${prefix}.acl_sorted`, fnx(sig, aclx("p.proacl")), "{postgres=X/postgres,service_role=X/postgres}"],
    ...["anon", "authenticated", "service_role"].map((r, i) => [`${prefix}.exec_${r}`, fnx(sig, `has_function_privilege('${r}', p.oid, 'EXECUTE')::text`), ["false", "false", "true"][i]]),
    [`${prefix}.exec_public`, fnx(sig, "coalesce((SELECT bool_or(x.grantee = 0) FROM aclexplode(p.proacl) x), false)::text"), "false"],
    ...extra,
  ];
}
export function ordersFacts(state) {     // S0 = captured prod | S1 = after pack 01
  const s1 = state === "S1";
  return [
    ["orders.relkind_rls", `(SELECT c.relkind::text||'/'||c.relrowsecurity::text||'/'||c.relforcerowsecurity::text FROM pg_class c WHERE c.oid = ${O})`, "r/true/false"],
    ["orders.owner", `(SELECT pg_get_userbyid(c.relowner)::text FROM pg_class c WHERE c.oid = ${O})`, "postgres"],
    ["orders.columns_md5", `(SELECT md5(string_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod), ',' ORDER BY a.attname::text COLLATE "C")) FROM pg_attribute a WHERE a.attrelid = ${O} AND a.attnum > 0 AND NOT a.attisdropped)`, md5(ORDERS_COLS)],
    ["orders.indexes", `(SELECT string_agg(i.indexname::text, ',' ORDER BY i.indexname::text COLLATE "C") FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = 'event_orders')`, IDX],
    ["orders.session_tier_unique_partial", `(SELECT count(*)::text FROM pg_index i WHERE i.indrelid = ${O} AND i.indisunique AND i.indpred IS NOT NULL AND (SELECT string_agg(a.attname::text, ',' ORDER BY k.ord) FROM unnest(i.indkey::int2[]) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) = 'stripe_session_id,tier_id')`, "1"],
    ["orders.constraints", `(SELECT string_agg(x, ',' ORDER BY x COLLATE "C") FROM (SELECT c.contype::text||':'||coalesce((SELECT relname::text FROM pg_class WHERE oid = c.confrelid),'-')||':'||coalesce(nullif(c.confdeltype::text,' '),'-')||':'||(SELECT string_agg(a.attname::text, '+' ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)) AS x FROM pg_constraint c WHERE c.conrelid = ${O} AND c.contype IN ('p','f','u')) z)`, CONSTR],
    ["orders.check_count", `(SELECT count(*)::text FROM pg_constraint c WHERE c.conrelid = ${O} AND c.contype = 'c')`, "1"],
    ["orders.user_triggers", `(SELECT count(*)::text FROM pg_trigger t WHERE t.tgrelid = ${O} AND NOT t.tgisinternal)`, "0"],
    ["orders.acl_sorted", `(SELECT ${aclx("c.relacl")} FROM pg_class c WHERE c.oid = ${O})`, s1 ? ACL_S1 : ACL_S0],
    ["orders.column_acl_rows", `(SELECT count(*)::text FROM pg_attribute a WHERE a.attrelid = ${O} AND a.attacl IS NOT NULL)`, "0"],
    ["orders.public_grants", `(SELECT count(*)::text FROM pg_class c, aclexplode(c.relacl) x WHERE c.oid = ${O} AND x.grantee = 0)`, "0"],
    ["orders.grant_options", `(SELECT count(*)::text FROM pg_class c, aclexplode(c.relacl) x WHERE c.oid = ${O} AND x.is_grantable)`, "0"],
    ["orders.priv_anon", privs("anon"), s1 ? "SELECT" : ALL8],
    ["orders.priv_authenticated", privs("authenticated"), s1 ? "SELECT" : ALL8],
    ["orders.priv_service_role", privs("service_role"), ALL8],
    ["orders.priv_postgres", privs("postgres"), ALL8],
    ["orders.policy_shapes", `(SELECT string_agg(p.policyname::text||'|'||p.cmd||'|'||(SELECT string_agg(r::text, ',' ORDER BY r::text COLLATE "C") FROM unnest(p.roles) r)||'|'||p.permissive, ',' ORDER BY p.policyname::text COLLATE "C") FROM pg_policies p WHERE ${POLW})`, s1 ? POL_S1 : POL_S0],
    ["policy.organizer_read.sig", pol("event_orders_organizer_read", "p.cmd = 'SELECT' AND p.qual ~ 'my_handle' AND p.qual ~ 'owner_handle' AND p.with_check IS NULL"), "true"],
    ["policy.owner_read.sig", pol("event_orders_owner_read", "p.cmd = 'SELECT' AND p.qual ~ 'buyer_email' AND p.qual ~ 'my_email' AND p.with_check IS NULL"), "true"],
    ["policy.organizer_update.sig", pol("event_orders_organizer_update", "p.cmd = 'UPDATE' AND p.qual ~ 'my_handle' AND p.with_check ~ 'my_handle'"), s1 ? ABS : "true"],
    ["policy.anon_insert.sig", pol("orders_anon_insert", "p.cmd = 'INSERT' AND p.qual IS NULL AND p.with_check = 'true'"), s1 ? ABS : "true"],
    ...svcFn("fulfill", "public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text)", "fulfill_ticket_order",
      [["fulfill.body_ws_md5", fnx("public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text)", "md5(regexp_replace(p.prosrc, '\\s+', '', 'g'))"), FULFILL_WS_MD5]]),
    ...svcFn("refund", "public.refund_ticket_order(text,text)", "refund_ticket_order"),
    ["deps.columns_present", `(SELECT count(*)::text FROM (VALUES ('events','id'),('events','slug'),('events','title'),('events','owner_handle'),('app_users','id'),('app_users','handle'),('ticket_tiers','id'),('ticket_tiers','name'),('ticket_tiers','qty_sold')) v(t,c) WHERE EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.'||v.t) AND a.attname = v.c AND NOT a.attisdropped))`, "9"],
    ["deps.my_handle_my_email", `(SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = to_regnamespace('public') AND p.proname IN ('my_handle','my_email'))`, "2"],
  ];
}
const GT = "public.get_ticket(text)", GH = "public.get_ticket__orig_13a(text)";
export function gtFacts(state) {         // G0 = captured prod (body NOT captured, see PRECHECK) | G1 = wrapper + renamed original
  const g1 = state === "G1";
  const stash = `(SELECT substr(obj_description(p.oid, 'pg_proc'), 10) FROM pg_proc p WHERE p.oid = ${F(GH)})`;
  const stashSorted = `(SELECT '{'||string_agg(e, ',' ORDER BY e COLLATE "C")||'}' FROM unnest(string_to_array(trim(both '{}' from ${stash}), ',')) e)`;
  const base = [
    ["gt.overloads", `(SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = to_regnamespace('public') AND p.proname = 'get_ticket')`, "1"],
    ["gt.helper_overloads", `(SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = to_regnamespace('public') AND p.proname = 'get_ticket__orig_13a')`, g1 ? "1" : "0"],
    ["gt.identity_args", fnx(GT, "pg_get_function_identity_arguments(p.oid)"), "p_qr text"],
    ["gt.ret", fnx(GT, "p.prorettype::regtype::text"), "jsonb"],
    ["gt.owner", fnx(GT, "pg_get_userbyid(p.proowner)::text"), "postgres"],
    ["gt.exec_anon", fnx(GT, "has_function_privilege('anon', p.oid, 'EXECUTE')::text"), "true"],
    ["gt.acl_explicit", fnx(GT, "(p.proacl IS NOT NULL)::text"), "true"],
    ["gt.grant_options", fnx(GT, "(SELECT count(*) FROM aclexplode(p.proacl) x WHERE x.is_grantable)::text"), "0"],
    ["gt.dependents", fnx(GT, "(SELECT count(*) FROM pg_depend d WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = p.oid AND d.deptype = 'n')::text"), "0"],
  ];
  if (!g1) return [...base,
    ["gt.secdef", fnx(GT, "p.prosecdef::text"), "true"],
    ["gt.comment", fnx(GT, "coalesce(obj_description(p.oid, 'pg_proc'), 'none')"), "none"],
  ];
  return [...base,
    ["gt.secdef", fnx(GT, "p.prosecdef::text"), "true"],
    ["gt.src_md5", fnx(GT, "md5(p.prosrc)"), GT_HARD_MD5],
    ["gt.config", fnx(GT, "coalesce((SELECT string_agg(c,',') FROM unnest(p.proconfig) c),'(none)')"), 'search_path=""'],
    ["gt.lang", fnx(GT, "(SELECT l.lanname FROM pg_language l WHERE l.oid = p.prolang)::text"), "plpgsql"],
    ["gt.helper_secdef", fnx(GH, "p.prosecdef::text"), "true"],
    ["gt.helper_owner", fnx(GH, "pg_get_userbyid(p.proowner)::text"), "postgres"],
    ["gt.helper_nonowner_grants", fnx(GH, "(SELECT count(*) FROM aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) x WHERE x.grantee <> p.proowner)::text"), "0"],
    ["gt.helper_exec_anon_authenticated_public", fnx(GH, "has_function_privilege('anon', p.oid, 'EXECUTE')::text||'/'||has_function_privilege('authenticated', p.oid, 'EXECUTE')::text||'/'||coalesce((SELECT bool_or(x.grantee = 0) FROM aclexplode(p.proacl) x), false)::text"), "false/false/false"],
    ["gt.helper_stash_present", fnx(GH, "(coalesce(obj_description(p.oid, 'pg_proc'), '') ~ '^ORIG_ACL=')::text"), "true"],
    ["gt.wrapper_acl_equals_original", `(SELECT (${fnx(GT, aclx("p.proacl"))} = ${stashSorted})::text)`, "true"],
  ];
}

/* ---------- SQL fragments */
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const BANNER = (title, extra = "") => `-- ${title}
-- 13A ORDERS HARDENING: PROPOSAL ONLY. NOT APPLIED ANYWHERE. GENERATED by db/proposed/13a-orders-hardening/build.mjs (node build.mjs --check fails if this file drifts from its inputs).
-- Apply gate: NO prod SQL without Joe's relayed yes + a Sentinel pass + a backup. Apply AFTER 12A (12A's drift guard expects the original event_orders ACL/policies). See README.md.
-- Run as postgres, ONE transaction, ON_ERROR_STOP (psql -v ON_ERROR_STOP=1) or a single-call SQL executor; right after BEGIN come SET LOCAL lock_timeout = '5s', the repo-wide pack advisory lock, and SET LOCAL lock_timeout = '5s' again.
${extra}`;
const LOCK = `-- repo-wide pack key (same as R1 #136 / 12A): serialises every pack run; transaction-scoped; a second run waits for a running pack to commit or roll back, for at most 5 s:
-- lock_timeout is set BEFORE the lock (so the lock wait itself is bounded; a timeout set after a lock statement cannot bound that statement) and again right after it (every later lock wait). Expiry = SQLSTATE 55P03, nothing changed.
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(${REPO_PACK_KEY});
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';`;
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
    RAISE EXCEPTION '13A ${label}: DRIFT, ABORT, nothing applied. % mismatch(es): %', array_length(f, 1), array_to_string(f, ' ; ');
  END IF;
END
$${tag}$;`;
}
function rowsCte(list) {
  const a = list.map(([n, x]) => `SELECT ${q(n)} AS name, coalesce(${x}, ${q(ABS)}) AS actual`).join("\n  UNION ALL ");
  const e = list.map(([n, , ex]) => `(${q(n)}, ${q(ex)})`).join(",\n  ");
  return `WITH a(name, actual) AS (
  ${a}
), e(name, expected) AS (VALUES
  ${e}
), r AS (SELECT e.name, e.expected, a.actual, (a.actual IS NOT DISTINCT FROM e.expected) AS ok FROM e LEFT JOIN a USING (name))`;
}
const evidenceSql = (list, state) => `${rowsCte(list)}
SELECT '000_ALL_OK' AS name, ${q(state)} AS expected, ${q(state)} AS actual, bool_and(ok) AS ok FROM r
UNION ALL SELECT name, expected, actual, ok FROM r
ORDER BY 1;`;
const assertAllOk = (tag, label, list) => `DO $${tag}$
DECLARE bad text;
BEGIN
  SELECT string_agg(name || ' (expected ' || expected || ', got ' || actual || ')', ' ; ') INTO bad FROM (
${rowsCte(list)}
SELECT name, expected, actual, ok FROM r
  ) z WHERE NOT ok;
  IF bad IS NOT NULL THEN RAISE EXCEPTION '13A ${label}: POST-CHECK FAILED (transaction rolls back): %', bad; END IF;
END
$${tag}$;`;

/* ---------- pack 01 statements */
export const FIX_SQL = `-- F-A orders_anon_insert (anon + authenticated INSERT WITH CHECK true): forged paid orders. Nobody but service_role / the SECURITY DEFINER fulfill_ticket_order may insert.
DROP POLICY orders_anon_insert ON public.event_orders;
-- F-B event_orders_organizer_update: an organizer could rewrite status / qr_token / checked_in_at / amount_cents of any order of their events. No client UPDATE is needed (check-in = 12A SECURITY DEFINER RPCs, refund = refund_ticket_order).
DROP POLICY event_orders_organizer_update ON public.event_orders;
-- F-C table ACL: ALL (incl. TRUNCATE, MAINTAIN, REFERENCES, TRIGGER, DELETE) for anon + authenticated. Remove everything, grant SELECT back (the surviving organizer_read / owner_read policies and the profile.html Tickets query need it; RLS still filters rows).
-- SELECT stays for anon on purpose: signed-out visitors of a profile run an event_orders SELECT today (profile.html loadTagged) and get an empty list; without the privilege they would get 42501. service_role / postgres are not touched.
REVOKE ALL ON TABLE public.event_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_orders TO anon, authenticated;`;
export const ROLLBACK_SQL = `-- restore the captured original: the two policies (same predicates), then the table-level ALL grants for anon + authenticated.
CREATE POLICY orders_anon_insert ON public.event_orders AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY event_orders_organizer_update ON public.event_orders AS PERMISSIVE FOR UPDATE TO authenticated
  USING (event_id IN (SELECT events.id FROM public.events WHERE events.owner_handle = public.my_handle()))
  WITH CHECK (event_id IN (SELECT events.id FROM public.events WHERE events.owner_handle = public.my_handle()));
REVOKE ALL ON TABLE public.event_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.event_orders TO anon, authenticated;`;

/* ---------- pack 02 statements */
const GT_ACL_COPY = `DO $acl$
DECLARE
  h oid := to_regprocedure('${GH}'); a aclitem[]; own oid; r record;
BEGIN
  SELECT p.proacl, p.proowner INTO a, own FROM pg_proc p WHERE p.oid = h;
  REVOKE ALL ON FUNCTION ${GT} FROM PUBLIC;
  FOR r IN SELECT DISTINCT x.grantee FROM aclexplode(a) x WHERE x.privilege_type = 'EXECUTE' AND x.grantee <> own LOOP
    IF r.grantee = 0 THEN GRANT EXECUTE ON FUNCTION ${GT} TO PUBLIC;
    ELSE EXECUTE format('GRANT EXECUTE ON FUNCTION ${GT} TO %I', pg_get_userbyid(r.grantee)); END IF;
  END LOOP;
  REVOKE ALL ON FUNCTION ${GH} FROM PUBLIC;
  FOR r IN SELECT DISTINCT x.grantee FROM aclexplode(a) x WHERE x.grantee <> own AND x.grantee <> 0 LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION ${GH} FROM %I', pg_get_userbyid(r.grantee));
  END LOOP;
END
$acl$;`;
const GT_STASH = `DO $stash$
BEGIN
  EXECUTE format('COMMENT ON FUNCTION ${GT} IS %L', 'ORIG_ACL=' || (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = to_regprocedure('${GT}')));
END
$stash$;`;
const GT_RESTORE = `DO $restore$
DECLARE
  h oid := to_regprocedure('${GH}'); stash text; e text; g text; own oid; r record;
BEGIN
  SELECT substr(obj_description(h, 'pg_proc'), 10), (SELECT proowner FROM pg_proc WHERE oid = h) INTO stash, own;
  IF stash IS NULL OR stash = '' THEN RAISE EXCEPTION '13A ROLLBACK-02: no stashed ACL on the renamed original, ABORT'; END IF;
  -- after the rename-back the function is public.get_ticket(text); restore EXACTLY the stashed grants (only EXECUTE grants without grant option were allowed by the apply guard)
  REVOKE ALL ON FUNCTION ${GH} FROM PUBLIC;
  FOR r IN SELECT DISTINCT x.grantee FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = h)) x WHERE x.grantee <> own AND x.grantee <> 0 LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION ${GH} FROM %I', pg_get_userbyid(r.grantee));
  END LOOP;
  FOREACH e IN ARRAY string_to_array(trim(both '{}' from stash), ',') LOOP
    g := split_part(e, '=', 1);
    IF split_part(split_part(e, '=', 2), '/', 1) <> 'X' THEN RAISE EXCEPTION '13A ROLLBACK-02: unexpected stashed ACL entry %, ABORT', e; END IF;
    IF g = '' THEN EXECUTE 'GRANT EXECUTE ON FUNCTION ${GH} TO PUBLIC';
    ELSIF g <> pg_get_userbyid(own) THEN EXECUTE format('GRANT EXECUTE ON FUNCTION ${GH} TO %I', g); END IF;
  END LOOP;
END
$restore$;`;

/* ---------- packs */
export function buildAll() {
  const out = new Map();
  const S0 = ordersFacts("S0"), S1 = ordersFacts("S1"), G0 = gtFacts("G0"), G1 = gtFacts("G1");
  out.set("13a_01_event_orders_APPLY_PROPOSED.sql", `${BANNER("13A pack 01 APPLY: F-A orders_anon_insert + F-B organizer UPDATE + F-C table ACL on public.event_orders (one transaction)", "-- Changes: DROP POLICY x2, REVOKE ALL FROM PUBLIC/anon/authenticated, GRANT SELECT TO anon, authenticated. No data is touched. fulfill_ticket_order / refund_ticket_order / create-checkout / stripe-webhook are NOT changed.\n-- Run it a second time and it refuses at the guard (state is no longer S0) with nothing changed.")}
BEGIN;
${LOCK}

-- 1. DRIFT GUARD: live state must be EXACTLY the captured prod state S0 (columns, indexes, constraints, table ACL incl. column ACLs and grant options, the four policies by shape and by predicate tokens, fulfill/refund definer + ACL + body fingerprint).
${guardDo("guard", "APPLY-01", S0)}

-- 2. THE FIX
${FIX_SQL}

-- 3. POST-CHECKS (assert; a failure rolls the whole transaction back). State S1.
${assertAllOk("post", "APPLY-01", S1)}

-- 4. RETAINED OUTPUT: keep this result set with the change record (ok must be true on every row).
${evidenceSql(S1, "S1")}
COMMIT;
`);
  out.set("13a_01_event_orders_ROLLBACK_PROPOSED.sql", `${BANNER("13A pack 01 ROLLBACK: restore the captured ORIGINAL event_orders policies and table ACL exactly (includes the vulnerabilities)", "-- Rolling back reopens forged-order insert, organizer rewrite and anon TRUNCATE. Roll back 13A BEFORE rolling back 12A (12A's rollback guard expects the original orders ACL/policies).")}
BEGIN;
${LOCK}

${guardDo("guard", "ROLLBACK-01", S1)}

${ROLLBACK_SQL}

${assertAllOk("post", "ROLLBACK-01", S0)}

${evidenceSql(S0, "S0")}
COMMIT;
`);
  out.set("13a_02_get_ticket_APPLY_PROPOSED.sql", `${BANNER("13A pack 02 (OPTIONAL, independent of pack 01) APPLY: F-D get_ticket no longer returns the buyer e-mail", "-- The prod body of get_ticket was NOT captured. This pack renames the live function to get_ticket__orig_13a (body untouched, all grants revoked, original ACL stashed in its comment) and installs a wrapper that returns the original result minus the 'buyer' key.\n-- Review PRECHECK-13A.sql output for get_ticket first (language, secdef, body, ACL, whether 'buyer' is a top-level key of the jsonb).")}
BEGIN;
${LOCK}

${guardDo("guard", "APPLY-02", G0)}

-- stash the original ACL in the function's comment (the guard proved there is no comment today), rename the original, install the wrapper
${GT_STASH}
ALTER FUNCTION ${GT} RENAME TO get_ticket__orig_13a;
${GT_HARD.trim()};
-- the wrapper gets exactly the original function's EXECUTE grants; the renamed original loses every grant but its owner's
${GT_ACL_COPY}

${assertAllOk("post", "APPLY-02", G1)}

${evidenceSql(G1, "G1")}
COMMIT;
`);
  out.set("13a_02_get_ticket_ROLLBACK_PROPOSED.sql", `${BANNER("13A pack 02 ROLLBACK: drop the wrapper, rename the original back, restore its stashed ACL, remove the stash comment", "-- Restores the live original function object (same oid, same body, same config) and its exact ACL.")}
BEGIN;
${LOCK}

${guardDo("guard", "ROLLBACK-02", G1)}

DROP FUNCTION ${GT};
ALTER FUNCTION ${GH} RENAME TO get_ticket;
${GT_RESTORE.replace(new RegExp(GH.replace(/[().]/g, "\\$&"), "g"), GT)}
COMMENT ON FUNCTION ${GT} IS NULL;

${assertAllOk("post", "ROLLBACK-02", G0)}

${evidenceSql(G0, "G0")}
COMMIT;
`);
  for (const [nm, lst, st] of [["orders_S0_original", S0, "S0"], ["orders_S1_after-pack01", S1, "S1"], ["get_ticket_G0_original", G0, "G0"], ["get_ticket_G1_after-pack02", G1, "G1"]])
    out.set(`13a_POSTCHECKS_${nm}_PROPOSED.sql`, `${BANNER(`13A POSTCHECKS for state ${st}: one read-only statement; ok must be true on every row`, "-- Read-only (a single SELECT over the catalog). 000_ALL_OK is the summary row.")}
${evidenceSql(lst, st)}
`);
  const drift = (label, A, B) => {
    const ma = new Map(A.map(([n, x, ex]) => [n, { x, ex }])), mb = new Map(B.map(([n, x, ex]) => [n, { x, ex }]));
    return [...new Set([...A, ...B].map(([n]) => n))].map((n) => ({ name: label + ":" + n, grp: label, x: (mb.get(n) || ma.get(n)).x, s0: ma.has(n) ? ma.get(n).ex : null, s1: mb.has(n) ? mb.get(n).ex : null, in0: ma.has(n), in1: mb.has(n) }));
  };
  const dq = [...drift("orders", S0, S1), ...drift("get_ticket", G0, G1)];
  const A = dq.map((d) => `SELECT ${q(d.name)} AS name, coalesce(${d.x}, ${q(ABS)}) AS actual`).join("\n  UNION ALL ");
  const E = dq.map((d) => `(${q(d.name)}, ${q(d.grp)}, ${d.s0 === null ? "NULL" : q(d.s0)}, ${d.s1 === null ? "NULL" : q(d.s1)}, ${d.in0}, ${d.in1})`).join(",\n  ");
  out.set("13a_DRIFT_QUERY_PROPOSED.sql", `${BANNER("13A DRIFT_QUERY: read-only; classifies orders as S0_original | S1_after-pack01 | DRIFT and get_ticket as G0_original | G1_after-pack02 | DRIFT, and lists every guarded fact", "-- Safe to run any time, as any role that can read the catalog.")}
WITH a(name, actual) AS (
  ${A}
), e(name, grp, s0, s1, in0, in1) AS (VALUES
  ${E}
), r AS (SELECT e.name, e.grp, e.s0, e.s1, e.in0, e.in1, a.actual FROM e LEFT JOIN a USING (name))
SELECT '000_STATE_orders' AS name,
  CASE WHEN bool_and(NOT in0 OR actual IS NOT DISTINCT FROM s0) THEN 'S0_original' WHEN bool_and(NOT in1 OR actual IS NOT DISTINCT FROM s1) THEN 'S1_after-pack01' ELSE 'DRIFT' END AS actual, NULL::text AS s0, NULL::text AS s1 FROM r WHERE grp = 'orders'
UNION ALL
SELECT '000_STATE_get_ticket', CASE WHEN bool_and(NOT in0 OR actual IS NOT DISTINCT FROM s0) THEN 'G0_original' WHEN bool_and(NOT in1 OR actual IS NOT DISTINCT FROM s1) THEN 'G1_after-pack02' ELSE 'DRIFT' END, NULL, NULL FROM r WHERE grp = 'get_ticket'
UNION ALL SELECT name, actual, s0, s1 FROM r
ORDER BY 1;
`);
  out.set("../PRECHECK-13A.sql", precheck());
  return out;
}

/* ---------- PRECHECK-13A.sql: ONE read-only statement, catalog + aggregate counts only, never row contents */
function precheck() {
  const OO = "'public.event_orders'::regclass";
  const fn = (label, sig, name) => {
    const w = `p.pronamespace = to_regnamespace('public') AND p.proname = '${name}'`;
    return `  SELECT '${label}.def:' || p.oid::regprocedure::text, pg_get_functiondef(p.oid) FROM pg_proc p WHERE ${w}
  UNION ALL SELECT '${label}.prosrc_md5:' || p.oid::regprocedure::text, md5(p.prosrc) || ' ws_md5=' || md5(regexp_replace(p.prosrc, '\\s+', '', 'g')) FROM pg_proc p WHERE ${w}
  UNION ALL SELECT '${label}.attrs:' || p.oid::regprocedure::text, 'secdef=' || p.prosecdef || ' owner=' || pg_get_userbyid(p.proowner) || ' config=' || coalesce(p.proconfig::text,'(none)') || ' lang=' || (SELECT lanname FROM pg_language WHERE oid = p.prolang) || ' ret=' || p.prorettype::regtype || ' args=' || pg_get_function_identity_arguments(p.oid) || ' comment=' || coalesce(obj_description(p.oid,'pg_proc'),'none') FROM pg_proc p WHERE ${w}
  UNION ALL SELECT '${label}.acl_raw_and_sorted:' || p.oid::regprocedure::text, coalesce(p.proacl::text,'(default)') || '  SORTED ' || ${aclx("p.proacl")} FROM pg_proc p WHERE ${w}
  UNION ALL SELECT '${label}.exec:' || p.oid::regprocedure::text, 'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE') FROM pg_proc p WHERE ${w}
  UNION ALL SELECT '${label}.dependents:' || p.oid::regprocedure::text, (SELECT count(*) FROM pg_depend d WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = p.oid AND d.deptype = 'n')::text FROM pg_proc p WHERE ${w}`;
  };
  return `${BANNER("13A PRECHECK: ONE read-only statement (catalog + aggregate counts; NEVER row contents) to run against prod BEFORE any 13A pack", "-- Captures: qr_token column DEFAULT expression, every event_orders policy text, table ACL + column ACLs + per-role privileges, triggers/indexes/constraints, role flags, the FULL bodies of fulfill_ticket_order / refund_ticket_order / get_ticket (byte-compare against baseline/PROD-FACTS-13A.md), every other object that reads event_orders (policies on other tables, views, functions) so the anon-SELECT question can be answered, and aggregate counts.\n-- Compare: the packs' drift guard expects the state in baseline/PROD-FACTS-13A.md + 12a facts. If any row here differs, STOP and re-review.")}
WITH items(k, v) AS (
  SELECT 'meta.server_version', current_setting('server_version') || ' as ' || current_user
  UNION ALL SELECT 'roles.flags', (SELECT string_agg(rolname || ':bypassrls=' || rolbypassrls || ',super=' || rolsuper, ' | ' ORDER BY rolname) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres','authenticator'))
  UNION ALL SELECT 'orders.relkind_rls_force_owner', (SELECT c.relkind::text || '/' || c.relrowsecurity || '/' || c.relforcerowsecurity || '/' || pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid = ${OO})
  UNION ALL SELECT 'orders.columns:' || a.attnum || ':' || a.attname, format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') || CASE WHEN a.attidentity <> '' THEN ' IDENTITY=' || a.attidentity::text ELSE '' END FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attrelid = ${OO} AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL SELECT 'orders.qr_token_default', coalesce((SELECT pg_get_expr(d.adbin, d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum WHERE d.adrelid = ${OO} AND a.attname = 'qr_token'), '(NO DEFAULT)')
  UNION ALL SELECT 'orders.acl_raw_and_sorted', (SELECT coalesce(c.relacl::text,'(default)') || '  SORTED ' || ${aclx("c.relacl")} FROM pg_class c WHERE c.oid = ${OO})
  UNION ALL SELECT 'orders.column_acls:' || a.attname, a.attacl::text FROM pg_attribute a WHERE a.attrelid = ${OO} AND a.attacl IS NOT NULL
  UNION ALL SELECT 'orders.column_acls.count', (SELECT count(*)::text FROM pg_attribute a WHERE a.attrelid = ${OO} AND a.attacl IS NOT NULL)
  UNION ALL SELECT 'orders.privs:' || r, (SELECT string_agg(p, ',' ORDER BY p) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p WHERE has_table_privilege(r, ${OO}, p)) FROM unnest(ARRAY['anon','authenticated','service_role','postgres']) r
  UNION ALL SELECT 'orders.policy:' || p.policyname, 'cmd=' || p.cmd || ' roles=' || array_to_string(p.roles, ',') || ' ' || p.permissive || ' USING ' || coalesce(p.qual, '(null)') || ' WITH CHECK ' || coalesce(p.with_check, '(null)') FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'event_orders'
  UNION ALL SELECT 'orders.indexes:' || i.indexname, i.indexdef FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = 'event_orders'
  UNION ALL SELECT 'orders.constraints:' || c.conname, pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conrelid = ${OO}
  UNION ALL SELECT 'orders.triggers:' || t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE t.tgrelid = ${OO} AND NOT t.tgisinternal
  UNION ALL SELECT 'orders.triggers.count', (SELECT count(*)::text FROM pg_trigger t WHERE t.tgrelid = ${OO} AND NOT t.tgisinternal)
  UNION ALL SELECT 'orders.id_sequence_acl', coalesce((SELECT s.relacl::text FROM pg_class s WHERE s.oid = pg_get_serial_sequence('public.event_orders','id')::regclass), '(identity/none or default)')
  UNION ALL SELECT 'orders.default_acls_public_schema', coalesce((SELECT string_agg(pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text || ':' || d.defaclacl::text, ' | ') FROM pg_default_acl d WHERE d.defaclnamespace IN (0, to_regnamespace('public')::oid)), '(none)')
  UNION ALL ${fn("fulfill", "", "fulfill_ticket_order").trimStart()}
  UNION ALL ${fn("refund", "", "refund_ticket_order").trimStart()}
  UNION ALL ${fn("get_ticket", "", "get_ticket").trimStart()}
  UNION ALL SELECT 'get_ticket.helper_name_free', (SELECT count(*)::text FROM pg_proc p WHERE p.proname = 'get_ticket__orig_13a')
  UNION ALL SELECT 'readers.functions_mentioning_event_orders:' || p.oid::regprocedure::text, 'secdef=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text,'(none)') || ' exec anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || ' md5=' || md5(p.prosrc) FROM pg_proc p WHERE p.pronamespace NOT IN (SELECT oid FROM pg_namespace WHERE nspname IN ('pg_catalog','information_schema')) AND p.prosrc ~* 'event_orders'
  UNION ALL SELECT 'readers.policies_on_other_tables_mentioning_event_orders:' || p.schemaname || '.' || p.tablename || '.' || p.policyname, 'cmd=' || p.cmd || ' roles=' || array_to_string(p.roles, ',') || ' ' || coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'') FROM pg_policies p WHERE (coalesce(p.qual,'') || coalesce(p.with_check,'')) ~* 'event_orders' AND NOT (p.schemaname = 'public' AND p.tablename = 'event_orders')
  UNION ALL SELECT 'readers.views_mentioning_event_orders:' || n.nspname || '.' || c.relname, c.relkind::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('v','m') AND pg_get_viewdef(c.oid) ~* 'event_orders'
  UNION ALL SELECT 'readers.dependents_via_pg_depend:' || coalesce(rc.relname, '?'), d.deptype::text FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid AND d.classid = 'pg_rewrite'::regclass JOIN pg_class rc ON rc.oid = rw.ev_class WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = ${OO}
  UNION ALL SELECT 'agg.orders_by_status:' || coalesce(o.status,'(null)'), count(*)::text FROM public.event_orders o GROUP BY o.status
  UNION ALL SELECT 'agg.orders_total_and_checked_in', count(*)::text || ' total, ' || count(*) FILTER (WHERE checked_in_at IS NOT NULL)::text || ' checked in, ' || count(*) FILTER (WHERE qr_token IS NULL)::text || ' without qr_token, ' || count(*) FILTER (WHERE stripe_session_id IS NULL)::text || ' without stripe_session_id' FROM public.event_orders
  UNION ALL SELECT 'agg.qr_token_duplicate_surplus_rows', coalesce((SELECT sum(c - 1)::text FROM (SELECT count(*) c FROM public.event_orders WHERE qr_token IS NOT NULL GROUP BY qr_token HAVING count(*) > 1) z), '0')
  UNION ALL SELECT 'agg.orders_without_stripe_session_by_status:' || coalesce(o.status,'(null)'), count(*)::text FROM public.event_orders o WHERE o.stripe_session_id IS NULL GROUP BY o.status
)
SELECT k AS name, v AS value FROM items ORDER BY k;
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check"); let bad = 0;
  const files = buildAll();
  for (const [name, content] of files) {
    const p = join(HERE, "packs", name);
    if (check) { if (!existsSync(p) || readFileSync(p, "utf8") !== content) { console.log("DRIFT " + name); bad++; } }
    else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); }
  }
  console.log(`${check ? "checked" : "wrote"} ${files.size} files; fulfill_ws_md5=${FULFILL_WS_MD5} get_ticket_wrapper_md5=${GT_HARD_MD5}${bad ? "; " + bad + " drifted" : ""}`);
  process.exit(bad ? 1 : 0);
}
