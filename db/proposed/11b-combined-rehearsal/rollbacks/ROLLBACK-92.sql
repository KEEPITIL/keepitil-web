-- ROLLBACK-92.sql : undo APPLY-92.sql (PR #92 migration). Run it BEFORE ROLLBACK-1.sql (the summary function depends on private.profile_is_public).
-- Placeholders {{...}} are invalid SQL on purpose: an unfilled one aborts the transaction at parse time (nothing is committed).
-- Capture BEFORE applying APPLY-92 (PRECHECK-92 Q-2):  SELECT pg_get_functiondef('public.get_profile_events(text)'::regprocedure);  plus the routine_privileges rows.
-- private.profile_is_public is owned by PR #91. This rollback does not drop it.
-- Differences from the PR's down file (both are fixes, proven in proof-92.mjs):
--   (1) NO table-level SELECT re-grant. The PR file re-grants table-level SELECT on events, which makes event_password_hash readable by anon. Prod has column grants (#39);
--       APPLY-92 changed none of them (guarded), so rollback leaves them alone.
--   (2) it restores get_profile_events from the capture and its ACL, and refuses to commit while the placeholders are unfilled.
-- NOT rolled back (data/behaviour): nothing is written by APPLY-92 except functions and (no-op) grants. Old clients regain the old public get_profile_events as soon as this runs.
BEGIN;
DROP FUNCTION IF EXISTS public.get_profile_event_summary(text);
DROP FUNCTION IF EXISTS public.get_my_ticket_summary();
DROP FUNCTION IF EXISTS public.get_profile_events(text);
{{GET_PROFILE_EVENTS_OLD_DEFINITION}};          -- the pg_get_functiondef text from Q-2, ending with its own $$ ... $$ (no trailing semicolon here)
{{GET_PROFILE_EVENTS_OLD_GRANTS}};              -- the GRANT/REVOKE EXECUTE statements rebuilt from Q-2's routine_privileges rows
-- Guard: the events column grants must still be the live 45-column set (same query as APPLY-92's guard): see VERIFY-92 V-3.
COMMIT;
-- VERIFY: V-1, V-2, V-3 of VERIFY-92.md; the old get_profile_events body equals the capture.
