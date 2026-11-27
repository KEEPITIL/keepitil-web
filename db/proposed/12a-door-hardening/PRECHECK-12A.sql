-- PRECHECK-12A.sql: READ-ONLY catalog and aggregate queries for KODE to run on prod BEFORE any 12A apply. PROPOSAL ONLY: nothing here has been run on prod by this job.
-- Rules this file keeps (and the proof harness enforces, test P13): only SELECT statements; catalog metadata and COUNT/MIN/MAX aggregates only; NO row of event_orders / events /
-- app_users / ticket_tiers is ever returned (no token, email, handle, name or id value appears in any output). Run it in a READ ONLY transaction:
--   BEGIN READ ONLY; <statements>; ROLLBACK;
-- Run 12a_DRIFT_QUERY_PROPOSED.sql first: its first row must read S0_original. Paste both outputs into the change record. Any mismatch = STOP (do not apply).
-- Q01 environment
SELECT 'Q01_environment' AS q, current_setting('server_version') AS server_version, current_user AS current_user_name, session_user AS session_user_name, current_database() AS db;

-- Q02 roles the packs rely on
SELECT 'Q02_roles' AS q, rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role', 'authenticator') ORDER BY rolname;

-- Q03 the two door functions (and any overload / look-alike in other schemas): identity, owner, definer flag, config, md5 of the body (strict and whitespace-normalised), length
SELECT 'Q03_functions' AS q, p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, p.provolatile AS volatility,
       coalesce((SELECT string_agg(c, ',') FROM unnest(p.proconfig) c), '(none)') AS config,
       md5(p.prosrc) AS src_md5_strict, md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')) AS src_md5_whitespace_normalised, length(p.prosrc) AS src_length
  FROM pg_proc p WHERE p.proname IN ('check_in_ticket', 'event_checkin_scan', 'door_checkin_core') ORDER BY 2;

-- Q04 ACLs of those functions, one row per grantee (a NULL ACL shows the default; grantee 0 = PUBLIC)
SELECT 'Q04_function_acl' AS q, p.oid::regprocedure::text AS signature, CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee, x.privilege_type, x.is_grantable
  FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE p.proname IN ('check_in_ticket', 'event_checkin_scan', 'door_checkin_core') ORDER BY 2, 3;

-- Q05 any other function body or view that mentions either door function (names only; the facts file says none)
SELECT 'Q05_referencing_objects' AS q, 'function' AS kind, n.nspname AS schema_name, p.proname AS object_name
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.prosrc ~ '(check_in_ticket|event_checkin_scan)' AND p.proname NOT IN ('check_in_ticket', 'event_checkin_scan') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
UNION ALL SELECT 'Q05_referencing_objects', 'view', schemaname::text, viewname::text FROM pg_views WHERE definition ~ '(check_in_ticket|event_checkin_scan)' AND schemaname NOT IN ('pg_catalog', 'information_schema');

-- Q06 event_orders columns (catalog)
SELECT 'Q06_orders_columns' AS q, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS column_default
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE a.attrelid = to_regclass('public.event_orders') AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum;

-- Q07 event_orders constraints and indexes (catalog; note whether a UNIQUE index on qr_token exists)
SELECT 'Q07_orders_constraints' AS q, c.conname::text AS name, c.contype::text AS type, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE c.conrelid = to_regclass('public.event_orders')
UNION ALL SELECT 'Q07_orders_indexes', i.indexname::text, 'index', i.indexdef FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = 'event_orders' ORDER BY 1, 2;

-- Q08 event_orders RLS flags, owner, user triggers, table ACL per grantee
SELECT 'Q08_orders_table' AS q, c.relkind::text AS relkind, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, pg_get_userbyid(c.relowner) AS owner,
       (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS user_triggers
  FROM pg_class c WHERE c.oid = to_regclass('public.event_orders');
SELECT 'Q08_orders_acl' AS q, CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee, string_agg(x.privilege_type, ',' ORDER BY x.privilege_type) AS privileges
  FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x WHERE c.oid = to_regclass('public.event_orders') GROUP BY 2 ORDER BY 2;

-- Q09 event_orders policies (catalog text of the predicates, not data)
SELECT 'Q09_orders_policies' AS q, policyname, permissive, roles::text AS roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_orders' ORDER BY policyname;

-- Q10 schema private and default privileges that could silently grant on new objects
SELECT 'Q10_private_schema' AS q, n.nspname::text AS schema_name, pg_get_userbyid(n.nspowner) AS owner, n.nspacl::text AS acl,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = n.oid) AS functions, (SELECT count(*) FROM pg_class WHERE relnamespace = n.oid) AS relations
  FROM pg_namespace n WHERE n.nspname = 'private';
