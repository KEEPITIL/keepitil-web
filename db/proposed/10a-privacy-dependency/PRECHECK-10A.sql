-- PRECHECK-10A.sql : READ-ONLY catalog queries for slice 10A (privacy dependency patch). PROPOSAL: nobody ran this on prod.
-- Catalog + counts only: no row contents, no emails, no user ids. Run one block at a time on keepitil-prod, save every output, any mismatch with an EXPECT = STOP.
-- Optional guard for the whole session:  begin transaction read only;  ...  rollback;
-- Blocks D and E print FUNCTION SOURCE (code, not data). Block H is the fingerprint that ROLLBACK-1C_PROPOSED.sql needs ({{PRE_1C_FINGERPRINT}}); take it right before 1C.

-- A. ACLs of the target relations (table-level + column-level), by grantee.   EXPECT after APPLY-1+92 (before 1C): see ORDER-10A.md "state table".
SELECT 'table' AS level, c.relname, CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee, string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privileges
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, LATERAL aclexplode(c.relacl) a
 WHERE n.nspname = 'public' AND c.relname IN ('profile_meta','profile_owners','profile_content','events','applications')
 GROUP BY 1, 2, 3
UNION ALL
SELECT 'column', c.relname || '.' || at.attname, CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END, string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
  FROM pg_attribute at JOIN pg_class c ON c.oid = at.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace, LATERAL aclexplode(at.attacl) a
 WHERE n.nspname = 'public' AND c.relname IN ('profile_meta','profile_owners','profile_content','applications') AND at.attnum > 0 AND NOT at.attisdropped AND at.attacl IS NOT NULL
 GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
-- A2. same for events but only the SUMMARY (45 columns expected before 1C, 44 after): readable column list per role.
SELECT r.rolname AS role, has_table_privilege(r.rolname, 'public.events', 'SELECT') AS table_level_select,
       count(*) FILTER (WHERE has_column_privilege(r.rolname, 'public.events', a.attname, 'SELECT')) AS readable_columns,
       bool_or(has_column_privilege(r.rolname, 'public.events', a.attname, 'SELECT')) FILTER (WHERE a.attname = 'event_password_hash') AS hash_readable,
       bool_or(has_column_privilege(r.rolname, 'public.events', a.attname, 'SELECT')) FILTER (WHERE a.attname = 'submitted_by') AS submitted_by_readable,
       string_agg(a.attname, ',' ORDER BY a.attname) FILTER (WHERE has_column_privilege(r.rolname, 'public.events', a.attname, 'SELECT')) AS column_list
  FROM pg_roles r CROSS JOIN pg_attribute a
 WHERE r.rolname IN ('anon','authenticated') AND a.attrelid = 'public.events'::regclass AND a.attnum > 0 AND NOT a.attisdropped
 GROUP BY 1 ORDER BY 1;

-- B. profile_meta shape (the column set the 1C guard assumes) and the per-role column privilege sets.
--    EXPECT: status default 'review'; the 6 APPLY-1 columns present; authenticated INSERT = the 22 APPLY-1 columns, UPDATE = the same 22 (before 1C); anon none.
SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS default_expr
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE a.attrelid = 'public.profile_meta'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum;
SELECT r.rolname AS role, p.priv,
       has_table_privilege(r.rolname, 'public.profile_meta', p.priv) AS table_level,
       string_agg(a.attname, ',' ORDER BY a.attname) FILTER (WHERE has_column_privilege(r.rolname, 'public.profile_meta', a.attname, p.priv)) AS columns
  FROM pg_roles r CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('SELECT')) p(priv) CROSS JOIN pg_attribute a
 WHERE r.rolname IN ('anon','authenticated') AND a.attrelid = 'public.profile_meta'::regclass AND a.attnum > 0 AND NOT a.attisdropped
 GROUP BY 1, 2, 3 ORDER BY 1, 2;

-- C. RLS and policies on every target table (needed for: profile_content anon write policy = none; events policies that mention submitted_by).
SELECT c.relname, c.relrowsecurity AS rls_on, c.relforcerowsecurity AS rls_forced FROM pg_class c WHERE c.oid IN ('public.profile_meta'::regclass,'public.profile_owners'::regclass,'public.profile_content'::regclass,'public.events'::regclass,'public.applications'::regclass) ORDER BY 1;
SELECT tablename, policyname, cmd, roles, permissive, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('profile_meta','profile_owners','profile_content','events','applications') ORDER BY 1, 2;
--   EXPECT profile_content: no policy with cmd in (INSERT, UPDATE, DELETE, ALL) whose roles include anon or public (1C guard G5 refuses otherwise).

