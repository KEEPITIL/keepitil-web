-- Rollback for 20261107020000_profile_event_summary.sql.
-- Not applied by the PR. Run this BEFORE the #91 down file.
--
-- The live get_profile_events(text) body is not in this repository.
-- Before the forward migration, save it with the grants (see
-- docs/profile-release-runbook.md). Paste that saved CREATE OR REPLACE
-- and the GRANT statements in the marked block below. Do not invent a body.
-- private.profile_is_public is owned by PR #91. This rollback does not drop it.

BEGIN;

DROP FUNCTION IF EXISTS public.get_profile_event_summary(text);
DROP FUNCTION IF EXISTS public.get_my_ticket_summary();

-- The forward file replaced get_profile_events inside a transaction.
-- Drop the replacement, then restore the saved original.
DROP FUNCTION IF EXISTS public.get_profile_events(text);

-- PASTE THE SAVED PRE-APPLY DEFINITION AND GRANTS HERE.
-- They must be the exact output of pg_get_functiondef and the grants
-- captured before 20261107020000_profile_event_summary.sql was applied.
-- Leaving this block empty drops the replacement and does not put the
-- old function back.

COMMIT;

-- Verify: get_profile_event_summary and get_my_ticket_summary are gone.
-- get_profile_events matches the saved definition. Then run the #91 down file.
