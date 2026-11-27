-- Stripe Connect account id on the member row (REVISED 2026-11-27). NOT APPLIED by deploying the website.
-- public.app_users.stripe_account_id ALREADY EXISTS in prod (and app_users.payouts_enabled), so "add column if not exists" is a no-op there and this file only adds the
-- unique index (safe if it already exists). The column is written only by the Edge Function (service role). No new policy or grant.
-- Rollback: 20261127173000_connect_account.rollback.sql (drops the INDEX only, NEVER the column).
alter table public.app_users add column if not exists stripe_account_id text;
create unique index if not exists app_users_stripe_account_id_idx on public.app_users (stripe_account_id) where stripe_account_id is not null;
