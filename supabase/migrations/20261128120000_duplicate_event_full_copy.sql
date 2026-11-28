-- Duplicate event: copy the whole event, not a thin slice.
-- Before: public.duplicate_event copied title, tagline, description, venue, city, starts_at, cover_url, genres and (name, price, qty, sort) of each tier.
-- It dropped the time zone (the column default put every copy on America/Los_Angeles, so a New York show showed 3 hours early),
-- the end time, state and county, the page features (lineup, gallery, feed, registration questions, links, fonts, colours, password) and each
-- tier's description and show-remaining flag. Sales windows and the legacy payment link are deliberately NOT copied: the copy is for a new date,
-- and an old window would make it unsellable; the organizer sets them when editing. The copy is still a private 'review' row owned by the caller.
-- Apply: Grok GO + backup (keepitil-prod). Rollback: 20261128120000_duplicate_event_full_copy.rollback.sql.
create or replace function public.duplicate_event(p_event_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  h text; src public.events%rowtype; new_id bigint; new_slug text;
begin
  if auth.uid() is null then return jsonb_build_object('error','unauth'); end if;
  select handle into h from public.app_users where id = auth.uid();
  select * into src from public.events where id = p_event_id;
  if not found or src.owner_handle is distinct from h then return jsonb_build_object('error','notyours'); end if;
  new_slug := 'event-'||substr(md5(random()::text),1,8);
  insert into public.events(slug, owner_handle, title, tagline, description, venue, city, state, county, tz, starts_at, ends_at, cover_url, genres, status,
      reg_questions, show_lineup, show_gallery, show_feed, end_time_public, waitlist_enabled, hide_guest_count, show_on_explore,
      event_password_hash, password_protected, spotify_url, youtube_url, title_font, accent_color, features, gallery, extra_links)
    values (new_slug, h, left(src.title, 153)||' (copy)', src.tagline, src.description, src.venue, src.city, src.state, src.county, src.tz, src.starts_at, src.ends_at, src.cover_url, src.genres, 'review',
      src.reg_questions, src.show_lineup, src.show_gallery, src.show_feed, src.end_time_public, src.waitlist_enabled, src.hide_guest_count, src.show_on_explore,
      src.event_password_hash, src.password_protected, src.spotify_url, src.youtube_url, src.title_font, src.accent_color, src.features, src.gallery, src.extra_links)
    returning id into new_id;
  insert into public.ticket_tiers(event_id, name, description, price_cents, currency, qty_total, show_qty, sort)
    select new_id, name, description, price_cents, currency, qty_total, show_qty, sort from public.ticket_tiers where event_id = p_event_id;
  return jsonb_build_object('event_id', new_id, 'slug', new_slug);
end;
$function$;
