CREATE OR REPLACE FUNCTION public.check_in_ticket(p_qr text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid     uuid := auth.uid();
  h       text;
  o       public.event_orders%rowtype;
  ev_title text;
  ev_owner text;
  ev_status text;
  ti      text;
  did     int;
  checked int;
  sold    int;
begin
  if uid is null then return jsonb_build_object('status','unauth'); end if;
  select handle into h from public.app_users where id = uid;

  select * into o from public.event_orders
    where qr_token = regexp_replace(coalesce(p_qr,''), '^KIL-', '', 'i') limit 1;
  if not found then return jsonb_build_object('status','notfound'); end if;

  select title, owner_handle, status into ev_title, ev_owner, ev_status
    from public.events where id = o.event_id;

  if ev_owner is distinct from h then return jsonb_build_object('status','notyours'); end if;
  if o.status <> 'paid' then return jsonb_build_object('status','notpaid','order_status',o.status); end if;

  select name into ti from public.ticket_tiers where id = o.tier_id;

  update public.event_orders set checked_in_at = now()
    where id = o.id and checked_in_at is null;
  get diagnostics did = row_count;

  select count(*) filter (where checked_in_at is not null), count(*)
    into checked, sold
    from public.event_orders where event_id = o.event_id and status = 'paid';

  if did = 0 then
    return jsonb_build_object('status','already','event',ev_title,'tier',coalesce(ti,'GA'),
                              'buyer',o.buyer_email,'at',o.checked_in_at,'checked_in',checked,'sold',sold);
  end if;

  return jsonb_build_object('status','valid','event',ev_title,'tier',coalesce(ti,'GA'),
                            'buyer',o.buyer_email,'qty',o.qty,'checked_in',checked,'sold',sold);
end;
$function$

CREATE OR REPLACE FUNCTION public.event_checkin_scan(p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o record; v_handle text; v_prev timestamptz;
begin
  if coalesce(btrim(p_qr_token),'') = '' then
    return jsonb_build_object('ok', false, 'result', 'empty', 'message', 'No code scanned.');
  end if;

  select h.handle into v_handle from public.app_users h where h.id = auth.uid();

  select o2.id, o2.event_id, o2.qty, o2.status, o2.buyer_email, o2.buyer_handle,
         o2.checked_in_at, e.slug as event_slug, e.title as event_title, e.owner_handle
  into o
  from public.event_orders o2
  join public.events e on e.id = o2.event_id
  where o2.qr_token = btrim(p_qr_token);

  if not found then
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'Not a KEEPITIL ticket.');
  end if;

  if v_handle is null or o.owner_handle is null or lower(v_handle) <> lower(o.owner_handle) then
    return jsonb_build_object('ok', false, 'result', 'forbidden',
      'message', 'You are not on the door for this event.');
  end if;

  if o.status is distinct from 'paid' then
    return jsonb_build_object('ok', false, 'result', 'unpaid',
      'message', 'This order is not paid ('||coalesce(o.status,'unknown')||').',
      'event_title', o.event_title);
  end if;

  if o.checked_in_at is not null then
    return jsonb_build_object('ok', false, 'result', 'already_used', 'message', 'Already admitted.',
      'checked_in_at', o.checked_in_at, 'event_title', o.event_title,
      'buyer', coalesce(o.buyer_handle, o.buyer_email), 'qty', o.qty);
  end if;

  update public.event_orders set checked_in_at = now()
   where id = o.id and checked_in_at is null;

  if not found then
    select checked_in_at into v_prev from public.event_orders where id = o.id;
    return jsonb_build_object('ok', false, 'result', 'already_used',
      'message', 'Already admitted (scanned a moment ago).',
      'checked_in_at', v_prev, 'event_title', o.event_title);
  end if;

  return jsonb_build_object('ok', true, 'result', 'admitted', 'message', 'Admitted',
    'event_title', o.event_title, 'event_slug', o.event_slug,
    'buyer', coalesce(o.buyer_handle, o.buyer_email), 'qty', o.qty, 'checked_in_at', now());
end $function$

