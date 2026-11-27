-- Rollback for 20261127173000_connect_account.sql. Drops the unique INDEX only.
-- It must NEVER drop app_users.stripe_account_id: that column existed in prod before this migration and the live connect-onboard / connect-webhook functions use it.
drop index if exists public.app_users_stripe_account_id_idx;
