-- Rollback: get_event_view exactly as read from keepitil-prod 2026-11-28; drop the cancel RPC. Events already cancelled stay cancelled (hidden from the public again).
drop function if exists public.kil_cancel_my_event(text);
create or replace function public.get_event_view(p_slug text)
 returns table(id bigint, slug text, title text, tagline text, description text, venue text, city text, starts_at timestamp with time zone, genres text, cover_url text, status text, reg_questions jsonb, show_lineup boolean, show_gallery boolean, show_feed boolean, series_id uuid, owner_handle text, owner_name text, is_external boolean, source_url text, state text, county text, tz text, ends_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select e.id, e.slug, e.title, e.tagline, e.description, e.venue, e.city, e.starts_at, e.genres,
         e.cover_url, e.status, e.reg_questions,
         e.show_lineup, e.show_gallery, e.show_feed, e.series_id,
         e.owner_handle,
         coalesce((select u.display_name from public.app_users u where u.handle=e.owner_handle),
                  (select m.display_name from public.profile_meta m where m.slug=e.owner_handle)),
         (e.source_url is not null and btrim(e.source_url) <> ''),
         e.source_url,
         e.state, e.county, e.tz, e.ends_at
  from public.events e
  where ( e.slug = p_slug
          or regexp_replace(lower(e.slug),'[^a-z0-9]','','g') = regexp_replace(lower(p_slug),'[^a-z0-9]','','g') )
    and ( e.status = 'published'
          or e.owner_handle = (select handle from public.app_users where id = auth.uid())
          or public.is_admin() )
  order by (e.slug = p_slug) desc
  limit 1;
$function$;
