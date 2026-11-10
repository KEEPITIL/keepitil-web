-- Rollback for 20261107020000_profile_event_summary.sql.
-- Not applied by the PR. Run this BEFORE the #91 down file.
--
-- The live get_profile_events(text) body is not in this repository.
-- Capture it before the forward migration, then paste it over the restore
-- block below. Do not invent a body. The exact capture is:
--
--   SELECT pg_get_functiondef('public.get_profile_events(text)'::regprocedure);
--   SELECT grantee, privilege_type
--   FROM information_schema.routine_privileges
--   WHERE routine_schema = 'public' AND routine_name = 'get_profile_events';
--
-- private.profile_is_public is owned by PR #91. This rollback does not drop it.

BEGIN;

DROP FUNCTION IF EXISTS public.get_profile_event_summary(text);
DROP FUNCTION IF EXISTS public.get_my_ticket_summary();

-- The forward file replaced get_profile_events inside a transaction.
-- Drop the replacement, then restore the saved original.
DROP FUNCTION IF EXISTS public.get_profile_events(text);

-- RESTORE BLOCK. This file aborts here until the captured definition and
-- GRANT statements replace the RAISE. An empty block must not commit.
DO $$
BEGIN
  RAISE EXCEPTION 'get_profile_events restore is empty. Capture pg_get_functiondef(''public.get_profile_events(text)''::regprocedure) and the routine_privileges rows, paste both in place of this DO block, then run the file.';
END $$;

-- The forward file removed table SELECT and re-granted every column except
-- event_password_hash. This puts back the previous table SELECT, which
-- includes that column.
GRANT SELECT ON TABLE public.events TO anon, authenticated;

COMMIT;

-- Verify: get_profile_event_summary and get_my_ticket_summary are gone.
-- get_profile_events matches the saved definition. Then run the #91 down file.
