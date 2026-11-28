-- Rollback: get_event_for_edit exactly as read from keepitil-prod 2026-11-28; drop the zone setter.
drop function if exists public.kil_set_my_event_tz(text, text);
create or replace function public.get_event_for_edit(p_slug text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when e.id is null then null else jsonb_build_object(
    'ev', jsonb_build_object('slug',e.slug,'title',e.title,'tagline',e.tagline,'description',e.description,
        'venue',e.venue,'city',e.city,'starts_at',e.starts_at,'cover_url',e.cover_url,'genres',e.genres,
        'status',e.status,'reg_questions',e.reg_questions,'series_id',e.series_id,
        'show_lineup',e.show_lineup,'show_gallery',e.show_gallery,'show_feed',e.show_feed,
        'ends_at',e.ends_at,'end_time_public',e.end_time_public,'waitlist_enabled',e.waitlist_enabled,
        'hide_guest_count',e.hide_guest_count,'show_on_explore',e.show_on_explore,
        'spotify_url',e.spotify_url,'youtube_url',e.youtube_url,'title_font',e.title_font,'accent_color',e.accent_color,
        'features',e.features,'gallery',e.gallery,'has_password',(e.event_password_hash is not null)),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('name',t.name,'description',t.description,'price_cents',t.price_cents,
                          'qty_total',t.qty_total,'sales_start',t.sales_start,'sales_end',t.sales_end,'show_qty',t.show_qty) order by t.sort)
                        from public.ticket_tiers t where t.event_id=e.id),'[]'::jsonb),
    'series', case when e.series_id is null then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('slug',se.slug,'starts_at',se.starts_at,'status',se.status,
            'paid', coalesce((select count(*) from public.event_orders o where o.event_id=se.id and o.status='paid'),0),
            'orders', coalesce((select count(*) from public.event_orders o where o.event_id=se.id),0)) order by se.starts_at nulls last, se.id)
        from public.events se where se.series_id=e.series_id and se.owner_handle=e.owner_handle),'[]'::jsonb) end
  ) end
  from public.events e
  where e.slug=p_slug and e.owner_handle=(select handle from public.app_users where id=auth.uid());
$function$;
