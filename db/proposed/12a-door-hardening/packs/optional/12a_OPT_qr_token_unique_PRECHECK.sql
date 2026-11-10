-- 12a_OPT_qr_token_unique_PRECHECK.sql: OPTIONAL pack, step 0 of 3. READ-ONLY aggregates and catalog facts (never a token value, never a row). PROPOSAL ONLY: nothing here has been run on prod.
-- Purpose: decide whether it is safe to add the partial UNIQUE index on event_orders.qr_token. This pack is NOT part of the required 12A apply chain and is NOT bundled with 12A.
-- Run in a READ ONLY transaction (BEGIN READ ONLY; ...; ROLLBACK;). The last row (OPT_Q4_gate) must read proceed = true; anything else = STOP.
SELECT 'OPT_Q1_existing_qr_indexes' AS q, c.relname::text AS index_name, x.indisunique AS is_unique, x.indisvalid AS is_valid, x.indisready AS is_ready, pg_get_indexdef(x.indexrelid) AS definition
  FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
 WHERE x.indrelid = to_regclass('public.event_orders') AND (pg_get_indexdef(x.indexrelid) ~ 'qr_token' OR c.relname = 'event_orders_qr_token_key') ORDER BY 2;

SELECT 'OPT_Q2_qr_token_duplicates' AS q, count(*) AS orders_total, count(qr_token) AS rows_with_token, count(DISTINCT qr_token) AS distinct_tokens,
       count(qr_token) - count(DISTINCT qr_token) AS duplicate_surplus_rows,
       (SELECT count(*) FROM (SELECT 1 FROM public.event_orders WHERE qr_token IS NOT NULL GROUP BY qr_token HAVING count(*) > 1) d) AS duplicated_token_groups,
       count(*) FILTER (WHERE qr_token IS NULL) AS null_tokens
  FROM public.event_orders;

SELECT 'OPT_Q3_size' AS q, (SELECT count(*) FROM public.event_orders) AS orders_rows, pg_total_relation_size('public.event_orders') AS table_bytes_incl_indexes,
       (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid() AND xact_start < now() - interval '1 minute') AS long_open_transactions;

SELECT 'OPT_Q4_gate' AS q,
       ((SELECT count(qr_token) - count(DISTINCT qr_token) FROM public.event_orders) = 0 AND to_regclass('public.event_orders_qr_token_key') IS NULL) AS proceed,
       (SELECT count(qr_token) - count(DISTINCT qr_token) FROM public.event_orders) AS duplicate_surplus_rows, (to_regclass('public.event_orders_qr_token_key') IS NOT NULL) AS index_name_already_taken;
