-- 14A-02 ROLLBACK: PROPOSAL ONLY. Re-grants service_role EXECUTE on the two legacy functions (their captured ACL was {postgres, service_role}). Only needed if the v52 webhook must be restored.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(2979301232487107403);
SET LOCAL lock_timeout = '5s';
GRANT EXECUTE ON FUNCTION public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ticket_order(text,text) TO service_role;
SELECT 'legacy_executable_again' AS check_name, has_function_privilege('service_role','public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text)','EXECUTE') AND has_function_privilege('service_role','public.refund_ticket_order(text,text)','EXECUTE') AS ok;
COMMIT;
