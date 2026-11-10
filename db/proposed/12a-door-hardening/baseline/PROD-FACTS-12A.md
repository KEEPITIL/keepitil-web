# 12A door-scanner: LIVE PROD FACTS (read-only catalog capture by KODE, 2026-11-10 ~00:30 PT; no row contents beyond aggregate counts)

Captured with SELECT-only catalog queries on keepitil-prod (pg_proc/pg_get_functiondef, pg_class ACLs, pg_policies, pg_constraint, aggregate counts). Transcribed from the tool output: re-verify byte-for-byte with PRECHECK-12A before any apply.

## Functions (both SECURITY DEFINER, owner postgres, proconfig search_path=public)

### public.check_in_ticket(p_qr text) RETURNS jsonb
ACL: {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}  (ANON CAN EXECUTE)
```
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_qr text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid     uuid := auth.uid();
  h       text;
  o       public.event_orders%rowtype;
  ev_title text;
  ev_owner text;
  ev_status text;
  ti      text;
  did     int;
  checked int;
  sold    int;
begin
  if uid is null then return jsonb_build_object('status','unauth'); end if;
  select handle into h from public.app_users where id = uid;

  select * into o from public.event_orders
    where qr_token = regexp_replace(coalesce(p_qr,''), '^KIL-', '', 'i') limit 1;
  if not found then return jsonb_build_object('status','notfound'); end if;

  select title, owner_handle, status into ev_title, ev_owner, ev_status
    from public.events where id = o.event_id;

  if ev_owner is distinct from h then return jsonb_build_object('status','notyours'); end if;
  if o.status <> 'paid' then return jsonb_build_object('status','notpaid','order_status',o.status); end if;

  select name into ti from public.ticket_tiers where id = o.tier_id;

  update public.event_orders set checked_in_at = now()
    where id = o.id and checked_in_at is null;
  get diagnostics did = row_count;

  select count(*) filter (where checked_in_at is not null), count(*)
    into checked, sold
    from public.event_orders where event_id = o.event_id and status = 'paid';

  if did = 0 then
    return jsonb_build_object('status','already','event',ev_title,'tier',coalesce(ti,'GA'),
                              'buyer',o.buyer_email,'at',o.checked_in_at,'checked_in',checked,'sold',sold);
  end if;

  return jsonb_build_object('status','valid','event',ev_title,'tier',coalesce(ti,'GA'),
                            'buyer',o.buyer_email,'qty',o.qty,'checked_in',checked,'sold',sold);
end;
$function$
```
OBSERVED DEFECTS: (1) anon has EXECUTE (returns {"status":"unauth"} for anon, but the surface is open); (2) NULL-OWNER HOLE: `ev_owner is distinct from h` is FALSE when BOTH are NULL, so a signed-in caller with no app_users handle (h null) passes the ownership test for any event whose owner_handle is NULL (1,392 of 1,457 events have owner_handle NULL per PRECHECK-92 Q-7); (3) returns the buyer's EMAIL ('buyer',o.buyer_email) on 'already' and 'valid'; (4) search_path=public (not empty/pg_catalog); (5) one QR per ORDER (qty can be >1) with a single checked_in_at: whole order admitted at once, no per-seat model; (6) ignores status 'checked_in'/'refunded' only via `<> 'paid'`.

### public.event_checkin_scan(p_qr_token text) RETURNS jsonb
ACL: {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}  (no anon)
```
CREATE OR REPLACE FUNCTION public.event_checkin_scan(p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o record; v_handle text; v_prev timestamptz;
begin
  if coalesce(btrim(p_qr_token),'') = '' then
    return jsonb_build_object('ok', false, 'result', 'empty', 'message', 'No code scanned.');
  end if;

  select h.handle into v_handle from public.app_users h where h.id = auth.uid();

  select o2.id, o2.event_id, o2.qty, o2.status, o2.buyer_email, o2.buyer_handle,
         o2.checked_in_at, e.slug as event_slug, e.title as event_title, e.owner_handle
  into o
  from public.event_orders o2
  join public.events e on e.id = o2.event_id
  where o2.qr_token = btrim(p_qr_token);

  if not found then
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'Not a KEEPITIL ticket.');
  end if;

  if v_handle is null or o.owner_handle is null or lower(v_handle) <> lower(o.owner_handle) then
    return jsonb_build_object('ok', false, 'result', 'forbidden',
      'message', 'You are not on the door for this event.');
  end if;

  if o.status is distinct from 'paid' then
    return jsonb_build_object('ok', false, 'result', 'unpaid',
      'message', 'This order is not paid ('||coalesce(o.status,'unknown')||').',
      'event_title', o.event_title);
  end if;

  if o.checked_in_at is not null then
    return jsonb_build_object('ok', false, 'result', 'already_used', 'message', 'Already admitted.',
      'checked_in_at', o.checked_in_at, 'event_title', o.event_title,
      'buyer', coalesce(o.buyer_handle, o.buyer_email), 'qty', o.qty);
  end if;

  update public.event_orders set checked_in_at = now()
   where id = o.id and checked_in_at is null;

  if not found then
    select checked_in_at into v_prev from public.event_orders where id = o.id;
    return jsonb_build_object('ok', false, 'result', 'already_used',
      'message', 'Already admitted (scanned a moment ago).',
      'checked_in_at', v_prev, 'event_title', o.event_title);
  end if;

  return jsonb_build_object('ok', true, 'result', 'admitted', 'message', 'Admitted',
    'event_title', o.event_title, 'event_slug', o.event_slug,
    'buyer', coalesce(o.buyer_handle, o.buyer_email), 'qty', o.qty, 'checked_in_at', now());
end $function$
```
OBSERVED DEFECTS: (1) KIL- FIX: matches `qr_token = btrim(p_qr_token)` with NO prefix handling, so a wallet QR payload 'KIL-<token>' is rejected as 'invalid' (all 5 prod tokens are 32 chars with no prefix); (2) returns buyer handle OR EMAIL ('buyer'); (3) search_path=public; (4) no per-seat; (5) null-owner is correctly denied here (the two functions disagree); (6) the scan is atomic (UPDATE ... WHERE checked_in_at IS NULL, then checks FOUND).

