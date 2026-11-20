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
