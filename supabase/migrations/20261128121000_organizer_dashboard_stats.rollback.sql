-- Rollback: organizer_dashboard exactly as read from keepitil-prod on 2026-11-28.
create or replace function public.organizer_dashboard()
 returns jsonb
 language sql
 security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(r order by r_start desc nulls last), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'event_id', e.id, 'slug', e.slug, 'title', e.title, 'cover', e.cover_url,
        'status', e.status, 'starts_at', e.starts_at, 'city', e.city, 'venue', e.venue,
        'sold', coalesce(s.sold,0), 'checked_in', coalesce(s.checked_in,0),
        'revenue_cents', coalesce(s.revenue,0)
      ) as r,
      e.starts_at as r_start
    from public.events e
    left join lateral (
      select
        count(*) filter (where o.status='paid') as sold,
        count(*) filter (where o.status='paid' and o.checked_in_at is not null) as checked_in,
        coalesce(sum(
          (select tt.price_cents from public.ticket_tiers tt where tt.id = o.tier_id) * o.qty
        ) filter (where o.status='paid'), 0) as revenue
      from public.event_orders o
      where o.event_id = e.id
    ) s on true
    where e.owner_handle = (select handle from public.app_users where id = auth.uid())
  ) q;
$function$;
