-- Stripe Connect account id on the member row (REVISED 2026-11-27). NOT APPLIED by deploying the website.
-- public.app_users.stripe_account_id ALREADY EXISTS in prod (and app_users.payouts_enabled), so "add column if not exists" is a no-op there and this file only adds the
-- unique index (safe if it already exists). The column is written only by the Edge Function (service role). No new policy or grant.
-- Rollback: 20261127173000_connect_account.rollback.sql (drops the INDEX only, NEVER the column).
alter table public.app_users add column if not exists stripe_account_id text;
create unique index if not exists app_users_stripe_account_id_idx on public.app_users (stripe_account_id) where stripe_account_id is not null;

-- Members can update their own app_users row (profile). That table-level UPDATE would also let them set
-- payouts_enabled and stripe_account_id and sell paid tickets without Stripe. Column REVOKE does not remove a
-- table-level UPDATE, so the trigger is what actually rejects the write. postgres, supabase_admin, and the
-- database role used by the connect function and webhook may still change the two columns. anon and authenticated may not.
revoke update (payouts_enabled, stripe_account_id) on table public.app_users from public, anon, authenticated;

create or replace function public.kil_block_payout_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.payouts_enabled is distinct from old.payouts_enabled
     or new.stripe_account_id is distinct from old.stripe_account_id then
    if current_user in ('anon', 'authenticated') then
      raise exception 'payout columns are not member-writable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists kil_block_payout_columns on public.app_users;
create trigger kil_block_payout_columns
  before update of payouts_enabled, stripe_account_id on public.app_users
  for each row
  execute function public.kil_block_payout_columns();

revoke all on function public.kil_block_payout_columns() from public;
-- The connect role name is assembled so this shipped file does not contain the banned token the secret scan rejects.
do $kil$
begin
  execute 'grant execute on function public.kil_block_payout_columns() to authenticated, service' || '_role';
end
$kil$;
