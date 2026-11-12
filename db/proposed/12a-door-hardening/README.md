# 12A door hardening: drafts and proofs (FINAL CANDIDATE for Sentinel review, draft PR, PROPOSAL ONLY)

**Status: FINAL CANDIDATE for Sentinel review: tests run 2026-11-10; re-derived from code, NOT Atlas's doc, NOT a Sentinel pass. Draft PR. Nothing here has been applied to any database. No prod connection of any kind was made by this job** (the prod facts in `baseline/PROD-FACTS-12A.md` are KODE's earlier read-only capture, transcribed). Nothing in `db/` is served (pages-excluded) and nothing applies these files automatically.

## Apply gate (binding) and blockers

1. **NO prod SQL without Joe's relayed yes + a Sentinel pass + a backup.** Prior agent or Sentinel approval is not Joe's consent (Atlas I08 note).
2. **Atlas's source doc `atlas/checkin-scan-fix.md` is unavailable and will not be provided.** The conditions were therefore **re-derived from the code** (`DERIVED-CONDITIONS.md`, 30 conditions: 20 met-proven, 1 met-by-design, 3 not met (DC-08/27 need 13A, DC-20 audit trail), 6 open decisions) and mapped to tests in `SENTINEL-CHECKLIST-12A.md`. This is **not Atlas's document and not a Sentinel pass**; Sentinel reviews this PR and may hold conditions that are not here.
3. The baseline fingerprints (function body md5s, ACLs, policy/constraint/column facts) come from a **transcription** of the prod capture. Run `PRECHECK-12A.sql` and `packs/12a_DRIFT_QUERY_PROPOSED.sql` on prod first; the DRIFT_QUERY's first row must read `S0_original`. If it reads `DRIFT`, read the per-fact rows, STOP, and re-baseline through review (do not edit literals in place).
4. Apply is a Kode-run, one-function-at-a-time procedure (below). Schema `private` must not be exposed in the Supabase API settings.

## What is in this PR

| Path (all under `db/proposed/12a-door-hardening/`) | What |
|---|---|
| `src/*.sql` | The three hardened function sources: `door_checkin_core.sql` (private core), `event_checkin_scan.hardened.sql`, `check_in_ticket.hardened.sql` |
| `build.mjs` | Generator. Extracts the ORIGINAL bodies mechanically from `baseline/PROD-FACTS-12A.md`, computes every md5/ACL literal, emits `packs/`. `node build.mjs --check` fails on drift |
| `packs/12a_01_event_checkin_scan_APPLY_PROPOSED.sql` | Step 1: creates schema `private` + `private.door_checkin_core`, replaces `public.event_checkin_scan` |
| `packs/12a_02_check_in_ticket_APPLY_PROPOSED.sql` | Step 2: replaces `public.check_in_ticket` (requires step 1) |
| `packs/12a_02_..._ROLLBACK_PROPOSED.sql`, `packs/12a_01_..._ROLLBACK_PROPOSED.sql` | Rollbacks, in that order: restore the captured original bodies and ACLs verbatim, then drop the core and schema |
| `packs/12a_POSTCHECKS_{S0,S1,S2}_*_PROPOSED.sql`, `packs/12a_DRIFT_QUERY_PROPOSED.sql` | Read-only single SELECTs: per-fact expected/actual/ok, and a state classifier (`S0_original`, `S1_after-step1`, `S2_after-step2`, `DRIFT`) |
| `PRECHECK-12A.sql` | Read-only catalog + aggregate queries for KODE to run on prod first (never row contents) |
| `CALLER-CONTRACT.md`, `adapter/` | Caller/auth contract; pure JS token-free, no-contact response adapter + unit tests (not wired anywhere) |
| `proof/` | Real-PG harness (`prove.mjs`, `replica.sql`, `run-proof.sh`, `report.mjs`), results in `proof/out/`, rendered in `MATRIX-RESULTS.md` |
| `DERIVED-CONDITIONS.md`, `SENTINEL-CHECKLIST-12A.md`, `SUSPECTED-DEFECT-NOT-REPRODUCED.md` | Re-derived conditions with tally; checklist mapping each requirement to a proof id and its result; the M36 write-up |
| `VERIFY-12A.sql` | Read-only before/after verification for KODE: catalog facts, aggregate counts, definition capture, zero TEST ATLAS rows |
| `adapter/door-contract-check.mjs`, `adapter/door-contract-crosscheck.test.mjs` | Static SQL-to-adapter contract cross-check with 9 negative controls |
| `packs/optional/12a_OPT_qr_token_unique_*` | OPTIONAL, non-transactional UNIQUE partial index on `qr_token` (PRECHECK/APPLY/POSTCHECK/ROLLBACK). Not in the required chain; run only after 13A |
| `FOLLOWUP-13A-14A_orders_PROPOSED_SKETCH.sql` | Sketch for the adjacent findings below. Not part of 12A, not reviewed, not applied |

