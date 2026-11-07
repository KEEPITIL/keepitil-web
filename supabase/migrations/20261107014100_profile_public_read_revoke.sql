-- STEP 2 of 2. Apply only after 20261107014000_profile_public_read_add.sql
-- is applied, the web deploy is live, and Spotlight, Connect, browse, and
-- /member have been checked.
-- NEEDS SENTINEL + JOE BEFORE PROD. Not applied by this PR.
--
-- After this file, this is refused for anon:
--   select book_email from public.profile_meta;

-- Drop anon (and PUBLIC) SELECT policies that are USING (true).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pol.polname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'profile_meta'
      AND pol.polcmd = 'r'
      AND (
        pol.polroles = '{0}'
        OR EXISTS (
          SELECT 1 FROM pg_roles role
          WHERE role.rolname = 'anon' AND pol.polroles @> ARRAY[role.oid]
        )
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profile_meta', r.polname);
  END LOOP;
END $$;

REVOKE SELECT ON TABLE public.profile_meta FROM anon;
REVOKE SELECT ON TABLE public.profile_meta FROM PUBLIC;

-- The signed-in owner can still read and update their own row. No anon policy.
-- Column grants from step 1 still block age_verified, is_minor, under_18, status, and account_type.
DROP POLICY IF EXISTS profile_meta_owner_select ON public.profile_meta;
CREATE POLICY profile_meta_owner_select ON public.profile_meta
  FOR SELECT TO authenticated
  USING (slug = public.my_profile_slug());

DROP POLICY IF EXISTS profile_meta_owner_update ON public.profile_meta;
CREATE POLICY profile_meta_owner_update ON public.profile_meta
  FOR UPDATE TO authenticated
  USING (slug = public.my_profile_slug())
  WITH CHECK (slug = public.my_profile_slug());

DROP POLICY IF EXISTS profile_meta_owner_insert ON public.profile_meta;
CREATE POLICY profile_meta_owner_insert ON public.profile_meta
  FOR INSERT TO authenticated
  WITH CHECK (slug = public.my_profile_slug());

-- public.profiles was created in step 1 with row security off.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM anon, PUBLIC;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
