-- STEP 1 of 2. Apply this first. Do not apply the revoke migration yet.
-- NEEDS SENTINEL + JOE BEFORE PROD. Not applied by this PR.
--
-- Adds columns, get_public_profile, public_profile_list, column grants, and the
-- backfill. Leaves anon SELECT on profile_meta in place so existing logged-out
-- pages keep working until the web deploy is verified.
-- Then apply 20261107014100_profile_public_read_revoke.sql.
--
-- ROLLBACK. Take a prod backup before applying this file. To undo both steps,
-- revert the web deploy, then run
-- supabase/rollbacks/20261107014000_profile_public_read_down.sql
-- (Atlas rollback v2: real prod policy names). Leave the added columns.
-- Do not run this file against prod from the PR.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profile_meta
  ADD COLUMN IF NOT EXISTS profile_public boolean,
  ADD COLUMN IF NOT EXISTS age_verified boolean,
  ADD COLUMN IF NOT EXISTS is_minor boolean,
  ADD COLUMN IF NOT EXISTS under_18 boolean,
  ADD COLUMN IF NOT EXISTS public_fields text[],
  ADD COLUMN IF NOT EXISTS admin_approved boolean;

-- No trusted 18+ signal exists in prod. The auth-metadata checkbox is
-- user-editable, so it is not copied. Both flags stay NULL until a
-- server-only path sets them together. Never backfill false: NULL fails closed.
UPDATE public.profile_meta
SET is_minor = NULL,
    under_18 = NULL;

ALTER TABLE public.profile_meta
  DROP CONSTRAINT IF EXISTS profile_meta_minor_flags_agree;
ALTER TABLE public.profile_meta
  ADD CONSTRAINT profile_meta_minor_flags_agree
  CHECK (is_minor IS NOT DISTINCT FROM under_18);

-- Approval is server-only. This marks the published rows that already exist,
-- and it never sets profile_public, age_verified, or is_minor.
-- A known minor (is_minor or under_18 is true) is left unapproved.
UPDATE public.profile_meta
SET admin_approved = TRUE
WHERE status = 'published'
  AND is_minor IS NOT TRUE
  AND under_18 IS NOT TRUE
  AND account_type IN ('subscriber_profile', 'editorial_artist', 'brand', 'organizer', 'artist')
  AND admin_approved IS NULL;

-- Business and artist pages that are already published become public.
-- Personal subscriber profiles stay null until the server sets 18+ and they opt in.
-- A known minor is never made public.
UPDATE public.profile_meta
SET profile_public = TRUE
WHERE status = 'published'
  AND is_minor IS NOT TRUE
  AND under_18 IS NOT TRUE
  AND account_type IN ('brand', 'organizer', 'artist', 'editorial_artist')
  AND profile_public IS NULL;

-- A null field list must not mean every column. Public business rows get the
-- directory fields only. Everyone else with a null list gets an empty list.
UPDATE public.profile_meta
SET public_fields = ARRAY['display_name','handle','avatar_url','bio','tagline','location']::text[]
WHERE public_fields IS NULL
  AND profile_public IS TRUE
  AND is_minor IS NOT TRUE
  AND under_18 IS NOT TRUE
  AND status = 'published'
  AND account_type IN ('brand', 'organizer', 'artist', 'editorial_artist');

UPDATE public.profile_meta
SET public_fields = ARRAY[]::text[]
WHERE public_fields IS NULL;

-- Server-only age log. Anon and authenticated have no privileges.
-- The user-editable auth-metadata checkbox is never read and never written here.
-- A row is the current decision only while revoked_at is null.
CREATE TABLE IF NOT EXISTS private.age_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  verified_by uuid,
  actor_role text NOT NULL,
  method text NOT NULL,
  evidence_note text,
  age_verified boolean,
  is_minor boolean,
  verified_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT age_verifications_actor CHECK (
    (actor_role = 'service_role' AND verified_by IS NULL)
    OR (actor_role = 'admin' AND verified_by IS NOT NULL)
  ),
  CONSTRAINT age_verifications_outcome CHECK (
    (
      revoked_at IS NULL
      AND age_verified IS TRUE
      AND is_minor IS FALSE
    )
    OR (
      revoked_at IS NULL
      AND age_verified IS FALSE
      AND is_minor IS TRUE
    )
    OR (
      revoked_at IS NOT NULL
      AND (
        (age_verified IS TRUE AND is_minor IS FALSE)
        OR (age_verified IS FALSE AND is_minor IS TRUE)
        OR (age_verified IS NULL AND is_minor IS NULL)
      )
    )
  )
);

