-- replica-f3-LOCAL-REPLICA-NOT-FOR-PROD.sql
-- LOCAL PGlite REPLICA ONLY. Never run this against any hosted database: it CREATEs ROLEs and TABLEs.
-- Purpose: a minimal stand-in for the production objects that Atlas's "Media RLS + Connect publish-gate
-- proposal v2" touches, so the proposal's FORWARD / ROLLBACK SQL can be executed and its test matrix partly
-- exercised WITHOUT any production access. NOTHING here was read from production by this PR; shapes come from
-- Atlas's document (Appendix A: verbatim policies/ACLs; section 2: profile_meta columns; rollback section:
-- verbatim original function bodies) and from D:\work\r91\PRECHECK-RESULTS.md (read-only prod facts recorded
-- on 2026-11-09). Every simplification is listed in proof/README-PROOF.md.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---- parents / ownership / admin (stand-ins; only the columns the proposal reads) ----
create table public.app_users(id uuid primary key references auth.users(id) on delete cascade, handle text);
create table public.app_admins(user_id uuid primary key);
alter table public.app_admins enable row level security;
create policy app_admins_self_read on public.app_admins for select to authenticated using (user_id = auth.uid());
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.app_admins a where a.user_id = auth.uid()) $$;

create table public.profile_owners(profile_slug text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now());
alter table public.profile_owners enable row level security;
create policy "profile_owners claim" on public.profile_owners for insert to authenticated with check (owner_id = auth.uid());
create policy "profile_owners delete own" on public.profile_owners for delete to authenticated using (owner_id = auth.uid());
create policy "profile_owners manage own" on public.profile_owners for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "profile_owners read all" on public.profile_owners for select to public using (true);
create policy profile_owners_read on public.profile_owners for select to public using (true);

create table public.events(id bigint generated always as identity primary key, slug text unique, owner_handle text, submitted_by uuid, status text);
alter table public.events enable row level security;
create policy events_pub_read on public.events for select to public using (status = 'published');
create table public.venues(slug text primary key, owner_handle text, status text);
alter table public.venues enable row level security;
create policy venues_pub_read on public.venues for select to public using (status = 'published');

-- ---- profile_meta: the 23 real columns (Atlas section 2) ----
create table public.profile_meta(
  slug text primary key, display_name text, handle text, location text, bio text, tagline text, pronouns text,
  avatar_url text, cover_url text, book_email text,
  socials jsonb not null default '{}'::jsonb, highlights jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(), about text, links jsonb, account_type text, links_label text, badges jsonb,
  status text default 'review', cover_mobile_url text, last_reviewed_at timestamptz,
  sources jsonb not null default '[]'::jsonb, entity_category text,
  constraint profile_meta_account_type_check check (account_type is null or account_type in
    ('editorial_artist','editorial_venue','editorial_organizer','editorial_brand','subscriber_profile')));
alter table public.profile_meta enable row level security;
-- Appendix A, verbatim shapes
create policy "profile_meta owner insert" on public.profile_meta as permissive for insert to authenticated
  with check (exists (select 1 from public.profile_owners o where o.profile_slug = profile_meta.slug and o.owner_id = auth.uid()));
create policy "profile_meta owner update" on public.profile_meta as permissive for update to authenticated
  using (exists (select 1 from public.profile_owners o where o.profile_slug = profile_meta.slug and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.profile_owners o where o.profile_slug = profile_meta.slug and o.owner_id = auth.uid()));
create policy "profile_meta read all" on public.profile_meta as permissive for select to public using (true);
create policy profile_meta_owner_update on public.profile_meta as permissive for update to public
  using (exists (select 1 from public.profile_owners po where po.profile_slug = profile_meta.slug and po.owner_id = auth.uid()));
create policy profile_meta_read on public.profile_meta as permissive for select to public using (true);

-- ---- media tables (Atlas section 1 + Appendix A) ----
create table public.event_media(
  id bigint generated always as identity primary key, event_slug text not null,
  kind text not null default 'image' check (kind in ('image','video','post')),
  media_url text, title text, author_handle text, source_url text,
  status text not null default 'published', created_at timestamptz not null default now());
