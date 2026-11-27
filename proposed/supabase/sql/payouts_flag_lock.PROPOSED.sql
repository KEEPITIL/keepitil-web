-- =====================================================================================================
-- PROPOSED / NOT APPLIED. Payout-flag lock: a browser can no longer mark an organizer "payout ready".
-- Small, standalone and branched from main, so it can ship before the Stripe Connect work (#181). #181 rebases
-- on top later; it adds the 4 stripe_* status columns, the Edge Functions that read Stripe, and the page that
-- shows the status. Needs Joe's DDL OK + review.
--
-- Written against the byte-exact keepitil-prod baseline in proposed/supabase/baseline/ (read-only reads,
-- 2026-11-17). Tested in PGlite: proposed/supabase/tests/payouts-flag-lock.pglite.test.mjs.
--
-- The hole: any signed-in user can make themselves payout-ready with no Stripe check, two ways:
--   a) rpc('mark_payouts_enabled')   (create-event.html did this on ?payouts=done), and
--   b) a direct  update app_users set payouts_enabled = true, stripe_account_id = 'acct_...'  on their own row.
-- create-checkout trusts app_users.payouts_enabled.
--
-- After this runs, ONLY the server sets the two columns: service_role (Edge Functions with the service key, the
-- Supabase SQL editor) or a definer function that is not client-executable.
--   * stripe_account_id: the live connect-onboard (v51) already writes it with service_role -> still allowed.
--   * payouts_enabled: NOTHING live sets it from Stripe today (the page's rpc was the only route), so this PR adds
--     the minimal server path proposed/supabase/functions/connect-status, which reads the account from Stripe
--     and calls public.set_payouts_from_stripe below. The page calls it on ?payouts=done instead of the rpc.
--     DEPLOY connect-status (and the page) BEFORE or WITH this SQL, or new hosts cannot become payout-ready.
--
-- One transaction: PRECHECK -> changes -> VERIFY; any failure rolls everything back.
-- =====================================================================================================

begin;

-- PRECHECK: the live function is exactly the one this was written against (baseline md5).
do $$
begin
  if md5(pg_get_functiondef('public.mark_payouts_enabled()'::regprocedure)) <> '975786ee803b22f894ef01af63f20d5c' then
    raise exception 'PRECHECK: public.mark_payouts_enabled() differs from the 2026-11-17 baseline; re-review before applying';
  end if;
end $$;

-- 1) Path (a): the client can no longer call it. Revoked, not dropped, so an old page fails closed
--    ("permission denied"); drop it once the page change has shipped everywhere.
revoke execute on function public.mark_payouts_enabled() from public, anon, authenticated;

-- 2) Path (b), first layer: take back the explicit column grants. NOTE: this alone does NOT close (b), because
--    anon and authenticated still hold a table-level UPDATE/INSERT grant that covers every column. The trigger
--    in step 3 is what closes it; these revokes just stop advertising the columns as client-writable.
revoke update (stripe_account_id, payouts_enabled), insert (stripe_account_id, payouts_enabled)
  on public.app_users from anon, authenticated;

-- 3) Path (b), the real lock: nobody but the server may change the two columns, whatever grants or RLS say.
create or replace function public.guard_stripe_columns() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    if new.payouts_enabled or new.stripe_account_id is not null then
      raise exception 'payout fields can only be set by the server from Stripe' using errcode = '42501';
    end if;
  elsif new.payouts_enabled is distinct from old.payouts_enabled
     or new.stripe_account_id is distinct from old.stripe_account_id then
    raise exception 'payout fields can only be set by the server from Stripe' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_stripe_columns on public.app_users;
create trigger guard_stripe_columns before insert or update on public.app_users
  for each row execute function public.guard_stripe_columns();

-- 4) The server path (service_role only). payouts_enabled = Stripe says charges AND payouts enabled AND the
--    account is not disabled. Matched by the account id the server stored. Returns how many rows changed.
create or replace function public.set_payouts_from_stripe(p_account text, p_charges boolean, p_payouts boolean,
                                                          p_disabled_reason text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if p_account !~ '^acct_[A-Za-z0-9]+$' then raise exception 'not a Stripe account id'; end if;
  update public.app_users
     set payouts_enabled = (coalesce(p_charges, false) and coalesce(p_payouts, false) and p_disabled_reason is null)
   where stripe_account_id = p_account;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.set_payouts_from_stripe(text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.set_payouts_from_stripe(text, boolean, boolean, text) to service_role;

-- VERIFY: both client paths are closed; any failure aborts and rolls back.
do $$
declare f oid := 'public.mark_payouts_enabled()'::regprocedure;
begin
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
    raise exception 'VERIFY: anon or authenticated can still execute mark_payouts_enabled()';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = f and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'VERIFY: PUBLIC can still execute mark_payouts_enabled()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'guard_stripe_columns'
                  and tgrelid = 'public.app_users'::regclass and not tgisinternal and tgenabled <> 'D') then
    raise exception 'VERIFY: trigger guard_stripe_columns is missing or disabled on public.app_users';
  end if;
  if has_function_privilege('authenticated', 'public.set_payouts_from_stripe(text, boolean, boolean, text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.set_payouts_from_stripe(text, boolean, boolean, text)'::regprocedure, 'EXECUTE') then
    raise exception 'VERIFY: a client role can execute set_payouts_from_stripe';
  end if;
  if has_column_privilege('authenticated', 'public.app_users', 'payouts_enabled', 'UPDATE')
     and not has_table_privilege('authenticated', 'public.app_users', 'UPDATE') then
    raise exception 'VERIFY: column grant still present';   -- (only reachable if the table grant was removed)
  end if;
end $$;

commit;

-- Before any apply (checklist):
--  [x] live baseline read (proposed/supabase/baseline/); PRECHECK pins mark_payouts_enabled() by md5
--  [x] live connect-onboard v51 writes stripe_account_id with service_role (Kode, read-only): the trigger allows it
--  [x] nothing live sets payouts_enabled from Stripe (stripe-webhook v52 has no account.updated branch)
--  [ ] deploy connect-status (this PR) and the create-event.html change BEFORE or WITH this SQL
--  [ ] the ONE user with payouts_enabled = true today is NOT payout-ready per Stripe: their first connect-status
--      check will correctly set it to false (the lock itself keeps the current value; it does not reset it)
