-- 14A-02 CUTOVER: PROPOSAL ONLY. Run ONLY AFTER the new stripe-webhook (v53, which calls the v2 functions) is deployed and verified.
-- Removes service_role EXECUTE on the legacy fulfill_ticket_order / refund_ticket_order so no caller can bypass the ledger, reconciliation and atomic capacity. Bodies are NOT touched (captured baselines stay as they are).
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(2979301232487107403);
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF to_regprocedure('public.fulfill_ticket_order_v2(text,text,text,bigint,jsonb,text,integer,text,integer,text)') IS NULL THEN RAISE EXCEPTION '14A-02: apply 14A-01 first'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.refund_ticket_order(text,text) FROM service_role;
SELECT 'legacy_not_executable_by_clients' AS check_name, NOT has_function_privilege('service_role','public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text)','EXECUTE')
   AND NOT has_function_privilege('service_role','public.refund_ticket_order(text,text)','EXECUTE')
   AND NOT has_function_privilege('anon','public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text)','EXECUTE')
   AND NOT has_function_privilege('authenticated','public.refund_ticket_order(text,text)','EXECUTE') AS ok;
COMMIT;
