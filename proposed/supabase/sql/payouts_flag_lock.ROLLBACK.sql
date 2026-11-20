-- =====================================================================================================
-- ROLLBACK for payouts_flag_lock.PROPOSED.sql (PROPOSED / NOT APPLIED). Undo plan for the 9 AM go-live.
-- Returns keepitil-prod to the 2026-11-17 live baseline (proposed/supabase/baseline/):
--   * drops what the lock added: trigger guard_stripe_columns, function guard_stripe_columns(),
--     writer set_payouts_from_stripe(text, boolean, boolean, text);
--   * re-grants EXACTLY the live ACLs: EXECUTE on mark_payouts_enabled() to PUBLIC, anon, authenticated
--     (service_role kept it), and the 8 explicit column grants: UPDATE + INSERT on stripe_account_id and
--     payouts_enabled for anon and for authenticated (authenticated's SELECT on payouts_enabled was never touched).
-- WARNING: this REOPENS the hole (any signed-in user can mark themselves payout-ready). Use only to undo a bad
-- deploy; connect-status (if deployed) keeps working, but its writer is gone, so it will report an error.
-- Values written while the lock was on (payouts_enabled set by connect-status) are kept as they are.
-- One transaction: PRECHECK -> undo -> VERIFY; any failure rolls everything back.
-- =====================================================================================================

begin;

-- PRECHECK: mark_payouts_enabled() itself must still be the live baseline (the lock never changes its body).
do $$
begin
  if md5(pg_get_functiondef('public.mark_payouts_enabled()'::regprocedure)) <> '975786ee803b22f894ef01af63f20d5c' then
    raise exception 'PRECHECK: public.mark_payouts_enabled() differs from the 2026-11-17 baseline; re-review before rolling back';
  end if;
end $$;

-- 1) Remove what the lock added (safe if already gone).
drop trigger if exists guard_stripe_columns on public.app_users;
drop function if exists public.guard_stripe_columns();
drop function if exists public.set_payouts_from_stripe(text, boolean, boolean, text);

-- 2) Re-grant exactly the live ACLs.
grant execute on function public.mark_payouts_enabled() to public, anon, authenticated;
grant update (stripe_account_id, payouts_enabled), insert (stripe_account_id, payouts_enabled) on public.app_users to anon, authenticated;

-- VERIFY: back to the baseline, exactly.
do $$
declare
  f oid := 'public.mark_payouts_enabled()'::regprocedure;
  cols text;
begin
  if md5(pg_get_functiondef(f)) <> '975786ee803b22f894ef01af63f20d5c' then
    raise exception 'VERIFY: mark_payouts_enabled() is not the baseline';
  end if;
  if not (has_function_privilege('anon', f, 'EXECUTE') and has_function_privilege('authenticated', f, 'EXECUTE')
          and has_function_privilege('service_role', f, 'EXECUTE')
          and exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where p.oid = f and a.grantee = 0 and a.privilege_type = 'EXECUTE')) then
    raise exception 'VERIFY: EXECUTE on mark_payouts_enabled() is not back for PUBLIC, anon, authenticated and service_role';
  end if;
  select string_agg(r.rolname || ':' || a.privilege_type || ':' || att.attname, ','
                    order by r.rolname || ':' || a.privilege_type || ':' || att.attname) into cols
    from pg_attribute att, aclexplode(att.attacl) a, pg_roles r
   where att.attrelid = 'public.app_users'::regclass and att.attname in ('stripe_account_id', 'payouts_enabled')
     and a.grantee = r.oid and r.rolname in ('anon', 'authenticated');
  if cols is distinct from
     'anon:INSERT:payouts_enabled,anon:INSERT:stripe_account_id,anon:UPDATE:payouts_enabled,anon:UPDATE:stripe_account_id,'
     'authenticated:INSERT:payouts_enabled,authenticated:INSERT:stripe_account_id,authenticated:SELECT:payouts_enabled,'
     'authenticated:UPDATE:payouts_enabled,authenticated:UPDATE:stripe_account_id' then
    raise exception 'VERIFY: column grants differ from the baseline: %', cols;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'guard_stripe_columns' and not tgisinternal)
     or to_regprocedure('public.guard_stripe_columns()') is not null
     or to_regprocedure('public.set_payouts_from_stripe(text, boolean, boolean, text)') is not null then
    raise exception 'VERIFY: something the lock added is still present';
  end if;
end $$;

commit;
