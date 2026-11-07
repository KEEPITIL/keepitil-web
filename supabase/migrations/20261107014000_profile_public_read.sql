-- NEEDS SENTINEL + JOE BEFORE PROD.
-- Not applied by this PR.
--
-- After this migration the following is refused for the anon role:
--   select book_email from public.profile_meta;
-- Logged-out reads go through public.get_public_profile(p_slug), one slug,
-- and only when the profile is public, published, and verified 18+.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- Privacy flags. Null means "not opted in" / "not verified".
ALTER TABLE public.profile_meta
  ADD COLUMN IF NOT EXISTS profile_public boolean,
  ADD COLUMN IF NOT EXISTS age_verified boolean,
  ADD COLUMN IF NOT EXISTS is_minor boolean,
  ADD COLUMN IF NOT EXISTS public_fields text[];

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

-- One slug. Public columns only. book_email is not selected.
CREATE OR REPLACE FUNCTION private.profile_public_one(p_slug text)
RETURNS TABLE (
  slug text,
  display_name text,
  handle text,
  avatar_url text,
  bio text,
  tagline text,
  location text,
  links jsonb,
  socials jsonb,
  about text,
  account_type text,
  links_label text,
  badges jsonb,
  profile_public boolean,
  public_fields text[],
  age_verified boolean,
  is_minor boolean,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    m.slug,
    CASE WHEN 'display_name' = ANY (m.public_fields) THEN m.display_name END,
    CASE WHEN 'handle' = ANY (m.public_fields) THEN m.handle END,
    CASE WHEN 'avatar_url' = ANY (m.public_fields) OR 'avatar' = ANY (m.public_fields) THEN m.avatar_url END,
    CASE WHEN 'bio' = ANY (m.public_fields) THEN m.bio END,
    CASE WHEN 'tagline' = ANY (m.public_fields) THEN m.tagline END,
    CASE WHEN 'location' = ANY (m.public_fields) THEN m.location END,
    CASE WHEN 'links' = ANY (m.public_fields) OR 'socials' = ANY (m.public_fields) THEN to_jsonb(m.links) END,
    CASE WHEN 'links' = ANY (m.public_fields) OR 'socials' = ANY (m.public_fields) THEN to_jsonb(m.socials) END,
    CASE WHEN 'about' = ANY (m.public_fields) THEN m.about END,
    CASE WHEN 'account_type' = ANY (m.public_fields) THEN m.account_type END,
    CASE WHEN 'links_label' = ANY (m.public_fields) THEN m.links_label END,
    CASE WHEN 'badges' = ANY (m.public_fields) THEN to_jsonb(m.badges) END,
    TRUE,
    m.public_fields,
    TRUE,
    FALSE,
    m.status
  FROM public.profile_meta m
  WHERE p_slug ~ '^[a-z0-9-]{1,80}$'
    AND m.slug = p_slug
    AND m.profile_public IS TRUE
    AND m.age_verified IS TRUE
    AND m.is_minor IS FALSE
    AND m.status = 'published'
    AND m.public_fields IS NOT NULL
    AND cardinality(m.public_fields) > 0
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profile(p_slug text)
RETURNS TABLE (
  slug text,
  display_name text,
  handle text,
  avatar_url text,
  bio text,
  tagline text,
  location text,
  links jsonb,
  socials jsonb,
  about text,
  account_type text,
  links_label text,
  badges jsonb,
  profile_public boolean,
  public_fields text[],
  age_verified boolean,
  is_minor boolean,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM private.profile_public_one(lower(btrim(p_slug)));
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated;

-- public.profiles: row security is off in prod. Turn it on before any page reads it.
-- If it is still the old view, rename that view and create the real table first.
DO $$
DECLARE kind "char";
BEGIN
  SELECT c.relkind INTO kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'profiles';

  IF kind = 'v' THEN
    EXECUTE 'ALTER VIEW public.profiles RENAME TO profiles_legacy_v';
  ELSIF kind IS NULL THEN
    NULL;
  ELSIF kind <> 'r' THEN
    RAISE EXCEPTION 'public.profiles has unexpected relkind %', kind;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  slug text UNIQUE,
  handle text,
  display_name text,
  avatar_url text,
  bio text,
  tagline text,
  location text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_public boolean,
  public_fields text[],
  age_verified boolean,
  is_minor boolean,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS before any grant to anon. Anon receives no SELECT.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (
  display_name, handle, avatar_url, bio, tagline, location, links, socials,
  profile_public, public_fields, slug
) ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- New accounts start private: every privacy flag is null.
CREATE OR REPLACE FUNCTION private.profiles_on_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_on_auth_user ON auth.users;
CREATE TRIGGER profiles_on_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.profiles_on_auth_user();

INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Copy display fields from the renamed view when that view exists.
-- Privacy flags stay null, so backfilled rows are not public.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'profiles_legacy_v'
  ) THEN
    EXECUTE $backfill$
      INSERT INTO public.profiles (id, slug, display_name, bio, avatar_url, location, socials)
      SELECT v.id,
             NULLIF(v.slug, ''),
             NULLIF(v.name, ''),
             NULLIF(v.bio, ''),
             NULLIF(v.image_url, ''),
             NULLIF(v.city, ''),
             jsonb_strip_nulls(jsonb_build_object(
               'instagram', NULLIF(v.instagram, ''),
               'spotify', NULLIF(v.spotify, ''),
               'website', NULLIF(v.website, ''),
               'youtube', NULLIF(v.youtube, '')
             ))
      FROM public.profiles_legacy_v v
      WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v.id)
      ON CONFLICT (id) DO UPDATE SET
        slug = COALESCE(public.profiles.slug, EXCLUDED.slug),
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        bio = COALESCE(public.profiles.bio, EXCLUDED.bio),
        avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
        location = COALESCE(public.profiles.location, EXCLUDED.location)
    $backfill$;
  END IF;
END $$;
