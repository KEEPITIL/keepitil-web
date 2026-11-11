# RUNBOOK: apply 12A + 13A with a verified backup first, and the fail-closed rollback (DRAFT, PROPOSAL ONLY)

Status: DRAFT. **Nothing in this runbook is approved to run.** No prod connection was made to write it. Merging the PR that carries it does not apply anything (`db/proposed/` is inert; no workflow applies SQL). **MERGING THIS DOES NOT FIX PROD.**

Related: global apply order `docs/db-apply-order/APPLY-ORDER-2026-11-10.md`; checkout dependency `docs/db-apply-order/CHECKOUT-DEPENDENCIES.md`; 12A pack docs `../12a-door-hardening/README.md`; 13A pack docs `README.md`, `DIFF.md`.

**This file is the single source of truth for (a) what "backup" means (section 2) and (b) what "rollback" means (section 5). Every other document links here and must not restate either.**

## 0. Live hazards that REMAIN until the packs are applied (verbatim facts from the 2026-11-10 captures)

| Hazard | Live today | Fixed by |
|---|---|---|
| `orders_anon_insert` policy, `INSERT` for `anon, authenticated` with `WITH CHECK (true)`: anyone can insert a forged `status='paid'` order with a chosen `qr_token` | YES | 13A pack 01 (drops it) |
| `event_orders_organizer_update`: an organizer can UPDATE every column (`status`, `qr_token`, `checked_in_at`, `amount_cents`, ...) of any order of their events | YES | 13A pack 01 (drops it, table ACL ALL -> SELECT) |
| table ACL ALL (incl. `TRUNCATE`, `MAINTAIN`, `REFERENCES`, `TRIGGER`, `DELETE`) for `anon` and `authenticated`: **anon can TRUNCATE `event_orders`** | YES | 13A pack 01 |
| door functions `event_checkin_scan` / `check_in_ticket` (null-owner and empty-handle admission, anon EXECUTE on `check_in_ticket`, buyer e-mail in the response, `search_path=public` definer bodies) | original bodies live | 12A steps 1-2 |
| `get_ticket(p_qr)` returns the buyer e-mail (`buyer` key) to anyone holding a token | YES | OPTIONAL 13A pack 02 (not in the prod plan) |

Merging the PR does NOT fix any of these.

## 1. Gates and who does what

| Gate | Who | Needed for |
|---|---|---|
| Atlas review of the pack text + proof at an exact commit SHA | Atlas | every write step |
| Sentinel PASS at that same exact SHA (a later push voids it) | Sentinel | every write step |
| Joe's explicit go, relayed by Grok/KODE, for THAT step | Joe (relayed) | every write step |
| **Verified backup** (section 2, parts A and B) saved to the dated folder | KODE (read-only) | before the first write |
| Supabase dashboard backup / PITR (section 2, part C) | Joe, optional extra | Joe's choice; NOT a gate, NOT a `pg_dump` |
| Running the SQL | KODE, by hand, one pack at a time, as role `postgres`, one transaction per pack | write steps |

Approval by Atlas or Sentinel is not Joe's consent. CI never applies SQL.

**Apply role requirements.** Every pack refuses unless `current_user = 'postgres'` (guard). `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` needs a superuser or a member of `supabase_admin`: if the apply role is neither, 12A step 1 prints a NOTICE that it skipped that statement and instead the guard and post-check prove that NO default ACL entry in schema `private` grants anything to PUBLIC / anon / authenticated / service_role (this is verified on prod today: no default ACL exists for `private`). The explicit per-object REVOKEs are the real control (section 6).

## 2. BACKUP = (definition capture, verified) + (no data change, proved) + (optional dashboard backup, Joe's choice)

Facts: the Supabase connector in use has **no `pg_dump`** and none is claimed anywhere. What KODE can produce read-only is a **definition backup**: everything the packs modify is a function body, a policy or a grant (plus two new functions), and all of it is captured as text.

**A. Definition capture (mandatory gate), saved in a dated folder, then VERIFIED.**

