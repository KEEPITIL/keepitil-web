CREATE OR REPLACE FUNCTION public.get_ticket(p_qr text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
begin
  -- 13A F-D: the original body (renamed public.get_ticket__orig_13a by the apply pack, no grants to anyone but the owner) is called unchanged;
  -- this wrapper only removes the buyer's e-mail address ('buyer') from its result. Every other key is passed through byte-for-byte.
  r := public.get_ticket__orig_13a(p_qr);
  if r is not null and pg_catalog.jsonb_typeof(r) = 'object' then
    return r operator(pg_catalog.-) 'buyer'::text;
  end if;
  return r;
end;
$function$
