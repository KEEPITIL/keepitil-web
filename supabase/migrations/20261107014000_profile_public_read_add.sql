-- STEP 1 of 2. Apply this first. Do not apply the revoke migration yet.
-- NEEDS SENTINEL + JOE BEFORE PROD. Not applied by this PR.
--
-- Adds columns, get_public_profile, public_profile_list, column grants, and the
-- backfill. Leaves anon SELECT on profile_meta in place so existing logged-out
-- pages keep working until the web deploy is verified.
-- Then apply 20261107014100_profile_public_read_revoke.sql.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profile_meta
  ADD COLUMN IF NOT EXISTS profile_public boolean,
  ADD COLUMN IF NOT EXISTS age_verified boolean,
  ADD COLUMN IF NOT EXISTS is_minor boolean,
  ADD COLUMN IF NOT EXISTS under_18 boolean,
  ADD COLUMN IF NOT EXISTS public_fields text[];

-- Published brand, organizer, and artist profiles are public. Personal members stay null.
UPDATE public.profile_meta
SET profile_public = TRUE
WHERE status = 'published'
  AND account_type IN ('brand', 'organizer', 'artist')
  AND profile_public IS NULL;

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
    AND m.is_minor IS NOT TRUE
    AND m.status = 'published'
    AND (
      m.account_type IN ('brand', 'organizer', 'artist')
      OR (
        COALESCE(m.account_type, '') NOT IN ('brand', 'organizer', 'artist')
        AND m.age_verified IS TRUE
        AND m.is_minor IS FALSE
        AND m.public_fields IS NOT NULL
        AND cardinality(m.public_fields) > 0
      )
    )
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

-- Directory list. Brand, organizer, and artist only, and only when
-- profile_public is true and status is published. No 18+ check here.
-- Personal member profiles are not returned. book_email is not selected.
CREATE OR REPLACE FUNCTION public.public_profile_list(
  p_account_type text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 24
)
RETURNS TABLE (
  slug text,
  display_name text,
  tagline text,
  bio text,
  avatar_url text,
  cover_url text,
  account_type text,
  entity_category text,
  location text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    m.slug,
    CASE WHEN m.public_fields IS NULL OR 'display_name' = ANY (m.public_fields) THEN m.display_name END,
    CASE WHEN m.public_fields IS NULL OR 'tagline' = ANY (m.public_fields) THEN m.tagline END,
    CASE WHEN m.public_fields IS NULL OR 'bio' = ANY (m.public_fields) THEN left(m.bio, 160) END,
    CASE WHEN m.public_fields IS NULL OR 'avatar_url' = ANY (m.public_fields) OR 'avatar' = ANY (m.public_fields) THEN m.avatar_url END,
    CASE WHEN m.public_fields IS NULL OR 'cover_url' = ANY (m.public_fields) OR 'avatar_url' = ANY (m.public_fields) THEN m.cover_url END,
    m.account_type,
    m.entity_category,
    CASE WHEN m.public_fields IS NULL OR 'location' = ANY (m.public_fields) THEN m.location END,
    m.status
  FROM public.profile_meta m
  WHERE m.status = 'published'
    AND m.profile_public IS TRUE
    AND m.is_minor IS NOT TRUE
    AND m.account_type IN ('brand', 'organizer', 'artist')
    AND (
      p_account_type IS NULL
      OR btrim(p_account_type) = ''
      OR lower(btrim(p_account_type)) = lower(m.account_type)
    )
    AND (
      p_query IS NULL
      OR btrim(p_query) = ''
      OR m.slug = lower(regexp_replace(btrim(p_query), '[^a-zA-Z0-9]+', '-', 'g'))
      OR m.display_name ILIKE ('%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%')
    )
  ORDER BY m.updated_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
$$;

REVOKE ALL ON FUNCTION public.public_profile_list(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_profile_list(text, text, integer) TO anon, authenticated;


-- Owners can edit their profile. They cannot set age, minor, status, or account type.
REVOKE UPDATE ON TABLE public.profile_meta FROM authenticated, anon, PUBLIC;
GRANT UPDATE (
  slug, display_name, handle, location, bio, tagline, pronouns, book_email,
  about, links, links_label, badges, avatar_url, cover_url, cover_mobile_url,
  socials, highlights, updated_at, profile_public, public_fields
) ON TABLE public.profile_meta TO authenticated;

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

-- Row security is turned on in the revoke migration, after this file is verified.
-- Column grants match profile_meta: an owner cannot write age_verified or is_minor.
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
