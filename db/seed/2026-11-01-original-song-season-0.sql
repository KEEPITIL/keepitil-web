-- CREATE · Original Song · Season 0 (November 2026)
-- KODE / Grok 780bc8e7 · 2026-11-01. DRAFT — NOT APPLIED TO PRODUCTION. Needs Joe's explicit go.
--
-- One INSERT on the EXISTING vs_competitions schema. No DDL. Idempotent (ON CONFLICT on slug).
-- Distinct from the December/Q4 'original-song' row (id 73): new slug, its own dates, untouched 73.
--
-- Dates are America/Los_Angeles. DST ends 2026-11-01 02:00, so:
--   entries open   2026-11-01 00:00 PDT = 07:00 UTC
--   entries close  2026-11-14 23:59 PST = 2026-11-15 07:59 UTC
--   finale voting  2026-11-15 00:00 PST → 2026-11-21 23:59 PST   (ASSUMPTION — not in the brief; Joe to confirm)
--
-- Judging: winner_method 'public_plus_staff', staff_weight_pct 70 → judges 70 / fans 30.
-- Entry: free Basic (entry_fee_cents 0, comped by create-checkout without Stripe).
-- One entry per person: enforced in the page (vs-app.js); the schema has no unique constraint
-- for it, and adding one would be DDL, so it is NOT done here.
--
-- Apply (only after Joe's go):  psql "$DATABASE_URL" -f db/seed/2026-11-01-original-song-season-0.sql
-- Roll back:                     delete from vs_competitions where slug = 'original-song-season-0'
--                                  and not exists (select 1 from vs_entries e where e.competition_id = vs_competitions.id);

insert into public.vs_competitions (
  slug, title, description, rules, requirements, category_id,
  entry_fee_cents, prize_structure, upload_settings,
  vote_display_mode, actions_enabled, winner_method, staff_weight_pct, tie_break,
  submissions_open_at, submissions_close_at, entry_closes_at, voting_opens_at, voting_closes_at,
  leaderboard_visible, status, terms_version, rules_version,
  cadence, season_label, season_year, divisions, min_age, integrity_state
)
select
  'original-song-season-0',
  'Original Song — Season 0',
  'The first KEEPITIL Original Song season. Share an original song you wrote and recorded, by SoundCloud link. Entries run November 1–14, 2026; finalists go to a fan-and-judge finale.',
  E'1. Original work only: you wrote it, or you have every co-writer''s permission to enter it.\n'
  E'2. Enter by SoundCloud track link. The link must stay live through the finale.\n'
  E'3. One entry per person.\n'
  E'4. Basic entry is free.\n'
  E'5. Winners: judges'' score 70%, fan vote 30%.\n'
  E'6. Entrants must be 18 or older. KEEPITIL may remove entries that break these rules or the community guidelines.',
  'A SoundCloud link to your original song, plus a 2:3 cover image.',
  (select id from public.vs_categories where slug = 'original-song'),
  0,
  '{"badge": true, "note": "Season 0 winners are featured on KEEPITIL."}'::jsonb,
  jsonb_build_object(
    'entry_mode', 'link',
    'link_host', 'soundcloud.com',
    'require_thumb', true,
    'season', jsonb_build_object(
      'headline', 'Season 0 · Entries November 1–14, 2026',
      'basic_note', 'Enter your song at no cost.',
      'finale_pass_note', 'Optional, for fans: unlocks Finale voting. It is not needed to enter.',
      'judging_note', 'Winners are decided by judges (70%) and fans (30%).',
      'rights_line', 'I wrote this song (or have every co-writer''s permission), I own or control the recording, and I accept the Season 0 rules.',
      'one_per_person', true
    )
  ),
  'transparent', array['like','comment','repost','share','save'],
  'public_plus_staff', 70, 'staff_score',
  '2026-11-01 07:00:00+00', '2026-11-15 07:59:00+00', '2026-11-15 07:59:00+00',
  '2026-11-15 08:00:00+00', '2026-11-22 07:59:00+00',
  true, 'published', 'create-2026-s0-v1', 'create-2026-s0-v1',
  'seasonal', 'Season 0', 2026,
  (select divisions from public.vs_competitions where slug = 'original-song'),
  18, 'open'
on conflict (slug) do nothing;

-- ═══ SERVER GUARDS (Sentinel review of #51, Grok fbbfbb4c) — DDL, NOT APPLIED ═══════════════
-- Apply with the INSERT above, only after Joe's go. Each block is safe to re-run.

-- 1. SoundCloud host validated on the server: an mtype 'link' row must be an https SoundCloud URL.
create or replace function public.vs_entry_media_link_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.mtype = 'link'
     and new.url !~* '^https://(www\.|m\.|on\.)?soundcloud\.com/\S+$' then
    raise exception 'entry link must be an https://soundcloud.com/ URL' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists vs_entry_media_link_guard on public.vs_entry_media;
create trigger vs_entry_media_link_guard before insert or update on public.vs_entry_media
  for each row execute function public.vs_entry_media_link_guard();

-- 2. Narrow vs_entry_media_read (was USING (true)): media of an approved entry, your own, or admin.
drop policy if exists vs_entry_media_read on public.vs_entry_media;
create policy vs_entry_media_read on public.vs_entry_media for select using (
  exists (select 1 from public.vs_entries e
           where e.id = vs_entry_media.entry_id
             and (e.status = 'approved' or e.creator_user_id = auth.uid()))
  or public.is_admin()
);

-- 3. One entry per person, on the server, for competitions with upload_settings.season.one_per_person.
--    Drafts, withdrawn and rejected entries do not count, matching the page, so a failed attempt
--    never blocks a retry. Checked at submit time (draft -> submitted), where the entry becomes real.
create or replace function public.vs_one_entry_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status not in ('draft','withdrawn','rejected')
     and coalesce((select (c.upload_settings #>> '{season,one_per_person}')::boolean
                     from public.vs_competitions c where c.id = new.competition_id), false)
     and exists (select 1 from public.vs_entries o
                  where o.competition_id = new.competition_id
                    and o.creator_user_id = new.creator_user_id
                    and o.id <> new.id
                    and o.status not in ('draft','withdrawn','rejected')) then
    raise exception 'this competition allows one entry per person' using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists vs_one_entry_guard on public.vs_entries;
create trigger vs_one_entry_guard before insert or update of status on public.vs_entries
  for each row execute function public.vs_one_entry_guard();
