-- 14A-01 CHECKOUT MONEY HARDENING: PROPOSAL ONLY. NOT APPLIED ANYWHERE. Needs Atlas + Sentinel review, a verified backup and Joe's relayed yes before any prod apply.
-- Adds (all NEW objects; the captured baseline functions fulfill_ticket_order / refund_ticket_order are NOT modified):
--   private.stripe_event_ledger   one row per Stripe event id: replayed events are no-ops (S2 ledger)
--   private.payment_ledger        one row per payment intent: refund / dispute state survives out-of-order delivery (Atlas 5, S3)
--   private.order_hold            prior status of an order cancelled by an open dispute, so a won dispute restores it exactly
--   public.fulfill_ticket_order_v2   server-side reconciliation (amount, currency, tier, event, per-tier price), ATOMIC capacity (tier row lock), ledger, no token in the return
--   public.refund_ticket_order_v2    full refund revokes; partial / pending refund only records; state kept if the refund arrives before the payment
--   public.dispute_ticket_order      dispute opened -> orders cancelled (held), won -> restored, lost -> inventory released
-- Every new SECURITY DEFINER function: SET search_path = '' (all references schema-qualified), owner postgres, EXECUTE only for service_role.
-- Frame: single transaction, advisory lock, lock_timeout, drift guards, POSTCHECKS (a result set of ok booleans). Roll back with 14a_01_..._ROLLBACK_PROPOSED.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(2979301232487107403);
SET LOCAL lock_timeout = '5s';

-- ---------- drift guards (abort on any surprise) ----------
DO $$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION '14A-01: run as postgres (got %)', current_user; END IF;
  IF to_regprocedure('public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text)') IS NULL THEN RAISE EXCEPTION '14A-01 drift: baseline fulfill_ticket_order missing'; END IF;
  IF to_regprocedure('public.refund_ticket_order(text,text)') IS NULL THEN RAISE EXCEPTION '14A-01 drift: baseline refund_ticket_order missing'; END IF;
  IF to_regclass('public.event_orders') IS NULL OR to_regclass('public.ticket_tiers') IS NULL THEN RAISE EXCEPTION '14A-01 drift: event_orders / ticket_tiers missing'; END IF;
  IF to_regclass('private.stripe_event_ledger') IS NOT NULL OR to_regclass('private.payment_ledger') IS NOT NULL OR to_regclass('private.order_hold') IS NOT NULL THEN RAISE EXCEPTION '14A-01 drift: a ledger table already exists'; END IF;
  IF to_regprocedure('public.fulfill_ticket_order_v2(text,text,text,bigint,jsonb,text,integer,text,integer,text)') IS NOT NULL
     OR to_regprocedure('public.refund_ticket_order_v2(text,text,text,boolean,integer)') IS NOT NULL
     OR to_regprocedure('public.dispute_ticket_order(text,text,text)') IS NOT NULL THEN RAISE EXCEPTION '14A-01 drift: a v2 function already exists'; END IF;
END $$;

