-- ROLLBACK for event_orders_guard.PROPOSED.sql. Restores the live state (no user triggers on event_orders).
-- NOTE: this REOPENS the organizer write hole. Use only to back out a bad apply.
begin;
do $pre$ begin
  if to_regprocedure('public.event_orders_guard_columns()') is null then
    raise exception 'PRECHECK: guard not present; nothing to roll back';
  end if;
end $pre$;
drop trigger if exists event_orders_guard_columns on public.event_orders;
drop function public.event_orders_guard_columns();
do $ver$ begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.event_orders'::regclass and not tgisinternal) then
    raise exception 'VERIFY: event_orders still has user triggers';
  end if;
  if to_regprocedure('public.event_orders_guard_columns()') is not null then raise exception 'VERIFY: guard function remains'; end if;
end $ver$;
commit;
