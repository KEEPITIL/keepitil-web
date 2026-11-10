-- FOLLOWUP-13A-14A_orders_PROPOSED_SKETCH.sql
-- SKETCH ONLY. NOT PART OF 12A. NOT A REVIEWED PACK (no drift guard, no rollback pack, no advisory lock yet). NOT APPLIED ANYWHERE.
-- Proven ONLY on the replica (proof test A04). Before it can become a 13A/14A pack it needs, at minimum:
--   1. the real checkout / Stripe-webhook write path identified (grep found NO client-side INSERT into event_orders in keepitil-web or keepitil-app; profile.html only READS it
--      and says "the ticket webhook writes" it) and confirmed to use service_role (which keeps ALL here and bypasses RLS). If checkout inserts as anon/authenticated, dropping
--      orders_anon_insert breaks sales: DO NOT APPLY until that is known.
--   2. the legitimate organizer WRITE use case (if any) on event_orders found; this sketch removes organizer UPDATE entirely.
--   3. PRECHECK-12A Q13 qr_duplicate_surplus_rows = 0 (the UNIQUE index below fails otherwise) and a decision on what to do with any existing forged/duplicate rows.
--   4. the standard pack frame: repo-wide advisory lock first, drift guard, ROLLBACK pack restoring the captured policies/ACLs exactly, POSTCHECKS, DRIFT_QUERY.
BEGIN;
-- A01 forged paid orders: nobody but service_role may insert.
DROP POLICY orders_anon_insert ON public.event_orders;
-- A02 organizer can rewrite status/qr_token/checked_in_at: remove the UPDATE path (a column-limited UPDATE grant can be added back once the legitimate need is known).
DROP POLICY event_orders_organizer_update ON public.event_orders;
-- A03 table-level ALL (incl. TRUNCATE/MAINTAIN) for anon and authenticated: reduce to what the surviving SELECT policies need.
REVOKE ALL ON TABLE public.event_orders FROM anon, authenticated;
GRANT SELECT ON TABLE public.event_orders TO authenticated;
-- qr_token has no UNIQUE constraint: make a duplicate impossible (the 12A door already refuses duplicates as ambiguous).
CREATE UNIQUE INDEX event_orders_qr_token_key ON public.event_orders (qr_token) WHERE qr_token IS NOT NULL;
COMMIT;
