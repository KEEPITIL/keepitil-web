-- Rollback for 20261127170000_self_serve_publish.sql. Run on keepitil-prod only with a backup and a written GO.
-- Drops the functions this migration created and puts back the one policy it removed (recreated exactly as found on 2026-11-27).
drop function if exists public.kil_publish_own_event(jsonb, jsonb);
drop function if exists public.kil_update_own_event(text, jsonb, jsonb);
drop function if exists public.kil_publish_own_series(jsonb, jsonb, jsonb);
drop function if exists public.kil_insert_event(uuid, text, jsonb, jsonb, timestamptz, uuid);
drop function if exists public.kil_publish_room(int);
drop function if exists public.kil_tiers_problem(jsonb);
drop function if exists public.kil_event_has_sales(bigint);
drop function if exists public.kil_err(text, text);
drop function if exists public.kil_row_owned(bigint);
drop function if exists public.kil_caller_handle();
drop function if exists public.kil_bad_link(text);
-- from the first draft of this migration, if it was ever applied:
drop function if exists public.kil_force_published(text);
drop function if exists public.kil_events_apply(text, jsonb, jsonb);
drop function if exists public.kil_caller_is_admin();
drop policy if exists kil_events_owner_read on public.events;
drop policy if exists kil_events_owner_insert on public.events;
drop policy if exists kil_events_owner_update on public.events;
drop policy if exists kil_events_public_read on public.events;
-- the policy the migration dropped (pre-existing in prod):
drop policy if exists tiers_owner_insert on public.ticket_tiers;
create policy tiers_owner_insert on public.ticket_tiers for insert
  with check (is_admin() or (event_id in (select e.id from public.events e where e.owner_handle = my_handle())));
