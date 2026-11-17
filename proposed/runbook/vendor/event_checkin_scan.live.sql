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
