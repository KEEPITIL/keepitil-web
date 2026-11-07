-- PR #91 ROLLBACK v2 (steps 1 + 2 + Sentinel 18+ helper). Drafted Nov 6 2026 ~9:50 PM PT.
-- Supersedes nothing; original kept at pr91-step1-rollback.sql. NOT APPLIED.
-- Prod pre-state re-read Nov 6 2026 (keepitil-prod, SELECT only):
--   profile_meta: RLS on, 4 rows (tuitea subscriber_profile/published, groove-trooper editorial_artist/published,
--     fobbinhard + keepitil-audit review). Policies: "profile_meta read all" (PUBLIC,true), profile_meta_read (PUBLIC,true),
--     "profile_meta owner insert", "profile_meta owner update" (authenticated), profile_meta_owner_update (PUBLIC).
--   profile_owners: 3 rows. Policies: "profile_owners claim" INSERT, "profile_owners delete own" DELETE,
--     "profile_owners manage own" UPDATE (all authenticated), "profile_owners read all" (PUBLIC,true),
--     profile_owners_read (PUBLIC,true). anon+authenticated ALL. (NOTE: no policy is named plain "read all".)
--   no private schema. Functions is_admin(), claim_profile(text,text) pre-exist (SECURITY DEFINER).
-- ORDER: revert the web deploy FIRST, then run this. Anon writes are deliberately NOT restored.

BEGIN;

-- 1. New policies
DROP POLICY IF EXISTS profile_meta_owner_select   ON public.profile_meta;
DROP POLICY IF EXISTS profile_meta_public_select  ON public.profile_meta;   -- if a helper-based read policy was added
DROP POLICY IF EXISTS profile_owners_select_own   ON public.profile_owners;

-- 2. New functions (RESTRICT: fail loudly if something unexpected depends on them)
-- NOT in a #91-only rollback: get_profile_events already exists in prod and #91 does not create it.
-- If #92 shipped, run supabase/rollbacks/20261107020000_profile_event_summary_down.sql first.
-- That file restores the backed-up live body. Never drop get_profile_events here.
-- DROP FUNCTION IF EXISTS public.get_profile_events(text) RESTRICT;
DROP FUNCTION IF EXISTS public.approve_profile_claim(uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.request_profile_claim(text) RESTRICT;
DROP FUNCTION IF EXISTS public.i_own_profile(text) RESTRICT;
DROP FUNCTION IF EXISTS public.set_profile_admin_approved(text, boolean) RESTRICT;
DROP FUNCTION IF EXISTS public.public_profile_list(text, text, integer) RESTRICT;
DROP FUNCTION IF EXISTS public.get_public_profile(text) RESTRICT;
DROP FUNCTION IF EXISTS private.profile_public_one(text) RESTRICT;
DROP FUNCTION IF EXISTS private.owner_is_verified_adult(text) RESTRICT;    -- if added for the business rule
DROP FUNCTION IF EXISTS private.profile_is_public(text) RESTRICT;          -- after the policies/functions that call it
DROP TABLE    IF EXISTS public.profile_claim_requests RESTRICT;
-- Sentinel ruling 1 (Nov 6): server-only age table. Drop the admin RPC first, then the table.
-- Name the RPC to match the PR (e.g. public.admin_set_account_age); RESTRICT fails loudly if the name is wrong.
DROP FUNCTION IF EXISTS public.admin_move_house_page(text, uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.admin_set_account_age(uuid, boolean, text) RESTRICT;
DROP FUNCTION IF EXISTS public.admin_set_account_age(uuid, boolean, text, text, text) RESTRICT;
DROP TABLE    IF EXISTS private.account_age RESTRICT;
-- Ruling 2: house profile_owners rows (method house) are data. Keep them on rollback; they are harmless with the original policies.
DROP SCHEMA   IF EXISTS private RESTRICT;   -- did not exist before step 1; fails if anything is left in it

-- 3. Restore the two original profile_meta read-all policies (step 2 drops them)
DROP POLICY IF EXISTS "profile_meta read all" ON public.profile_meta;
CREATE POLICY "profile_meta read all" ON public.profile_meta FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS profile_meta_read ON public.profile_meta;
CREATE POLICY profile_meta_read ON public.profile_meta FOR SELECT TO public USING (true);

-- 4. Restore profile_owners policies exactly as prod has them today
DROP POLICY IF EXISTS "profile_owners claim" ON public.profile_owners;
CREATE POLICY "profile_owners claim" ON public.profile_owners
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "profile_owners delete own" ON public.profile_owners;
CREATE POLICY "profile_owners delete own" ON public.profile_owners
  FOR DELETE TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "profile_owners manage own" ON public.profile_owners;
CREATE POLICY "profile_owners manage own" ON public.profile_owners
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "profile_owners read all" ON public.profile_owners;
CREATE POLICY "profile_owners read all" ON public.profile_owners FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS profile_owners_read ON public.profile_owners;
CREATE POLICY profile_owners_read ON public.profile_owners FOR SELECT TO public USING (true);
-- NOTE: restoring the claim + read-all policies reopens the known takeover/owner_id leak. Intended:
-- rollback = exact pre-state. Re-apply the profile_owners hardening separately if only the web part failed.

-- 5. Restore table-wide authenticated privileges (a leftover column grant is harmless under ALL)
GRANT ALL ON TABLE public.profile_meta   TO authenticated;
GRANT ALL ON TABLE public.profile_owners TO authenticated;
-- Restore anon SELECT only (step 2 revoked ALL). Logged-out pages read these today.
GRANT SELECT ON TABLE public.profile_meta   TO anon;
GRANT SELECT ON TABLE public.profile_owners TO anon;

-- 6. claim_profile EXECUTE for signed-in users, if step 1 revoked it
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'claim_profile'
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig); END LOOP;
END $$;

-- Soft rollback stops here (keeps the 6 columns). Full rollback:
-- ALTER TABLE public.profile_meta
--   DROP COLUMN IF EXISTS profile_public, DROP COLUMN IF EXISTS age_verified,
--   DROP COLUMN IF EXISTS is_minor, DROP COLUMN IF EXISTS under_18,
--   DROP COLUMN IF EXISTS public_fields, DROP COLUMN IF EXISTS admin_approved;
COMMIT;

-- Verify: select policyname from pg_policies where tablename in ('profile_meta','profile_owners')
--   -> the 5 + 5 names above, nothing else; anon `select slug from profile_meta` returns 4 rows;
--   owner save on /profile works; \dp shows authenticated=arwdDxt on both tables, anon=r;
--   select count(*) from pg_namespace where nspname='private' -> 0.
