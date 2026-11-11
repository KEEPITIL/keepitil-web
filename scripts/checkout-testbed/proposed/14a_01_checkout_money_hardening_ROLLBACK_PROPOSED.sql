-- 14A-01 ROLLBACK: PROPOSAL ONLY. Order of operations: (1) redeploy the previous stripe-webhook (v52) FIRST, (2) run this. Dropping the v2 functions while the new webhook is live makes it answer 500.
-- Drops ONLY the three v2 functions. The ledger tables are KEPT on purpose (they are evidence: which events were applied, which payments were refunded or disputed); drop them by hand only after Joe/Sentinel agree.
-- The baseline fulfill_ticket_order / refund_ticket_order were never modified, so nothing else needs restoring. If 14A-02 was applied, run 14a_02 ROLLBACK first (it re-grants the legacy functions).
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(2979301232487107403);
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF has_function_privilege('service_role', 'public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION '14A-01 rollback refused: legacy fulfill_ticket_order is not executable by service_role (14A-02 still applied?). Run the 14A-02 rollback first.'; END IF;
END $$;
DROP FUNCTION public.fulfill_ticket_order_v2(text,text,text,bigint,jsonb,text,integer,text,integer,text);
DROP FUNCTION public.refund_ticket_order_v2(text,text,text,boolean,integer);
DROP FUNCTION public.dispute_ticket_order(text,text,text);
SELECT 'v2_functions_gone' AS check_name, count(*) = 0 AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('fulfill_ticket_order_v2','refund_ticket_order_v2','dispute_ticket_order')
UNION ALL SELECT 'ledgers_kept', to_regclass('private.stripe_event_ledger') IS NOT NULL AND to_regclass('private.payment_ledger') IS NOT NULL AND to_regclass('private.order_hold') IS NOT NULL;
COMMIT;
