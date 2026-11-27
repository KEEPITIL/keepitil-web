-- Stripe Connect account id on the member row. NOT APPLIED by deploying the website.
-- Apply on keepitil-prod before the connect-onboard function can remember an account.
-- The column is written only by the Edge Function (service role). No new anon policy.

do $$
begin
  if to_regclass('public.app_users') is null then
    raise notice 'public.app_users is missing; stripe_account_id skipped';
    return;
  end if;
  execute 'alter table public.app_users add column if not exists stripe_account_id text';
  execute 'create unique index if not exists app_users_stripe_account_id_idx on public.app_users (stripe_account_id) where stripe_account_id is not null';
end $$;