-- schema private already exists in prod (owner postgres, no grants); create only when absent (replicas), never alter an existing one's grants
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- ---------- ledgers (private; postgres only; definer functions are the only writers) ----------
CREATE TABLE private.stripe_event_ledger (
  stripe_event_id text PRIMARY KEY,
  event_type      text NOT NULL,
  payment_intent  text,
  session_id      text,
  outcome         text NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.payment_ledger (
  payment_intent  text PRIMARY KEY,
  session_id      text,
  fully_refunded  boolean NOT NULL DEFAULT false,
  refunded_cents  integer NOT NULL DEFAULT 0,
  disputed        boolean NOT NULL DEFAULT false,
  dispute_lost    boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.order_hold (
  order_id     bigint PRIMARY KEY,
  prior_status text NOT NULL,
  held_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.stripe_event_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.payment_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.order_hold          ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.stripe_event_ledger, private.payment_ledger, private.order_hold FROM PUBLIC, anon, authenticated, service_role;

-- ---------- fulfill_ticket_order_v2 ----------
CREATE FUNCTION public.fulfill_ticket_order_v2(
  p_stripe_event_id text, p_session_id text, p_payment_intent text, p_event_id bigint, p_items jsonb,
  p_buyer_email text, p_app_fee_cents integer, p_organizer_acct text, p_amount_total integer, p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $f$
declare
  v_prior jsonb; v_pl private.payment_ledger%rowtype; v_handle text;
  v_items jsonb := '[]'::jsonb; r record; t record; v_total bigint := 0; v_reject text;
  v_status text; v_oid bigint; v_inserted int := 0; v_skipped int := 0; v_oversold int := 0; v_oversold_cents bigint := 0;
  v_blocked boolean := false; v_live boolean; v_held boolean; v_detail jsonb;
begin
  if p_stripe_event_id is null or p_session_id is null or p_event_id is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'fulfill_ticket_order_v2: event id, session, event_id and items[] are required';
  end if;
  -- 1. replay guard: a Stripe event id is applied at most once (the ledger row commits or rolls back WITH the effects below)
  insert into private.stripe_event_ledger (stripe_event_id, event_type, payment_intent, session_id, outcome)
    values (p_stripe_event_id, 'checkout.session', p_payment_intent, p_session_id, 'in_progress') on conflict (stripe_event_id) do nothing;
  if not found then
    select detail into v_prior from private.stripe_event_ledger where stripe_event_id = p_stripe_event_id;
    return jsonb_build_object('ok', true, 'duplicate', true) || coalesce(v_prior, '{}'::jsonb);
  end if;
  if p_payment_intent is null then
    v_reject := 'no_payment_intent';
  else
    -- 2. serialise with refunds / disputes of the same payment, and read their state (out-of-order delivery)
    insert into private.payment_ledger (payment_intent, session_id) values (p_payment_intent, p_session_id)
      on conflict (payment_intent) do update set session_id = coalesce(private.payment_ledger.session_id, excluded.session_id);
    select * into v_pl from private.payment_ledger where payment_intent = p_payment_intent for update;
  end if;
  -- 3. reconcile every line against the SERVER-SIDE price: tier exists, belongs to this event, unit price and currency match, quantities sane, total = what Stripe charged
  if v_reject is null then
    for r in
      select (e->>'t')::bigint as tier_id, sum(greatest(0, coalesce(nullif(e->>'q','')::int, 0)))::int as q, min(nullif(e->>'u','')::int) as u, count(distinct e->>'u') as nu
        from jsonb_array_elements(p_items) e where nullif(e->>'t','') is not null group by 1 order by 1
    loop
      select id, event_id, price_cents, coalesce(currency, 'usd') as currency, qty_total into t from public.ticket_tiers where id = r.tier_id for update;   -- row lock: capacity is decided under it
      if not found then v_reject := 'unknown_tier'; exit; end if;
      if t.event_id is distinct from p_event_id then v_reject := 'tier_event_mismatch'; exit; end if;
      if r.nu <> 1 or r.u is distinct from t.price_cents then v_reject := 'price_mismatch'; exit; end if;
      if r.q < 1 or r.q > 20 then v_reject := 'quantity_out_of_range'; exit; end if;
      if lower(coalesce(p_currency, '')) <> lower(t.currency) then v_reject := 'currency_mismatch'; exit; end if;
      v_total := v_total + (t.price_cents::bigint * r.q);
      v_items := v_items || jsonb_build_array(jsonb_build_object('t', r.tier_id, 'q', r.q, 'u', t.price_cents));
    end loop;
    if v_reject is null and (jsonb_array_length(v_items) = 0 or p_amount_total is null or p_amount_total::bigint <> v_total) then v_reject := 'amount_mismatch'; end if;
  end if;
  if v_reject is not null then
    v_detail := jsonb_build_object('rejected', v_reject);
    update private.stripe_event_ledger set outcome = 'rejected', detail = v_detail where stripe_event_id = p_stripe_event_id;
    return jsonb_build_object('ok', false, 'rejected', v_reject);
  end if;
  -- 4. already refunded / lost a dispute (refund arrived first) -> the payment is not a live ticket; open dispute -> held
  v_blocked := v_pl.fully_refunded or v_pl.dispute_lost;
  if p_buyer_email is not null then
    select au.handle into v_handle from auth.users u join public.app_users au on au.id = u.id where lower(u.email) = lower(p_buyer_email) limit 1;
  end if;
  for r in select (e->>'t')::bigint as tier_id, (e->>'q')::int as q, (e->>'u')::int as u from jsonb_array_elements(v_items) e order by 1 loop
    select id, qty_total, qty_sold into t from public.ticket_tiers where id = r.tier_id;   -- already locked above
    v_status := case when v_pl.fully_refunded then 'refunded' when v_pl.dispute_lost then 'cancelled' else 'paid' end;
    v_live := not v_blocked; v_held := false;
    if v_live and t.qty_total is not null and coalesce(t.qty_sold, 0) + r.q > t.qty_total then
      v_status := 'cancelled'; v_live := false; v_oversold := v_oversold + 1; v_oversold_cents := v_oversold_cents + (r.u::bigint * r.q);   -- capacity decided atomically under the tier lock
    elsif v_live and v_pl.disputed then v_status := 'cancelled'; v_held := true;                                                      -- dispute open: held, door refuses, inventory counted
    end if;
    insert into public.event_orders (event_id, tier_id, buyer_email, buyer_handle, qty, status, amount_cents, stripe_session_id, stripe_payment_intent, application_fee_cents, organizer_acct)
      values (p_event_id, r.tier_id, p_buyer_email, v_handle, r.q, v_status, r.u * r.q, p_session_id, p_payment_intent, p_app_fee_cents, p_organizer_acct)
      on conflict (stripe_session_id, tier_id) where stripe_session_id is not null do nothing returning id into v_oid;
    if v_oid is null then v_skipped := v_skipped + 1; continue; end if;
    v_inserted := v_inserted + 1;
    if v_live then update public.ticket_tiers set qty_sold = coalesce(qty_sold, 0) + r.q where id = r.tier_id; end if;
    if v_held then insert into private.order_hold (order_id, prior_status) values (v_oid, 'paid') on conflict do nothing; end if;
    v_oid := null;
  end loop;
  v_detail := jsonb_build_object('inserted', v_inserted, 'skipped_duplicate', v_skipped, 'oversold_lines', v_oversold, 'oversold_cents', v_oversold_cents, 'blocked', v_blocked);
  update private.stripe_event_ledger set outcome = case when v_oversold > 0 then 'oversold' when v_blocked then 'blocked' else 'fulfilled' end, detail = v_detail where stripe_event_id = p_stripe_event_id;
  return jsonb_build_object('ok', true, 'event_id', p_event_id) || v_detail;
end
$f$;

-- ---------- refund_ticket_order_v2 ----------
CREATE FUNCTION public.refund_ticket_order_v2(p_stripe_event_id text, p_session_id text, p_payment_intent text, p_full boolean, p_refunded_cents integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $f$
declare r record; v_n int := 0; v_hold int := 0; v_detail jsonb;
begin
  if p_stripe_event_id is null or p_payment_intent is null then raise exception 'refund_ticket_order_v2: event id and payment intent are required'; end if;
  insert into private.stripe_event_ledger (stripe_event_id, event_type, payment_intent, session_id, outcome) values (p_stripe_event_id, 'charge.refund', p_payment_intent, p_session_id, 'in_progress') on conflict (stripe_event_id) do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  insert into private.payment_ledger (payment_intent, session_id) values (p_payment_intent, p_session_id) on conflict (payment_intent) do nothing;
  perform 1 from private.payment_ledger where payment_intent = p_payment_intent for update;
  update private.payment_ledger set refunded_cents = greatest(refunded_cents, coalesce(p_refunded_cents, 0)), fully_refunded = fully_refunded or coalesce(p_full, false), updated_at = now() where payment_intent = p_payment_intent;
  if not coalesce(p_full, false) then
    v_detail := jsonb_build_object('partial', true, 'revoked', 0);
    update private.stripe_event_ledger set outcome = 'partial_recorded', detail = v_detail where stripe_event_id = p_stripe_event_id;
    return jsonb_build_object('ok', true) || v_detail;       -- a partial or still-pending refund NEVER revokes the order
  end if;
  for r in select o.id, o.tier_id, o.qty, o.status, (h.order_id is not null) as held from public.event_orders o left join private.order_hold h on h.order_id = o.id
            where o.stripe_payment_intent = p_payment_intent and (o.status = 'paid' or h.order_id is not null) order by o.id for update of o loop
    update public.event_orders set status = 'refunded' where id = r.id;
    update public.ticket_tiers set qty_sold = greatest(0, coalesce(qty_sold, 0) - r.qty) where id = r.tier_id;   -- held (disputed) orders still held inventory
    if r.held then delete from private.order_hold where order_id = r.id; v_hold := v_hold + 1; end if;
    v_n := v_n + 1;
  end loop;
  v_detail := jsonb_build_object('partial', false, 'revoked', v_n, 'released_from_hold', v_hold);
  update private.stripe_event_ledger set outcome = 'refunded', detail = v_detail where stripe_event_id = p_stripe_event_id;
  return jsonb_build_object('ok', true) || v_detail;
end
$f$;

-- ---------- dispute_ticket_order ----------
CREATE FUNCTION public.dispute_ticket_order(p_stripe_event_id text, p_payment_intent text, p_phase text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $f$
declare r record; v_n int := 0; v_detail jsonb;
begin
  if p_stripe_event_id is null or p_payment_intent is null or p_phase not in ('created', 'won', 'lost') then raise exception 'dispute_ticket_order: event id, payment intent and phase (created|won|lost) are required'; end if;
  insert into private.stripe_event_ledger (stripe_event_id, event_type, payment_intent, outcome) values (p_stripe_event_id, 'charge.dispute.' || p_phase, p_payment_intent, 'in_progress') on conflict (stripe_event_id) do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  insert into private.payment_ledger (payment_intent) values (p_payment_intent) on conflict (payment_intent) do nothing;
  perform 1 from private.payment_ledger where payment_intent = p_payment_intent for update;
  if p_phase = 'created' then
    update private.payment_ledger set disputed = true, updated_at = now() where payment_intent = p_payment_intent;
    for r in select id from public.event_orders where stripe_payment_intent = p_payment_intent and status = 'paid' order by id for update loop
      insert into private.order_hold (order_id, prior_status) values (r.id, 'paid') on conflict do nothing;
      update public.event_orders set status = 'cancelled' where id = r.id; v_n := v_n + 1;      -- door refuses it; inventory stays held until the dispute is decided
    end loop;
  elsif p_phase = 'won' then
    update private.payment_ledger set disputed = false, updated_at = now() where payment_intent = p_payment_intent;
    for r in select o.id, h.prior_status from public.event_orders o join private.order_hold h on h.order_id = o.id where o.stripe_payment_intent = p_payment_intent and o.status = 'cancelled' order by o.id for update of o loop
      update public.event_orders set status = r.prior_status where id = r.id; delete from private.order_hold where order_id = r.id; v_n := v_n + 1;
    end loop;
  else
    update private.payment_ledger set disputed = false, dispute_lost = true, updated_at = now() where payment_intent = p_payment_intent;
    for r in select o.id, o.tier_id, o.qty, h.prior_status from public.event_orders o join private.order_hold h on h.order_id = o.id where o.stripe_payment_intent = p_payment_intent and o.status = 'cancelled' order by o.id for update of o loop
      if r.prior_status = 'paid' then update public.ticket_tiers set qty_sold = greatest(0, coalesce(qty_sold, 0) - r.qty) where id = r.tier_id; end if;
      delete from private.order_hold where order_id = r.id; v_n := v_n + 1;
    end loop;
  end if;
  v_detail := jsonb_build_object('phase', p_phase, 'orders', v_n);
  update private.stripe_event_ledger set outcome = 'dispute_' || p_phase, detail = v_detail where stripe_event_id = p_stripe_event_id;
  return jsonb_build_object('ok', true) || v_detail;
end
$f$;

-- ---------- ACL: explicit, per object (default privileges in public would otherwise grant anon / authenticated) ----------
REVOKE ALL ON FUNCTION public.fulfill_ticket_order_v2(text,text,text,bigint,jsonb,text,integer,text,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ticket_order_v2(text,text,text,boolean,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispute_ticket_order(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_ticket_order_v2(text,text,text,bigint,jsonb,text,integer,text,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ticket_order_v2(text,text,text,boolean,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispute_ticket_order(text,text,text) TO service_role;

-- ---------- POSTCHECKS: every row must be ok = true ----------
SELECT 'v2_functions_search_path_empty' AS check_name, count(*) = 3 AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('fulfill_ticket_order_v2','refund_ticket_order_v2','dispute_ticket_order') AND p.prosecdef AND p.proconfig = ARRAY['search_path=""']
UNION ALL SELECT 'v2_functions_owned_by_postgres', count(*) = 3 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('fulfill_ticket_order_v2','refund_ticket_order_v2','dispute_ticket_order') AND pg_get_userbyid(p.proowner) = 'postgres'
UNION ALL SELECT 'v2_execute_service_role_only', bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('fulfill_ticket_order_v2','refund_ticket_order_v2','dispute_ticket_order')
UNION ALL SELECT 'ledgers_not_client_readable', bool_and(NOT has_table_privilege('anon', c.oid, 'SELECT') AND NOT has_table_privilege('authenticated', c.oid, 'SELECT') AND NOT has_table_privilege('service_role', c.oid, 'SELECT')) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relname IN ('stripe_event_ledger','payment_ledger','order_hold')
UNION ALL SELECT 'baseline_functions_untouched', to_regprocedure('public.fulfill_ticket_order(text,text,bigint,jsonb,text,integer,text)') IS NOT NULL AND to_regprocedure('public.refund_ticket_order(text,text)') IS NOT NULL;

COMMIT;
