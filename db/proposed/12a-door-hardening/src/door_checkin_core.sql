CREATE FUNCTION private.door_checkin_core(p_raw text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_handle  text;
  v_tok     text;
  v_n       int;
  o         record;
  v_at      timestamptz;
  v_status  text;
  v_tier    text;
  v_checked int;
  v_sold    int;
begin
  -- 1. authentication: a signed-in JWT subject is required. No uid, no information.
  if v_uid is null then
    return pg_catalog.jsonb_build_object('code', 'unauth');
  end if;

  -- 2. normalise the scanned payload: trim, strip ONE leading 'KIL-' (any case), trim again.
  v_tok := pg_catalog.regexp_replace(coalesce(p_raw, ''), '^\s+|\s+$', '', 'g');
  v_tok := pg_catalog.regexp_replace(v_tok, '^KIL-', '', 'i');
  v_tok := pg_catalog.regexp_replace(v_tok, '^\s+|\s+$', '', 'g');
  if v_tok = '' then
    return pg_catalog.jsonb_build_object('code', 'empty');
  end if;
  if pg_catalog.length(v_tok) > 128 then
    return pg_catalog.jsonb_build_object('code', 'invalid');
  end if;

  -- 3. caller's door handle. NULL and '' are both "no handle".
  select nullif(u.handle, '') into v_handle from public.app_users u where u.id = v_uid;

  -- 4. token lookup. qr_token carries no UNIQUE constraint, so a duplicated token is refused, never guessed.
  select pg_catalog.count(*) into v_n
    from (select 1 from public.event_orders x where x.qr_token = v_tok limit 2) d;
  if v_n = 0 or v_n > 1 then
    return pg_catalog.jsonb_build_object('code', 'invalid');
  end if;

  select o2.id, o2.event_id, o2.tier_id, o2.qty, o2.status, o2.checked_in_at,
         e.title as event_title, nullif(e.owner_handle, '') as owner_handle
    into o
    from public.event_orders o2
    join public.events e on e.id = o2.event_id
   where o2.qr_token = v_tok;

  -- 5. owner authorisation: BOTH sides must be non-null/non-empty, then case-insensitive equality.
  if v_handle is null or o.owner_handle is null
     or pg_catalog.lower(v_handle) <> pg_catalog.lower(o.owner_handle) then
    return pg_catalog.jsonb_build_object('code', 'forbidden');
  end if;

  select t.name into v_tier from public.ticket_tiers t where t.id = o.tier_id;
  v_tier := coalesce(v_tier, 'GA');

  -- 6. cheap pre-classification (the UPDATE below is the real gate).
  v_status := o.status;
  v_at := o.checked_in_at;
  if v_status is distinct from 'paid' or v_at is not null then
    -- fall through to the final classification below without attempting admission
    null;
  else
    -- 7. ATOMIC single admission: one statement decides. status, prior admission and ownership are all
    --    re-evaluated on the locked row, so concurrent scans / a concurrent refund cannot both win.
    update public.event_orders eo
       set checked_in_at = pg_catalog.now()
     where eo.id = o.id
       and eo.checked_in_at is null
       and eo.status = 'paid'
       and exists (select 1 from public.events ev
                    where ev.id = eo.event_id
                      and nullif(ev.owner_handle, '') is not null
                      and pg_catalog.lower(ev.owner_handle) = pg_catalog.lower(v_handle))
    returning eo.checked_in_at into v_at;
    if found then
      select pg_catalog.count(*) filter (where z.checked_in_at is not null), pg_catalog.count(*)
        into v_checked, v_sold
        from public.event_orders z where z.event_id = o.event_id and z.status = 'paid';
      return pg_catalog.jsonb_build_object('code', 'admitted', 'event_title', o.event_title, 'tier', v_tier,
               'qty', o.qty, 'checked_in_at', v_at, 'checked_in', v_checked, 'sold', v_sold);
    end if;
    -- lost the race (or status/ownership changed since the read): re-read the committed row
    select z.status, z.checked_in_at into v_status, v_at from public.event_orders z where z.id = o.id;
    if not found then
      return pg_catalog.jsonb_build_object('code', 'invalid');
    end if;
    if v_status = 'paid' and v_at is null then
      return pg_catalog.jsonb_build_object('code', 'forbidden');   -- ownership changed under us
    end if;
  end if;

  select pg_catalog.count(*) filter (where z.checked_in_at is not null), pg_catalog.count(*)
    into v_checked, v_sold
    from public.event_orders z where z.event_id = o.event_id and z.status = 'paid';

  if v_status = 'checked_in' or (v_status = 'paid' and v_at is not null) then
    return pg_catalog.jsonb_build_object('code', 'already_used', 'event_title', o.event_title, 'tier', v_tier,
             'qty', o.qty, 'checked_in_at', v_at, 'checked_in', v_checked, 'sold', v_sold);
  end if;

  return pg_catalog.jsonb_build_object('code', 'unpaid', 'order_status', v_status, 'event_title', o.event_title,
           'tier', v_tier, 'qty', o.qty, 'checked_in', v_checked, 'sold', v_sold);
end;
$function$
