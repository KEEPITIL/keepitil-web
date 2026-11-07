-- DRAFT. Do not apply this file from the PR.
-- NEEDS SENTINEL REVIEW BEFORE PROD.
--
-- Apply order: PR #91 (20261107014000 then 20261107014100) must be applied
-- and verified in production first. #91 owns private.profile_is_public(text).
-- This file CREATE OR REPLACE's that helper only so a review can see the rules
-- Sentinel decided (decision-18plus-profile-types). If #91 already created the
-- helper, this restates those same rules. Do not invent a second copy of the
-- checks inside the event functions.
--
-- What changes:
--   get_profile_event_summary(text) — anon and signed-in callers. One row:
--     upcoming_count, cities. No titles, venues, covers, or ticket counts.
--     upcoming_count is NULL when the true count is 1–4 (show "<5"),
--     0 when there are none, and the exact integer when it is 5 or more.
--     Gates on private.profile_is_public(slug) plus public_fields containing
--     'events'. Password-protected events are left out.
--   get_profile_events(text) — replaced. Authenticated owner only. Returns
--     is_protected boolean and does not return the password hash. Anon has
--     no execute. Another signed-in user gets no rows. Public callers use
--     the summary function.
--   get_my_ticket_summary() — the signed-in member's ticket cards without a
--     door token. get_my_tickets() is unchanged so /tickets can still show a QR.
--
-- ROLLBACK. See supabase/rollbacks/20261107020000_profile_event_summary_down.sql.
-- Take a backup of get_profile_events(text) before applying. This file drops
-- every overload of that name.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- #91 owns this helper. Person types: member, artist, creator, dj.
-- subscriber_profile is the live member account_type until #91 renames it.
-- Business types: brand, venue, organizer. Any other account_type fails closed.
-- Null profile_public, status, admin_approved, is_minor, under_18, or
-- age_verified fails closed (IS TRUE / IS FALSE, not IS NOT TRUE).
-- A business with no owner, or whose owner has no age-verified adult
-- person profile, is private. Age flags are the server-set columns on
-- profile_meta. This helper does not read a password hash.
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
      AND (
        (
          lower(btrim(m.account_type)) IN (
            'member', 'artist', 'creator', 'dj', 'subscriber_profile'
          )
          AND m.age_verified IS TRUE
        )
        OR (
          lower(btrim(m.account_type)) IN ('brand', 'venue', 'organizer')
          AND EXISTS (
            SELECT 1
            FROM public.profile_owners biz
            JOIN public.profile_owners owned
              ON owned.owner_id = biz.owner_id
            JOIN public.profile_meta acct
              ON acct.slug = owned.profile_slug
            WHERE biz.profile_slug = m.slug
              AND biz.owner_id IS NOT NULL
              AND acct.slug <> m.slug
              AND lower(btrim(acct.account_type)) IN (
                'member', 'artist', 'creator', 'dj', 'subscriber_profile'
              )
              AND acct.age_verified IS TRUE
              AND acct.is_minor IS FALSE
              AND acct.under_18 IS FALSE
          )
        )
      )
    FROM public.profile_meta m
    WHERE p_slug ~ '^[a-z0-9-]{1,80}$'
      AND m.slug = lower(btrim(p_slug))
    LIMIT 1
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION private.profile_is_public(text) FROM PUBLIC, anon, authenticated;

-- The live get_profile_events(text) is executable by anon and only checks
-- handle + published. Drop every overload so that body cannot stay callable.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_profile_events'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

