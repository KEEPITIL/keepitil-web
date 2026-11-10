-- 12a_OPT_qr_token_unique_ROLLBACK_PROPOSED.sql: OPTIONAL pack, step 3 of 3 (back-out). PROPOSAL ONLY. Also NOT transactional (DROP INDEX CONCURRENTLY cannot run in a transaction block).
-- Use it (a) to remove a good index, (b) to remove the INVALID leftover of a failed build, (c) BEFORE rolling back 13A (13A's rollback guard expects the original four indexes).
-- Dropping the index changes no data. The 12A door keeps working either way (it never depended on the index; it refuses duplicated tokens itself).
-- Statement 1 of 2:
SET lock_timeout = '5s';
-- Statement 2 of 2:
DROP INDEX CONCURRENTLY IF EXISTS public.event_orders_qr_token_key;
-- THEN verify (read-only): SELECT to_regclass('public.event_orders_qr_token_key') IS NULL AS index_gone;
