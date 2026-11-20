-- APPLY-92-44col_PROPOSED.sql : APPLY-92.sql with ONE change (slice 10A): the events guard and GRANT use the 44 columns that remain readable after APPLY-1C revokes
--   events.submitted_by. Use it ONLY when APPLY-1C ran BEFORE #92's migration (otherwise APPLY-92.sql's 45-column guard aborts, by design: that is the stale-baseline
--   caveat). Preferred order is APPLY-92 (45) then APPLY-1C. Everything else is byte-identical to the pack's APPLY-92.sql: `diff APPLY-92.sql APPLY-92-44col_PROPOSED.sql`
--   shows exactly 4 changed lines. PROPOSAL ONLY, NOT APPLIED.

-- APPLY-92.sql (R92 pack) = PR #92 migration 20261107020000_profile_event_summary.sql with ONE block rewritten: the events column grants.
-- NEEDS A GO: touches grants on public.events (guarded: it changes NOTHING unless the live grant set already equals the 45-column set below).
-- Sections: 1 get_profile_events replaced (owner only, is_protected instead of the hash) [PR verbatim]; 2 get_profile_event_summary (public rollup gated by
--   private.profile_is_public) [PR verbatim]; 3 get_my_ticket_summary [PR verbatim]; 4 events grants [REWRITTEN]. Everything outside section 4 and this header is verbatim.
-- WHY SECTION 4 WAS REWRITTEN. The PR block assumed a table-level SELECT on events and (a) REVOKEd it, (b) GRANTed SELECT on EVERY column except
--   event_password_hash/owner_handle/owner_id, computed dynamically from pg_attribute. Prod today (after #39) has NO table-level SELECT for anon/authenticated and exactly
--   45 granted columns, including owner_handle and password_protected. The dynamic grant would add every column of events that #39 deliberately hid (anything outside the 45)
--   and would REMOVE owner_handle, which live pages read. The PR's own down file also re-grants TABLE-level SELECT (the hash becomes readable).
--   Rewrite: (1) guard: for BOTH anon and authenticated the column-SELECT set must equal the 45 below, there must be no table-level SELECT; otherwise RAISE (column names only)
--   and nothing commits. (2) then an explicit idempotent GRANT of exactly those 45 and an explicit REVOKE of the hash and owner_id columns.
--   On a database that matches the guard the net effect is none. This file never grants table-level SELECT and never grants event_password_hash.
-- ADDITIVE columns: none. owner_handle STAYS readable by anon (live behaviour), so get_profile_event_summary.organizer is NOT a privacy control: the organizer slug is
--   already public through events.owner_handle. The profile-privacy goal of the PR for event ownership is therefore NOT achieved by this file (decision for Joe).
-- ORDER: after #91 step 1 (needs private.profile_is_public; out of order it fails inside the transaction and rolls back, proof-92 control N3).
-- Side effect to know: get_profile_events is dropped and recreated with a NEW column list and no anon EXECUTE: old cached pages and the iOS bundle that call it as anon get permission denied.

-- DRAFT. Do not apply this file from the PR.
-- NEEDS SENTINEL REVIEW BEFORE PROD.
--
-- Apply order: immediately after PR #91 step 1
-- (20261107014000_profile_public_read_add.sql), in the same window,
-- and before 20261107014100_profile_public_read_revoke.sql.
-- #91 owns private.profile_is_public(text).
-- This file does not create or replace that helper. The summary below only calls it.
--
-- What changes:
--   get_profile_event_summary(text) — anon and signed-in callers. One row:
--     upcoming_count, cities, organizer. No titles, venues, covers, or ticket counts.
--     organizer is the profile slug, and only because this function already
--     requires private.profile_is_public. The events table grant does not
--     include owner_handle or owner_id.
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

-- private.profile_is_public(text) is created in PR #91. Do not replace it here.
-- One transaction: a failure must not leave get_profile_events dropped.

BEGIN;

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
    (e.event_password_hash IS NOT NULL) AS is_protected
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
  cities text[],
  organizer text
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
    ) AS cities,
    (SELECT v.slug FROM visible v) AS organizer
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

-- 4. events grants: guard, then exactly the live 45-column set. No table-level SELECT anywhere in this file.
DO $$
DECLARE
  expected text[] := ARRAY['accent_color', 'city', 'county', 'cover_url', 'created_at', 'dedupe_key', 'description', 'end_time_public', 'ends_at', 'extra_links', 'featured', 'features', 'gallery', 'genres', 'hide_guest_count', 'id', 'imported_at', 'link_checked_at', 'link_detail', 'link_last_ok_at', 'link_status', 'owner_handle', 'password_protected', 'reg_questions', 'review_reason', 'series_id', 'show_feed', 'show_gallery', 'show_lineup', 'show_on_explore', 'slug', 'source', 'source_url', 'spotify_url', 'starts_at', 'state', 'status', 'tagline', 'title', 'title_font', 'tz', 'venue', 'waitlist_enabled', 'youtube_url'];
  r text; have text[]; missing text[]; extra text[];
BEGIN
  IF to_regclass('public.events') IS NULL THEN RAISE EXCEPTION 'public.events is missing'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(r, 'public.events', 'SELECT') THEN
      RAISE EXCEPTION 'events guard: % has TABLE-level SELECT on public.events (live state differs from the 44-column set); nothing applied', r;
    END IF;
    SELECT COALESCE(array_agg(a.attname::text ORDER BY a.attname), ARRAY[]::text[]) INTO have
    FROM pg_attribute a
    WHERE a.attrelid = 'public.events'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege(r, 'public.events', a.attname, 'SELECT');
    SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO missing FROM unnest(expected) x WHERE NOT (x = ANY (have));
    SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO extra   FROM unnest(have) x WHERE NOT (x = ANY (expected));
    IF cardinality(missing) > 0 OR cardinality(extra) > 0 THEN
      RAISE EXCEPTION 'events guard: % column SELECT set differs from the 44 expected. missing=% extra=%; nothing applied', r, missing, extra;
    END IF;
  END LOOP;
END $$;

GRANT SELECT (accent_color, city, county, cover_url, created_at, dedupe_key, description, end_time_public, ends_at, extra_links, featured, features, gallery, genres, hide_guest_count, id, imported_at, link_checked_at, link_detail, link_last_ok_at, link_status, owner_handle, password_protected, reg_questions, review_reason, series_id, show_feed, show_gallery, show_lineup, show_on_explore, slug, source, source_url, spotify_url, starts_at, state, status, tagline, title, title_font, tz, venue, waitlist_enabled, youtube_url) ON TABLE public.events TO anon, authenticated;
REVOKE SELECT (event_password_hash) ON TABLE public.events FROM anon, authenticated, PUBLIC;

COMMIT;
