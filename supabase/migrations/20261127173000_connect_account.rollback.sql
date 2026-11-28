-- Rollback for 20261127173000_connect_account.sql. Drops the unique INDEX and the member-write block only.
-- It must NEVER drop app_users.stripe_account_id: that column existed in prod before this migration and the live connect-onboard / connect-webhook functions use it.
drop trigger if exists kil_block_payout_columns on public.app_users;
drop function if exists public.kil_block_payout_columns();
grant update (payouts_enabled, stripe_account_id) on table public.app_users to anon, authenticated;
grant insert (payouts_enabled, stripe_account_id) on table public.app_users to anon, authenticated;
grant execute on function public.mark_payouts_enabled() to public, anon, authenticated;
drop index if exists public.app_users_stripe_account_id_idx;
