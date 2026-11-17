-- STEP 1 runbook, backup part 2 (read-only): the exact definitions + ACLs of the functions the step touches.
-- pg_dump cannot select single functions, so this prints them (run with psql -X -A -t, output to the backup folder).
-- The md5 column must match the PRECHECKs: mark_payouts_enabled 975786ee…, check_in_ticket bc0a07ce…,
-- event_checkin_scan d6f2977a…. Restoring = running the printed definition, then the printed GRANT lines.
select p.oid::regprocedure::text                                   as function,
       md5(pg_get_functiondef(p.oid))                              as md5,
       coalesce(p.proacl::text, '(default)')                       as acl,
       pg_get_functiondef(p.oid)                                   as definition
  from pg_proc p
 where p.oid in ('public.mark_payouts_enabled()'::regprocedure,
                 'public.check_in_ticket(text)'::regprocedure,
                 'public.event_checkin_scan(text)'::regprocedure)
 order by 1;
