-- replica-91.sql : REPLICA of the production objects PR #91's migrations touch. PGlite (Postgres 17 WASM), throwaway in-memory only.
-- Built from: the prod facts given by the requester (2026-11-09), the PR's own comments (live policy names, view columns, prod rows) and the
-- deletion runbook's replica.sql (D:\work\delrunbook). NOTHING here was read from prod by this runbook. Every simplification is in PROOF-NOTES.md.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema extensions;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;   -- Supabase default: new functions are executable by anon/authenticated
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create table public.app_users(id uuid primary key references auth.users(id) on delete cascade, handle text not null, display_name text, avatar_url text, created_at timestamptz default now());
-- profile_meta: columns = every column the PR's migration/grants/RPCs name. account_type CHECK is deliberately permissive (prod's real CHECK is unknown: see PRECHECKS 3.x).
create table public.profile_meta(slug text primary key, display_name text, handle text, location text, bio text, tagline text, pronouns text, book_email text,
  about text, links jsonb, links_label text, badges jsonb, account_type text, status text default 'review', avatar_url text, cover_url text, cover_mobile_url text,
  socials jsonb not null default '{}'::jsonb, highlights jsonb, entity_category text, updated_at timestamptz not null default now());
create table public.profile_owners(profile_slug text primary key, owner_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table public.profile_content(id uuid primary key default gen_random_uuid(), profile_slug text not null, kind text not null, data jsonb not null default '{}'::jsonb, created_by uuid, archived boolean not null default false);
create table public.applications(id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), slug text, type text, name text, genre text, city text, bio text, website text, instagram text,
  music text, image_url text, featured boolean default false, spotify text, youtube text, event_name text, event_date date, event_venue text, event_tickets text, status text not null default 'pending', email text);
create view public.profiles as select id, created_at, slug, type, name, genre, city, bio, website, instagram, music, image_url, featured, spotify, youtube, event_name, event_date, event_venue, event_tickets from public.applications where status='approved';
create table public.app_admins(user_id uuid primary key);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.app_admins a where a.user_id = auth.uid()) $$;
-- claim_profile / my_profile_slug: REAL BODIES NOT CAPTURED. Behavioural stand-ins (SECURITY DEFINER; claim creates meta+owner row).
create function public.claim_profile(p_handle text, p_display text) returns text language plpgsql security definer set search_path=public as $$
declare s text; begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select profile_slug into s from public.profile_owners where owner_id=auth.uid() limit 1; if s is not null then return s; end if;
  s := lower(regexp_replace(p_handle,'[^a-zA-Z0-9]+','-','g'));
  if exists(select 1 from public.profile_owners where profile_slug=s) then raise exception 'handle taken'; end if;
  insert into public.profile_meta(slug,display_name,handle,status) values (s,coalesce(nullif(p_display,''),s),s,'review') on conflict do nothing;
  insert into public.profile_owners(profile_slug,owner_id) values (s,auth.uid()); return s; end $$;
create function public.my_profile_slug() returns text language sql stable security definer set search_path=public as $$ select profile_slug from public.profile_owners where owner_id=auth.uid() limit 1 $$;
-- signup + deletion triggers on auth.users (bodies simplified; names as in prod)
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin
  insert into public.app_users(id,handle,display_name) values (new.id, coalesce(nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'handle',''),'[^a-zA-Z0-9_]','','g'),''),'user_'||substr(replace(new.id::text,'-',''),1,12)), coalesce(new.raw_user_meta_data->>'display_name','Member')) on conflict (id) do nothing; return new; end $$;
