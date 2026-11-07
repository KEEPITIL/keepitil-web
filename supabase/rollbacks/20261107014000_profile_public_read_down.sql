-- PR #91 step 1 (20261107014000_profile_public_read_add.sql) ROLLBACK
-- Prod pre-state read Nov 6 2026 5:45 PM PT (keepitil-prod, read-only):
--   profile_meta: RLS on; 4 rows; none of the 6 new columns exist; no private schema;
--   no get_public_profile / public_profile_list / profile_public_one / set_profile_admin_approved;
--   anon + authenticated have ALL table privileges; policies: "profile_meta read all" (PUBLIC, true),
--   profile_meta_read (PUBLIC, true), "profile_meta owner insert", "profile_meta owner update",
--   profile_meta_owner_update; trigger profile_meta_publish_gate_trg.
--   profile_owners: RLS on; policies "profile_owners claim" (INSERT, owner_id = auth.uid())
--   and "read all" (USING true); anon and authenticated have ALL, including TRUNCATE.
-- ORDER: revert the web deploy FIRST (new JS selects the new columns), then run this.
-- Before step 1: back up the 4 rows and save grants/policies (pg_dump -t public.profile_meta).
-- Not applied by this PR.

BEGIN;
DROP POLICY IF EXISTS profile_meta_owner_select ON public.profile_meta;
DROP POLICY IF EXISTS profile_owners_select_own ON public.profile_owners;

DROP FUNCTION IF EXISTS public.approve_profile_claim(uuid);
DROP FUNCTION IF EXISTS public.request_profile_claim(text);
DROP FUNCTION IF EXISTS public.i_own_profile(text);
DROP FUNCTION IF EXISTS public.set_profile_admin_approved(text, boolean);
DROP FUNCTION IF EXISTS public.public_profile_list(text, text, integer);
DROP FUNCTION IF EXISTS public.get_public_profile(text);
DROP FUNCTION IF EXISTS private.profile_public_one(text);
DROP TABLE IF EXISTS public.profile_claim_requests;
DROP SCHEMA IF EXISTS private RESTRICT;   -- did not exist before step 1

-- The forward migration dropped these. Put them back for authenticated only.
DROP POLICY IF EXISTS "profile_owners claim" ON public.profile_owners;
CREATE POLICY "profile_owners claim" ON public.profile_owners
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "read all" ON public.profile_owners;
CREATE POLICY "read all" ON public.profile_owners
  FOR SELECT TO authenticated
  USING (true);

-- Step 1 replaced table-wide INSERT and UPDATE with column grants.
-- GRANT ALL puts the table-wide privileges back, which is what production has now.
GRANT ALL ON TABLE public.profile_meta TO authenticated;
GRANT ALL ON TABLE public.profile_owners TO authenticated;
-- Anon privileges stay revoked. Do not grant this role.

-- claim_profile was revoked from signed-in users in step 1. Give it back to them only.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_profile'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- Soft rollback stops here (keeps the new columns and any opt-ins). Full rollback:
-- ALTER TABLE public.profile_meta
--   DROP COLUMN IF EXISTS profile_public, DROP COLUMN IF EXISTS age_verified,
--   DROP COLUMN IF EXISTS is_minor, DROP COLUMN IF EXISTS under_18,
--   DROP COLUMN IF EXISTS public_fields, DROP COLUMN IF EXISTS admin_approved;
COMMIT;

-- Verify: anon `select slug from profile_meta` still works; owner save on /profile works;
-- get_public_profile gone; \dp public.profile_meta shows authenticated=arwdDxt.
-- \dp public.profile_owners shows authenticated=arwdDxt and no privileges for anon.
