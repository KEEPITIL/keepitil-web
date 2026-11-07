-- STEP 2 of 2. Apply only after 20261107014000_profile_public_read_add.sql
-- is applied, the web deploy is live, and Spotlight, Connect, browse, and
-- /member have been checked.
-- NEEDS SENTINEL + JOE BEFORE PROD. Not applied by this PR.
--
-- After this file, this is refused for anon:
--   select book_email from public.profile_meta;
--
-- public.profiles is a view over approved applications. ENABLE ROW LEVEL
-- SECURITY does not apply to a view, so this file does not touch it.
-- kode/app.html and kode/embed.html keep reading and writing that view.

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

-- The owner read policy is created in step 1 on profile_owners.
-- Turn row security on so that policy is what a signed-in user can read.
-- The existing update policy is not replaced.
ALTER TABLE public.profile_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_meta_owner_select ON public.profile_meta;
CREATE POLICY profile_meta_owner_select ON public.profile_meta
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profile_owners po
      WHERE po.profile_slug = profile_meta.slug
        AND po.owner_id = (SELECT auth.uid())
    )
  );
