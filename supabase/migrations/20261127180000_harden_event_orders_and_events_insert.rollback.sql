-- Rollback for 20261127180000_harden_event_orders_and_events_insert.sql: puts back the grants and policies exactly as read in keepitil-prod on 2026-11-27.
-- Backup + written GO first.
-- event_orders: client UPDATE / DELETE grants and the organizer UPDATE policy
grant update, delete on public.event_orders to anon, authenticated;
drop policy if exists event_orders_organizer_update on public.event_orders;
create policy event_orders_organizer_update on public.event_orders for update to authenticated
  using (event_id in (select events.id from public.events where events.owner_handle = public.my_handle()))
  with check (event_id in (select events.id from public.events where events.owner_handle = public.my_handle()));
-- events: table-level INSERT / UPDATE / DELETE for anon and INSERT for authenticated, and the original any-column policy
revoke insert on public.events from authenticated;
grant insert, update, delete on public.events to anon;
grant insert on public.events to authenticated;
drop policy if exists events_auth_insert on public.events;
create policy events_auth_insert on public.events for insert
  with check ((auth.uid() is not null) and (status = any (array['draft', 'review'])));
