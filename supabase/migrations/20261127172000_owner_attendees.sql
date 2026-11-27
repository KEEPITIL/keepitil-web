-- Owner-only attendee read. NOT APPLIED by deploying the website.
-- Apply on keepitil-prod after 20261127170000_self_serve_publish.sql (uses kil_row_owned
-- and kil_event_id_for_slug). A creator can read buyers and RSVPs only for events they own.
-- anon and other users get forbidden. The function never selects a row whose event is not p_slug.

create or replace function public.kil_event_customers(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id bigint;
  regs jsonb := '[]'::jsonb;
  orders jsonb := '[]'::jsonb;
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,200}$' then
    return jsonb_build_object('error', 'bad_slug');
  end if;
  v_id := public.kil_event_id_for_slug(p_slug);
  if v_id is null or not public.kil_row_owned(v_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if to_regclass('public.event_registrations') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', coalesce(buyer_name, ''),
          'email', coalesce(buyer_email, ''),
          'tier', 'RSVP',
          'quantity', 1,
          'checked_in', false,
          'at', created_at
        )), '[]'::jsonb)
        from public.event_registrations
        where event_slug = $1
      $q$ into regs using p_slug;
    exception when undefined_column then
      regs := '[]'::jsonb;
    end;
  end if;

  if to_regclass('public.orders') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', coalesce(buyer_name, ''),
          'email', coalesce(buyer_email, ''),
          'tier', coalesce(tier_name, ''),
          'quantity', coalesce(quantity, 1),
          'checked_in', coalesce(checked_in, false),
          'at', created_at
        )), '[]'::jsonb)
        from public.orders
        where event_id = $1
      $q$ into orders using v_id;
    exception when undefined_column or undefined_table then
      orders := '[]'::jsonb;
    end;
  end if;

  return coalesce(regs, '[]'::jsonb) || coalesce(orders, '[]'::jsonb);
end;
$$;

revoke all on function public.kil_event_customers(text) from public, anon;
grant execute on function public.kil_event_customers(text) to authenticated;