-- D. [CAPTURE] the function bodies and ACLs this slice reasons about but could not read (not in any pack).
--    D1 get_event_view is THE missing body for the organizer-mask review template. D2 captures the #91/#92 RPCs after APPLY-1/92 for the rollback.
SELECT p.oid::regprocedure AS signature, p.prosecdef AS security_definer, p.proconfig AS config, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl, pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('get_event_view','event_requires_password','has_event_ticket','get_event_lineup','get_event_media','get_event_social','get_my_tickets') ORDER BY 1;          -- D1
SELECT p.oid::regprocedure AS signature, p.prosecdef, p.proconfig, p.proacl::text AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE (n.nspname = 'public' AND p.proname IN ('get_public_profile','public_profile_list','get_approved_profile','i_own_profile','request_profile_claim','approve_profile_claim','get_profile_events','get_profile_event_summary','get_my_ticket_summary','claim_profile'))
    OR (n.nspname = 'private') ORDER BY 1;                                                                                                          -- D2

-- E. Every function that WRITES profile_meta (so the account_type/status narrowing breaks no legitimate writer). Source regex, not data.
--    EXPECT (post APPLY-1): only SECURITY DEFINER functions owned by postgres that you can name: approve_profile_claim writes profile_owners only (NOT listed unless it matches),
--    admin_set_account_age / admin_move_house_page write is_minor/under_18 (flags, not account_type/status), set_profile_admin_approved writes admin_approved.
--    ANY other hit that sets account_type or status = STOP and review before 1C.
SELECT p.oid::regprocedure AS signature, p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner,
       (p.prosrc ~* '(account_type|status)\s*=')                                                            AS assigns_account_type_or_status,
       (p.prosrc ~* 'insert\s+into\s+(public\.)?profile_meta')                                              AS inserts,
       (p.prosrc ~* 'update\s+(public\.)?profile_meta')                                                     AS updates,
       (p.prosrc ~* 'delete\s+from\s+(public\.)?profile_meta')                                              AS deletes,
       (p.prosrc ~* 'truncate')                                                                             AS truncates,
       p.proacl::text AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prokind = 'f'
   AND p.prosrc ~* '(insert\s+into|update|delete\s+from|merge\s+into)\s+(public\.)?profile_meta'
 ORDER BY 1;
-- E2. triggers on profile_meta / profile_owners / profile_content / events (the publish gate must be there; a trigger can write status without the column grant).
SELECT tgrelid::regclass AS rel, tgname, tgenabled, pg_get_triggerdef(oid, true) AS def FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.profile_meta'::regclass,'public.profile_owners'::regclass,'public.profile_content'::regclass,'public.events'::regclass) ORDER BY 1, 2;
-- E3. pg_cron jobs and rules that mention the tables (EXPECT none; pg_cron exists per P-2).
SELECT jobid, jobname, left(command, 120) AS command_head FROM cron.job WHERE command ~* '(profile_meta|profile_owners|profile_content|profiles|submitted_by)' ;

-- F. public.profiles view and its dependents (who can still read it, and what sits on top of applications).
--    EXPECT after APPLY-1: no SELECT for anon/authenticated/PUBLIC on the view; no other view/function reads it except get_approved_profile.
SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner, c.reloptions, c.relacl::text AS acl FROM pg_class c WHERE c.oid IN ('public.profiles'::regclass, 'public.applications'::regclass);
SELECT DISTINCT dep.refobjid::regclass AS depends_on, cl.oid::regclass AS dependent_relation
  FROM pg_depend dep JOIN pg_rewrite rw ON rw.oid = dep.objid JOIN pg_class cl ON cl.oid = rw.ev_class
 WHERE dep.refobjid IN ('public.profiles'::regclass, 'public.applications'::regclass) AND cl.oid <> dep.refobjid;
SELECT p.oid::regprocedure AS signature, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prosrc ~* '(from|join)\s+(public\.)?profiles\M' ORDER BY 1;
SELECT count(*) AS applications_rows, count(*) FILTER (WHERE status = 'approved') AS approved_rows FROM public.applications;

