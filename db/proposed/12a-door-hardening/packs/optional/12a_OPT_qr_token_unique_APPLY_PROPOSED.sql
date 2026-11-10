-- 12a_OPT_qr_token_unique_APPLY_PROPOSED.sql: OPTIONAL pack, step 1 of 3. PROPOSAL ONLY. NOT part of the 12A apply chain. NOT transactional BY DESIGN.
--
-- WHY NO BEGIN/COMMIT, NO ADVISORY LOCK, NO DRIFT-GUARD DO BLOCK: CREATE INDEX CONCURRENTLY cannot run inside a transaction block (SQLSTATE 25001). Running it in a
-- transaction would force the plain CREATE UNIQUE INDEX, which takes a SHARE lock on event_orders and blocks every order write (checkout, fulfilment, refunds) while it builds.
-- The proof (U05) shows the in-transaction attempt is refused. So this file is a runbook of THREE separately executed statements; run each one on its own (one statement per call, autocommit).
--
-- PRECONDITIONS (all must hold; STOP otherwise):
--   1. 12a_OPT_qr_token_unique_PRECHECK.sql: OPT_Q4_gate proceed = true (zero duplicate tokens; index name free). With duplicates present the build FAILS (23505) and leaves an INVALID index behind (proof U03).
--   2. ORDER: apply AFTER 13A. 13A's drift guard asserts the exact index list {event_orders_pkey, event_orders_qr_token_idx, event_orders_session_tier_uidx, orders_event_idx}; an extra index
--      before 13A makes 13A abort with DRIFT (safe, but it would block 13A). 12A's own guard looks at constraints, not indexes, so 12A is unaffected either way.
--   3. Run it in a quiet window; CONCURRENTLY waits for older transactions to finish. No other pack may run at the same time (there is no advisory lock here).
--   4. Joe's relayed yes + a Sentinel pass + a backup (the standing apply gate). This optional pack has NOT been reviewed by Sentinel.
--
-- Statement 1 of 3: bound lock waits for this session.
SET lock_timeout = '5s';

-- Statement 2 of 3: the build. Partial, so NULL tokens (rows that have none) never collide. NO "IF NOT EXISTS" on purpose: an INVALID leftover index of the same name would be silently
-- skipped by IF NOT EXISTS; the PRECHECK gate (name free) plus the POSTCHECK (indisvalid) are the guards instead.
CREATE UNIQUE INDEX CONCURRENTLY event_orders_qr_token_key ON public.event_orders (qr_token) WHERE qr_token IS NOT NULL;

-- Statement 3 of 3: restore the session setting.
RESET lock_timeout;
-- THEN run 12a_OPT_qr_token_unique_POSTCHECK_PROPOSED.sql and retain its output. If any row is not ok (e.g. the build failed and left an INVALID index): run the ROLLBACK file, fix the cause, retry.
