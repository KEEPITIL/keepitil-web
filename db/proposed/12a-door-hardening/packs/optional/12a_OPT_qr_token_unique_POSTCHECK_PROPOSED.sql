-- 12a_OPT_qr_token_unique_POSTCHECK_PROPOSED.sql: OPTIONAL pack, step 2 of 3. READ-ONLY single SELECT: one row per fact (expected / actual / ok) plus 000_ALL_OK. Retain the output.
WITH i AS (SELECT x.indisunique, x.indisvalid, x.indisready, pg_get_expr(x.indpred, x.indrelid) AS pred, pg_get_indexdef(x.indexrelid) AS def, x.indrelid
             FROM pg_index x WHERE x.indexrelid = to_regclass('public.event_orders_qr_token_key')),
f(fact, expected, actual) AS (
  SELECT '001_index_exists', 'true', (SELECT count(*) = 1 FROM i)::text
  UNION ALL SELECT '002_on_event_orders', 'true', coalesce((SELECT (indrelid = to_regclass('public.event_orders')) FROM i), false)::text
  UNION ALL SELECT '003_unique', 'true', coalesce((SELECT indisunique FROM i), false)::text
  UNION ALL SELECT '004_valid', 'true', coalesce((SELECT indisvalid FROM i), false)::text
  UNION ALL SELECT '005_ready', 'true', coalesce((SELECT indisready FROM i), false)::text
  UNION ALL SELECT '006_partial_predicate', '(qr_token IS NOT NULL)', coalesce((SELECT pred FROM i), '(none)')
  UNION ALL SELECT '007_key_columns', 'true', coalesce((SELECT (def ~ '\(qr_token\)') FROM i), false)::text
  UNION ALL SELECT '008_no_other_invalid_index_on_orders', '0', (SELECT count(*) FROM pg_index WHERE indrelid = to_regclass('public.event_orders') AND NOT indisvalid)::text)
SELECT fact, expected, actual, (expected = actual) AS ok FROM f
UNION ALL SELECT '000_ALL_OK', 'true', (SELECT bool_and(expected = actual) FROM f)::text, (SELECT bool_and(expected = actual) FROM f)
ORDER BY 1;
