-- Rollback for 20261107020000_profile_event_summary.sql.
-- Not applied by the PR. Run only after a backup.
--
-- get_profile_events(text) was replaced. This file cannot restore the previous
-- body. Put that definition back from the backup taken before the forward file.
-- private.profile_is_public is owned by PR #91. This rollback does not drop it.

BEGIN;

DROP FUNCTION IF EXISTS public.get_profile_event_summary(text);
DROP FUNCTION IF EXISTS public.get_my_ticket_summary();

REVOKE ALL ON FUNCTION public.get_profile_events(text) FROM PUBLIC, anon, authenticated;

COMMIT;

-- Verify: anon cannot execute get_profile_events(text).
-- get_profile_event_summary and get_my_ticket_summary are gone.
-- Restore get_profile_events from backup before relying on /profile again.
