-- VERIFY-12A.sql: READ-ONLY verification SELECTs for KODE to run after EACH apply step (and after any rollback). PROPOSAL ONLY: nothing here has been run on prod by this job.
-- Rules (the proof harness enforces them, test V01): SELECT only; catalog facts and COUNT aggregates only; no token, email, handle, name or id value is ever returned. Run as: BEGIN READ ONLY; ...; ROLLBACK;
-- This complements (does not replace) packs/12a_POSTCHECKS_S{0,1,2}_*.sql and packs/12a_DRIFT_QUERY_PROPOSED.sql: those prove the function/ACL/table state; this file adds the aggregate before/after counts and the
-- "zero TEST ATLAS rows" check Atlas required. Paste the output into the change record next to the pack's retained output.

-- V1 door functions: one row per function (flags, config, body md5, sorted ACL, who can execute)
SELECT 'V1_door_functions' AS q, p.oid::regprocedure::text AS fn, p.prosecdef AS security_definer, coalesce((SELECT string_agg(c, ',') FROM unnest(p.proconfig) c), '(none)') AS config,
       md5(p.prosrc) AS body_md5, coalesce((SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, ',' ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)
                                    FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.privilege_type = 'EXECUTE'), '') AS execute_grantees,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
  FROM pg_proc p WHERE p.proname IN ('event_checkin_scan', 'check_in_ticket', 'door_checkin_core') ORDER BY 2;

-- V2 orders aggregate counts (before/after comparison; "admitted" must not change except by the scans Sentinel/Kode intentionally run on a fixture)
SELECT 'V2_orders_counts' AS q, count(*) AS orders_total, count(*) FILTER (WHERE status = 'paid') AS paid, count(*) FILTER (WHERE status = 'checked_in') AS status_checked_in,
       count(*) FILTER (WHERE checked_in_at IS NOT NULL) AS admitted, count(qr_token) - count(DISTINCT qr_token) AS qr_duplicate_surplus_rows
  FROM public.event_orders;

-- V3 zero TEST ATLAS rows (counts only; the pattern matches 'test atlas', 'TEST_ATLAS', 'test-atlas', 'test.atlas...' in any case)
SELECT 'V3_test_atlas_rows' AS q,
       (SELECT count(*) FROM public.events WHERE title ILIKE '%test%atlas%' OR slug ILIKE '%test%atlas%') AS events_matching,
       (SELECT count(*) FROM public.event_orders WHERE buyer_email ILIKE '%test%atlas%' OR buyer_handle ILIKE '%test%atlas%') AS orders_matching,
       (SELECT count(*) FROM public.app_users WHERE handle ILIKE '%test%atlas%') AS users_matching,
       ((SELECT count(*) FROM public.events WHERE title ILIKE '%test%atlas%' OR slug ILIKE '%test%atlas%')
        + (SELECT count(*) FROM public.event_orders WHERE buyer_email ILIKE '%test%atlas%' OR buyer_handle ILIKE '%test%atlas%')
        + (SELECT count(*) FROM public.app_users WHERE handle ILIKE '%test%atlas%') = 0) AS zero_test_atlas_rows;

-- V4 the orders surface 12A must NOT have changed (hash of policy names/commands/roles + sorted table ACL + index names + constraint names): compare before/after, must be equal
SELECT 'V4_orders_surface_unchanged' AS q,
       md5(coalesce((SELECT string_agg(policyname || '/' || cmd || '/' || roles::text || '/' || permissive, ';' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_orders'), '')) AS policies_md5,
       md5(coalesce((SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':' || a.privilege_type, ',' ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type)
                      FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a WHERE c.oid = to_regclass('public.event_orders')), '')) AS table_acl_md5,
       md5(coalesce((SELECT string_agg(indexname::text, ',' ORDER BY indexname::text) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'event_orders'), '')) AS index_names_md5,
       md5(coalesce((SELECT string_agg(conname::text, ',' ORDER BY conname::text) FROM pg_constraint WHERE conrelid = to_regclass('public.event_orders')), '')) AS constraint_names_md5;

-- V5 definition capture of the two public functions (the read-only "backup" the SQL connector can produce: full text + ACL + config; run it BEFORE step 1 and keep the output; the verbatim originals are also in the ROLLBACK packs)
SELECT 'V5_definition_capture' AS q, p.oid::regprocedure::text AS fn, pg_get_functiondef(p.oid) AS definition, p.proacl::text AS acl_raw, p.proconfig::text AS config
  FROM pg_proc p WHERE p.proname IN ('check_in_ticket', 'event_checkin_scan') AND p.pronamespace = 'public'::regnamespace ORDER BY 2;