| File | Produced by | Contents |
|---|---|---|
| `01_PRECHECK-12A.txt` | `../12a-door-hardening/PRECHECK-12A.sql` | read-only catalog facts + aggregate counts |
| `02_12a_DRIFT_QUERY.txt` | `../12a-door-hardening/packs/12a_DRIFT_QUERY_PROPOSED.sql` | state classifier: first row MUST read `S0_original` |
| `03_VERIFY-12A.txt` | `../12a-door-hardening/VERIFY-12A.sql` | before-counts, door function flags, orders surface hash |
| `04_PRECHECK-13A.txt` | `PRECHECK-13A.sql` | policy texts, ACLs, qr_token default, full function bodies |
| `05_13a_DRIFT_QUERY.txt` | `packs/13a_DRIFT_QUERY_PROPOSED.sql` | orders MUST read `S0_original`, get_ticket MUST read `G0_original` |
| `06_CAPTURE-READONLY.txt` and `06b_CAPTURE-READONLY.txt` | `CAPTURE-READONLY.sql`, run **twice in a row** | `pg_get_functiondef` text + md5, owner, config, raw + sorted ACL of the 6 functions; `event_orders` ACL, column ACLs, RLS flags, every policy text, indexes, constraints, per-role privileges; schema `private` (its four tables with owner, raw + sorted ACL, columns, and a fingerprint), default ACLs, counts by status; last row `000_capture.summary` = `rows=N md5=...` |
| `07_live-readers.md5.txt` | `SELECT proname, md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname IN ('get_ticket','get_my_tickets')` | must equal `1814becc056c30ccac38c3adb51019ae` / `c3885372304c4f2c1d73c540a6f6834e` |

Run each as `BEGIN READ ONLY; <file>; ROLLBACK;` (single statement each).

**Verification step (part of the backup, not optional):**
1. `06` and `06b` must be byte-identical (`diff 06_CAPTURE-READONLY.txt 06b_CAPTURE-READONLY.txt` prints nothing) and their `000_capture.summary` rows (row count + md5, computed in SQL) must match. A capture that is not reproducible is not a backup.
2. Row count of `06` must be at least the baseline of `baseline/PROD-FACTS-13A.md` / `../12a-door-hardening/baseline/PROD-FACTS-12A.md` (function rows for the six functions, the six policies/ACL rows, four `private.relation:` rows).
3. The captured file must be re-loadable: `replay-from-capture.mjs` builds, from the capture rows ALONE, the SQL that restores the captured original state (function definitions and ACLs, event_orders policies and table ACL, removal of objects the capture lists as absent). Proof test J21 applies the whole chain on the replica and restores the original from the capture alone (post-replay capture equals the pre-apply capture; replay of a different capture does not). This replay REOPENS the holes and is only for the explicit-override case (section 5).
4. Abort rule: if any DRIFT_QUERY row reads `DRIFT`, 12A is not `S0_original`, 13A is not `S0_original` / `G0_original`, or the md5s in file 07 differ, STOP, edit no literal, report to Atlas/Sentinel.

**B. No pack modifies row data (proved, so no data backup is needed to roll back these packs).** Every pack is DDL / ACL / function text only. Proof test J22 asserts that row counts and md5 checksums of `event_orders`, `events`, `app_users`, `ticket_tiers` and the four `private.*` tables are identical before the packs, after them, and after the full override rollback, and statically that no pack contains `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` outside function bodies. The four `private.*` incident tables (including `private.qr_token_backup_20261106`, a sensitive backup of order tokens) are never touched: 12A step 1 fingerprints them (owner, relacl, column list, column ACLs, schema ACL) at its start and asserts equality at its end.

**C. Dashboard backup / PITR: Joe's optional extra.** It is a Supabase dashboard action, it is not a `pg_dump`, KODE cannot produce or verify it, and it is NOT a gate of this plan. If Joe wants it, he takes it before the first write; that is his call.

## 3. Exact apply order (prod plan: 12A 01, 12A 02, 13A 01; each step needs its gate in section 1)