create table public.venue_media(
  id bigint generated always as identity primary key, venue_slug text not null,
  kind text not null default 'image' check (kind in ('image','video','blog','post')),
  media_url text, thumb_url text, title text, author_handle text, source_url text,
  is_artist boolean not null default false,
  status text not null default 'published', created_at timestamptz not null default now(),
  constraint venue_media_status_check check (status = any (array['published'::text,'hidden'::text])));
alter table public.event_media enable row level security;
alter table public.venue_media enable row level security;
create policy event_media_ins on public.event_media as permissive for insert to public with check (true);
create policy event_media_read on public.event_media as permissive for select to public using (status = 'published'::text);
create policy venue_media_insert on public.venue_media as permissive for insert to public with check (true);
create policy venue_media_read on public.venue_media as permissive for select to public using (status = 'published'::text);

-- ---- ORIGINAL functions, verbatim from Atlas's rollback section (pg_get_functiondef copies) ----
CREATE OR REPLACE FUNCTION public.tag_event_media(p_slug text, p_kind text, p_media_url text, p_title text, p_source_url text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_handle text;
begin
 select handle into v_handle from public.app_users where id=auth.uid();
 if v_handle is null then raise exception 'sign in to tag an event'; end if;
 insert into public.event_media(event_slug,kind,media_url,title,author_handle,source_url)
 values (p_slug, coalesce(p_kind,'image'), p_media_url, p_title, v_handle, p_source_url) returning id into v_id;
 return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.tag_venue_media(p_slug text, p_kind text, p_media_url text, p_title text, p_source_url text DEFAULT NULL::text, p_is_artist boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_handle text;
begin
 select handle into v_handle from public.app_users where id=auth.uid();
 if v_handle is null then raise exception 'sign in to tag a venue'; end if;
 if not exists(select 1 from public.venues where slug=p_slug and status='published') then raise exception 'venue not found'; end if;
 insert into public.venue_media(venue_slug,kind,media_url,title,author_handle,is_artist,source_url)
 values (p_slug, coalesce(p_kind,'image'), p_media_url, p_title, v_handle, coalesce(p_is_artist,false), p_source_url)
 returning id into v_id;
 return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.profile_meta_publish_gate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
 extras int;
 missing text[] := '{}';
begin
 if new.status is distinct from 'published' then
 return new;
 end if;
 if tg_op = 'UPDATE' and old.status = 'published' then
 return new;
 end if;

 if nullif(btrim(coalesce(new.display_name,'')),'') is null then
 missing := missing || 'public name'::text; end if;
 if new.account_type is null then
 missing := missing || 'account_type (never NULL)'::text; end if;
 if nullif(btrim(coalesce(new.entity_category,'')),'') is null then
 missing := missing || 'entity category'::text; end if;
 if jsonb_typeof(new.sources) is distinct from 'array'
 or not exists (
 select 1 from jsonb_array_elements(new.sources) s
 where coalesce(s->>'url','') <> '' and (s->>'http_status') = '200'
 ) then
 missing := missing || 'at least one verified source URL returning 200'::text; end if;
 if nullif(btrim(coalesce(new.about, new.bio, '')),'') is null then
 missing := missing || 'short description'::text; end if;
 if new.last_reviewed_at is null then
 missing := missing || 'last_reviewed_at'::text; end if;

 if array_length(missing, 1) is not null then
 raise exception 'profile "%" cannot be published — missing: %', new.slug, array_to_string(missing, ', ')
 using errcode = 'check_violation';
 end if;

 extras := (case when nullif(btrim(coalesce(new.avatar_url,'')),'') is not null then 1 else 0 end)
 + (case when nullif(btrim(coalesce(new.location,'')),'') is not null then 1 else 0 end)
 + (case when nullif(btrim(coalesce(new.entity_category,'')),'') is not null then 1 else 0 end)
 + (case when coalesce(jsonb_typeof(new.socials),'') = 'object'
 and (select count(*) from jsonb_object_keys(new.socials)) > 0 then 1 else 0 end)
 + (case when coalesce(jsonb_typeof(new.links),'') = 'array'
 and jsonb_array_length(new.links) > 0 then 1 else 0 end);

 if extras < 2 then
 raise exception 'profile "%" cannot be published — needs at least 2 of: image, location, genre/industry, relationship, working link (has %)', new.slug, extras
 using errcode = 'check_violation';
 end if;

 return new;
end;
$function$;
create trigger profile_meta_publish_gate_trg before insert or update on public.profile_meta
  for each row execute function public.profile_meta_publish_gate();

-- claim_profile: STAND-IN (real body not captured here). Per Atlas it is postgres-owned SECURITY DEFINER and
-- inserts only a fixed new-profile payload with review defaults. This stand-in does exactly that.
create function public.claim_profile(p_handle text, p_display text) returns text language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  s := lower(regexp_replace(p_handle,'[^a-zA-Z0-9]+','-','g'));
  if exists(select 1 from public.profile_owners where profile_slug = s) then raise exception 'handle taken'; end if;
  insert into public.profile_meta(slug, display_name, handle) values (s, coalesce(nullif(p_display,''), s), s);
  insert into public.profile_owners(profile_slug, owner_id) values (s, auth.uid());
  return s;
end $$;

-- ---- synthetic identities (all .test addresses are not stored; uuids are made up) ----
insert into auth.users(id) values
 ('a0000000-0000-4000-8000-000000000001'),  -- OWN    owner of profile pub-a / event owner via owner_handle
 ('a0000000-0000-4000-8000-000000000002'),  -- OWN2   owner of profile pub-b
 ('a0000000-0000-4000-8000-000000000003'),  -- STR    unrelated signed-in user
 ('a0000000-0000-4000-8000-000000000004'),  -- ADM    app_admins member, owns nothing
 ('a0000000-0000-4000-8000-000000000005');  -- SUB    submitted_by owner of a draft event, no profile mapping
insert into public.app_users(id, handle) values
 ('a0000000-0000-4000-8000-000000000001','own'),('a0000000-0000-4000-8000-000000000002','own2'),
 ('a0000000-0000-4000-8000-000000000003','str'),('a0000000-0000-4000-8000-000000000004','adm'),
 ('a0000000-0000-4000-8000-000000000005','sub');
insert into public.app_admins values ('a0000000-0000-4000-8000-000000000004');
insert into public.profile_owners(profile_slug, owner_id) values
 ('pub-a','a0000000-0000-4000-8000-000000000001'),('pub-b','a0000000-0000-4000-8000-000000000002');
insert into public.events(slug, owner_handle, submitted_by, status) values
 ('ev-pub',   'pub-a', null, 'published'),
 ('ev-draft', 'pub-a', null, 'draft'),
 ('ev-sub',   null, 'a0000000-0000-4000-8000-000000000005', 'draft'),
 ('ev-other', 'pub-b', null, 'draft');
insert into public.venues(slug, owner_handle, status) values ('v-pub','pub-a','published'),('v-draft','pub-a','draft'),('v-other','pub-b','draft');
-- Two complete published profiles (inserted as postgres so the ORIGINAL gate runs and passes)
insert into public.profile_meta(slug,display_name,handle,location,bio,tagline,pronouns,avatar_url,cover_url,book_email,socials,highlights,about,links,
  account_type,links_label,badges,status,cover_mobile_url,last_reviewed_at,sources,entity_category) values
 ('pub-a','Pub A','pub-a','LA','bio a','tag a','they','https://x.test/a.png','https://x.test/ac.png','a@x.test','{"instagram":"a"}','[]','about a','["https://x.test/l"]',
  'editorial_artist','Links','["b1"]','published','https://x.test/am.png', now(), '[{"url":"https://x.test/src","http_status":"200"}]','dj'),
 ('pub-b','Pub B','pub-b','SD','bio b','tag b','she','https://x.test/b.png','https://x.test/bc.png','b@x.test','{"instagram":"b"}','[]','about b','["https://x.test/m"]',
  'editorial_artist','Links','["b2"]','published','https://x.test/bm.png', now(), '[{"url":"https://x.test/src2","http_status":"200"}]','dj');
-- 19 published event_media rows with NO parent event (the "orphan set" Atlas quarantines) + 2 with parents
insert into public.event_media(event_slug, kind, media_url, title, author_handle, status)
  select 'orphan-' || g, 'image', 'https://x.test/o' || g || '.jpg', 't' || g, 'someone', 'published' from generate_series(1,19) g;
insert into public.event_media(event_slug, kind, media_url, title, author_handle, status) values
 ('ev-pub','image','https://x.test/p1.jpg','kept parent row','own','published');