-- G. events.submitted_by dependents (policies, functions, views) so revoking the column cannot break a definer-less reader.
--    EXPECT: policies/functions may reference it (RLS expressions and DEFINER bodies do NOT need the caller's column privilege). Any SECURITY INVOKER function or view that
--    selects it for anon/authenticated = a breaking reader: STOP.
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND (qual ~* 'submitted_by' OR with_check ~* 'submitted_by') ORDER BY 1;
SELECT p.oid::regprocedure AS signature, p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public','private','atlas_media_guard') AND p.prokind = 'f' AND p.prosrc ~* 'submitted_by' ORDER BY 1;
SELECT cl.oid::regclass AS view_name, cl.relkind FROM pg_rewrite rw JOIN pg_class cl ON cl.oid = rw.ev_class WHERE cl.relkind IN ('v','m') AND pg_get_viewdef(cl.oid) ~* 'submitted_by';
SELECT count(*) AS events_total, count(submitted_by) AS with_submitted_by FROM public.events;

-- H. DRIFT FINGERPRINT (privileges of the 5 relations + get_approved_profile). Same expression as ROLLBACK-1C. Take it right before 1C; store it as {{PRE_1C_FINGERPRINT}}.
--    Also take it right before APPLY-1 and after each step (ORDER-10A.md "checkpoints") so every step has its own baseline. It deliberately EXCLUDES grantor.
SELECT md5(string_agg(line, E'\n' ORDER BY line)) AS acl_fingerprint, count(*) AS acl_lines FROM (
  SELECT 'T|' || c.relname || '|' || CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END || '|' || a.privilege_type || '|' || a.is_grantable::text AS line
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, LATERAL aclexplode(c.relacl) a
   WHERE n.nspname = 'public' AND c.relname IN ('profile_meta','profile_owners','profile_content','events','applications')
  UNION ALL
  SELECT 'C|' || c.relname || '.' || at.attname || '|' || CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END || '|' || a.privilege_type || '|' || a.is_grantable::text
    FROM pg_attribute at JOIN pg_class c ON c.oid = at.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace, LATERAL aclexplode(at.attacl) a
   WHERE n.nspname = 'public' AND c.relname IN ('profile_meta','profile_owners','profile_content','events','applications') AND at.attnum > 0 AND NOT at.attisdropped AND at.attacl IS NOT NULL
  UNION ALL
  SELECT 'F|' || p.oid::regprocedure::text || '|' || CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END || '|' || a.privilege_type || '|' || a.is_grantable::text
    FROM pg_proc p, LATERAL aclexplode(p.proacl) a WHERE p.oid = to_regprocedure('public.get_approved_profile(uuid,text)')
) s;

-- I. Server touchpoints for the 18+ purchase / Discover / save / share gate (names and shapes only). I10 needs the live bodies of the checkout edge functions, which are NOT in SQL.
SELECT p.oid::regprocedure AS signature, p.prosecdef AS security_definer, (p.prosrc ~* 'account_age') AS mentions_account_age
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prokind = 'f'
   AND (p.proname ~* '(checkout|order|ticket|purchase|buy|save|share|follow|rsvp|attend|payout)' OR p.prosrc ~* '(event_orders|saved_events|ticket_orders)')
 ORDER BY 1;                                                                                                                                            -- I1
SELECT c.relname, c.relkind, c.relrowsecurity AS rls_on, c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('event_orders','saved_events','ticket_tiers','ticketing_links','platform_config') ORDER BY 1;                -- I2
SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('event_orders','saved_events') ORDER BY 1, ordinal_position; -- I3
SELECT to_regclass('private.account_age') IS NOT NULL AS account_age_exists;                                                                              -- I4
--   EXPECT I1: no purchase/save/share function mentions account_age today (the gate does not exist server-side); the edge functions create-checkout v58, create-promo-checkout,
--   stripe-webhook, ticketing-webhook are read from the deployed bundle (supabase functions download or the connector), NOT from SQL: mark "needs live read".

-- J. owner_handle exposure (get_event_view organizer mask): column readable by anon today; row counts only.
SELECT count(*) AS events_with_owner_handle, count(DISTINCT lower(btrim(owner_handle))) AS distinct_hosts FROM public.events WHERE owner_handle IS NOT NULL;
SELECT count(DISTINCT lower(btrim(e.owner_handle))) AS hosts_with_public_profile
  FROM public.events e WHERE e.owner_handle IS NOT NULL AND to_regprocedure('private.profile_is_public(text)') IS NOT NULL AND private.profile_is_public(lower(btrim(e.owner_handle)));
