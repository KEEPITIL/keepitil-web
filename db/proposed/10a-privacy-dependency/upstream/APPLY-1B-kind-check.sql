-- APPLY-1B-kind-check.sql  (#91 pack addendum)
-- *** NEEDS A GO: DDL ON PROD (drops and recreates a CHECK constraint on public.profile_content). Not applied. ***
-- Why: PR #91's new profile.html "request a business type" inserts public.profile_content rows with kind = 'account_type_request'. Prod's CHECK
--   profile_content_kind_check allows only 9 kinds (PRECHECK-RESULTS P-8: article, photo, show, chat, post, event, highlight, profile_categories, create_entry),
--   so that insert is REJECTED today and the owner's request silently does nothing. Neither APPLY-1 nor APPLY-2 touches this constraint.
-- What: drop and recreate the constraint with the same 9 kinds + 'account_type_request'. No NOT VALID (ADD CONSTRAINT validates the 632 existing rows, all of whose kinds are in the 9: article 364, post 211, event 56, create_entry 1).
-- Lock: ACCESS EXCLUSIVE on profile_content for the validation scan (632 rows: milliseconds). Run with: set lock_timeout='5s';
-- Order: any time before the web merge; independent of APPLY-1/APPLY-2 (it needs neither). Recommended right after APPLY-1.
-- Guard: refuses unless the constraint exists and currently allows exactly the 9 kinds (so a drifted prod is not silently overwritten). The constraint NAME is the conventional one and is
--   ASSUMED: confirm with  select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.profile_content'::regclass and contype='c';
-- Rollback: ROLLBACK-1B-kind-check.sql (deletes account_type_request rows first, so that is data loss by design).
BEGIN;
DO $$
DECLARE def text; kinds text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conrelid = 'public.profile_content'::regclass AND c.conname = 'profile_content_kind_check' AND c.contype = 'c';
  IF def IS NULL THEN RAISE EXCEPTION 'profile_content_kind_check not found; nothing applied'; END IF;
  SELECT COALESCE(array_agg(m[1] ORDER BY m[1]), ARRAY[]::text[]) INTO kinds FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
  IF kinds <> ARRAY['article','chat','create_entry','event','highlight','photo','post','profile_categories','show']::text[] THEN
    RAISE EXCEPTION 'profile_content_kind_check differs from the 9 expected kinds (%); nothing applied', kinds;
  END IF;
END $$;
ALTER TABLE public.profile_content DROP CONSTRAINT profile_content_kind_check;
ALTER TABLE public.profile_content ADD CONSTRAINT profile_content_kind_check
  CHECK (kind = ANY (ARRAY['article','photo','show','chat','post','event','highlight','profile_categories','create_entry','account_type_request']::text[]));
COMMIT;
-- VERIFY: select pg_get_constraintdef(oid) from pg_constraint where conname='profile_content_kind_check';  -> 10 kinds.  select count(*) from public.profile_content; -> 632 (unchanged).
