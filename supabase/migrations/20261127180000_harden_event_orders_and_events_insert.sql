-- Hardening: event_orders client writes and direct events inserts. DRAFT, NOT APPLIED. Backup + Grok sha GO + Joe GO first.
-- Rollback: 20261127180000_harden_event_orders_and_events_insert.rollback.sql. Found while reviewing #505 (2026-11-27), read-only look at keepitil-prod.
--
-- 1) public.event_orders. Today: anon AND authenticated hold UPDATE and DELETE (and anon SELECT) as table grants, and the policy event_orders_organizer_update lets
--    any organizer update ANY column of every order on their events (status, qty, amount_cents, buyer_email, checked_in_at...). No client code writes event_orders
--    (profile-ig.js only reads it); orders are written by fulfill_ticket_order / refund_ticket_order (security definer) and check-in is the RPCs check_in_ticket(p_qr) and
--    event_checkin_scan(p_qr_token) (security definer). So: drop the organizer UPDATE policy and revoke UPDATE / DELETE from anon and authenticated.
--    The two SELECT policies for organizers and buyers are untouched (organizers keep reading their own attendees).
-- 2) public.events direct INSERT. Today events_auth_insert lets any signed-in user insert a draft/review row with ANY column, including featured, source, link_status,
--    event_password_hash, dedupe_key and another member's owner_handle. Now INSERT is a column whitelist (content columns only; featured keeps its default false and
--    source / source_url / imported_at / dedupe_key / review_reason / password hash / link_* cannot be set by a client), and the policy also requires status draft or
--    review, submitted_by = the caller and owner_handle = the caller's handle (or none). No client code inserts into events directly (all writes are RPCs).
--    anon loses its table-level INSERT / UPDATE / DELETE on events (RLS already denied them; this removes the grant too).

-- event_orders
drop policy if exists event_orders_organizer_update on public.event_orders;
revoke update, delete on public.event_orders from anon, authenticated;

-- events: anon never writes; authenticated may insert only whitelisted columns
revoke insert, update, delete on public.events from anon;
revoke insert on public.events from authenticated;
grant insert (slug, title, tagline, description, venue, city, starts_at, ends_at, cover_url, genres, status, reg_questions, tz, owner_handle, submitted_by,
              show_lineup, show_gallery, show_feed, end_time_public, waitlist_enabled, hide_guest_count, show_on_explore, spotify_url, youtube_url, title_font, accent_color, features, gallery)
  on public.events to authenticated;
drop policy if exists events_auth_insert on public.events;
create policy events_auth_insert on public.events for insert to authenticated
  with check (auth.uid() is not null and status in ('draft', 'review') and submitted_by = auth.uid() and (owner_handle is null or owner_handle = public.my_handle()));
