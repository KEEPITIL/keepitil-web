-- Rollback for 20261128010000_event_orders_no_client_writes.sql: restores the grants and the policy exactly as found on keepitil-prod 2026-11-27.
begin;
grant insert, update, delete, truncate, references, trigger on table public.event_orders to anon, authenticated;
create policy event_orders_organizer_update on public.event_orders for update to authenticated
  using (event_id in (select events.id from public.events where events.owner_handle = public.my_handle()))
  with check (event_id in (select events.id from public.events where events.owner_handle = public.my_handle()));
commit;
