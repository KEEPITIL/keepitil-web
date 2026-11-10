-- ROLLBACK-2.sql : undo APPLY-2.sql (step 2) only. Returns the database to the state after APPLY-1 (step 1).
-- Use when: after step 2, something that read public.profile_meta as anon / old cached JS / the iOS bundle broke.
-- Restores: the two open read policies, anon SELECT on profile_meta, the owner column grants that step 2 revoked.
-- Does NOT restore (step 2 never took them either): anon access to profile_owners, owner INSERT/UPDATE/DELETE on profile_owners, claim_profile.
-- Tested in proof-91.mjs (scenario R3: step 1 + step 2 + ROLLBACK-2 == step 1 state, compared by policy list, ACLs and function ACLs).
BEGIN;
DROP POLICY IF EXISTS "profile_meta read all" ON public.profile_meta;
CREATE POLICY "profile_meta read all" ON public.profile_meta FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS profile_meta_read ON public.profile_meta;
CREATE POLICY profile_meta_read ON public.profile_meta FOR SELECT TO public USING (true);
-- Any OTHER anon/PUBLIC select policy that step 2's catalog loop dropped: compare P-9 (PRECHECKS) with the pre-step-2 policy list and recreate it here: none expected.
GRANT SELECT ON TABLE public.profile_meta TO anon;
GRANT INSERT (account_type, status) ON TABLE public.profile_meta TO authenticated;
GRANT UPDATE (account_type, status, slug) ON TABLE public.profile_meta TO authenticated;
-- profile_meta RLS stays ENABLED (it was enabled before step 2 as well).
COMMIT;
-- VERIFY (anon): select count(*) from public.profile_meta;  -> 4 (row count from P-13).  owner save from the OLD cached profile.html works again.