## Callers
No database function references either (pg_proc.prosrc regex scan over all non-system schemas: none). Web/app callers: find in the web repo (grep check_in_ticket / event_checkin_scan; dashboard.html self-link scanner per Atlas Q: 'no established scanner caller').

## public.event_orders (RLS enabled)
Columns: id bigint, event_id bigint, tier_id bigint, buyer_email text, buyer_handle text, qty int, referral_code text, qr_token text, status text, amount_cents int, created_at timestamptz, stripe_session_id text, stripe_payment_intent text, application_fee_cents int, organizer_acct text, checked_in_at timestamptz.
Constraints: PK id; event_id FK -> events(id) ON DELETE CASCADE; tier_id FK -> ticket_tiers(id) ON DELETE SET NULL; CHECK status IN ('pending','paid','checked_in','refunded','cancelled'). No triggers.
Table ACL: {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres} (ALL incl. TRUNCATE/MAINTAIN for anon and authenticated; RLS is the only guard).
Policies: event_orders_organizer_read (authenticated SELECT: event_id IN (select events.id from events where events.owner_handle = my_handle())); event_orders_organizer_update (authenticated UPDATE, same predicate in USING and WITH CHECK: an organizer can update ANY column of their orders, incl. status and qr_token); event_orders_owner_read (authenticated SELECT: buyer_email = my_email()); **orders_anon_insert (anon AND authenticated INSERT, WITH CHECK true)**: anyone can insert an order row with ANY values (status 'paid', own qr_token, any event_id, amount_cents...). ADJACENT FINDING (for 13A/14A, not 12A): a forged 'paid' order can be inserted by anon and then admitted at the door; document + prove on the replica only; do NOT exploit anything on prod.
Counts (aggregate only): 5 orders total, 5 paid, 0 checked in, 5 with qr_token; qr_token length min=max=32; 5 distinct 4-char prefixes (random-looking, no 'KIL-').

## Atlas's requirements (from kapp-thanksgiving-build.md; his source doc atlas/checkin-scan-fix.md is NOT available on this machine: Grok was asked to put it in the CLAUDE KODE Drive folder)
- I08: actual owner-authorized door scanner UI/network path, atomic single admission, raw/KIL acceptance, repeat/concurrent/refunded/stale-token refusal. Include held event_checkin_scan KIL- fix + check_in_ticket null-owner/anon/search_path hardening. Do not return attendee contacts; names require opt-in.
- 12A: 'reviewed two-function artifacts, real caller/auth contract, token-free/no-contact response adapter, drift/post-check evidence.' Sentinel gate: isolated raw/KIL/null-owner/anon/replay tests; 'Kode applies (team call per Grok, Nov 9 7:26 PM); Sentinel conditions in checkin-scan-fix.md; stop on drift.' Nova: authenticated owner route selected; no self-link scanner accepted.
- Dependency order (Atlas): 'Check-in changes: extract forward sections only; as postgres, one function at a time, abort on drift; retain post-check SELECT output. Fixture scans remain isolated/boolean-only; verify zero TEST ATLAS rows.'
- NEEDS JOE: direct yes to applying BOTH fixes by Nov 10; prior agent/Sentinel approval is not Joe's consent. KODE's rule (relayed by the fork): NO prod SQL without Joe's relayed yes + a Sentinel pass + a backup. Everything here is PROPOSAL ONLY.
