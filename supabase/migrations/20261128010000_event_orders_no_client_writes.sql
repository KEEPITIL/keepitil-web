-- DRAFT: NOT APPLIED. Grok applies to keepitil-prod after review; rollback beside it (20261128010000_event_orders_no_client_writes.rollback.sql).
-- No workflow in keepitil-web runs files in this folder.
--
-- public.event_orders: clients can no longer write ticket orders directly.
--   Found 2026-11-27 (KODE, verified read-only on keepitil-prod):
--   * anon and authenticated still hold Supabase's default UPDATE / DELETE (+ TRUNCATE, REFERENCES, TRIGGER) on the table. RLS
--     blocks anon today only because no policy matches; one careless policy would open it.
--   * policy event_orders_organizer_update lets an organizer rewrite ANY column of their events' orders (amount_cents,
--     application_fee_cents, status, buyer_email, stripe_* ids, qr_token, checked_in_at ...).
--   Every legitimate write already goes through SECURITY DEFINER functions, which run as their owner and are unaffected:
--   check_in_ticket, event_checkin_scan (check-in), refund_ticket_order, fulfill_ticket_order (webhook, service role),
--   account_anonymise_user_refs. No client (keepitil-web, keepitil-app, keepitil.github.io) writes event_orders directly; they
--   only SELECT, which stays as it is (event_orders_organizer_read, event_orders_owner_read).
begin;
drop policy if exists event_orders_organizer_update on public.event_orders;
revoke insert, update, delete, truncate, references, trigger on table public.event_orders from anon, authenticated;
commit;
