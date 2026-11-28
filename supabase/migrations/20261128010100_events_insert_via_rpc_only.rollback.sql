-- Rollback for 20261128010100_events_insert_via_rpc_only.sql: restores the grants and the policy exactly as found on keepitil-prod 2026-11-27.
begin;
grant insert, update, delete, truncate, references, trigger on table public.events to anon, authenticated;
create policy events_auth_insert on public.events for insert to public
  with check ((auth.uid() is not null) and (status = any (array['draft'::text, 'review'::text])));
commit;