SELECT 'Q10_default_acls' AS q, pg_get_userbyid(d.defaclrole) AS for_role, coalesce(n.nspname::text, '(all schemas)') AS in_schema, d.defaclobjtype::text AS object_type, d.defaclacl::text AS acl
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace ORDER BY 2, 3, 4;

-- Q11 columns the door functions read in the three other tables (names/types only)
SELECT 'Q11_dependent_columns' AS q, c.relname::text AS table_name, a.attname::text AS column_name, format_type(a.atttypid, a.atttypmod) AS type
  FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE c.oid IN (to_regclass('public.events'), to_regclass('public.app_users'), to_regclass('public.ticket_tiers'))
   AND a.attname IN ('id', 'slug', 'title', 'owner_handle', 'handle', 'name') ORDER BY 2, 3;

-- Q12 auth.uid() and the policy helpers (identity and body hashes only)
SELECT 'Q12_auth_helpers' AS q, p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, md5(p.prosrc) AS src_md5, length(p.prosrc) AS src_length
  FROM pg_proc p WHERE p.oid IN (to_regprocedure('auth.uid()'), to_regprocedure('public.my_handle()'), to_regprocedure('public.my_email()')) ORDER BY 2;

-- Q13 event_orders AGGREGATES ONLY (counts / lengths; no values)
SELECT 'Q13_orders_aggregates' AS q, count(*) AS orders_total,
       count(*) FILTER (WHERE status = 'paid') AS paid, count(*) FILTER (WHERE status = 'pending') AS pending, count(*) FILTER (WHERE status = 'refunded') AS refunded,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled, count(*) FILTER (WHERE status = 'checked_in') AS status_checked_in,
       count(*) FILTER (WHERE checked_in_at IS NOT NULL) AS with_checked_in_at, count(*) FILTER (WHERE qr_token IS NULL) AS qr_null,
       min(length(qr_token)) AS qr_len_min, max(length(qr_token)) AS qr_len_max, count(DISTINCT length(qr_token)) AS qr_len_distinct,
       count(*) FILTER (WHERE qr_token ~* '^kil-') AS qr_with_kil_prefix, count(*) FILTER (WHERE qr_token ~ '\s') AS qr_with_whitespace,
       count(*) FILTER (WHERE qr_token ~ '[A-F]') AS qr_with_uppercase_hex, count(*) FILTER (WHERE qr_token !~ '^[0-9a-fA-F]+$') AS qr_not_hex,
       count(qr_token) - count(DISTINCT qr_token) AS qr_duplicate_surplus_rows
  FROM public.event_orders;

-- Q14 ownership / handle aggregates that decide who is authorised at the door
SELECT 'Q14_owner_handle_aggregates' AS q,
       (SELECT count(*) FROM public.events) AS events_total,
       (SELECT count(*) FROM public.events WHERE owner_handle IS NULL) AS events_owner_null,
       (SELECT count(*) FROM public.events WHERE owner_handle = '') AS events_owner_empty,
       (SELECT count(*) FROM public.events WHERE owner_handle <> lower(owner_handle)) AS events_owner_has_uppercase,
       (SELECT count(*) FROM public.app_users) AS app_users_total,
       (SELECT count(*) FROM public.app_users WHERE handle IS NULL) AS app_users_handle_null,
       (SELECT count(*) FROM public.app_users WHERE handle = '') AS app_users_handle_empty,
       (SELECT count(*) FROM (SELECT lower(handle) FROM public.app_users WHERE handle IS NOT NULL AND handle <> '' GROUP BY 1 HAVING count(*) > 1) d) AS app_users_handle_case_collisions,
       (SELECT count(*) FROM public.event_orders o JOIN public.events e ON e.id = o.event_id WHERE e.owner_handle IS NULL OR e.owner_handle = '') AS orders_on_events_without_owner,
       (SELECT count(*) FROM public.event_orders WHERE tier_id IS NULL) AS orders_without_tier;

-- Q15 is any pack currently running (advisory locks held cluster-wide; the pack key shows up as classid/objid halves of 2979301232487107403)
SELECT 'Q15_advisory_locks' AS q, count(*) AS advisory_locks_held, count(*) FILTER (WHERE NOT granted) AS waiting FROM pg_locks WHERE locktype = 'advisory';