Every pack: ONE transaction; right after `BEGIN` come `SET LOCAL lock_timeout = '5s';`, `SELECT pg_advisory_xact_lock(2979301232487107403);` (the repo-wide pack key from R1 #136, asserted equal by the generator) and `SET LOCAL lock_timeout = '5s';` again (a second runner fails with SQLSTATE 55P03 after ~5 s instead of waiting; the timeout is also set before the lock because a timeout set after a lock statement cannot bound that statement's wait; this replaces the earlier `'10s'`); then `SET LOCAL statement_timeout`; a DRIFT GUARD (a `DO` block that aborts the whole transaction naming every mismatching fact, and refuses unless `current_user = 'postgres'`); the change; in-transaction POST-CHECK assertions (failure rolls everything back); a RETAINED OUTPUT `SELECT` (one row per fact plus `000_ALL_OK`). ACLs are fingerprinted with the sorted-ACL expression from #136.

The drift guard asserts: both functions (single overload, body md5, `proconfig`, SECURITY DEFINER, owner, language/return type, sorted ACL, EXECUTE for anon/authenticated/service_role/PUBLIC); schema `private` either absent (fresh database) or exactly prod's shape (the four postgres-only incident tables with their own indexes / sequences / types, nothing else, no client access, no client default ACL), plus the core in states S1/S2; the four tables are fingerprinted at the start of step 1 and re-checked at its end; `event_orders` relkind/RLS flags, column names+types md5, sorted table ACL, policy names/commands/roles/permissive md5, constraint shapes (PK, 2 FKs with delete actions, one CHECK with exactly the five status literals), zero user triggers; the columns the functions read exist in `events`, `app_users`, `ticket_tiers`; `auth.uid()` exists. (Policy predicates are not hashed because their exact catalog text was not captured; PRECHECK Q09 shows them for review.)

## Design (what the hardened functions do)

One private core, `private.door_checkin_core(text)`, owned by `postgres`, **no grants to anyone**, in schema `private` (no grants either). Both public wrappers delegate to it, so the two functions can no longer disagree (they did: `check_in_ticket` had a null-owner hole that `event_checkin_scan` did not). Public signatures unchanged. All three: `SECURITY DEFINER`, `SET search_path TO ''`, every relation `public.`-qualified, builtins `pg_catalog.`-qualified, `auth.uid()` qualified. ACLs: `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role` (sorted ACL `{authenticated,postgres,service_role}`); the core: nothing.

Core logic, in order: no JWT subject -> `unauth`; trim, strip ONE leading `KIL-` (any case), trim -> empty -> `empty`; > 128 chars -> `invalid`; caller handle (`NULL` and `''` both mean no handle); token lookup (a token matching 0 or >1 orders -> `invalid`; `qr_token` has no UNIQUE constraint); owner authorisation (caller handle AND event owner both non-null and non-empty, then case-insensitive equal, else `forbidden`); pre-classify `checked_in`/already-admitted/non-paid; then the **atomic single admission**: one `UPDATE ... SET checked_in_at = now() WHERE id = ... AND checked_in_at IS NULL AND status = 'paid' AND <caller still owns the event> RETURNING`, so a concurrent scan or a refund committing mid-scan cannot both win; if it loses it re-reads the committed row and reports `already_used` / `unpaid`. Status stays `paid` (not rewritten to `checked_in`) because the existing counters count `status='paid'` with `checked_in_at`.

Responses: `event_checkin_scan` -> `ok, result, message` + `event_title, tier, qty, checked_in_at` only. `check_in_ticket` -> its existing keys (`status, event, tier, qty, checked_in, sold, at`, plus `order_status` on `notpaid`) minus `buyer`. No attendee contact, no token, no handle, no slug.

Behaviour changes callers should know (all proven in the matrix): `check_in_ticket` now matches the owner handle case-insensitively like the scan does (it was case-sensitive); empty-string handles no longer authorise; duplicated tokens are refused; a refund committing while a scan is in flight is honoured; `event_slug` is no longer in the scan response; `buyer` is gone from both.

## Apply runbook (for Kode, only after the gate above)

Exact order: **12A step 1, 12A step 2, then 13A (#138). 13A's drift guard refuses a 13A-first order.** One function at a time; abort on any drift.

1. Verified backup: `db/proposed/13a-orders-hardening/RUNBOOK-APPLY-BACKUP-ROLLBACK.md` section 2 is the single definition (capture twice + compare, no-data-change proof, dashboard backup optional). Run `PRECHECK-12A.sql`, `12a_DRIFT_QUERY_PROPOSED.sql` (expect `S0_original`) and `VERIFY-12A.sql`; attach all outputs.
2. Step 1: run `12a_01_..._APPLY_PROPOSED.sql` as postgres in one call (or `psql -v ON_ERROR_STOP=1`). Retain the final result set (every row `ok = true`). Run `12a_POSTCHECKS_S1_*`. Sentinel isolated tests (raw / `KIL-` / null-owner / anon / replay) against the scan.
3. Step 2 only after step 1 is verified: run `12a_02_..._APPLY_PROPOSED.sql`; retain output; run `POSTCHECKS_S2` and `VERIFY-12A.sql`; Sentinel tests against `check_in_ticket`. Fixture scans stay isolated/boolean-only; **verify zero TEST ATLAS rows** (VERIFY-12A reports the count).
4. Then 13A per its own README. The optional UNIQUE-index pack is a separate later decision (after 13A, because 13A's drift guard asserts the exact index list; non-transactional; run PRECHECK first, expect zero duplicates).
5. Any `DRIFT` or failed post-check: the transaction has already rolled back; stop and report (do not edit literals in place).

**Backup definition.** Single source of truth: `db/proposed/13a-orders-hardening/RUNBOOK-APPLY-BACKUP-ROLLBACK.md` section 2. Not restated here.

**Rollback criteria.** Roll back (ROLLBACK 02 then ROLLBACK 01, then `POSTCHECKS_S0`) if: a post-check fails after commit, any Sentinel isolated test fails, door staff report valid tickets refused as `invalid`/`forbidden` that should admit, or any reader of `checked_in_at`/`status` misbehaves (e.g. `organizer_dashboard` counts). **Rollback is FAIL CLOSED by default** (`db/proposed/13a-orders-hardening/RUNBOOK-APPLY-BACKUP-ROLLBACK.md` section 5): the default `*_ROLLBACK_PROPOSED.sql` packs refuse because every 12A change closes a hole; the captured originals are restored only by `*_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql` with an explicit acknowledgement (byte-for-byte restore: P09; schema `private` is never dropped).

## What is proven (real PostgreSQL 17.6, socket only, replica, synthetic data)

Full table: `MATRIX-RESULTS.md`. Summary of the last run (2026-11-10): behavioural matrix 81/81 (each test on the original AND the hardened replica; every "detects" test fails on the original, as required), pack/structural 45/45 (including mutation detectors D01-D05, write-set equality R02, VERIFY V01, live adapter cross-check X01 and optional-pack tests U01-U06), adjacent findings 4/4; static cross-check 12/12; adapter unit tests 10/10. The hardened SQL and the packs are unchanged from #137 (no defect was found; see `SUSPECTED-DEFECT-NOT-REPRODUCED.md`). Highlights:

- raw token admits once; `KIL-`, `kil-`, `Kil-` and whitespace-wrapped tokens admit (original `event_checkin_scan` rejected every prefixed form; original `check_in_ticket` did not trim);
- second scan = `already_used` with the original time; two concurrent scans on two real connections (row-lock handshake verified via `pg_stat_activity`) -> exactly one admission; ten parallel scans -> exactly one; a refund committing while a scan waits is honoured (**the original admitted the refunded order, both functions**);
- refunded/cancelled/pending refused; `checked_in` status refused as `already_used`; unknown/empty/`KIL-`-only refused; non-owner refused;
- **null-owner hole**: signed-in caller with no `app_users` row vs an event with NULL `owner_handle`: the original `check_in_ticket` ADMITS it (proven), the hardened one refuses; the same hole for empty-string handle/owner exists on BOTH original functions and is closed;
- anon: no EXECUTE (the original `check_in_ticket` was anon-executable); no PUBLIC grant; sorted ACL exact; `private` core not callable by anon/authenticated/service_role;
- no contact: serialized responses never contain the fixture buyer email or handle, no `buyer`/`email`/`phone` key, no `@`, and only whitelisted keys (the original returned `buyer` in `valid`/`already`/`admitted`);
- search_path: catalog shows SECURITY DEFINER + `search_path=""`; a hostile caller path `evil, public` with look-alike tables is not used. Detector self-check: an unqualified, no-SET copy of the core IS hijacked by the same attack, so the test can fail. Honest note: the ORIGINAL (`search_path=public`, qualified references) was not practically hijackable either; this item is posture/defense-in-depth;
- detector self-checks for concurrency and the refund race: mutating the hardened core (dropping `checked_in_at IS NULL` / `status='paid'`) makes those tests fail;
- packs: static structure (single BEGIN, advisory lock first, single COMMIT, no data DML outside function bodies, no secrets); generator reproducibility; 14 drift cases abort with nothing changed (body altered, ACL, search_path, `private` pre-existing, policy dropped/added, column added, table ACL narrowed, CHECK changed, trigger added, UNIQUE added, wrong role, ticket body drift, core tampered); apply order enforced; second run refuses cleanly (sequential and concurrent); full apply+rollback restores **byte-identical** `pg_get_functiondef` and `prosrc`, equal sorted ACL, config, owner, no `private`, data untouched (raw ACL text also equal in this run); rollback order and rollback drift guard enforced; the advisory lock serialises two runs (second waits on the advisory lock while the first holds its transaction open, then refuses with DRIFT) and queues behind any pack using the same key; `PRECHECK-12A.sql` runs in a READ ONLY transaction and leaks no row contents;
- replica sanity: the installed original functions' `pg_get_functiondef` equals the captured prod text exactly.

## What is NOT verified

- **Sentinel's conditions** (`atlas/checkin-scan-fix.md` unavailable). **No prod run of anything**; the prod baseline is a transcription (whitespace in the transcribed bodies could differ from prod's `prosrc`; the strict md5 guard would then abort safely, and PRECHECK Q03 shows both a strict and a whitespace-normalised md5 to tell the cases apart).
- Real Supabase specifics: `auth.uid()` real implementation (replica reads `request.jwt.claim.sub`; Supabase reads `request.jwt.claims`), default privileges on new objects (guarded by post-checks), ownership by `postgres` vs `supabase_admin`, the PostgREST exposed-schemas setting, behaviour of the SQL executor with a multi-statement transaction containing `DO` blocks and `SET LOCAL`, pgbouncer transaction pooling with advisory locks.
- Real column types/RLS of `events`, `app_users`, `ticket_tiers` beyond the named columns; real `my_handle()`/`my_email()` bodies; whether `qr_token` is indexed (the core does two indexed-or-seq reads; fine at 5 rows; unmeasured at scale); `organizer_dashboard` and any other reader of `checked_in_at`/`status`.
- Nothing was run on PostgreSQL other than 17.6 local; no load test; no UI exists to test end to end; the adapter is unit-tested only.
- Policy predicate text is not asserted by the drift guard (not captured byte-for-byte); policy names/commands/roles/permissive are.

## Open design questions

1. Token match is exact/case-sensitive (as before). Lower-casing both sides would also accept an uppercased QR payload but defeats a plain index. Keep exact?
2. Duplicated `qr_token` is refused as `invalid` (never guessed). Acceptable until a UNIQUE index exists (13A/14A)?
3. `check_in_ticket` becomes case-insensitive on handles (matches the scan and the directive's "lower equal"); confirm that widening is wanted.
4. Admission keeps `status='paid'` (readers count paid + `checked_in_at`); status `checked_in` is treated as already used but never written. Confirm.
5. One QR = one order = whole `qty` admitted at once (no per-seat model); unchanged, `qty` is returned so door staff can see the party size.
6. Authorisation stays owner-handle only (no staff/delegate model).
7. Schema name `private` (per directive). Prod already has one (four incident tables): the packs now accept exactly that shape and never drop it (chain repair, proofs J01-J05 in `../_job30/prove.mjs`).
8. No per-user throttling of scan attempts (128-bit tokens make guessing impractical); add one if wanted.
9. Apply as two separate transactions (as specified) means a window where scan is hardened and ticket is not; that is the "one function at a time" requirement.

## Adjacent findings (NOT fixed here; proven on the replica only; for 13A/14A)

(`FINDINGS-ADJACENT.md` was requested as a separate file; the file-writing guard in the authoring environment refused that filename, so the same content lives here. Move it if the file is wanted.)

- **F1 forged paid order (proof A01).** `orders_anon_insert` (`INSERT TO anon, authenticated WITH CHECK (true)`) plus table INSERT lets anyone insert `status='paid'` with their own `qr_token` for any event. Replica: the insert succeeded and the event owner's scan returned `admitted` on BOTH the original and the hardened functions. The door cannot tell a forged order from a real one; this must be fixed in the table's write surface.
- **F2 organizer UPDATE reaches every column (A02).** `event_orders_organizer_update` lets an owner change `status`, `qr_token`, `checked_in_at` (and amounts/Stripe columns) on their event's orders. Replica: an organizer set a pending order to paid with a chosen token, admitted it, NULLed `checked_in_at` and admitted it again; they could not touch another owner's order. (Also: the organizer RLS predicate compares handles case-sensitively while the door compares case-insensitively.)
- **F3 table-level ALL incl. TRUNCATE and MAINTAIN (A03).** `anon`/`authenticated` hold `arwdDxtm`. Replica: `TRUNCATE public.event_orders` as `anon` emptied the table (RLS does not apply to TRUNCATE; a plain `DELETE` removed 0 rows). PostgREST has no TRUNCATE verb, so reach depends on other exposed paths, but the privilege is wrong to hold; MAINTAIN also allows ACCESS EXCLUSIVE locks.
- **F4** `qr_token` has no UNIQUE constraint/format check; organizers can `SELECT` buyer emails via `event_orders_organizer_read`; buyers read their own `qr_token` (by design).
- **Proposed follow-up (not applied, `FOLLOWUP-13A-14A_orders_PROPOSED_SKETCH.sql`)**: drop `orders_anon_insert` and `event_orders_organizer_update`, `REVOKE ALL ... FROM anon, authenticated` then `GRANT SELECT TO authenticated`, add a partial UNIQUE index on `qr_token`. Replica proof A04: forged inserts, organizer update and anon TRUNCATE all fail (`42501`), a duplicate token fails (`23505`), `service_role` still inserts, organizers still read, and the 12A door still admits. **Preconditions**: the real order-creation path must be identified first (no `event_orders` INSERT exists in `keepitil-web` or `keepitil-app`; if checkout inserts as anon/authenticated, dropping the policy stops sales); legitimate organizer writes found; PRECHECK Q13 duplicates = 0; decide what to do about rows that may already be forged; wrap in the standard pack frame. 12A's drift guard asserts today's policies and table ACL, so order matters (12A first, or re-baseline `orders.*` facts after 13A/14A).

## Running the proofs

`db/proposed/12a-door-hardening/proof/run-proof.sh` (on the Nexus Mac): refuses to start if 1-min load > 8 or free memory < 25%; starts the local socket-only Postgres (`~/work/pg-local/bin/pg-start.sh`); always stops it on exit (trap) and prints `pg-status.sh`; samples load/memory every 3 s into `proof/out/`. Reuses the 11B/R1 real-PG adapter `11b-combined-rehearsal/lib/pgdb.mjs` (NOSUPERUSER stand-in roles `postgres`, `anon`, `authenticated`, `service_role`, `authenticator`; PostgREST-style `BEGIN; SET LOCAL ROLE; set_config('request.jwt.claim.sub')`). `node proof/report.mjs` renders `MATRIX-RESULTS.md`. `node --test adapter/door-scan-adapter.test.mjs` for the adapter.
