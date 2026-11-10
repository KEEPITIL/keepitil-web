-- COMBINED-REPLICA.sql : ONE replica schema for the 11B combined RLS rehearsal. PGlite (in-memory, throwaway). NEVER run against a hosted database: it CREATEs ROLEs.
-- It is the UNION of the four existing replicas, stitched in this order, with every conflict resolved explicitly (list: REHEARSAL-REPORT.md section "Replica: conflicts and stand-ins"):
--   replica-91.sql         (profile tables, auth stubs, owner/admin helpers, signup triggers, P-9 policies)          -> sections 1-4
--   replica-92-add.sql     (publish gate columns, kind CHECK, events 45+1 columns + column grants, ticket/event fns) -> sections 3, 5
--   replica-10a-add.sql    (cron stand-in, get_event_view stand-in, per-command profile_content policies)           -> sections 4, 5, 6
--   replica-f3-LOCAL...sql (media tables, ORIGINAL tag_* bodies, ORIGINAL publish-gate body, F3 fixtures)           -> sections 2, 5, 7
--   + 11A needs nothing but events/profile_owners (its own proof used the 10A replica).
-- Nothing here was read from production by this slice. Facts come from PRECHECK-RESULTS.md (P-x, B), PRECHECK-92-RESULTS.md (Q-x) and Atlas's F3 document (Appendix A, section 2, rollback copies).
-- STATE AFTER THIS FILE = the captured pre-everything baseline ("S0"): none of the six #91 columns, no private.account_age, no atlas_media_guard, no can_upload_event_media.

-- ============================================================ 0. roles, auth stubs, default privileges (replica-91 + replica-f3)
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema extensions;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
-- auth.uid() stub: the JWT subject is read from the GUC PostgREST sets (request.jwt.claim.sub). Tests set it with set_config(...) and SET ROLE.
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
-- Supabase default: new tables/functions/sequences in public are granted to the three API roles (P-10 "anon and authenticated have ALL")
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ============================================================ 1. users, admins (replica-91 app_users; replica-f3 app_admins with RLS)
create table public.app_users(id uuid primary key references auth.users(id) on delete cascade, handle text not null, display_name text, avatar_url text, created_at timestamptz default now());
create table public.app_admins(user_id uuid primary key);
alter table public.app_admins enable row level security;     -- f3 variant (91's has no RLS: with the blanket anon/authenticated grants that would let a client write admins in a replica)
create policy app_admins_self_read on public.app_admins for select to authenticated using (user_id = auth.uid());
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.app_admins a where a.user_id = auth.uid()) $$;

-- ============================================================ 2. profile tables
create table public.profile_owners(profile_slug text primary key, owner_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now());
-- profile_meta: the 23 real prod columns in Atlas's order (F3 section 2) = P-7 (21 needed) + last_reviewed_at + sources(NOT NULL) + entity_category. The six #91 columns are NOT here: APPLY-1 adds them.
-- Conflict 91-vs-f3: 91 had highlights nullable/no default; f3 NOT NULL default '[]' (Atlas section 2). f3 wins.
create table public.profile_meta(
  slug text primary key, display_name text, handle text, location text, bio text, tagline text, pronouns text,
  avatar_url text, cover_url text, book_email text,
  socials jsonb not null default '{}'::jsonb, highlights jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(), about text, links jsonb, account_type text, links_label text, badges jsonb,
  status text default 'review', cover_mobile_url text, last_reviewed_at timestamptz,
  sources jsonb not null default '[]'::jsonb, entity_category text,
  constraint profile_meta_account_type_check check (account_type is null or account_type in
    ('editorial_artist','editorial_venue','editorial_organizer','editorial_brand','subscriber_profile')));   -- prod CHECK values (P-8)