create function public.record_signup_consent() returns trigger language plpgsql security definer set search_path=public as $$ begin return new; end $$;
create table public.nexus_deletion_requests(user_id uuid, requested_at timestamptz default now());
create function public.record_nexus_deletion_request() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.nexus_deletion_requests(user_id) values (old.id); return old; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger record_signup_consent after insert on auth.users for each row execute function public.record_signup_consent();
create trigger nexus_deletion_tombstone after delete on auth.users for each row execute function public.record_nexus_deletion_request();
-- RLS + policies exactly as named in the PR's down file ("prod pre-state re-read Nov 6")
alter table public.profile_meta enable row level security; alter table public.profile_owners enable row level security; alter table public.profile_content enable row level security;
create policy "profile_meta read all" on public.profile_meta for select to public using (true);
create policy profile_meta_read on public.profile_meta for select to public using (true);
create policy "profile_meta owner insert" on public.profile_meta for insert to authenticated with check (exists(select 1 from public.profile_owners o where o.profile_slug=slug and o.owner_id=auth.uid()));
create policy "profile_meta owner update" on public.profile_meta for update to authenticated using (exists(select 1 from public.profile_owners o where o.profile_slug=slug and o.owner_id=auth.uid())) with check (exists(select 1 from public.profile_owners o where o.profile_slug=slug and o.owner_id=auth.uid()));
create policy profile_meta_owner_update on public.profile_meta for update to public using (exists(select 1 from public.profile_owners o where o.profile_slug=slug and o.owner_id=auth.uid()));
create policy "profile_owners claim" on public.profile_owners for insert to authenticated with check (owner_id=auth.uid());
create policy "profile_owners delete own" on public.profile_owners for delete to authenticated using (owner_id=auth.uid());
create policy "profile_owners manage own" on public.profile_owners for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "profile_owners read all" on public.profile_owners for select to public using (true);
create policy profile_owners_read on public.profile_owners for select to public using (true);
-- profile_content policies NOT captured: assumed world-readable, owner-writable (stand-in)
create policy pc_read on public.profile_content for select to public using (true);
create policy pc_owner_write on public.profile_content for all to authenticated using (exists(select 1 from public.profile_owners o where o.profile_slug=profile_slug and o.owner_id=auth.uid())) with check (true);
-- prod rows (counts/shape from the PR's runbook + requester facts; uuids are the ones the PR names). Content is synthetic.
insert into auth.users(id,email) values
 ('4f1ff687-e287-496e-8eb4-c444f8e556d1','joe-tuitea@example.test'),('d1ef5687-7410-4027-b94d-e4de393c27d9','fobbinhard@example.test'),
 ('aaaaaaaa-0000-4000-8000-000000000001','audit-owner@example.test'),('bbbbbbbb-0000-4000-8000-000000000001','admin-two@example.test'),
 ('cccccccc-0000-4000-8000-000000000001','house@example.test'),('dddddddd-0000-4000-8000-000000000001','stranger@example.test');
insert into public.profile_meta(slug,display_name,handle,account_type,status,book_email,bio,tagline,location,avatar_url) values
 ('tuitea','Tuitea','tuitea','subscriber_profile','published','private@example.test','bio t','tag t','OC','https://keepitil.com/a.png'),
 ('groove-trooper','Groove Trooper','groove-trooper','editorial_artist','published','booking@example.test','bio g','tag g','LA','https://keepitil.com/g.png'),
 ('fobbinhard','Fob','fobbinhard',null,'review',null,null,null,null,null),
 ('keepitil-audit','Audit','keepitil-audit',null,'review',null,null,null,null,null);
insert into public.profile_owners(profile_slug,owner_id) values ('tuitea','4f1ff687-e287-496e-8eb4-c444f8e556d1'),('fobbinhard','d1ef5687-7410-4027-b94d-e4de393c27d9'),('keepitil-audit','aaaaaaaa-0000-4000-8000-000000000001');
insert into public.profile_content(profile_slug,kind,data) select 'groove-trooper','post','{}'::jsonb from generate_series(1,5);
insert into public.applications(slug,name,city,status,type,bio,genre) values ('tuitea','Tuitea','OC','approved','artist','app bio','house'),('joseph-tuitea','Joseph','OC','approved','artist','x','x');
insert into public.app_admins values ('4f1ff687-e287-496e-8eb4-c444f8e556d1'),('bbbbbbbb-0000-4000-8000-000000000001'),('cccccccc-0000-4000-8000-000000000001');
grant all on all tables in schema public to anon, authenticated;   -- prod grants are this broad (PR's down file: anon+authenticated ALL on both tables)
