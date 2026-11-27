-- PROPOSED — NOT APPLIED. Organizer write guard on public.event_orders, split out of #66 to ship alone.
-- Grok 2026-11-17 08:10 PT: fast-track the guard ALONE (trigger + PRECHECK/VERIFY/ROLLBACK). Joe/Grok GO before apply.
--
-- THE HOLE (live, read-only verified 2026-11-17): authenticated has table UPDATE on event_orders and the policy
-- event_orders_organizer_update (FOR UPDATE TO authenticated, own events; its WITH CHECK restricts rows, not columns) lets an organizer rewrite ANY
-- column of their own events' orders through the REST API: status, qty, amount_cents, application_fee_cents, event_id,
-- qr_token, buyer_email/handle, stripe_payment_intent / stripe_session_id. refund_ticket_order and the coming
-- refund-tickets match orders by payment intent, so a forged one can point a refund or webhook at the wrong order.
--
-- THE FIX: a BEFORE UPDATE trigger. A DIRECT client write (current_user anon / authenticated) may change checked_in_at
-- only; every other column is server-only. Server and definer paths run as their owner (postgres) or service_role and
-- are unaffected: check_in_ticket / event_checkin_scan (SECURITY DEFINER, set checked_in_at only), fulfill_ticket_order /
-- refund_ticket_order (definer, webhook). Keyed on current_user, NOT auth.uid(): inside a definer RPC auth.uid() is still
-- the caller, so a uid-keyed guard would refuse any server-side write of a non-check-in column made in a user's session
-- (check-in itself only writes checked_in_at and would pass either way).
--
-- EVIDENCE that nothing breaks (tower 1 sweep, 2026-11-17 08:0x): no client code in keepitil-web, keepitil-app or
-- thrive-app writes event_orders (no .update/.upsert/.insert/.delete, no REST PATCH); the only client use is a READ
-- (keepitil-web profile.html:3069, the buyer's own tickets). Policies and grants are left as they are (minimal change).
--
-- Same trigger as #66 (identical name + body). If this ships first, #66's PRECHECK "guard already exists" must be relaxed
-- to accept this exact definition (rebase note on #66).

begin;

-- PRECHECK
do $pre$
begin
  if to_regclass('public.event_orders') is null then raise exception 'PRECHECK: public.event_orders missing'; end if;
  if to_regprocedure('public.event_orders_guard_columns()') is not null then
    raise exception 'PRECHECK: event_orders_guard_columns already exists (applied before, or #66 is in); aborting';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.event_orders'::regclass and not tgisinternal) then
    raise exception 'PRECHECK: event_orders has user triggers now (baseline had none); re-review';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_orders'
                  and policyname = 'event_orders_organizer_update') then
    raise exception 'PRECHECK: the live organizer update policy is not as baselined; re-review';
  end if;
end
$pre$;

create function public.event_orders_guard_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated')
     and (to_jsonb(new) - 'checked_in_at') is distinct from (to_jsonb(old) - 'checked_in_at') then
    raise exception 'event_orders: only checked_in_at can be changed directly; money, status and refund columns are server-only'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.event_orders_guard_columns() from public, anon, authenticated;
create trigger event_orders_guard_columns before update on public.event_orders
  for each row execute function public.event_orders_guard_columns();

-- VERIFY
do $ver$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.event_orders'::regclass
                  and tgname = 'event_orders_guard_columns' and tgenabled = 'O') then
    raise exception 'VERIFY: the event_orders column guard is missing or disabled';
  end if;
  if has_function_privilege('anon', 'public.event_orders_guard_columns()', 'execute')
     or has_function_privilege('authenticated', 'public.event_orders_guard_columns()', 'execute') then
    raise exception 'VERIFY: the guard function is executable by clients';
  end if;
end
$ver$;

commit;
