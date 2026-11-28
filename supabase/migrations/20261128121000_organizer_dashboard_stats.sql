-- Organizer dashboard stats: count tickets (not orders), show free RSVPs, and return the event's time zone.
-- Before: organizer_dashboard counted PAID ORDERS as "sold" and "checked in" (an order of 4 tickets counted once), had no RSVP count (a free RSVP event always read
-- 0), and did not return tz, so the dashboard printed every date in Los Angeles time (a New York show at 11 PM could show the next or previous day).
-- Revenue is unchanged (tier price x quantity of paid orders). Same signature, same owner filter. Rollback: 20261128121000_organizer_dashboard_stats.rollback.sql.
-- Apply: Grok GO + backup (keepitil-prod).
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
        'status', e.status, 'starts_at', e.starts_at, 'tz', e.tz, 'city', e.city, 'venue', e.venue,
        'sold', coalesce(s.sold,0), 'checked_in', coalesce(s.checked_in,0),
        'revenue_cents', coalesce(s.revenue,0), 'rsvps', coalesce(g.rsvps,0)
      ) as r,
      e.starts_at as r_start
    from public.events e
    left join lateral (
      select
        coalesce(sum(o.qty) filter (where o.status='paid'), 0) as sold,
        coalesce(sum(o.qty) filter (where o.status='paid' and o.checked_in_at is not null), 0) as checked_in,
        coalesce(sum(
          (select tt.price_cents from public.ticket_tiers tt where tt.id = o.tier_id) * o.qty
        ) filter (where o.status='paid'), 0) as revenue
      from public.event_orders o
      where o.event_id = e.id
    ) s on true
    left join lateral (
      select count(*) as rsvps from public.event_registrations rg where rg.event_id = e.id
    ) g on true
    where e.owner_handle = (select handle from public.app_users where id = auth.uid())
  ) q;
$function$;
