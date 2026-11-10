-- replica-92-add.sql : applied AFTER replica-91.sql (which now has the pre-existing private schema). Adds what #92, APPLY-1B and the publish gate need. Stand-ins are marked.
-- (1) PUBLISH GATE (PRECHECK-RESULTS B): BEFORE INSERT OR UPDATE on profile_meta; not security definer; blocks a row moving INTO 'published' unless complete. SIMPLIFIED: the real gate also needs
--     a source with http_status 200, a short description and 2 of (image, location, category, socials, links); here: display_name, account_type, entity_category, last_reviewed_at.
alter table public.profile_meta add column last_reviewed_at timestamptz, add column sources jsonb not null default '[]'::jsonb;
alter table public.profile_meta add constraint profile_meta_account_type_check check (account_type is null or account_type in ('editorial_artist','editorial_venue','editorial_organizer','editorial_brand','subscriber_profile'));   -- prod CHECK values (PRECHECK-RESULTS P-8)
create function public.profile_meta_publish_gate() returns trigger language plpgsql as $$
begin
  if NEW.status is distinct from 'published' then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.status = 'published' then return NEW; end if;
  if coalesce(btrim(NEW.display_name),'') = '' or NEW.account_type is null or NEW.entity_category is null or NEW.last_reviewed_at is null then
    raise exception 'publish gate: row is not complete' using errcode = 'P0001';
  end if;
  return NEW;
end $$;
create trigger profile_meta_publish_gate_trg before insert or update on public.profile_meta for each row execute function public.profile_meta_publish_gate();
-- (2) profile_content kind CHECK exactly as prod (9 kinds)
alter table public.profile_content add constraint profile_content_kind_check check (kind = any (array['article','photo','show','chat','post','event','highlight','profile_categories','create_entry']::text[]));
-- (3) events: the 45 live SELECT columns + hidden columns (event_password_hash, owner_id, internal_notes, stripe_acct = STAND-INS for whatever else #39 hides). Grants: column-level SELECT only, as prod (PRECHECK-RESULTS P-17).
create table public.events(
  accent_color text, city text, county text, cover_url text, created_at timestamptz default now(), dedupe_key text, description text, end_time_public boolean, ends_at timestamptz, extra_links jsonb,
  featured boolean, features jsonb, gallery jsonb, genres text, hide_guest_count boolean, id uuid primary key default gen_random_uuid(), imported_at timestamptz, link_checked_at timestamptz, link_detail text,
  link_last_ok_at timestamptz, link_status text, owner_handle text, password_protected boolean not null default false, reg_questions jsonb, review_reason text, series_id uuid, show_feed boolean, show_gallery boolean,
  show_lineup boolean, show_on_explore boolean, slug text unique, source text, source_url text, spotify_url text, starts_at timestamptz, state text, status text, submitted_by uuid, tagline text, title text,
  title_font text, tz text, venue text, waitlist_enabled boolean, youtube_url text,
  event_password_hash text, owner_id uuid, internal_notes text, stripe_acct text);
alter table public.events enable row level security;
create policy events_public_read on public.events for select to anon, authenticated using (status = 'published');
create policy events_owner_all on public.events for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on table public.events from anon, authenticated, public;
grant select (accent_color,city,county,cover_url,created_at,dedupe_key,description,end_time_public,ends_at,extra_links,featured,features,gallery,genres,hide_guest_count,id,imported_at,link_checked_at,link_detail,link_last_ok_at,link_status,owner_handle,password_protected,reg_questions,review_reason,series_id,show_feed,show_gallery,show_lineup,show_on_explore,slug,source,source_url,spotify_url,starts_at,state,status,submitted_by,tagline,title,title_font,tz,venue,waitlist_enabled,youtube_url) on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;
-- (4) ticket stand-ins: get_my_tickets is SECURITY DEFINER in prod (PRECHECK-RESULTS P-5); body is a STAND-IN returning a qr_token and order_id so the summary's projection can be tested.
create table public.event_orders(id uuid primary key default gen_random_uuid(), user_id uuid, event_slug text, qty int, tier_name text, qr_token text, checked_in_at timestamptz);
create function public.get_my_tickets() returns table(slug text, title text, starts_at timestamptz, venue text, city text, qty int, tier_name text, checked_in_at timestamptz, qr_token text, order_id uuid)
  language sql stable security definer set search_path = public as $$
  select e.slug, e.title, e.starts_at, e.venue, e.city, o.qty, o.tier_name, o.checked_in_at, o.qr_token, o.id from public.event_orders o join public.events e on e.slug = o.event_slug where o.user_id = auth.uid() $$;
-- (5) the LIVE get_profile_events(text): body NOT captured; stand-in = published-or-own by owner_handle, SECURITY DEFINER, executable by anon (as the PR says of the live one).
create function public.get_profile_events(p_handle text) returns table(slug text, title text, status text, starts_at timestamptz, tz text, venue text, city text, cover_url text, password_protected boolean)
  language sql stable security definer set search_path = public as $$
  select e.slug, e.title, e.status, e.starts_at, e.tz, e.venue, e.city, e.cover_url, e.password_protected from public.events e where e.owner_handle = p_handle and (e.status = 'published' or e.owner_id = auth.uid()) $$;
