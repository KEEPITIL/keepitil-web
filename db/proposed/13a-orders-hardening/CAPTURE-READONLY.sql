-- CAPTURE-READONLY.sql: the read-only "backup" of the DEFINITIONS that the 12A and 13A packs touch. PROPOSAL ONLY: nothing here has been run on prod by this job.
-- ONE statement, SELECT only, catalog facts + aggregate COUNTS only (never a row's contents, never a token, e-mail, handle or id value). Run it as: BEGIN READ ONLY; <this>; ROLLBACK;
-- Save the output to a dated folder BEFORE the first write and again AFTER any rollback; the two files must be equal on every row whose name does not contain `acl_raw`
-- (raw ACL entry ORDER legitimately differs after a rollback because GRANT appends; the `acl_sorted` rows are the order-independent fingerprints). See RUNBOOK-APPLY-BACKUP-ROLLBACK.md.
-- VERIFY THE CAPTURE (part of the one backup definition, RUNBOOK section 2): run this file TWICE in a row, save both outputs; the two files must be byte-identical, and the last row `000_capture.summary` (rows=N md5=...) must match. Counts and md5 are computed in SQL over every row except the acl_raw rows.
-- It captures: full pg_get_functiondef text + md5 of the readers/doors/writers, owner, SECURITY flag, config, comment, raw and sorted ACL; event_orders table ACL (raw + sorted), column ACLs, RLS flags, every policy text,
-- indexes, constraints, per-role privileges; the `private` schema and its functions; the 13A helper name; order counts by status.
WITH f(sig) AS (VALUES
  ('public.get_ticket(text)'), ('public.get_my_tickets()'), ('public.check_in_ticket(text)'), ('public.event_checkin_scan(text)'),
  ('public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text)'), ('public.refund_ticket_order(text,text)'),
  ('private.door_checkin_core(text)'), ('public.get_ticket__orig_13a(text)')
), p AS (
  SELECT f.sig, to_regprocedure(f.sig)::oid AS oid FROM f
), items(k, v) AS (
  SELECT 'fn.def:' || sig, pg_get_functiondef(oid) FROM p WHERE oid IS NOT NULL
  UNION ALL SELECT 'fn.def_md5:' || sig, md5(pg_get_functiondef(oid)) FROM p WHERE oid IS NOT NULL
  UNION ALL SELECT 'fn.attrs:' || sig, 'owner=' || pg_get_userbyid(pr.proowner) || ' secdef=' || pr.prosecdef || ' config=' || coalesce(pr.proconfig::text, '(none)') || ' comment=' || coalesce(obj_description(pr.oid, 'pg_proc'), 'none') FROM p JOIN pg_proc pr ON pr.oid = p.oid
  UNION ALL SELECT 'fn.acl_raw:' || sig, coalesce(pr.proacl::text, '(default)') FROM p JOIN pg_proc pr ON pr.oid = p.oid
  UNION ALL SELECT 'fn.acl_sorted:' || sig, coalesce(CASE WHEN pr.proacl IS NULL THEN NULL ELSE (SELECT '{' || coalesce(string_agg(acl_e::text, ',' ORDER BY acl_e::text COLLATE "C"), '') || '}' FROM unnest(pr.proacl) acl_e) END, '(default)') FROM p JOIN pg_proc pr ON pr.oid = p.oid
  UNION ALL SELECT 'fn.absent:' || sig, 'absent' FROM p WHERE oid IS NULL
  UNION ALL SELECT 'orders.acl_raw', coalesce(c.relacl::text, '(default)') FROM pg_class c WHERE c.oid = to_regclass('public.event_orders')
  UNION ALL SELECT 'orders.acl_sorted', coalesce(CASE WHEN c.relacl IS NULL THEN NULL ELSE (SELECT '{' || coalesce(string_agg(acl_e::text, ',' ORDER BY acl_e::text COLLATE "C"), '') || '}' FROM unnest(c.relacl) acl_e) END, '(default)') FROM pg_class c WHERE c.oid = to_regclass('public.event_orders')
  UNION ALL SELECT 'orders.relkind_rls_force_owner', c.relkind::text || '/' || c.relrowsecurity || '/' || c.relforcerowsecurity || '/' || pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid = to_regclass('public.event_orders')
  UNION ALL SELECT 'orders.column_acls:' || a.attname, a.attacl::text FROM pg_attribute a WHERE a.attrelid = to_regclass('public.event_orders') AND a.attacl IS NOT NULL
  UNION ALL SELECT 'orders.column_acls.count', (SELECT count(*)::text FROM pg_attribute a WHERE a.attrelid = to_regclass('public.event_orders') AND a.attacl IS NOT NULL)
  UNION ALL SELECT 'orders.privs:' || r, coalesce((SELECT string_agg(pv, ',' ORDER BY pv) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv WHERE has_table_privilege(r, to_regclass('public.event_orders'), pv)), '(none)') FROM unnest(ARRAY['anon','authenticated','service_role','postgres']) r
  UNION ALL SELECT 'orders.policy:' || pp.policyname, 'cmd=' || pp.cmd || ' roles=' || array_to_string(pp.roles, ',') || ' ' || pp.permissive || ' USING ' || coalesce(pp.qual, '(null)') || ' WITH CHECK ' || coalesce(pp.with_check, '(null)') FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = 'event_orders'
  UNION ALL SELECT 'orders.policy.count', (SELECT count(*)::text FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = 'event_orders')
  UNION ALL SELECT 'orders.indexes:' || i.indexname, i.indexdef FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = 'event_orders'
  UNION ALL SELECT 'orders.constraints:' || c.conname, pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conrelid = to_regclass('public.event_orders')
  UNION ALL SELECT 'schema.private.exists', (SELECT count(*)::text FROM pg_namespace WHERE nspname = 'private')
  UNION ALL SELECT 'schema.private.functions', coalesce((SELECT string_agg(p2.proname, ',' ORDER BY p2.proname) FROM pg_proc p2 WHERE p2.pronamespace = to_regnamespace('private')), '(none)')
  UNION ALL SELECT 'private.schema', coalesce((SELECT 'exists owner=' || pg_get_userbyid(n.nspowner) || ' acl_raw=' || coalesce(n.nspacl::text, '(null)') FROM pg_namespace n WHERE n.oid = to_regnamespace('private')), 'absent')
  UNION ALL SELECT 'private.relation:' || c.relname::text || '/' || c.relkind::text, 'owner=' || pg_get_userbyid(c.relowner) || ' acl_raw=' || coalesce(c.relacl::text, '(null)') || ' columns=' || coalesce((SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || coalesce(a.attacl::text, '-'), ',' ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped), '') FROM pg_class c WHERE c.relnamespace = to_regnamespace('private') AND c.relkind IN ('r','v','m','S','f','p')
  UNION ALL SELECT 'private.relation_acl_sorted:' || c.relname::text, coalesce((SELECT '{' || string_agg(acl_e::text, ',' ORDER BY acl_e::text COLLATE "C") || '}' FROM unnest(c.relacl) acl_e), '(default)') FROM pg_class c WHERE c.relnamespace = to_regnamespace('private') AND c.relkind IN ('r','v','m','S','f','p')
  UNION ALL SELECT 'private.known_tables_fingerprint', (SELECT md5(coalesce(string_agg(x, E'\n' ORDER BY x COLLATE "C"), '')) FROM (SELECT c.relname::text || '|' || c.relkind::text || '|' || pg_get_userbyid(c.relowner)::text || '|' || coalesce(c.relacl::text, '-') || '|' || coalesce((SELECT string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) || ':' || coalesce(a.attacl::text, '-'), ',' ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped), '') AS x FROM pg_class c WHERE c.relnamespace = to_regnamespace('private') AND c.relkind = 'r' AND c.relname = ANY (ARRAY['incident_auth_counts_20261106','incident_session_ids_20261106','incident_refresh_ids_20261106','qr_token_backup_20261106']::name[])) z)
  UNION ALL SELECT 'default_acl:' || pg_get_userbyid(d.defaclrole) || ':' || coalesce(d.defaclnamespace::regnamespace::text, '(global)') || ':' || d.defaclobjtype::text, '{' || coalesce((SELECT string_agg(acl_e::text, ',' ORDER BY acl_e::text COLLATE "C") FROM unnest(d.defaclacl) acl_e), '') || '}' FROM pg_default_acl d
  UNION ALL SELECT 'roles.supabase_admin_member_of_apply_role', coalesce(pg_has_role(current_user, 'supabase_admin', 'MEMBER')::text, '(no such role)') WHERE to_regrole('supabase_admin') IS NOT NULL
  UNION ALL SELECT 'helper.get_ticket__orig_13a.count', (SELECT count(*)::text FROM pg_proc p2 WHERE p2.proname = 'get_ticket__orig_13a')
  UNION ALL SELECT 'agg.orders_by_status:' || coalesce(o.status, '(null)'), count(*)::text FROM public.event_orders o GROUP BY o.status
  UNION ALL SELECT 'agg.orders_total', count(*)::text FROM public.event_orders
)
SELECT k AS name, v AS value FROM items
UNION ALL SELECT '000_capture.summary', 'rows=' || count(*)::text || ' md5=' || md5(string_agg(k || '=' || coalesce(v, ''), E'\n' ORDER BY k COLLATE "C")) FROM items WHERE k NOT LIKE '%acl_raw%'
ORDER BY 1;
