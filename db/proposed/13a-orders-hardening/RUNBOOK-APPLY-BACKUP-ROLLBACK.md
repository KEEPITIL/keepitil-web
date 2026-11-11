# RUNBOOK: apply 12A + 13A with a definition backup first, and roll back (DRAFT, PROPOSAL ONLY)

Status: DRAFT. **Nothing in this runbook is approved to run.** No prod connection was made to write it. Merging the PR that carries it does not apply anything (`db/proposed/` is inert; no workflow applies SQL).

Related: global apply order `docs/db-apply-order/APPLY-ORDER-2026-11-10.md`; real-test steps live in the docs PR titled "real checkout + door test steps" (branch `draft/20a-real-checkout-door-test-steps`; no PR number is quoted here until that PR exists); 12A pack docs `../12a-door-hardening/README.md`; 13A pack docs `README.md`, `DIFF.md` (diff against the live readers).

## 0. Live hazards that REMAIN until the packs are applied (verbatim facts from the 2026-11-10 captures)

| Hazard | Live today | Fixed by |
|---|---|---|
| `orders_anon_insert` policy, `INSERT` for `anon, authenticated` with `WITH CHECK (true)`: anyone can insert a forged `status='paid'` order with a chosen `qr_token` | YES | 13A pack 01 (drops it) |
| `event_orders_organizer_update`: an organizer can UPDATE every column (`status`, `qr_token`, `checked_in_at`, `amount_cents`, ...) of any order of their events | YES | 13A pack 01 (drops it, table ACL ALL -> SELECT) |
| table ACL ALL (incl. `TRUNCATE`, `MAINTAIN`, `REFERENCES`, `TRIGGER`, `DELETE`) for `anon` and `authenticated`: **anon can TRUNCATE `event_orders`** | YES | 13A pack 01 |
| door functions `event_checkin_scan` / `check_in_ticket` (hardening findings in 12A README) | original bodies live | 12A steps 1-2 |
| `get_ticket(p_qr)` returns the buyer e-mail (`buyer` key) to anyone holding a token | YES | OPTIONAL 13A pack 02 |

Merging the PR does NOT fix any of these.

## 1. Gates and who does what

| Gate | Who | Needed for |
|---|---|---|
| Atlas review of the pack text + proof at an exact commit SHA | Atlas | every write step |
| Sentinel PASS at that same exact SHA (a later push voids it) | Sentinel | every write step |
| Joe's explicit go, relayed by Grok/KODE, for THAT step | Joe (relayed) | every write step |
| Definition capture saved to the dated folder (section 2) | KODE (read-only) | before the first write |
| Full DATA backup | Joe, in the Supabase dashboard (backup / PITR), only if Joe wants one | optional; see section 2 |
| Running the SQL | KODE, by hand, one pack at a time, as role `postgres`, one transaction per pack | write steps |

Approval by Atlas or Sentinel is not Joe's consent. CI never applies SQL.

## 2. What "backup" means for this change

Facts: the Supabase connector in use has **no `pg_dump`**. What KODE can produce read-only is a **definition backup**: everything the packs modify is a function body, a policy, or a grant, and all of it is captured as text. Those definitions are sufficient to restore the old state byte for byte (that is what the ROLLBACK packs do, and proofs P06/P07/G04 and P38 show it on a real PostgreSQL 17 replica).

Row data is not changed by any pack. `event_orders` currently holds only about 5 orders (aggregate counts only, no contents, are captured). If Joe nevertheless wants a data backup, the means is the Supabase dashboard backup / point-in-time recovery, which is Joe's dashboard action. This runbook does not invent any other mechanism.

Capture, in a **dated folder** (for example `db-apply-captures/2026-MM-DD-HHMM/` on the KODE machine; the name is not load-bearing, but it must exist before the first write and be kept):

