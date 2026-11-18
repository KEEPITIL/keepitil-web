CREATE OR REPLACE FUNCTION public.event_checkin_scan(p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb := private.door_checkin_core(p_qr_token);
  c text  := r->>'code';
begin
  -- Token-free, contact-free adapter over the shared core. Only these keys can ever appear:
  -- ok, result, message, event_title, tier, qty, checked_in_at.
  if c = 'admitted' then
    return pg_catalog.jsonb_build_object('ok', true, 'result', 'admitted', 'message', 'Admitted',
      'event_title', r->'event_title', 'tier', r->'tier', 'qty', r->'qty', 'checked_in_at', r->'checked_in_at');
  elsif c = 'already_used' then
    return pg_catalog.jsonb_build_object('ok', false, 'result', 'already_used', 'message', 'Already admitted.',
      'event_title', r->'event_title', 'tier', r->'tier', 'qty', r->'qty', 'checked_in_at', r->'checked_in_at');
  elsif c = 'unpaid' then
    return pg_catalog.jsonb_build_object('ok', false, 'result', 'unpaid',
      'message', 'This order is not paid (' || coalesce(r->>'order_status', 'unknown') || ').',
      'event_title', r->'event_title');
  elsif c = 'forbidden' then
    return pg_catalog.jsonb_build_object('ok', false, 'result', 'forbidden', 'message', 'You are not on the door for this event.');
  elsif c = 'invalid' then
    return pg_catalog.jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'Not a KEEPITIL ticket.');
  elsif c = 'empty' then
    return pg_catalog.jsonb_build_object('ok', false, 'result', 'empty', 'message', 'No code scanned.');
  end if;
  return pg_catalog.jsonb_build_object('ok', false, 'result', 'unauth', 'message', 'Sign in to scan tickets.');
end;
$function$
