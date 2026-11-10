-- ROLLBACK-1B-kind-check.sql : undo APPLY-1B. *** DDL on prod: needs a GO. *** Deletes every profile_content row with kind 'account_type_request' (the owners' business-type requests: DATA LOSS by design;
-- there is no other way to keep a row the 9-kind CHECK rejects). The guard refuses to delete unless you set kil.rollback_ok = 'yes' in this transaction, so you see the count first:
--   select count(*) from public.profile_content where kind = 'account_type_request';
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.profile_content WHERE kind = 'account_type_request') > 0 AND coalesce(current_setting('kil.rollback_ok', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'account_type_request rows exist; select set_config(''kil.rollback_ok'',''yes'',true); in this transaction to delete them';
  END IF;
END $$;
DELETE FROM public.profile_content WHERE kind = 'account_type_request';
ALTER TABLE public.profile_content DROP CONSTRAINT IF EXISTS profile_content_kind_check;
ALTER TABLE public.profile_content ADD CONSTRAINT profile_content_kind_check
  CHECK (kind = ANY (ARRAY['article','photo','show','chat','post','event','highlight','profile_categories','create_entry']::text[]));
COMMIT;
