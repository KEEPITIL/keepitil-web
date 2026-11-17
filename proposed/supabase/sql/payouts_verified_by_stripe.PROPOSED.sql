-- =====================================================================================================
-- PROPOSED / NOT APPLIED. Stripe Connect payouts: payouts_enabled is set ONLY from a Stripe account the
-- SERVER read (connect-status refresh or the verified account.updated webhook). Needs Joe's DDL OK + review.
-- Tested only in PGlite (proposed/supabase/tests/payouts-sql.pglite.test.mjs) against a STAND-IN of the live
-- objects (app_users and mark_payouts_enabled), reconstructed from how create-event.html uses them and KODE's
-- description ("client-callable, no Stripe check"). Read the live definitions before any review for apply.
--
-- The bug this fixes: create-event.html calls supa.rpc('mark_payouts_enabled') when the browser returns with
-- ?payouts=done, so any signed-in user can mark themselves payout-ready without Stripe; create-checkout then
-- trusts app_users.payouts_enabled.
-- =====================================================================================================

-- 1) Status columns the server keeps from Stripe (all default to "not ready").
alter table public.app_users
  add column if not exists stripe_charges_enabled  boolean not null default false,
  add column if not exists stripe_requirements_due text[]  not null default '{}',
  add column if not exists stripe_disabled_reason  text,
  add column if not exists stripe_status_checked_at timestamptz;

-- 2) The client can no longer claim payouts. Revoked (not dropped) so an old page fails closed with
--    "permission denied"; drop it once the page change has shipped.
revoke execute on function public.mark_payouts_enabled() from public, anon, authenticated;

-- 3) Nobody but the server may change the Stripe columns, whatever table grants or RLS policies app_users has
--    (a column-level REVOKE does not override a table-level UPDATE grant, so this is a trigger).
create or replace function public.guard_stripe_columns() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    if new.payouts_enabled or new.stripe_account_id is not null or new.stripe_charges_enabled
       or new.stripe_requirements_due <> '{}' or new.stripe_disabled_reason is not null or new.stripe_status_checked_at is not null then
      raise exception 'payout fields can only be set by the server from Stripe' using errcode = '42501';
    end if;
  elsif new.payouts_enabled is distinct from old.payouts_enabled
     or new.stripe_account_id is distinct from old.stripe_account_id
     or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
     or new.stripe_requirements_due is distinct from old.stripe_requirements_due
     or new.stripe_disabled_reason is distinct from old.stripe_disabled_reason
     or new.stripe_status_checked_at is distinct from old.stripe_status_checked_at then
    raise exception 'payout fields can only be set by the server from Stripe' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_stripe_columns on public.app_users;
create trigger guard_stripe_columns before insert or update on public.app_users
  for each row execute function public.guard_stripe_columns();

-- 4) Server-only writers (service_role). Called by the proposed Edge Functions; never by a browser.
-- Store a newly created Stripe account id; never replaces an existing one.
create or replace function public.set_stripe_account_id(p_user uuid, p_account text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_account !~ '^acct_[A-Za-z0-9]+$' then raise exception 'not a Stripe account id'; end if;
  update public.app_users set stripe_account_id = p_account where id = p_user and stripe_account_id is null;
  return found;
end $$;

-- Write the status read from Stripe. payouts_enabled = charges AND payouts enabled AND no disabled_reason.
create or replace function public.set_payouts_from_stripe(p_account text, p_charges boolean, p_payouts boolean,
                                                          p_due text[], p_disabled_reason text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.app_users set
    payouts_enabled          = (coalesce(p_charges, false) and coalesce(p_payouts, false) and p_disabled_reason is null),
    stripe_charges_enabled   = coalesce(p_charges, false),
    stripe_requirements_due  = coalesce(p_due, '{}'),
    stripe_disabled_reason   = p_disabled_reason,
    stripe_status_checked_at = now()
  where stripe_account_id = p_account;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.set_stripe_account_id(uuid, text) from public, anon, authenticated;
revoke all on function public.set_payouts_from_stripe(text, boolean, boolean, text[], text) from public, anon, authenticated;
grant execute on function public.set_stripe_account_id(uuid, text) to service_role;
grant execute on function public.set_payouts_from_stripe(text, boolean, boolean, text[], text) to service_role;

-- Review checklist before any apply:
--  [ ] read the LIVE app_users definition, its grants/policies and mark_payouts_enabled(); adjust the stand-in test
--  [ ] signed-in user: rpc('mark_payouts_enabled') -> permission denied; payouts_enabled unchanged
--  [ ] signed-in user: update/insert of any Stripe column -> refused; other own-profile fields still update
--  [ ] only service_role can run set_stripe_account_id / set_payouts_from_stripe
--  [ ] existing rows: decide whether to re-verify every payouts_enabled = true user via connect-status before
--      relying on the flag (the old flag may have been set by the client)