ALTER TABLE private.age_verifications OWNER TO postgres;
ALTER TABLE private.age_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.age_verifications FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS age_verifications_open_user
  ON private.age_verifications (user_id)
  WHERE revoked_at IS NULL;

-- Admin or service_role only. Records who, how, and when, then sets the
-- owner's server flags to match. There is no self-service path.
-- p_action: adult, minor, or revoke. Revoke writes the flags back to NULL.
CREATE OR REPLACE FUNCTION public.admin_record_age_verification(
  p_user_id uuid,
  p_action text,
  p_method text,
  p_evidence_note text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  vid uuid;
  actor uuid;
  role_name text;
  action text;
  how text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF (SELECT auth.role()) = 'service_role' THEN
    role_name := 'service_role';
    actor := NULL;
  ELSIF COALESCE(public.is_admin(), FALSE) IS TRUE AND (SELECT auth.uid()) IS NOT NULL THEN
    role_name := 'admin';
    actor := (SELECT auth.uid());
  ELSE
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF actor IS NOT DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  action := lower(btrim(COALESCE(p_action, '')));
  IF action NOT IN ('adult', 'minor', 'revoke') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  how := btrim(COALESCE(p_method, ''));
  IF how = '' OR length(how) > 80 THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF lower(how) IN ('auth_metadata', 'checkbox', 'self', 'self_service') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE private.age_verifications
  SET revoked_at = now()
  WHERE user_id = p_user_id
    AND revoked_at IS NULL;

  INSERT INTO private.age_verifications (
    user_id, verified_by, actor_role, method, evidence_note,
    age_verified, is_minor, verified_at, revoked_at
  ) VALUES (
    p_user_id,
    actor,
    role_name,
    how,
    NULLIF(btrim(COALESCE(p_evidence_note, '')), ''),
    CASE action WHEN 'adult' THEN TRUE WHEN 'minor' THEN FALSE ELSE NULL END,
    CASE action WHEN 'adult' THEN FALSE WHEN 'minor' THEN TRUE ELSE NULL END,
    now(),
    CASE WHEN action = 'revoke' THEN now() ELSE NULL END
  ) RETURNING id INTO vid;

  IF action = 'revoke' THEN
    UPDATE public.profile_meta m
    SET
      is_minor = NULL,
      under_18 = NULL,
      age_verified = CASE
        WHEN lower(btrim(m.account_type)) IN (
          'member', 'artist', 'creator', 'dj', 'subscriber_profile'
        ) THEN NULL
        ELSE m.age_verified
      END
    WHERE EXISTS (
      SELECT 1 FROM public.profile_owners po
      WHERE po.profile_slug = m.slug
        AND po.owner_id = p_user_id
    );
  ELSE
    UPDATE public.profile_meta m
    SET
      is_minor = (action = 'minor'),
      under_18 = (action = 'minor'),
      age_verified = CASE
        WHEN lower(btrim(m.account_type)) IN (
          'member', 'artist', 'creator', 'dj', 'subscriber_profile'
        ) THEN (action = 'adult')
        ELSE m.age_verified
      END
    WHERE EXISTS (
      SELECT 1 FROM public.profile_owners po
      WHERE po.profile_slug = m.slug
        AND po.owner_id = p_user_id
    );
  END IF;

  RETURN vid;
END;
$$;

ALTER FUNCTION public.admin_record_age_verification(uuid, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_record_age_verification(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_age_verification(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_age_verification(uuid, text, text, text) TO authenticated;

-- One visibility rule for every public RPC. Not for RLS policies.
-- SECURITY DEFINER, owner postgres, search_path fixed to empty.
-- Unknown, null, or a missing owner fails closed.
-- The 18+ signal is an open row in private.age_verifications for that owner.
-- profile_meta.age_verified alone does not count, and auth metadata is not read.
-- Person: member, artist, creator, dj, and the live subscriber_profile alias.
-- Business: brand, venue, organizer, promoter, company.
-- Both still need is_minor and under_18 false on the page. Those flags are
-- set only by admin_record_age_verification. editorial_* stays private.
CREATE OR REPLACE FUNCTION private.profile_is_public(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT
      m.profile_public IS TRUE
      AND m.status = 'published'
      AND m.admin_approved IS TRUE
      AND m.is_minor IS FALSE
      AND m.under_18 IS FALSE
      AND lower(btrim(m.account_type)) IN (
        'member', 'artist', 'creator', 'dj', 'subscriber_profile',
        'brand', 'venue', 'organizer', 'promoter', 'company'
      )
      AND EXISTS (
        SELECT 1
        FROM public.profile_owners po
        JOIN private.age_verifications v
          ON v.user_id = po.owner_id
        WHERE po.profile_slug = m.slug
          AND po.owner_id IS NOT NULL
          AND v.revoked_at IS NULL
          AND v.age_verified IS TRUE
          AND v.is_minor IS FALSE
      )
    FROM public.profile_meta m
    WHERE p_slug ~ '^[a-z0-9-]{1,80}$'
      AND m.slug = lower(btrim(p_slug))
    LIMIT 1
  ), FALSE);
$$;

ALTER FUNCTION private.profile_is_public(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.profile_is_public(text) FROM PUBLIC, anon, authenticated;

-- One slug. Public columns only. book_email is not selected.
-- Visibility is private.profile_is_public. This function does not repeat it.
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
  under_18 boolean,
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
    CASE WHEN 'display_name' = ANY (m.public_fields) THEN m.display_name END,
    CASE WHEN 'handle' = ANY (m.public_fields) THEN m.handle END,
    CASE WHEN 'avatar_url' = ANY (m.public_fields) OR 'avatar' = ANY (m.public_fields) THEN m.avatar_url END,
    CASE WHEN 'bio' = ANY (m.public_fields) THEN m.bio END,
    CASE WHEN 'tagline' = ANY (m.public_fields) THEN m.tagline END,
    CASE WHEN 'location' = ANY (m.public_fields) THEN m.location END,
    CASE WHEN 'links' = ANY (m.public_fields) OR 'socials' = ANY (m.public_fields) THEN to_jsonb(m.links) END,
    CASE WHEN 'links' = ANY (m.public_fields) OR 'socials' = ANY (m.public_fields) THEN to_jsonb(m.socials) END,
    CASE WHEN 'about' = ANY (m.public_fields) THEN m.about END,
    m.account_type,
    CASE WHEN 'links_label' = ANY (m.public_fields) THEN m.links_label END,
    CASE WHEN 'badges' = ANY (m.public_fields) THEN to_jsonb(m.badges) END,
    m.profile_public,
    m.public_fields,
    m.age_verified,
    m.is_minor,
    m.under_18,
    m.status,
    m.admin_approved
  FROM public.profile_meta m
  WHERE p_slug ~ '^[a-z0-9-]{1,80}$'
    AND m.slug = p_slug
    AND private.profile_is_public(m.slug)
    AND m.public_fields IS NOT NULL
    AND cardinality(m.public_fields) > 0
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
  under_18 boolean,
  status text,
  admin_approved boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT *
  FROM private.profile_public_one(lower(btrim(p_slug))) one
  WHERE private.profile_is_public(one.slug);
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated;

-- Directory list. Person performers and business pages that pass
-- private.profile_is_public. Personal members are not listed.
-- The field list limits each column. book_email is not selected.
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
    CASE WHEN 'display_name' = ANY (m.public_fields) THEN m.display_name END,
    CASE WHEN 'tagline' = ANY (m.public_fields) THEN m.tagline END,
    CASE WHEN 'bio' = ANY (m.public_fields) THEN left(m.bio, 160) END,
    CASE WHEN 'avatar_url' = ANY (m.public_fields) OR 'avatar' = ANY (m.public_fields) THEN m.avatar_url END,
    CASE WHEN 'cover_url' = ANY (m.public_fields) THEN m.cover_url END,
    m.account_type,
    m.entity_category,
    CASE WHEN 'location' = ANY (m.public_fields) THEN m.location END,
    m.status
  FROM public.profile_meta m
  WHERE private.profile_is_public(m.slug)
    AND m.public_fields IS NOT NULL
    AND cardinality(m.public_fields) > 0
    AND lower(btrim(m.account_type)) IN (
      'artist', 'creator', 'dj',
      'brand', 'venue', 'organizer', 'promoter', 'company'
    )
    AND (
      p_account_type IS NULL
      OR btrim(p_account_type) = ''
      OR (
        lower(btrim(p_account_type)) = 'artist'
        AND lower(btrim(m.account_type)) IN ('artist', 'creator', 'dj')
      )
      OR lower(btrim(p_account_type)) = lower(btrim(m.account_type))
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


-- Anon keeps SELECT until the revoke migration. Writes, delete, and truncate go now.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.profile_meta FROM anon, PUBLIC;

-- A table-wide INSERT or UPDATE hides a column grant, so revoke those two
-- privileges and grant the columns back. The live save sends account_type,
-- status, and slug. profile_public and public_fields are the opt-in.
-- admin_approved, age_verified, is_minor, and under_18 are not granted.
REVOKE INSERT, UPDATE ON TABLE public.profile_meta FROM authenticated;
GRANT INSERT (
  slug, display_name, handle, location, bio, tagline, pronouns, book_email,
  about, links, links_label, badges, account_type, status, avatar_url,
  cover_url, cover_mobile_url, socials, highlights, updated_at,
  profile_public, public_fields
) ON TABLE public.profile_meta TO authenticated;
GRANT UPDATE (
  slug, display_name, handle, location, bio, tagline, pronouns, book_email,
  about, links, links_label, badges, account_type, status, avatar_url,
  cover_url, cover_mobile_url, socials, highlights, updated_at,
  profile_public, public_fields
) ON TABLE public.profile_meta TO authenticated;

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

-- public.profiles is a view. Its CREATE VIEW statement is not in this repo, so this
-- migration does not replace it and does not add a filter that could drop a column
-- kode already reads. kode/embed.html reads id, handle, display_name by handle.
-- kode/app.html reads the signed-in row with select * and inserts id, handle, display_name.
-- Those pages stay on the view. A filter for profile_public, is_minor, or under_18
-- cannot be added here without the view body.

-- profile_owners: stop unclaimed-profile takeover and stop owner_id being public.
-- Prod policy names (Atlas, read-only): "profile_owners read all" and
-- profile_owners_read. There is no policy named "read all".
-- "profile_owners manage own" lets an owner set profile_slug to any slug.
-- "profile_owners delete own" is dropped with it. No replacement UPDATE or
-- DELETE policy: owners cannot change the slug.
DROP POLICY IF EXISTS "profile_owners claim" ON public.profile_owners;
DROP POLICY IF EXISTS "profile_owners read all" ON public.profile_owners;
DROP POLICY IF EXISTS profile_owners_read ON public.profile_owners;
DROP POLICY IF EXISTS "profile_owners manage own" ON public.profile_owners;
DROP POLICY IF EXISTS "profile_owners delete own" ON public.profile_owners;
DROP POLICY IF EXISTS "read all" ON public.profile_owners;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pol.polname
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'profile_owners'
      AND pol.polcmd IN ('a', 'w', 'd')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profile_owners', r.polname);
  END LOOP;
END $$;

-- Anon keeps the SELECT privilege until step 2, but the public read policies
-- are gone, so owner_id is not readable. profile_meta's open read policies
-- stay until step 2. That swap is not done here.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.profile_owners FROM anon, PUBLIC;

DROP POLICY IF EXISTS profile_owners_select_own ON public.profile_owners;
CREATE POLICY profile_owners_select_own ON public.profile_owners
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- "Do I own this slug?" The row itself is not returned.
CREATE OR REPLACE FUNCTION public.i_own_profile(slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_owners po
    WHERE po.profile_slug = lower(btrim(slug))
      AND po.owner_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.i_own_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.i_own_profile(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.profile_claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_slug text NOT NULL,
  requester_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_slug, requester_id)
);

REVOKE ALL ON TABLE public.profile_claim_requests FROM PUBLIC, anon, authenticated;

-- A signed-in user can ask. This never inserts into profile_owners.
CREATE OR REPLACE FUNCTION public.request_profile_claim(p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE rid uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF lower(btrim(p_slug)) !~ '^[a-z0-9-]{2,80}$' THEN
    RAISE EXCEPTION 'bad slug';
  END IF;
  INSERT INTO public.profile_claim_requests (profile_slug, requester_id, status)
  VALUES (lower(btrim(p_slug)), (SELECT auth.uid()), 'pending')
  ON CONFLICT (profile_slug, requester_id) DO UPDATE
    SET status = public.profile_claim_requests.status
  RETURNING id INTO rid;
  RETURN rid;
END;
$$;

REVOKE ALL ON FUNCTION public.request_profile_claim(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_profile_claim(text) TO authenticated;

-- Only an admin turns a request into a row in profile_owners.
CREATE OR REPLACE FUNCTION public.approve_profile_claim(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE req public.profile_claim_requests%ROWTYPE;
BEGIN
  IF COALESCE(public.is_admin(), FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT * INTO req FROM public.profile_claim_requests WHERE id = p_request_id;
  IF req.id IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;
  INSERT INTO public.profile_owners (profile_slug, owner_id)
  VALUES (req.profile_slug, req.requester_id)
  ON CONFLICT (profile_slug) DO NOTHING;
  UPDATE public.profile_claim_requests SET status = 'approved' WHERE id = req.id;
  RETURN req.profile_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_profile_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_profile_claim(uuid) TO authenticated;

-- The old self-claim RPC must not stay callable by signed-in users.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_profile'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;