| File | Produced by | Contents |
|---|---|---|
| `01_PRECHECK-12A.txt` | `../12a-door-hardening/PRECHECK-12A.sql` | read-only catalog facts + aggregate counts |
| `02_12a_DRIFT_QUERY.txt` | `../12a-door-hardening/packs/12a_DRIFT_QUERY_PROPOSED.sql` | state classifier: first row MUST read `S0_original` |
| `03_VERIFY-12A.txt` | `../12a-door-hardening/VERIFY-12A.sql` | before-counts, door function flags, orders surface hash |
| `04_PRECHECK-13A.txt` | `PRECHECK-13A.sql` | policy texts, ACLs, qr_token default, full function bodies |
| `05_13a_DRIFT_QUERY.txt` | `packs/13a_DRIFT_QUERY_PROPOSED.sql` | orders MUST read `S0_original`, get_ticket MUST read `G0_original` (this now pins the verbatim live body, md5 `1814becc056c30ccac38c3adb51019ae`) |
| `06_CAPTURE-READONLY.txt` | `CAPTURE-READONLY.sql` | `pg_get_functiondef` text + md5, owner, config, raw + sorted ACL of the 6 functions; `event_orders` ACL (raw + sorted), column ACLs, RLS flags, every policy text, indexes, constraints, per-role privileges; `private` schema contents; counts by status |
| `07_live-readers.md5.txt` | `SELECT proname, md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname IN ('get_ticket','get_my_tickets')` | must equal `1814becc056c30ccac38c3adb51019ae` / `c3885372304c4f2c1d73c540a6f6834e` (`baseline/live-readers.VERBATIM.sql`) |

Run each as `BEGIN READ ONLY; <file>; ROLLBACK;` (single statement each). **Abort on drift**: if any DRIFT_QUERY row reads `DRIFT`, if 12A is not `S0_original`, if 13A is not `S0_original` / `G0_original`, or if the md5s in file 07 differ, STOP, do not edit any literal in a pack, and report to Atlas/Sentinel. Compare the captures with `baseline/PROD-FACTS-13A.md`, `../12a-door-hardening/baseline/PROD-FACTS-12A.md` and `baseline/live-readers.VERBATIM.sql`.

## 3. Exact apply order (every step needs its gate in section 1; every pack is one transaction with its own drift guard and post-check)