create table public.profile_content(id uuid primary key default gen_random_uuid(), profile_slug text not null, kind text not null, data jsonb not null default '{}'::jsonb, created_by uuid, archived boolean not null default false,
  constraint profile_content_kind_check check (kind = any (array['article','photo','show','chat','post','event','highlight','profile_categories','create_entry']::text[])));   -- prod: exactly 9 kinds (P-8, Q-8)
create unique index profile_content_create_entry_uq on public.profile_content ((data->>'vs_entry_id')) where kind = 'create_entry';   -- P-8 "unique partial index on create_entry"
create table public.applications(id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), slug text, type text, name text, genre text, city text, bio text, website text, instagram text,
  music text, image_url text, featured boolean default false, spotify text, youtube text, event_name text, event_date date, event_venue text, event_tickets text, status text not null default 'pending', email text);
create view public.profiles as select id, created_at, slug, type, name, genre, city, bio, website, instagram, music, image_url, featured, spotify, youtube, event_name, event_date, event_venue, event_tickets from public.applications where status='approved';
revoke all on table public.profiles from anon, authenticated;  grant select on table public.profiles to anon, authenticated;   -- P-10: SELECT on the view (not the blanket ALL)

-- the pre-existing `private` schema with the Nov-6 incident backups (PRECHECK-RESULTS A): APPLY-1's CREATE SCHEMA IF NOT EXISTS is a no-op, ROLLBACK-1 must not drop it
create schema private;
create table private.incident_auth_counts_20261106(k text, n int);
create table private.incident_refresh_ids_20261106(id text);
create table private.incident_session_ids_20261106(id text);
create table private.qr_token_backup_20261106(id text, token text);

-- ============================================================ 3. events and venues (92-add events + f3 stand-ins). Conflicts resolved:
--   * 92-add invented owner_id/internal_notes/stripe_acct; PRECHECK-92 Q-5 says prod events has 46 columns = the 45 readable + event_password_hash and NO owner_id. DROPPED here.
--   * 92-add id uuid vs f3 id bigint identity: uuid kept (45-column list includes id; prod type unknown). Nothing in f3/11A reads events.id.
--   * policies: prod has events_auth_insert {public} INSERT, events_owner_read {public} SELECT, events_public_read {anon,authenticated} SELECT (Q-5). Bodies NOT captured: stand-ins below
--     (owner_read references submitted_by AND my_profile_slug()/is_admin() as P-12 says; this is the worst case for revoking submitted_by in 1C).
create table public.events(
  accent_color text, city text, county text, cover_url text, created_at timestamptz default now(), dedupe_key text, description text, end_time_public boolean, ends_at timestamptz, extra_links jsonb,
  featured boolean, features jsonb, gallery jsonb, genres text, hide_guest_count boolean, id uuid primary key default gen_random_uuid(), imported_at timestamptz, link_checked_at timestamptz, link_detail text,
  link_last_ok_at timestamptz, link_status text, owner_handle text, password_protected boolean not null default false, reg_questions jsonb, review_reason text, series_id uuid, show_feed boolean, show_gallery boolean,
  show_lineup boolean, show_on_explore boolean, slug text unique, source text, source_url text, spotify_url text, starts_at timestamptz, state text, status text, submitted_by uuid, tagline text, title text,
  title_font text, tz text, venue text, waitlist_enabled boolean, youtube_url text,
  event_password_hash text);
alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated, public;
grant select (accent_color,city,county,cover_url,created_at,dedupe_key,description,end_time_public,ends_at,extra_links,featured,features,gallery,genres,hide_guest_count,id,imported_at,link_checked_at,link_detail,link_last_ok_at,link_status,owner_handle,password_protected,reg_questions,review_reason,series_id,show_feed,show_gallery,show_lineup,show_on_explore,slug,source,source_url,spotify_url,starts_at,state,status,submitted_by,tagline,title,title_font,tz,venue,waitlist_enabled,youtube_url) on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;
create table public.venues(slug text primary key, owner_handle text, status text);
alter table public.venues enable row level security;
create policy venues_pub_read on public.venues for select to public using (status = 'published');

