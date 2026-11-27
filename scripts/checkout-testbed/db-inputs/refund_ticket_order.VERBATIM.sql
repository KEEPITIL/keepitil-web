-- VERBATIM from prod pg_get_functiondef (read-only catalog capture 2026-11-10); ACL {postgres=X/postgres,service_role=X/postgres}; proconfig search_path=public
CREATE OR REPLACE FUNCTION public.refund_ticket_order(p_session_id text DEFAULT NULL::text, p_payment_intent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_n int := 0;
begin
  if p_session_id is null and p_payment_intent is null then
    raise exception 'refund_ticket_order: need session id or payment intent';
  end if;

  for r in
    select id, tier_id, qty from public.event_orders
     where status = 'paid'
       and ( (p_session_id is not null and stripe_session_id = p_session_id)
          or (p_payment_intent is not null and stripe_payment_intent = p_payment_intent) )
     for update
  loop
    update public.event_orders set status = 'refunded' where id = r.id;
    update public.ticket_tiers
       set qty_sold = greatest(0, coalesce(qty_sold,0) - r.qty)
     where id = r.tier_id;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'refunded_rows', v_n);
end $function$
