-- SOURCE: Atlas, "Media RLS + Connect publish-gate proposal v2" (2026-11-07 01:58 PST). The SQL below is copied
-- verbatim from that document (Section 4 "Post-check SELECTs"); only this comment header was added. Markdown backslash escapes were removed.
-- STATUS: PROPOSAL ONLY. NOT APPLIED. NOT AUTO-APPLIED. Nothing in this repository applies files under db/proposed/.
-- HOLD: no application without (1) Sentinel's isolated test matrix against the real catalog, (2) Joe's explicit
--       live-change authorization, (3) a re-baselined fingerprint (see README.md: the c917a7df... baseline is STALE).
-- POST-CHECK SELECTs (read-only, counts and catalog facts only). Run after a quiescent FORWARD apply. No mutation.

SELECT tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('event_media','venue_media','profile_meta')
ORDER BY tablename,policyname;
SELECT c.relname,c.relacl::text AS acl,
 has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
 has_table_privilege('anon',c.oid,'TRUNCATE') AS anon_truncate,
 has_table_privilege('authenticated',c.oid,'TRUNCATE') AS authenticated_truncate,
 has_table_privilege('anon',c.oid,'UPDATE') AS anon_update,
 has_table_privilege('anon',c.oid,'DELETE') AS anon_delete,
 has_table_privilege('anon',c.oid,'REFERENCES') AS anon_references,
 has_table_privilege('anon',c.oid,'TRIGGER') AS anon_trigger,
 has_table_privilege('authenticated',c.oid,'DELETE') AS authenticated_delete
FROM pg_class c WHERE c.oid IN ('public.event_media'::regclass,'public.venue_media'::regclass,'public.profile_meta'::regclass)
ORDER BY c.relname;
SELECT c.relname,a.attname,pg_get_expr(d.adbin,d.adrelid) AS default_expr
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE c.oid IN ('public.event_media'::regclass,'public.venue_media'::regclass) AND a.attname='status';
SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,p.proacl::text AS acl,
 pg_get_userbyid(p.proowner) AS owner,md5(pg_get_functiondef(p.oid)) AS definition_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='atlas_media_guard' OR (n.nspname='public' AND p.proname IN ('tag_event_media','tag_venue_media','profile_meta_publish_gate'))
ORDER BY n.nspname,p.proname;
SELECT tgname,tgenabled,pg_get_triggerdef(oid,true) AS definition FROM pg_trigger
WHERE tgrelid='public.profile_meta'::regclass AND NOT tgisinternal;
SELECT conname,pg_get_constraintdef(oid,true) AS definition FROM pg_constraint
WHERE conrelid='public.venue_media'::regclass AND conname='venue_media_status_check';
-- Counts only: no rows/identities/content returned.
SELECT 'event_media' AS table_name,status,count(*) FROM public.event_media GROUP BY status
UNION ALL SELECT 'venue_media',status,count(*) FROM public.venue_media GROUP BY status
UNION ALL SELECT 'profile_meta',status,count(*) FROM public.profile_meta GROUP BY status;
SELECT (SELECT count(*) FROM atlas_media_guard.orphan_event_media_backup) AS quarantine_backup_count,
 count(*) AS still_orphan_count,
 count(*) FILTER(WHERE m.status='hidden') AS orphan_hidden_count,
 count(*) FILTER(WHERE m.status='published') AS orphan_published_count
FROM public.event_media m WHERE NOT EXISTS(SELECT 1 FROM public.events e WHERE e.slug=m.event_slug);
