# 13A: diff against the REAL live readers (`get_ticket`, `get_my_tickets`)

Status: DRAFT / inert (`db/proposed/`). Nothing here is applied anywhere. Baseline = `baseline/live-readers.VERBATIM.sql`, a read-only catalog capture of prod `pg_get_functiondef` (2026-11-10 ~14:10 PT).

| function | md5(pg_get_functiondef) captured from prod | reproduced by the baseline file | language / security | `proconfig` | ACL (sorted) |
|---|---|---|---|---|---|
| `public.get_ticket(p_qr text)` | `1814becc056c30ccac38c3adb51019ae` | yes (build.mjs refuses to run otherwise; proof G07 re-checks on real PostgreSQL 17) | `sql`, SECURITY DEFINER | `search_path=public` | `{anon, authenticated, postgres, service_role}` = EXECUTE, no PUBLIC, no grant option |
| `public.get_my_tickets()` | `c3885372304c4f2c1d73c540a6f6834e` | yes (same checks) | `sql`, SECURITY DEFINER | `search_path=public` | `{anon, authenticated, postgres, service_role}` = EXECUTE |

## 1. `get_ticket`: what the optional F-D pack 02 changes, exactly

Pack 02 does NOT rewrite the live body. Sequence (one transaction, after the drift guard):

1. stash the live ACL in the function comment (`ORIG_ACL=...`);
2. `ALTER FUNCTION public.get_ticket(text) RENAME TO get_ticket__orig_13a` (same oid, body byte-identical, all grants revoked except the owner);
3. install the wrapper below as `public.get_ticket(text)` with the original's EXECUTE grants copied.

The post-check asserts that the renamed helper, with its name swapped back, still hashes to `1814becc056c30ccac38c3adb51019ae` (fact `gt.helper_def_md5`), and ROLLBACK-02 asserts the same before and after.

`diff -u` of the live definition (left) against the wrapper definition (right), produced from the files in this directory:

```diff
 CREATE OR REPLACE FUNCTION public.get_ticket(p_qr text)
  RETURNS jsonb
- LANGUAGE sql
+ LANGUAGE plpgsql
  SECURITY DEFINER
- SET search_path TO 'public'
+ SET search_path TO ''
 AS $function$
-  select case
-    when o.id is null then jsonb_build_object('status','notfound')
-    else jsonb_build_object(
-      'status', o.status,
-      'event', e.title, 'slug', e.slug, 'cover', e.cover_url,
-      'venue', e.venue, 'city', e.city, 'starts_at', e.starts_at,
-      'tier', coalesce(t.name,'General Admission'), 'qty', o.qty,
-      'buyer', o.buyer_email, 'qr', o.qr_token, 'checked_in_at', o.checked_in_at
-    )
-  end
-  from (select regexp_replace(coalesce(p_qr,''),'^KIL-','','i') as tok) x
-  left join public.event_orders o on o.qr_token = x.tok and o.status = 'paid'
-  left join public.events e on e.id = o.event_id
-  left join public.ticket_tiers t on t.id = o.tier_id
-  limit 1;
+declare
+  r jsonb;
+begin
+  -- 13A F-D: ... the original body (renamed public.get_ticket__orig_13a ...) is called unchanged;
+  r := public.get_ticket__orig_13a(p_qr);
+  if r is not null and pg_catalog.jsonb_typeof(r) = 'object' then
+    return r operator(pg_catalog.-) 'buyer'::text;
+  end if;
+  return r;
+end;
 $function$
```

### Behavioural difference (the only one intended)

The live function returns, for a paid order token (`status = 'paid'` only; refunded/unknown/empty/NULL inputs give `{"status":"notfound"}`):

```
{"status","event","slug","cover","venue","city","starts_at","tier","qty","buyer","qr","checked_in_at"}
```

After pack 02 the result is the same object **minus the `buyer` key** (the buyer's e-mail address). All other keys, their values, the `{"status":"notfound"}` results, and the `KIL-` prefix handling are unchanged (they come from the untouched original). Proven on the replica with the verbatim body: G01 (every other key byte-equal), G02 (notfound for unknown / refunded / empty / NULL, identical before and after), G03 (grants), G04 (rollback restores the same oid and the exact definition), G08/G09 (drift guards).

Side notes on the wrapper that are real differences to the live object and are visible to a reviewer: `LANGUAGE plpgsql` instead of `sql`; `search_path` is empty (everything in the wrapper is schema-qualified); a second function `get_ticket__orig_13a` exists (no grants for anon/authenticated/service_role); the function comment holds the stashed ACL. Rollback removes all four.

Because the live body is now known, the earlier "if the original nests the e-mail, the wrapper would not remove it" caveat is closed: `buyer` is a top-level key of the object (see the `'buyer', o.buyer_email` line above).

## 2. `get_my_tickets`: NOT changed by 13A

Neither pack 01 nor pack 02 creates, replaces, renames or re-grants `public.get_my_tickets()`. The live definition is `SECURITY DEFINER` owned by `postgres` with `search_path=public`. It reads `event_orders` as the function owner, so:

* **Pack 01's REVOKEs do not affect it.** Pack 01 does `REVOKE ALL ON public.event_orders FROM PUBLIC, anon, authenticated` and drops two policies; a definer function runs with its owner's privileges (the owner keeps ALL, and RLS is not forced), so `get_my_tickets()` returns exactly what it returned before. Proof G10 (real PostgreSQL 17, verbatim body): identical definition md5, ACL and config before pack 01, after pack 01, and after pack 01 + pack 02; the buyer's result (orders 1, 4, 6 with `qr_token`) is identical in all three worlds; buyer2 sees only theirs (2, 5); anon and an unrelated organizer get zero rows; the refunded order is not returned. Matrix R06 is the same check against both the original and the hardened world.
* **What it returns and to whom.** Its result columns are `order_id, event_id, slug, title, cover_url, venue, city, starts_at, qty, qr_token, status, purchased_at, tier_name, price_cents, checked_in_at, genres, owner_handle, owner_name`: **no buyer e-mail column**. It filters `o.status = 'paid' AND lower(o.buyer_email) = lower((select email from auth.users where id = auth.uid()))`, i.e. a signed-in buyer gets their own tickets (including `qr_token`, which the buyer needs to show at the door) only through the `auth.users` e-mail match. This is unchanged. For `anon`, `auth.uid()` is null, the sub-select is null, nothing matches: zero rows (G10).
* **Pack 01 does not touch what the organizer can read.** `event_orders_organizer_read` (SELECT) stays; the organizer can still read `buyer_email` / `qr_token` of their own events' orders (documented, adjacent test X02, not changed by 13A).

## 3. Correction of an earlier replica assumption

The earlier replica modelled `get_my_tickets()` as SECURITY INVOKER (and returned `paid`+`checked_in`); the real function is SECURITY DEFINER and returns `paid` only. The earlier replica also returned `null` for unknown tokens; the real `get_ticket` returns `{"status":"notfound"}`. Both approximations are now replaced by the verbatim bodies (`proof/replica.sql` splices `baseline/live-readers.VERBATIM.sql`), and tests R06 and G02 were corrected to the real behaviour. The pack 01 conclusions did not change.