-- Owner's own events, every status. is_protected instead of the hash.
-- A caller who does not own the slug gets no rows, including when the
-- profile is public. Public reads use get_profile_event_summary.
CREATE OR REPLACE FUNCTION public.get_profile_events(p_handle text)
RETURNS TABLE (
  slug text,
  title text,
  status text,
  starts_at timestamptz,
  tz text,
  venue text,
  city text,
  cover_url text,
  is_protected boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    e.slug,
    e.title,
    e.status,
    e.starts_at,
    e.tz,
    e.venue,
    e.city,
    e.cover_url,
    (
      COALESCE(e.password_protected, FALSE)
      OR e.event_password_hash IS NOT NULL
    ) AS is_protected
  FROM public.events e
  WHERE p_handle ~ '^[a-z0-9-]{1,80}$'
    AND lower(btrim(e.owner_handle)) = lower(btrim(p_handle))
    AND EXISTS (
      SELECT 1
      FROM public.profile_owners po
      WHERE po.profile_slug = lower(btrim(p_handle))
        AND po.owner_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.get_profile_events(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_events(text) TO authenticated;

-- Public rollup. Visibility is private.profile_is_public, not a copied check.
-- 'events' must be in public_fields. Upcoming published rows only.
-- Password-protected rows are excluded. A count of 1–4 comes back NULL
-- so the page shows "<5" and a single event cannot be told from a few.
CREATE OR REPLACE FUNCTION public.get_profile_event_summary(p_handle text)
RETURNS TABLE (
  upcoming_count integer,
  cities text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH visible AS (
    SELECT m.slug
    FROM public.profile_meta m
    WHERE p_handle ~ '^[a-z0-9-]{1,80}$'
      AND m.slug = lower(btrim(p_handle))
      AND private.profile_is_public(m.slug)
      AND m.public_fields IS NOT NULL
      AND 'events' = ANY (m.public_fields)
  ),
  upcoming AS (
    SELECT e.slug, btrim(e.city) AS city
    FROM public.events e
    JOIN visible v ON lower(btrim(e.owner_handle)) = v.slug
    WHERE e.status = 'published'
      AND e.starts_at IS NOT NULL
      AND e.starts_at >= now()
      AND COALESCE(e.password_protected, FALSE) IS NOT TRUE
      AND e.event_password_hash IS NULL
  ),
  counted AS (
    SELECT count(*)::integer AS n FROM upcoming
  )
  SELECT
    CASE
      WHEN (SELECT n FROM counted) = 0 THEN 0
      WHEN (SELECT n FROM counted) < 5 THEN NULL
      ELSE (SELECT n FROM counted)
    END AS upcoming_count,
    (
      SELECT COALESCE(array_agg(city ORDER BY city), ARRAY[]::text[])
      FROM (
        SELECT DISTINCT city
        FROM upcoming
        WHERE city IS NOT NULL AND city <> ''
        ORDER BY city
        LIMIT 6
      ) picked
    ) AS cities
  WHERE EXISTS (SELECT 1 FROM visible);
$$;

REVOKE ALL ON FUNCTION public.get_profile_event_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_event_summary(text) TO anon, authenticated;

-- Same caller as get_my_tickets (SECURITY INVOKER, so this does not widen
-- that function). Projects the card fields only. The door token is not selected.
CREATE OR REPLACE FUNCTION public.get_my_ticket_summary()
RETURNS TABLE (
  slug text,
  title text,
  starts_at timestamptz,
  venue text,
  city text,
  qty integer,
  tier_name text,
  checked_in_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    j->>'slug',
    j->>'title',
    CASE
      WHEN NULLIF(j->>'starts_at', '') IS NOT NULL THEN (j->>'starts_at')::timestamptz
    END,
    j->>'venue',
    j->>'city',
    CASE
      WHEN NULLIF(j->>'qty', '') IS NOT NULL THEN (j->>'qty')::integer
    END,
    COALESCE(j->>'tier_name', j->>'tier'),
    CASE
      WHEN NULLIF(j->>'checked_in_at', '') IS NOT NULL THEN (j->>'checked_in_at')::timestamptz
    END
  FROM (
    SELECT to_jsonb(t) AS j
    FROM public.get_my_tickets() AS t
  ) s;
$$;

REVOKE ALL ON FUNCTION public.get_my_ticket_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ticket_summary() TO authenticated;