| # | Step | Command | Verify after | Abort rule |
|---|---|---|---|---|
| A0 | Read-only captures | section 2, files 01-07 | outputs saved, states as required | any DRIFT -> stop |
| A1 | 12A step 1 | `../12a-door-hardening/packs/12a_01_event_checkin_scan_APPLY_PROPOSED.sql` | its retained evidence SELECT all `ok`; `../12a-door-hardening/packs/12a_POSTCHECKS_S1_after-step1_PROPOSED.sql` all `ok`; `VERIFY-12A.sql`; Sentinel isolated tests (raw token, `KIL-` prefix, null-owner, anon, replay) | pack aborts on drift by itself (nothing applied); any failed post-check -> ROLLBACK (section 5) |
| A2 | 12A step 2 | `../12a-door-hardening/packs/12a_02_check_in_ticket_APPLY_PROPOSED.sql` | `../12a-door-hardening/packs/12a_POSTCHECKS_S2_after-step2_PROPOSED.sql` all `ok`; `VERIFY-12A.sql` again; zero TEST ATLAS rows | as above |
| A3 | 13A pack 01 (the money fix) | `packs/13a_01_event_orders_APPLY_PROPOSED.sql` (apply AFTER 12A: 12A's drift guard expects the original orders state and REFUSES once 13A is applied, so 13A-first would block 12A) | `packs/13a_POSTCHECKS_orders_S1_after-pack01_PROPOSED.sql` all `ok`; `packs/13a_DRIFT_QUERY_PROPOSED.sql` orders = `S1_after-pack01`; re-run file 06 into the `after` folder | as above |
| A4 | Smoke | a Stripe TEST-mode purchase through the real flow (docs PR `draft/20a-real-checkout-door-test-steps`) must still produce an order; the buyer still sees it in `get_my_tickets()` | Joe's separate gate | failure -> ROLLBACK 13A pack 01 first |
| A5 | OPTIONAL 13A pack 02 (F-D) | `packs/13a_02_get_ticket_APPLY_PROPOSED.sql` (independent of A3; shares the lock) | `packs/13a_POSTCHECKS_get_ticket_G1_after-pack02_PROPOSED.sql` all `ok`; DRIFT_QUERY get_ticket = `G1_after-pack02` | needs its own go: callers outside these repos are unknown (`DIFF.md`) |
| A6 | OPTIONAL `12a_OPT_qr_token_unique` | `../12a-door-hardening/packs/optional/` (PRECHECK must show zero duplicates; non-transactional) | its POSTCHECK | only AFTER A3 |

Each pack takes the repo-wide advisory lock with `lock_timeout 5s`; if another pack is running it waits at most 5 s and fails with `55P03`, nothing changed.

## 4. Abort and rollback triggers

Roll back if: a post-check row is not `ok` after commit, a Sentinel isolated test fails, door staff report valid tickets refused, the test purchase does not create an order, or `get_my_tickets()` stops returning a buyer's own paid tickets.

## 5. Rollback (reverse order; **13A before 12A, always**)

Rolling back 12A first REFUSES while 13A is applied (proved P21); that is deliberate.

| # | Step | Command | Verify |
|---|---|---|---|
| R1 | (if applied) UNIQUE index | `../12a-door-hardening/packs/optional/12a_OPT_qr_token_unique_ROLLBACK_PROPOSED.sql` | index gone |
| R2 | (if applied) 13A pack 02 | `packs/13a_02_get_ticket_ROLLBACK_PROPOSED.sql` (restores the original function object: same oid, byte-identical definition, ACL, config, comment removed) | `packs/13a_POSTCHECKS_get_ticket_G0_original_PROPOSED.sql` all `ok` |
| R3 | 13A pack 01 | `packs/13a_01_event_orders_ROLLBACK_PROPOSED.sql` (recreates the two policies, ALL grants again: this REOPENS the hazards in section 0, only do it to restore the baseline) | `packs/13a_POSTCHECKS_orders_S0_original_PROPOSED.sql` all `ok` |
| R4 | 12A step 2 | `../12a-door-hardening/packs/12a_02_check_in_ticket_ROLLBACK_PROPOSED.sql` | `../12a-door-hardening/packs/12a_POSTCHECKS_S1_after-step1_PROPOSED.sql` all `ok` |
| R5 | 12A step 1 | `../12a-door-hardening/packs/12a_01_event_checkin_scan_ROLLBACK_PROPOSED.sql` (restores the captured original body and ACL, drops `private.door_checkin_core` and schema `private`) | `../12a-door-hardening/packs/12a_POSTCHECKS_S0_original_PROPOSED.sql` all `ok` |

**Post-rollback verification (sorted-ACL fingerprints equal the captured baseline).** After R5:

1. Run `12a_DRIFT_QUERY` (first row `S0_original`) and `13a_DRIFT_QUERY` (orders `S0_original`, get_ticket `G0_original`).
2. Re-run `CAPTURE-READONLY.sql` into `after-rollback/06_CAPTURE-READONLY.txt` and compare with the baseline file. Every row must be equal **except rows whose name contains `acl_raw`**: raw ACL entry order legitimately differs after a rollback (GRANT appends); the `fn.acl_sorted:*` and `orders.acl_sorted` rows are the order-independent fingerprints and must be equal, as must every `fn.def_md5:*`, policy, index, constraint, `schema.private.*` and count row. Example (bash; note `grep -v` exits 1 when it filters everything, hence `|| true`):

```bash
strip() { grep -v 'acl_raw' "$1" || true; }
diff <(strip before/06_CAPTURE-READONLY.txt) <(strip after-rollback/06_CAPTURE-READONLY.txt) && echo "fingerprints equal"
```

3. `md5(pg_get_functiondef)` of `get_ticket` and `get_my_tickets` must again be `1814becc056c30ccac38c3adb51019ae` and `c3885372304c4f2c1d73c540a6f6834e`.

This exact method (capture, apply 12A 01 + 02 + 13A 01, roll back in the order above, capture, compare) is executed on the real-PostgreSQL replica by proof `P38` in `proof/prove.mjs`.

## 6. NOT approved / NOT verified

* NOT approved to apply: anything in `db/proposed/` (12A step 1, step 2, 13A pack 01, 13A pack 02, the UNIQUE index, 17A, #91/#92/10A, 11A, F3). Joe's relayed go, an Atlas review and a Sentinel PASS at the exact commit, and the section 2 capture are all still outstanding.
* Not verified: behaviour against the real Supabase stack (the replica uses stand-in roles); the real Stripe -> webhook -> `fulfill_ticket_order` chain; external callers of `get_ticket`; the prod catalog beyond the 2026-11-10 captures (the DRIFT_QUERY on prod is the real check).
