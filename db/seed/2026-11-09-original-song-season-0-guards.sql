-- Season 0 SERVER GUARDS: DDL, NOT APPLIED. Needs the KODE relay before prod (prod DDL waits for it).
-- Split out of the seed so the seed is a plain data INSERT. Each block is safe to re-run.

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
