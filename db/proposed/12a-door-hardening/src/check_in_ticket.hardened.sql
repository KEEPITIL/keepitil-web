CREATE OR REPLACE FUNCTION public.check_in_ticket(p_qr text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb := private.door_checkin_core(p_qr);
  c text  := r->>'code';
begin
  -- Legacy response shape (status, event, tier, qty, checked_in, sold, at) over the shared core.
  -- The legacy 'buyer' key (attendee email) is intentionally gone.
  if c = 'admitted' then
    return pg_catalog.jsonb_build_object('status', 'valid', 'event', r->'event_title', 'tier', r->'tier', 'qty', r->'qty',
      'checked_in', r->'checked_in', 'sold', r->'sold', 'at', r->'checked_in_at');
  elsif c = 'already_used' then
    return pg_catalog.jsonb_build_object('status', 'already', 'event', r->'event_title', 'tier', r->'tier', 'qty', r->'qty',
      'checked_in', r->'checked_in', 'sold', r->'sold', 'at', r->'checked_in_at');
  elsif c = 'unpaid' then
    return pg_catalog.jsonb_build_object('status', 'notpaid', 'order_status', r->'order_status');
  elsif c = 'forbidden' then
    return pg_catalog.jsonb_build_object('status', 'notyours');
  elsif c = 'invalid' or c = 'empty' then
    return pg_catalog.jsonb_build_object('status', 'notfound');
  end if;
  return pg_catalog.jsonb_build_object('status', 'unauth');
end;
$function$
