CREATE OR REPLACE FUNCTION public.fulfill_ticket_order(p_session_id text, p_payment_intent text, p_event_id bigint, p_items jsonb, p_buyer_email text, p_app_fee_cents integer DEFAULT NULL::integer, p_organizer_acct text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  it jsonb;
  v_tier_id bigint; v_qty int; v_unit int;
  v_handle text;
  v_inserted int := 0; v_skipped int := 0;
  v_tokens jsonb := '[]'::jsonb;
  v_token text;
begin
  if p_session_id is null or p_event_id is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'fulfill_ticket_order: session, event_id and items[] are required';
  end if;
  if p_buyer_email is not null then
    select au.handle into v_handle from auth.users u join public.app_users au on au.id = u.id
     where lower(u.email) = lower(p_buyer_email) limit 1;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_tier_id := nullif(it->>'t','')::bigint;
    v_qty     := greatest(1, coalesce(nullif(it->>'q','')::int, 1));
    v_unit    := coalesce(nullif(it->>'u','')::int, 0);
    if v_tier_id is null then continue; end if;
    insert into public.event_orders (event_id, tier_id, buyer_email, buyer_handle, qty, status,
      amount_cents, stripe_session_id, stripe_payment_intent, application_fee_cents, organizer_acct)
    values (p_event_id, v_tier_id, p_buyer_email, v_handle, v_qty, 'paid',
      v_unit * v_qty, p_session_id, p_payment_intent, p_app_fee_cents, p_organizer_acct)
    on conflict (stripe_session_id, tier_id) where stripe_session_id is not null do nothing
    returning qr_token into v_token;
    if v_token is not null then
      v_inserted := v_inserted + 1; v_tokens := v_tokens || to_jsonb(v_token);
      update public.ticket_tiers set qty_sold = coalesce(qty_sold,0) + v_qty where id = v_tier_id;
    else v_skipped := v_skipped + 1; end if;
    v_token := null;
  end loop;
  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'skipped_duplicate', v_skipped,
                            'event_id', p_event_id, 'session', p_session_id, 'qr_tokens', v_tokens);
end
$function$
