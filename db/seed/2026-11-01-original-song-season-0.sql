-- CREATE · Original Song · Season 0 (November 2026, re-dated 2026-11-08: finale Fri Nov 27)
-- KODE / Grok 780bc8e7 · 2026-11-01. Data only. The server guards (DDL) are in 2026-11-09-original-song-season-0-guards.sql and are NOT part of this file.
--
-- (Fixed 2026-11-08: the rules text joins its E'' pieces with ||; the first version had adjacent E'' literals,
-- which Postgres rejects. This is the statement that ran on prod and created id 82.)
-- One INSERT on the EXISTING vs_competitions schema. No DDL. Idempotent (ON CONFLICT on slug).
-- Distinct from the December/Q4 'original-song' row (id 73): new slug, its own dates, untouched 73.
--
-- Dates are America/Los_Angeles. DST ends 2026-11-01 02:00, so:
--   entries open   2026-11-09 00:00 PST = 2026-11-09 08:00 UTC
--   entries close  2026-11-20 23:59 PST = 2026-11-21 07:59 UTC
--   finale voting  2026-11-21 00:00 PST → 2026-11-27 23:59 PST (= 2026-11-28 07:59 UTC)  finale Fri Nov 27
--   (ASSUMPTION: Muse gave only "Fri Nov 27 finale"; the entry/voting split above is mine.)
--
-- Judging: winner_method 'public_plus_staff', staff_weight_pct 70 → judges 70 / fans 30.
-- Entry: free Basic (entry_fee_cents 0, comped by create-checkout without Stripe).
-- One entry per person: enforced in the page (vs-app.js); the schema has no unique constraint
-- for it, and adding one would be DDL, so it is NOT done here.
--
-- Data INSERT only; applied to prod under Muse's directive via KODE (see PR #51 for the date and statement). Roll back:
--   delete from vs_competitions where slug = 'original-song-season-0'
--     and not exists (select 1 from vs_entries e where e.competition_id = vs_competitions.id);

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
  'The first KEEPITIL Original Song season. Share an original song you wrote and recorded, by SoundCloud link. Entries run November 9–20, 2026; finalists go to a fan-and-judge finale on Friday, November 27.',
  E'1. Original work only: you wrote it, or you have every co-writer''s permission to enter it.\n'
  || E'2. Enter by SoundCloud track link. The link must stay live through the finale.\n'
  || E'3. One entry per person.\n'
  || E'4. Basic entry is free.\n'
  || E'5. Winners: judges'' score 70%, fan vote 30%.\n'
  || E'6. Entrants must be 18 or older. KEEPITIL may remove entries that break these rules or the community guidelines.',
  'A SoundCloud link to your original song, plus a 2:3 cover image.',
  (select id from public.vs_categories where slug = 'original-song'),
  0,
  '{"badge": true, "note": "Season 0 winners are featured on KEEPITIL."}'::jsonb,
  jsonb_build_object(
    'entry_mode', 'link',
    'link_host', 'soundcloud.com',
    'require_thumb', true,
    'season', jsonb_build_object(
      'headline', 'Season 0 · Entries November 9–20 · Finale Friday, November 27',
      'basic_note', 'Enter your song at no cost.',
      'finale_pass_note', 'Optional, for fans: unlocks Finale voting. It is not needed to enter.',
      'judging_note', 'Winners are decided by judges (70%) and fans (30%).',
      'rights_line', 'I wrote this song (or have every co-writer''s permission), I own or control the recording, and I accept the Season 0 rules.',
      'one_per_person', true
    )
  ),
  'transparent', array['like','comment','repost','share','save'],
  'public_plus_staff', 70, 'staff_score',
  '2026-11-09 08:00:00+00', '2026-11-21 07:59:00+00', '2026-11-21 07:59:00+00',
  '2026-11-21 08:00:00+00', '2026-11-28 07:59:00+00',
  true, 'published', 'create-2026-s0-v1', 'create-2026-s0-v1',
  'seasonal', 'Season 0', 2026,
  (select divisions from public.vs_competitions where slug = 'original-song'),
  18, 'open'
on conflict (slug) do nothing;