-- ============================================================ 4. helper functions with prod ACLs (P-3: claim_profile/is_admin/my_profile_slug carry PUBLIC; the others do not)
create function public.my_profile_slug() returns text language sql stable security definer set search_path=public as $$ select profile_slug from public.profile_owners where owner_id=auth.uid() limit 1 $$;
-- claim_profile: REAL BODY CAPTURED in prod P-4 but not in the notes pack -> behavioural stand-in (replica-91 version: idempotent per owner, inserts meta+owner with review defaults)
create function public.claim_profile(p_handle text, p_display text) returns text language plpgsql security definer set search_path=public as $$
declare s text; begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select profile_slug into s from public.profile_owners where owner_id=auth.uid() limit 1; if s is not null then return s; end if;
  s := lower(regexp_replace(p_handle,'[^a-zA-Z0-9]+','-','g'));
  if exists(select 1 from public.profile_owners where profile_slug=s) then raise exception 'handle taken'; end if;
  insert into public.profile_meta(slug,display_name,handle,status) values (s,coalesce(nullif(p_display,''),s),s,'review') on conflict do nothing;
  insert into public.profile_owners(profile_slug,owner_id) values (s,auth.uid()); return s; end $$;
-- signup + deletion triggers on auth.users (replica-91; bodies simplified, names as in prod)
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin
  insert into public.app_users(id,handle,display_name) values (new.id, coalesce(nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'handle',''),'[^a-zA-Z0-9_]','','g'),''),'user_'||substr(replace(new.id::text,'-',''),1,12)), coalesce(new.raw_user_meta_data->>'display_name','Member')) on conflict (id) do nothing; return new; end $$;
create function public.record_signup_consent() returns trigger language plpgsql security definer set search_path=public as $$ begin return new; end $$;
create table public.nexus_deletion_requests(user_id uuid, requested_at timestamptz default now());
create function public.record_nexus_deletion_request() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.nexus_deletion_requests(user_id) values (old.id); return old; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger record_signup_consent after insert on auth.users for each row execute function public.record_signup_consent();
create trigger nexus_deletion_tombstone after delete on auth.users for each row execute function public.record_nexus_deletion_request();
-- pg_cron stand-in (10A PRECHECK block E3); empty like prod (P-18)
create schema cron; create table cron.job(jobid int, jobname text, command text);

-- ============================================================ 5. RLS and policies exactly as named in P-9 / Appendix A / Q-5
alter table public.profile_meta enable row level security; alter table public.profile_owners enable row level security; alter table public.profile_content enable row level security;
-- profile_meta: Appendix A shapes (f3), same names as P-9
create policy "profile_meta owner insert" on public.profile_meta as permissive for insert to authenticated with check (exists (select 1 from public.profile_owners o where o.profile_slug = profile_meta.slug and o.owner_id = auth.uid()));
create policy "profile_meta owner update" on public.profile_meta as permissive for update to authenticated
  using (exists (select 1 from public.profile_owners o where o.profile_slug = profile_meta.slug and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.profile_owners o where o.profile_slug = profile_meta.slug and o.owner_id = auth.uid()));
create policy "profile_meta read all" on public.profile_meta as permissive for select to public using (true);
create policy profile_meta_owner_update on public.profile_meta as permissive for update to public using (exists (select 1 from public.profile_owners po where po.profile_slug = profile_meta.slug and po.owner_id = auth.uid()));
create policy profile_meta_read on public.profile_meta as permissive for select to public using (true);
-- profile_owners (P-9)
create policy "profile_owners claim" on public.profile_owners for insert to authenticated with check (owner_id = auth.uid());
create policy "profile_owners delete own" on public.profile_owners for delete to authenticated using (owner_id = auth.uid());
create policy "profile_owners manage own" on public.profile_owners for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "profile_owners read all" on public.profile_owners for select to public using (true);
create policy profile_owners_read on public.profile_owners for select to public using (true);
-- profile_content (P-9: "read all" public true; insert/update/delete own via profile_owners, authenticated) = the 10A per-command version
create policy "profile_content read all" on public.profile_content for select to public using (true);
create policy "profile_content insert own" on public.profile_content for insert to authenticated with check (exists (select 1 from public.profile_owners o where o.profile_slug = profile_content.profile_slug and o.owner_id = auth.uid()));
create policy "profile_content update own" on public.profile_content for update to authenticated
  using (exists (select 1 from public.profile_owners o where o.profile_slug = profile_content.profile_slug and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.profile_owners o where o.profile_slug = profile_content.profile_slug and o.owner_id = auth.uid()));
