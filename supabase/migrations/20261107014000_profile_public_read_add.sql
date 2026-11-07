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
  ADD COLUMN IF NOT EXISTS public_fields text[],
  ADD COLUMN IF NOT EXISTS admin_approved boolean;

-- Approval is server-only. This marks the published rows that already exist,
-- and it never sets profile_public, age_verified, or is_minor.
-- A known minor (is_minor = true) is left unapproved.
UPDATE public.profile_meta
SET admin_approved = TRUE
WHERE status = 'published'
  AND is_minor IS NOT TRUE
  AND account_type IN ('subscriber_profile', 'editorial_artist', 'brand', 'organizer', 'artist')
  AND admin_approved IS NULL;

-- Business and artist pages that are already published become public.
-- Personal subscriber profiles stay null until the server sets 18+ and they opt in.
-- A known minor is never made public.
UPDATE public.profile_meta
SET profile_public = TRUE
WHERE status = 'published'
  AND is_minor IS NOT TRUE
  AND account_type IN ('brand', 'organizer', 'artist', 'editorial_artist')
  AND profile_public IS NULL;

-- One slug. Public columns only. book_email is not selected.
DROP FUNCTION IF EXISTS private.profile_public_one(text);
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
  status text,
  admin_approved boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    m.slug,
    CASE WHEN m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist') OR 'display_name' = ANY (m.public_fields) THEN m.display_name END,
    CASE WHEN m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist') OR 'handle' = ANY (m.public_fields) THEN m.handle END,
    CASE WHEN m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist') OR 'avatar_url' = ANY (m.public_fields) OR 'avatar' = ANY (m.public_fields) THEN m.avatar_url END,
    CASE WHEN m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist') OR 'bio' = ANY (m.public_fields) THEN m.bio END,
    CASE WHEN m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist') OR 'tagline' = ANY (m.public_fields) THEN m.tagline END,
    CASE WHEN m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist') OR 'location' = ANY (m.public_fields) THEN m.location END,
    CASE WHEN m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist') OR 'links' = ANY (m.public_fields) OR 'socials' = ANY (m.public_fields) THEN to_jsonb(m.links) END,
    CASE WHEN m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist') OR 'links' = ANY (m.public_fields) OR 'socials' = ANY (m.public_fields) THEN to_jsonb(m.socials) END,
    CASE WHEN 'about' = ANY (m.public_fields) THEN m.about END,
    m.account_type,
    CASE WHEN 'links_label' = ANY (m.public_fields) THEN m.links_label END,
    CASE WHEN 'badges' = ANY (m.public_fields) THEN to_jsonb(m.badges) END,
    m.profile_public,
    m.public_fields,
    m.age_verified,
    m.is_minor,
    m.status,
    m.admin_approved
  FROM public.profile_meta m
  WHERE p_slug ~ '^[a-z0-9-]{1,80}$'
    AND m.slug = p_slug
    AND m.is_minor IS NOT TRUE
    AND m.status = 'published'
    AND m.admin_approved IS TRUE
    AND (
      m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist')
      OR (
        COALESCE(m.account_type, '') NOT IN ('brand', 'organizer', 'artist', 'editorial_artist')
        AND m.profile_public IS TRUE
        AND m.age_verified IS TRUE
        AND m.is_minor IS FALSE
        AND m.public_fields IS NOT NULL
        AND cardinality(m.public_fields) > 0
      )
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.profile_public_one(text) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.get_public_profile(text);
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
  status text,
  admin_approved boolean
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

-- Directory list. Brand, organizer, artist, and editorial_artist only.
-- They appear when published and admin_approved. is_minor = true is excluded.
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
    AND m.admin_approved IS TRUE
    AND m.is_minor IS NOT TRUE
    AND m.account_type IN ('brand', 'organizer', 'artist', 'editorial_artist')
    AND (
      p_account_type IS NULL
      OR btrim(p_account_type) = ''
      OR (
        lower(btrim(p_account_type)) = 'artist'
        AND m.account_type IN ('artist', 'editorial_artist')
      )
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


-- Signed-in users lose table-wide writes. SELECT stays so the owner read policy can return their row.
-- INSERT and UPDATE are limited to the columns profile.html saves, plus the public opt-in.
-- age_verified, is_minor, under_18, status, account_type, and admin_approved are not granted.
REVOKE ALL ON TABLE public.profile_meta FROM authenticated;
GRANT SELECT ON TABLE public.profile_meta TO authenticated;
GRANT INSERT (
  slug, display_name, handle, location, bio, tagline, pronouns, book_email,
  about, links, links_label, badges, avatar_url, cover_url, cover_mobile_url,
  socials, highlights, updated_at, profile_public, public_fields
) ON TABLE public.profile_meta TO authenticated;
GRANT UPDATE (
  slug, display_name, handle, location, bio, tagline, pronouns, book_email,
  about, links, links_label, badges, avatar_url, cover_url, cover_mobile_url,
  socials, highlights, updated_at, profile_public, public_fields
) ON TABLE public.profile_meta TO authenticated;

-- Anon keeps SELECT until the revoke migration. Writes, delete, and truncate go now.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.profile_meta FROM anon, PUBLIC;
REVOKE DELETE, TRUNCATE ON TABLE public.profile_meta FROM authenticated;

-- Owner read uses profile_owners, the same check the existing update policy uses.
-- The existing update policy is left in place.
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

-- Only an admin, or service_role writing the column directly, can set admin_approved.
CREATE OR REPLACE FUNCTION public.set_profile_admin_approved(p_slug text, p_approved boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(public.is_admin(), FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  UPDATE public.profile_meta
  SET admin_approved = p_approved
  WHERE slug = lower(btrim(p_slug));
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_admin_approved(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_admin_approved(text, boolean) TO authenticated;

-- public.profiles is a view over approved applications. This file does not rename it,
-- replace it, or change its privileges. kode/app.html and kode/embed.html still read it.
