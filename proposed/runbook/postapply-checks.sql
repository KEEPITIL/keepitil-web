-- STEP 1 runbook, post-apply checks (READ-ONLY: no writes, safe to run any time).
-- Every row must say ok = t after both SQL files are applied. Any f → the stop rule (roll back, report).
-- Before the apply, the guard / lock rows read f (that is the live hole), which is how the dry-run proves the checks
-- can fail.
select check_name, ok from (values
  -- #67 event_orders organizer write guard
  (1, 'event_orders guard trigger present and enabled',
      exists (select 1 from pg_trigger where tgrelid = 'public.event_orders'::regclass
                 and tgname = 'event_orders_guard_columns' and tgenabled = 'O' and not tgisinternal)),
  (2, 'guard function not executable by anon / authenticated',
      to_regprocedure('public.event_orders_guard_columns()') is not null
      and not has_function_privilege('anon', 'public.event_orders_guard_columns()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.event_orders_guard_columns()', 'EXECUTE')),
  (3, 'door check-in functions unchanged (md5 = baseline)',
      md5(pg_get_functiondef('public.check_in_ticket(text)'::regprocedure)) = 'bc0a07ce552ea84acd4c0130a5cf8df3'
      and md5(pg_get_functiondef('public.event_checkin_scan(text)'::regprocedure)) = 'd6f2977aa8a0f8eebaadfac021892cbb'),
  -- #182 payout-flag lock
  (4, 'mark_payouts_enabled not executable by PUBLIC / anon / authenticated',
      not has_function_privilege('anon', 'public.mark_payouts_enabled()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.mark_payouts_enabled()', 'EXECUTE')
      and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where p.oid = 'public.mark_payouts_enabled()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')),
  (5, 'mark_payouts_enabled body unchanged (md5 = baseline)',
      md5(pg_get_functiondef('public.mark_payouts_enabled()'::regprocedure)) = '975786ee803b22f894ef01af63f20d5c'),
  (6, 'guard_stripe_columns trigger present and enabled on app_users',
      exists (select 1 from pg_trigger where tgrelid = 'public.app_users'::regclass
                 and tgname = 'guard_stripe_columns' and tgenabled <> 'D' and not tgisinternal)),
  (7, 'set_payouts_from_stripe: service_role only',
      to_regprocedure('public.set_payouts_from_stripe(text,boolean,boolean,text)') is not null
      and has_function_privilege('service_role', 'public.set_payouts_from_stripe(text,boolean,boolean,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.set_payouts_from_stripe(text,boolean,boolean,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.set_payouts_from_stripe(text,boolean,boolean,text)', 'EXECUTE')),
  (8, 'no client column grants left on stripe_account_id / payouts_enabled (UPDATE, INSERT)',
      not exists (select 1 from pg_attribute att, aclexplode(att.attacl) a, pg_roles r
                   where att.attrelid = 'public.app_users'::regclass and att.attname in ('stripe_account_id', 'payouts_enabled')
                     and a.grantee = r.oid and r.rolname in ('anon', 'authenticated') and a.privilege_type in ('UPDATE', 'INSERT')))
) as t(n, check_name, ok)
order by n;
