-- DRAFT: NOT APPLIED. Grok applies to keepitil-prod after review; rollback beside it (20261128010100_events_insert_via_rpc_only.rollback.sql).
--
-- public.events: events are created only through the RPCs, never by a direct INSERT from a client.
--   Found 2026-11-27 (KODE, verified read-only on keepitil-prod): policy events_auth_insert (roles: public) allows ANY signed-in user
--   to insert a row with status draft/review and ANY other column: featured = true, show_on_explore, source, link_* fields, and an
--   owner_handle / submitted_by that is not theirs. anon and authenticated also still hold Supabase's default INSERT/UPDATE/DELETE.
--   Every legitimate insert already goes through SECURITY DEFINER RPCs, which choose the columns themselves and are unaffected:
--   create_event_with_tiers, create_event_series, duplicate_event, submit_community_event (and update_event,
--   update_community_event, archive_event, delete_event for changes). keepitil-web, keepitil-app and keepitil.github.io only
--   SELECT from events; #505 (self-serve events) also writes only through RPCs. Reads are unchanged (events_public_read,
--   events_owner_read). Whitelisting columns was the alternative; with no client insert left, removing the path is simpler and tighter.
begin;
drop policy if exists events_auth_insert on public.events;
revoke insert, update, delete, truncate, references, trigger on table public.events from anon, authenticated;
commit;
