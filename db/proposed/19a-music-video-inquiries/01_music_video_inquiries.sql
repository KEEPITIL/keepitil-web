-- PROPOSAL ONLY. NOT APPLIED. NOT PROOFED ON REAL POSTGRES (no PG was run in drafting; syntax unchecked).
-- Music video service inquiries (job 19a). Not wired: the page default is mailto (window.KIL_MV_SUBMIT_MODE).
-- Applying this to prod needs: Sentinel review of spam/privacy, Joe's yes, a backup. Not now.
begin;

create table if not exists public.music_video_inquiries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 5 and 254),
  email_hash  bytea not null,                      -- sha256(lower(email)); rate limiting only, no IP stored
  tier        text not null check (tier in ('hook','lyric_cut','character_story','not_sure')),
  song_title  text not null check (char_length(song_title) between 1 and 160),
  link        text not null check (char_length(link) between 8 and 500 and link ~* '^https?://'),
  message     text not null default '' check (char_length(message) <= 1500),
  consent     boolean not null check (consent),
  attestation boolean not null check (attestation)
);

alter table public.music_video_inquiries enable row level security;
alter table public.music_video_inquiries force row level security;
-- No policies for anon/authenticated: no SELECT, INSERT, UPDATE or DELETE except via the RPC below.
revoke all on public.music_video_inquiries from anon, authenticated, public;

create index if not exists music_video_inquiries_hash_created_idx
  on public.music_video_inquiries (email_hash, created_at desc);

create or replace function public.submit_music_video_inquiry(
  p_name text, p_email text, p_tier text, p_song text, p_link text, p_message text,
  p_consent boolean, p_attest boolean, p_hp text default ''
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash  bytea;
begin
  if coalesce(p_hp, '') <> '' then return true; end if;        -- honeypot: pretend success, store nothing
  if coalesce(p_consent, false) is not true or coalesce(p_attest, false) is not true then return false; end if;
  if p_tier is null or p_tier not in ('hook','lyric_cut','character_story','not_sure') then return false; end if;
  if v_email !~ '^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$' or char_length(v_email) > 254 then return false; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then return false; end if;
  if char_length(btrim(coalesce(p_song,''))) not between 1 and 160 then return false; end if;
  if coalesce(p_link,'') !~* '^https?://' or char_length(p_link) > 500 then return false; end if;
  if char_length(coalesce(p_message,'')) > 1500 then return false; end if;

  v_hash := sha256(convert_to(v_email, 'UTF8'));
  -- Rate limit: at most 3 inquiries per hashed email per 24 hours (no IP is read or stored).
  if (select count(*) from public.music_video_inquiries
       where email_hash = v_hash and created_at > now() - interval '24 hours') >= 3 then
    return false;
  end if;

  insert into public.music_video_inquiries (name, email, email_hash, tier, song_title, link, message, consent, attestation)
  values (btrim(p_name), v_email, v_hash, p_tier, btrim(p_song), btrim(p_link), btrim(coalesce(p_message,'')), true, true);
  return true;                                                  -- never returns submitted data
end;
$$;

revoke all on function public.submit_music_video_inquiry(text,text,text,text,text,text,boolean,boolean,text) from public;
grant execute on function public.submit_music_video_inquiry(text,text,text,text,text,text,boolean,boolean,text) to anon, authenticated;

commit;
