-- VERBATIM from prod pg_get_functiondef (read-only catalog capture 2026-11-10 ~14:10 PT).
-- ACL both: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}; proconfig search_path=public
-- md5(pg_get_functiondef): get_my_tickets c3885372304c4f2c1d73c540a6f6834e ; get_ticket 1814becc056c30ccac38c3adb51019ae

CREATE OR REPLACE FUNCTION public.get_my_tickets()
 RETURNS TABLE(order_id bigint, event_id bigint, slug text, title text, cover_url text, venue text, city text, starts_at timestamp with time zone, qty integer, qr_token text, status text, purchased_at timestamp with time zone, tier_name text, price_cents integer, checked_in_at timestamp with time zone, genres text, owner_handle text, owner_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.id, e.id, e.slug, e.title, e.cover_url, e.venue, e.city, e.starts_at,
         o.qty, o.qr_token, o.status, o.created_at,
         tt.name, tt.price_cents, o.checked_in_at,
         e.genres, e.owner_handle, au.display_name
  from public.event_orders o
  join public.events e on e.id = o.event_id
  left join public.ticket_tiers tt on tt.id = o.tier_id
  left join public.app_users au on au.handle = e.owner_handle
  where o.status='paid'
    and lower(o.buyer_email)=lower((select email from auth.users where id=auth.uid()))
  order by o.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_ticket(p_qr text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when o.id is null then jsonb_build_object('status','notfound')
    else jsonb_build_object(
      'status', o.status,
      'event', e.title, 'slug', e.slug, 'cover', e.cover_url,
      'venue', e.venue, 'city', e.city, 'starts_at', e.starts_at,
      'tier', coalesce(t.name,'General Admission'), 'qty', o.qty,
      'buyer', o.buyer_email, 'qr', o.qr_token, 'checked_in_at', o.checked_in_at
    )
  end
  from (select regexp_replace(coalesce(p_qr,''),'^KIL-','','i') as tok) x
  left join public.event_orders o on o.qr_token = x.tok and o.status = 'paid'
  left join public.events e on e.id = o.event_id
  left join public.ticket_tiers t on t.id = o.tier_id
  limit 1;
$function$;