create policy "profile_content delete own" on public.profile_content for delete to authenticated using (exists (select 1 from public.profile_owners o where o.profile_slug = profile_content.profile_slug and o.owner_id = auth.uid()));
-- events (Q-5 names; bodies = stand-ins, see section 3)
create policy events_public_read on public.events for select to anon, authenticated using (status = 'published');
create policy events_owner_read on public.events for select to public using (submitted_by = auth.uid() or owner_handle = public.my_profile_slug() or public.is_admin());
create policy events_auth_insert on public.events for insert to public with check (auth.uid() is not null and submitted_by = auth.uid());

-- ============================================================ 6. the EXISTING PROD publish gate, VERBATIM (Atlas rollback copy of pg_get_functiondef = PRECHECK-RESULTS B). Note the early return for published->published updates.
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
create trigger profile_meta_publish_gate_trg before insert or update on public.profile_meta for each row execute function public.profile_meta_publish_gate();

-- ============================================================ 7. media tables, original fan RPCs (f3: Atlas Appendix A + verbatim rollback copies)
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

-- ============================================================ 8. live #92 inputs: get_profile_events (CAPTURED body, PRECHECK-92 Q-2, byte-for-byte), get_my_tickets (stand-in), get_event_view (10A stand-in)
-- ACL as captured: no PUBLIC; postgres/anon/authenticated/service_role (P-3).
CREATE OR REPLACE FUNCTION public.get_profile_events(p_handle text)
 RETURNS TABLE(slug text, title text, cover_url text, starts_at timestamp with time zone, venue text, city text, status text, genres text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select e.slug, e.title, e.cover_url, e.starts_at, e.venue, e.city, e.status, e.genres
  from public.events e
  where e.owner_handle = p_handle
    and ( e.status = 'published'
          or e.owner_handle = (select handle from public.app_users where id = auth.uid()) )
  order by e.starts_at desc nulls last, e.id desc;
$function$;
revoke all on function public.get_profile_events(text) from public;
grant execute on function public.get_profile_events(text) to anon, authenticated, service_role;
create table public.event_orders(id uuid primary key default gen_random_uuid(), user_id uuid, event_slug text, qty int, tier_name text, qr_token text, checked_in_at timestamptz);
create function public.get_my_tickets() returns table(slug text, title text, starts_at timestamptz, venue text, city text, qty int, tier_name text, checked_in_at timestamptz, qr_token text, order_id uuid)
  language sql stable security definer set search_path = public as $$
  select e.slug, e.title, e.starts_at, e.venue, e.city, o.qty, o.tier_name, o.checked_in_at, o.qr_token, o.id from public.event_orders o join public.events e on e.slug = o.event_slug where o.user_id = auth.uid() $$;
revoke all on function public.get_my_tickets() from public; grant execute on function public.get_my_tickets() to anon, authenticated, service_role;
create function public.get_event_view(p_slug text) returns table(slug text, title text, starts_at timestamptz, owner_handle text, has_submitter boolean)
  language sql stable security definer set search_path = public as $$
  select e.slug, e.title, e.starts_at, e.owner_handle, (e.submitted_by is not null) from public.events e where e.slug = p_slug and e.status = 'published' $$;

-- ============================================================ 9. seed data (all synthetic; uuids are the ones the packs name or invented)
insert into auth.users(id,email) values
 ('4f1ff687-e287-496e-8eb4-c444f8e556d1','joe-tuitea@example.test'),('d1ef5687-7410-4027-b94d-e4de393c27d9','fobbinhard@example.test'),
 ('aaaaaaaa-0000-4000-8000-000000000001','audit-owner@example.test'),('bbbbbbbb-0000-4000-8000-000000000001','admin-two@example.test'),
 ('cccccccc-0000-4000-8000-000000000001','house@example.test'),('dddddddd-0000-4000-8000-000000000001','stranger@example.test'),
 ('a0000000-0000-4000-8000-000000000001','own@example.test'),('a0000000-0000-4000-8000-000000000002','own2@example.test'),
 ('a0000000-0000-4000-8000-000000000003','str@example.test'),('a0000000-0000-4000-8000-000000000004','adm@example.test'),
 ('a0000000-0000-4000-8000-000000000005','sub@example.test');
-- the signup trigger created an app_users row for each; give the f3 identities their f3 handles (conflict 91-trigger vs f3 explicit inserts)
update public.app_users set handle = v.h from (values ('a0000000-0000-4000-8000-000000000001','own'),('a0000000-0000-4000-8000-000000000002','own2'),('a0000000-0000-4000-8000-000000000003','str'),('a0000000-0000-4000-8000-000000000004','adm'),('a0000000-0000-4000-8000-000000000005','sub')) v(i,h) where id = v.i::uuid;
-- profile_meta: seeded as postgres so the ORIGINAL gate runs and passes. ASSUMPTION (flagged): the four published rows carry complete evidence (prod's 2 published rows were not read for evidence; F3 GATE_READINESS must be run on prod).
insert into public.profile_meta(slug,display_name,handle,location,bio,tagline,pronouns,avatar_url,cover_url,book_email,socials,highlights,about,links,account_type,links_label,badges,status,cover_mobile_url,last_reviewed_at,sources,entity_category) values
 ('tuitea','Tuitea','tuitea','OC','bio t','tag t',null,'https://keepitil.com/a.png',null,'private@example.test','{"instagram":"t"}','[]','about t','["https://x.test/t"]','subscriber_profile','Links','[]','published',null,now(),'[{"url":"https://x.test/src-t","http_status":"200"}]','person'),
 ('groove-trooper','Groove Trooper','groove-trooper','LA','bio g','tag g',null,'https://keepitil.com/g.png',null,'booking@example.test','{"instagram":"g"}','[]','about g','["https://x.test/g"]','editorial_artist','Links','[]','published',null,now(),'[{"url":"https://x.test/src-g","http_status":"200"}]','dj'),
 ('fobbinhard','Fob','fobbinhard',null,null,null,null,null,null,null,'{}','[]',null,null,null,null,null,'review',null,null,'[]',null),
 ('keepitil-audit','Audit','keepitil-audit',null,null,null,null,null,null,null,'{}','[]',null,null,null,null,null,'review',null,null,'[]',null),
 ('pub-a','Pub A','pub-a','LA','bio a','tag a','they','https://x.test/a.png','https://x.test/ac.png','a@x.test','{"instagram":"a"}','[]','about a','["https://x.test/l"]','editorial_artist','Links','["b1"]','published','https://x.test/am.png',now(),'[{"url":"https://x.test/src","http_status":"200"}]','dj'),
 ('pub-b','Pub B','pub-b','SD','bio b','tag b','she','https://x.test/b.png','https://x.test/bc.png','b@x.test','{"instagram":"b"}','[]','about b','["https://x.test/m"]','editorial_artist','Links','["b2"]','published','https://x.test/bm.png',now(),'[{"url":"https://x.test/src2","http_status":"200"}]','dj');
insert into public.profile_owners(profile_slug,owner_id) values
 ('tuitea','4f1ff687-e287-496e-8eb4-c444f8e556d1'),('fobbinhard','d1ef5687-7410-4027-b94d-e4de393c27d9'),('keepitil-audit','aaaaaaaa-0000-4000-8000-000000000001'),
 ('pub-a','a0000000-0000-4000-8000-000000000001'),('pub-b','a0000000-0000-4000-8000-000000000002');
insert into public.profile_content(profile_slug,kind,data) select 'groove-trooper','post','{}'::jsonb from generate_series(1,5);
insert into public.applications(slug,name,city,status,type,bio,genre) values ('tuitea','Tuitea','OC','approved','artist','app bio','house'),('joseph-tuitea','Joseph','OC','approved','artist','x','x');
-- admins: prod has exactly 1 (Joe). The replica has 4 (Joe, a second admin and the house account for the attestation step, f3's ADM). Flagged.
insert into public.app_admins values ('4f1ff687-e287-496e-8eb4-c444f8e556d1'),('bbbbbbbb-0000-4000-8000-000000000001'),('cccccccc-0000-4000-8000-000000000001'),('a0000000-0000-4000-8000-000000000004');
insert into public.events(slug,title,status,starts_at,city,venue,owner_handle,submitted_by) values
 ('ev-pub',   'Ev pub',   'published', now()+interval '8 days', 'LA', 'V', 'pub-a', null),
 ('ev-draft', 'Ev draft', 'draft',     now()+interval '9 days', 'LA', 'V', 'pub-a', null),
 ('ev-sub',   'Ev sub',   'draft',     now()+interval '9 days', 'LA', 'V', null, 'a0000000-0000-4000-8000-000000000005'),
 ('ev-other', 'Ev other', 'draft',     now()+interval '9 days', 'SD', 'V', 'pub-b', null),
 ('t-up-1','Up 1','published', now()+interval '10 days','Los Angeles','V1','tuitea','4f1ff687-e287-496e-8eb4-c444f8e556d1'),
 ('t-draft','Draft','draft', now()+interval '13 days','Draft City','V4','tuitea','4f1ff687-e287-496e-8eb4-c444f8e556d1'),
 ('g-up','G up','published', now()+interval '9 days','Long Beach','V6','groove-trooper','cccccccc-0000-4000-8000-000000000001');
insert into public.venues(slug, owner_handle, status) values ('v-pub','pub-a','published'),('v-draft','pub-a','draft'),('v-other','pub-b','draft');
-- 19 published event_media rows with NO parent event (the orphan set F3 quarantines) + 1 with a parent
insert into public.event_media(event_slug, kind, media_url, title, author_handle, status)
  select 'orphan-' || g, 'image', 'https://x.test/o' || g || '.jpg', 't' || g, 'someone', 'published' from generate_series(1,19) g;
insert into public.event_media(event_slug, kind, media_url, title, author_handle, status) values ('ev-pub','image','https://x.test/p1.jpg','kept parent row','own','published');
-- P1 stand-in (post_collaborators policies NOT captured; P-12 only says they are TO authenticated and subquery profile_owners): shape-only, used for the profile_owners-dependency check
create table public.post_collaborators(id uuid primary key default gen_random_uuid(), post_slug text, collaborator_slug text, source_slug text);
alter table public.post_collaborators enable row level security;
create policy pc_insert on public.post_collaborators for insert to authenticated with check (exists (select 1 from public.profile_owners o where o.profile_slug = source_slug and o.owner_id = auth.uid()));
create policy pc_update on public.post_collaborators for update to authenticated using (exists (select 1 from public.profile_owners o where o.profile_slug = collaborator_slug and o.owner_id = auth.uid()));
create policy pc_read on public.post_collaborators for select to public using (true);

-- ============================================================ 10. REHEARSAL TOOLING (schema `rehearsal` is excluded from every snapshot)
create schema rehearsal;
-- helper: exploded ACL as a sorted json array of 'grantor>grantee:PRIV:grantable'
create function rehearsal.acl(a aclitem[]) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(s order by s), '[]'::jsonb) from (
    select pg_get_userbyid(x.grantor) || '>' || case x.grantee when 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type || ':' || x.is_grantable::text s
    from aclexplode(a) x) q $$;
-- the catalog snapshot: grants (relation, column, function, schema), policies, triggers, constraints, indexes, function md5s, default ACLs. Each section is a jsonb object keyed by identity so a diff names the object.
create function rehearsal.catalog_snapshot() returns jsonb language sql stable as $$
select jsonb_build_object(
 'schemas', (select coalesce(jsonb_object_agg(n.nspname, jsonb_build_object('owner', pg_get_userbyid(n.nspowner), 'acl', rehearsal.acl(n.nspacl))), '{}') from pg_namespace n where n.nspname in ('public','private','atlas_media_guard','auth')),
 'relations', (select coalesce(jsonb_object_agg(n.nspname||'.'||c.relname, jsonb_build_object('kind', c.relkind, 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity, 'owner', pg_get_userbyid(c.relowner), 'acl', rehearsal.acl(c.relacl))), '{}')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','atlas_media_guard') and c.relkind in ('r','v','m','S','p')),
 'columns', (select coalesce(jsonb_object_agg(n.nspname||'.'||c.relname||'.'||a.attname, jsonb_build_object('type', format_type(a.atttypid,a.atttypmod), 'notnull', a.attnotnull, 'identity', a.attidentity, 'default', pg_get_expr(d.adbin,d.adrelid), 'acl', rehearsal.acl(a.attacl))), '{}')
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where n.nspname in ('public','private','atlas_media_guard') and c.relkind in ('r','v','m','S','p') and a.attnum>0 and not a.attisdropped),
 'policies', (select coalesce(jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname, jsonb_build_object('permissive', permissive, 'roles', roles::text, 'cmd', cmd, 'qual', qual, 'with_check', with_check)), '{}') from pg_policies where schemaname in ('public','private','atlas_media_guard')),
 'triggers', (select coalesce(jsonb_object_agg(c.oid::regclass::text||'.'||t.tgname, jsonb_build_object('enabled', t.tgenabled, 'def', pg_get_triggerdef(t.oid,true))), '{}')
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private','atlas_media_guard','auth')),
 'constraints', (select coalesce(jsonb_object_agg(n.nspname||'.'||c.relname||'.'||k.conname, pg_get_constraintdef(k.oid,true)), '{}')
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','atlas_media_guard')),
 'indexes', (select coalesce(jsonb_object_agg(schemaname||'.'||indexname, indexdef), '{}') from pg_indexes where schemaname in ('public','private','atlas_media_guard')),
 'functions', (select coalesce(jsonb_object_agg(n.nspname||'.'||p.oid::regprocedure::text, jsonb_build_object('owner', pg_get_userbyid(p.proowner), 'secdef', p.prosecdef, 'config', p.proconfig, 'volatile', p.provolatile, 'acl', rehearsal.acl(p.proacl), 'md5', md5(pg_get_functiondef(p.oid)))), '{}')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and (n.nspname in ('public','private','atlas_media_guard') or (n.nspname='auth' and p.proname='uid'))),
 'default_acl', (select coalesce(jsonb_object_agg(coalesce(d.defaclnamespace::regnamespace::text,'0')||'.'||pg_get_userbyid(d.defaclrole)||'.'||d.defaclobjtype::text, rehearsal.acl(d.defaclacl)), '{}') from pg_default_acl d),
 'memberships', (select coalesce(jsonb_agg(pg_get_userbyid(member)||'>'||pg_get_userbyid(roleid) order by 1::int), '[]') from pg_auth_members where pg_get_userbyid(member) in ('anon','authenticated','service_role'))
) $$;