| # | Step | Command | Verify after | Abort rule |
|---|---|---|---|---|
| A0 | Verified backup | section 2 (A and B) | summary rows match, states as required | any DRIFT -> stop |
| A1 | 12A step 1 | `../12a-door-hardening/packs/12a_01_event_checkin_scan_APPLY_PROPOSED.sql` | evidence SELECT all `ok`; `12a_POSTCHECKS_S1_after-step1_PROPOSED.sql` all `ok`; `VERIFY-12A.sql`; Sentinel isolated tests (raw token, `KIL-`, null-owner, anon, replay); re-run `CAPTURE-READONLY.sql`: the four `private.relation:*` rows and `private.known_tables_fingerprint` equal the backup | pack aborts on drift by itself (nothing applied); any failed post-check -> section 5 |
| A2 | 12A step 2 | `../12a-door-hardening/packs/12a_02_check_in_ticket_APPLY_PROPOSED.sql` | `12a_POSTCHECKS_S2_after-step2_PROPOSED.sql` all `ok`; `VERIFY-12A.sql`; zero TEST ATLAS rows | as above |
| A3 | 13A pack 01 (the money fix) | `packs/13a_01_event_orders_APPLY_PROPOSED.sql` (AFTER 12A: 12A's guard refuses once 13A is applied) | `packs/13a_POSTCHECKS_orders_S1_after-pack01_PROPOSED.sql` all `ok`; DRIFT_QUERY orders = `S1_after-pack01` | as above |
| A4 | Smoke | a Stripe TEST-mode purchase through the real flow; requires PR #153 (checkout bearer fix) live first, see `docs/db-apply-order/CHECKOUT-DEPENDENCIES.md` | the purchase creates an order; `get_my_tickets()` returns it | failure -> section 5 |
| - | 13A pack 02 (F-D `get_ticket` wrapper) | NOT in the prod plan, NOT needed for the INSERT fix; stays optional | - | own go + own review |
| - | `12a_OPT_qr_token_unique` | optional, only after A3 | its POSTCHECK | - |

Each pack takes the repo-wide advisory lock with `lock_timeout 5s`; a second runner waits at most 5 s and fails with `55P03`, nothing changed.

### Schema `private` on prod (chain repair)
Prod's schema `private` already exists (owner postgres, no ACL, four postgres-only tables, no functions). 12A step 1 therefore never requires it to be absent and never drops it: the guard accepts either an absent schema (fresh database, the pack creates it) or exactly the four known tables (all four, owner postgres, ACL `{postgres=arwdDxtm/postgres}`, no column ACLs) plus their own indexes, sequences and row/array types, and aborts on any other object or any client-role grant or default ACL. The pack creates only `private.door_checkin_core`. See proofs J01-J05.

## 4. Abort and rollback triggers

Roll back (section 5) if: a post-check row is not `ok` after commit, a Sentinel isolated test fails, door staff report valid tickets refused, the test purchase does not create an order, or `get_my_tickets()` stops returning a buyer's own paid tickets.

## 5. Rollback = FAIL CLOSED by default

**Interpretation (flagged for Sentinel to confirm or reject).** "Fail closed" is implemented as: the DEFAULT rollback pack NEVER reopens a security hole. Every change of these packs is security-closing, so there is nothing that can be reverted without reopening a hole; the default `*_ROLLBACK_PROPOSED.sql` packs therefore verify the state (a wrong state reports `DRIFT`) and then ABORT with a message naming what a revert would reopen, leaving the database unchanged. Restoring the captured original is possible ONLY through a separate, loudly named file, `*_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql`, which refuses unless the same session first ran `SET kil.rollback_reopen_ack = 'I-ACCEPT-REOPENING-HOLES-<id>'` (ids `12A-01`, `12A-02`, `13A-01`, `13A-02`), raises a `RAISE WARNING` banner, and then restores the original. If Sentinel prefers a different reading (for example a default that restores a hole-free subset of the original), the packs are generated by `build.mjs` and can be changed in one place.

| Step | DEFAULT rollback (keep closed) | UNSAFE override (needs the ack) reopens |
|---|---|---|
| 13A pack 01 | refuses; policies stay dropped, table ACL stays `SELECT` for anon/authenticated | forged INSERT by anon / any signed-in user (`orders_anon_insert`); organizer UPDATE of `status` / `qr_token` / `checked_in_at` / `amount_cents`; anon TRUNCATE, DELETE, REFERENCES, TRIGGER, MAINTAIN |
| 13A pack 02 | refuses; wrapper stays (buyer key dropped, search_path pinned) | buyer e-mail returned by `get_ticket` to any token holder |
| 12A step 2 | refuses; anon EXECUTE on `check_in_ticket` stays revoked, null-owner / empty-handle hole stays closed | anon EXECUTE, null-owner / empty-handle admission, case-sensitive owner compare, buyer e-mail, `search_path=public` definer body |
| 12A step 1 | refuses; core stays (also `event_checkin_scan` depends on it); schema `private` is NEVER dropped | empty-handle admission, ambiguous duplicate token guessed, refund race, attendee contact, `search_path=public` definer body; drops ONLY `private.door_checkin_core` (the four incident tables are fingerprint-checked before/after) |

Order if overrides are ever used: 13A-02, 13A-01, then 12A-02, then 12A-01 (a 12A rollback while 13A is applied refuses with DRIFT; proved J14). Later packs that add objects to `private` (#91) must be rolled back before the 12A-01 override only if they depend on the core (they do not).

Proofs: default rollbacks refuse and every hole stays closed on the applied DB (J10, J10b); the override needs the exact ack (J11); with the ack it reopens all five detectors (J12, so the tests can see a reopening); it restores the original exactly, schema `private` kept (J13); wrong or partial state aborts with DRIFT (J14, J15); the static structure (J16).

Verification after an override rollback: re-run `CAPTURE-READONLY.sql` into `after-rollback/06_CAPTURE-READONLY.txt` and compare with the backup file on every row except rows whose name contains `acl_raw` (raw ACL entry order legitimately differs after GRANT):

```bash
strip() { grep -v 'acl_raw' "$1" || true; }
diff <(strip before/06_CAPTURE-READONLY.txt) <(strip after-rollback/06_CAPTURE-READONLY.txt) && echo "fingerprints equal"
```
`md5(pg_get_functiondef)` of `get_ticket` / `get_my_tickets` must again be `1814becc...` / `c3885372...`. Without any rollback pack, the original can also be rebuilt from the capture alone with `replay-from-capture.mjs` (also an override: it reopens the holes).

## 6. Hardening included in every pack

* Every SECURITY DEFINER function a pack creates or replaces pins `SET search_path = ''` with fully qualified references (`private.door_checkin_core`, `public.event_checkin_scan`, `public.check_in_ticket`, the F-D `get_ticket` wrapper); tests J30-J32 scan the live `proconfig` and the pack text, with a negative control. The only definer outside that rule is the renamed ORIGINAL `get_ticket__orig_13a` (the captured prod body, `search_path=public`), which pack 02 leaves with no grant to anyone but its owner.
* Default privileges: in prod, new functions created by `postgres` or `supabase_admin` in `public` are born executable by anon / authenticated / service_role (J40 reproduces it). Every function the packs create or replace therefore gets `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` and then exactly the intended `GRANT EXECUTE` (J41); removing the revoke makes the pack fail its own post-check (J42). Step 1 also runs `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE ALL ...` (and for `supabase_admin` when the apply role may). Finding: an in-schema default REVOKE cannot remove PostgreSQL's global PUBLIC EXECUTE default, so a function created in `private` later still carries PUBLIC EXECUTE; the schema has no USAGE for any client role, so it is unreachable (J44).

## 7. NOT approved / NOT verified

* NOT approved to apply: anything in `db/proposed/`. Joe's relayed go, an Atlas review and a Sentinel PASS at the exact commit, and the section 2 verified backup are all still outstanding.
* Not verified: behaviour against the real Supabase stack (the replica uses stand-in roles; whether prod's `postgres` is a member of `supabase_admin`); the exact set of non-table objects prod keeps in `private` beyond the four tables (the guard aborts on anything unexpected, which is the safe direction: run the DRIFT_QUERY read-only first); the real Stripe -> webhook -> `fulfill_ticket_order` chain; external callers of `get_ticket`.
