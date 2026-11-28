-- Owner-only attendee read (REVISED against the real keepitil-prod schema, 2026-11-27). NOT APPLIED by deploying the website.
-- Apply after 20261127170000_self_serve_publish.sql (uses kil_row_owned, kil_event_id_for_slug from 171000). Rollback: 20261127172000_owner_attendees.rollback.sql.
--
-- SCHEMA DRIFT FIXED: there is no public.orders / public.tickets. Paid orders are public.event_orders (event_id, tier_id, buyer_email, buyer_handle, qty, status,
-- checked_in_at, created_at; status 'paid') and RSVPs are public.event_registrations (event_id, event_slug, buyer_name, buyer_email, created_at). The first draft
-- looked for the wrong tables inside exception handlers, so it would have returned an empty paid list and looked fine. This version reads the real tables with static
-- SQL, no exception handler: if a table or column is missing the function does not create / does not run (it fails CLOSED, never open and never silently empty).
-- Only the event's owner (kil_row_owned) can call it; anyone else gets 'forbidden'.

create or replace function public.kil_event_customers(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'not_authenticated'); end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,200}$' then return jsonb_build_object('error', 'bad_slug'); end if;
  v_id := public.kil_event_id_for_slug(p_slug);
  if v_id is null or not public.kil_row_owned(v_id) then return jsonb_build_object('error', 'forbidden'); end if;
  return coalesce((
    select jsonb_agg(x.row order by x.at desc) from (
      select jsonb_build_object('name', coalesce(r.buyer_name, ''), 'email', coalesce(r.buyer_email, ''), 'tier', 'RSVP', 'quantity', 1, 'checked_in', false, 'at', r.created_at) as row, r.created_at as at
        from public.event_registrations r where r.event_id = v_id
      union all
      select jsonb_build_object('name', coalesce(o.buyer_handle, ''), 'email', coalesce(o.buyer_email, ''), 'tier', coalesce(t.name, ''), 'quantity', coalesce(o.qty, 1),
                                'checked_in', o.checked_in_at is not null, 'at', o.created_at), o.created_at
        from public.event_orders o left join public.ticket_tiers t on t.id = o.tier_id where o.event_id = v_id and o.status = 'paid'
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.kil_event_customers(text) from public, anon;
grant execute on function public.kil_event_customers(text) to authenticated;
