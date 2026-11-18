> **STATUS: FINAL CANDIDATE for Sentinel review: tests run 2026-11-10; re-derived from code, NOT Atlas's doc, NOT a Sentinel pass**

# Sentinel review checklist: 12A door SQL hardening (PR #137 + this finalize PR)

**Status: FINAL CANDIDATE for Sentinel review. Draft only. Nothing applied anywhere. No prod connection was made.**
Honesty: Atlas's `atlas/checkin-scan-fix.md` was unavailable; the conditions below were **re-derived from the code** (`DERIVED-CONDITIONS.md`). This checklist is a map to evidence, **not a Sentinel pass and not Atlas's conditions**; tick boxes only after Sentinel has looked at the evidence itself, and add any condition of Sentinel's own that is missing. Apply gate (binding): **no prod SQL without Joe's relayed yes + a Sentinel pass + a backup.**

All paths under `db/proposed/12a-door-hardening/`. "Row" = a row id in `MATRIX-RESULTS.md` (re-run: `proof/run-proof.sh`). Every behavioural row runs on BOTH the original (prod-captured bodies) and the hardened functions; "detects" rows must fail on the original.


## Proof run summary (2026-11-10, real PostgreSQL 17.6 replica, synthetic data, on the Nexus Mac)

| Suite | Result |
|---|---|
| Behavioural matrix (each row on original AND hardened; `detects` rows fail on the original as required) | 81/81 (was 59/59; +22 rows = M28-M38 on both RPCs) |
| Pack / structural (incl. mutation detectors D01-D05, R01/R01c, R02/R02c, X01, V01, optional-pack U01-U06) | 45/45 (was 31/31) |
| Adjacent findings A01-A04 (replica only; A01-A03 are open until 13A) | 4/4 |
| Cross-check `adapter/door-contract-crosscheck.test.mjs` | 12/12 |
| Adapter unit tests `adapter/door-scan-adapter.test.mjs` | 10/10; adapter copy byte-identical (md5 c51a63589620122045bd0986815f50f8) in the proposed dir and in drafts 15a and 15b |
| Repo `npm test` (this branch, run once, Postgres stopped) | 167 tests: 160 pass, 2 fail, 5 skipped. The two failures are not from 12A: `admin_move_house_page` (known, fixed by #140 on another stack) and `kil-xss-profile.test.mjs` (jsdom not installed on this Mac: ERR_MODULE_NOT_FOUND) |
| M36 defect hunt | NOT reproduced; no SQL change (the packs and md5 are unchanged from #137) |

## A. Isolated door tests Atlas named (raw / KIL / null-owner / anon / replay)
- [ ] raw token admits once, response has title/tier/qty/time: M01, M01b  **[proof run 2026-11-10: PASS]**
- [ ] `KIL-`, `kil-`, `Kil-`, whitespace-wrapped admit; `KIL-KIL-`, `KIL -`, `KIL_`, `KIL:` refused: M02, M03, M04, M34  **[proof run 2026-11-10: PASS]**
- [ ] null-owner (no handle caller vs NULL-owner event) refused; empty-string handle/owner refused; no-row/NULL handle refused; case-insensitive owner match: M12, M12b, M13, M14, M35  **[proof run 2026-11-10: PASS]**
- [ ] anon has no EXECUTE on either function, no PUBLIC grant, private core unreachable: M19, M20, M25 (+ P04/P05 post-checks)  **[proof run 2026-11-10: PASS]**
- [ ] replay: second scan = already_used with the original time; pre-admitted order keeps its time: M05, M05b  **[proof run 2026-11-10: PASS]**
- [ ] repeat / concurrent: two real connections (row-lock handshake) and ten parallel scans admit exactly once: M06, M07; mutation self-check D01 (race test fails when the guard is removed)  **[proof run 2026-11-10: PASS]**
- [ ] refunded / cancelled / pending / NULL status / `checked_in` status never admitted: M08, M08b, M30, M32  **[proof run 2026-11-10: PASS]**
- [ ] refund committing while a scan waits is honoured (original admitted it): M18; mutation D02  **[proof run 2026-11-10: PASS]**
- [ ] stale (rotated) / unknown / over-long / metacharacter / prefix-of-token / token+1 refused: M09, M17, M28, M29  **[proof run 2026-11-10: PASS]**
- [ ] ownership moved mid-scan refused (no stale-ownership admission): M31; mutation D04  **[proof run 2026-11-10: PASS]**
- [ ] order vanishes between lookups -> no exception, nothing admitted; answers `forbidden` (fail-closed). A suspected unassigned-record exception did NOT reproduce, so no SQL change was made: M36, D05 (see DERIVED-CONDITIONS 'Suspected defect: NOT reproduced')  **[proof run 2026-11-10: PASS]**
- [ ] duplicated `qr_token` refused as ambiguous: M15  **[proof run 2026-11-10: PASS]**

## B. Privacy (attendee contacts, tokens, names)
- [ ] no buyer e-mail / handle / `buyer`/`email`/`phone` key in any response (all codes, owner and non-owner): M22 (original FAILS), M37, M38  **[proof run 2026-11-10: PASS]**
- [ ] token-free: no response echoes the token, a prefix of it, or a garbage payload: M37  **[proof run 2026-11-10: PASS]**
- [ ] names require opt-in: no opt-in column exists, so no name is returned (DERIVED-CONDITIONS DC-14); counters are aggregate integers (M27)
- [ ] adapter drops any key outside its whitelist even if a future server regresses: `adapter/door-scan-adapter.test.mjs`  **[proof run 2026-11-10: PASS]**

## C. Function hardening posture
- [ ] SECURITY DEFINER, `search_path=""`, every relation/builtin/`auth.uid()` schema-qualified: M23, M24; D03 (an unqualified copy IS hijacked, so M24 can fail)  **[proof run 2026-11-10: PASS]**
- [ ] sorted ACL exactly `{authenticated,postgres,service_role}`; core has no grants; `service_role` cannot admit (no JWT subject): M20, M21, M25  **[proof run 2026-11-10: PASS]**
- [ ] the two public functions share one private core, so they cannot disagree again: read `src/*.sql`

## D. Contract with the door UI (#141/#142)
- [ ] every result code the SQL can return is mapped by the adapter and vice versa (static, parses SQL + adapter): `adapter/door-contract-crosscheck.test.mjs` (12 tests; negative controls 1-9 each must fail the check)  **[proof run 2026-11-10: PASS]**
- [ ] live: all seven codes through both real RPCs and both adapter functions, no `error`, keys within whitelist: X01  **[proof run 2026-11-10: PASS]**
- [ ] caller contract (JWT bearer + apikey; 401/403/42501 -> sign in; retry-safe): `CALLER-CONTRACT.md`, M19, M35  **[proof run 2026-11-10: PASS]**

## E. Nothing else moves (readers, status vs checked_in_at)
- [ ] the packs change no table, column, policy, grant, index, constraint, trigger, other public function or row of data: R01 (negative control R01c)  **[proof run 2026-11-10: PASS]**
- [ ] write-set equality: same scan sequence leaves the whole `event_orders` table identical on original and hardened, both RPCs (admission writes only `checked_in_at`; status stays `paid`): R02 (negative control R02c)  **[proof run 2026-11-10: PASS]**
- [ ] the readers (`tickets.html:157`, app `tickets.html:156`, `kil-member.js:302`, `get_my_tickets`, `has_event_ticket`, `organizer_dashboard`) are therefore unaffected. `organizer_dashboard`'s body is NOT in the repo: Sentinel/Kode should read it (PRECHECK) if it counts `status='checked_in'`
- [ ] the one intended response change: `checked_in` status now answers `already_used` (was `notpaid`): M08b  **[proof run 2026-11-10: PASS]**

## F. Apply machinery (unchanged by this job; full re-run included)
- [ ] one transaction, 5 s lock_timeout before and after the advisory lock, drift guard (14 drift cases abort with nothing changed), in-transaction post-checks, retained output rows: P01, P04-P08.14, P14, P14c  **[proof run 2026-11-10: PASS]**
- [ ] apply order enforced; second run refuses; byte-identical rollback of both functions' definitions and ACLs: P05-P07, P09, P10  **[proof run 2026-11-10: PASS]**
- [ ] lock shared with other packs; serialises concurrent runs: P11, P12  **[proof run 2026-11-10: PASS]**
- [ ] PRECHECK is read-only and leaks no contents: P13; VERIFY-12A.sql (before/after counts, definition capture, **zero TEST ATLAS rows**) is read-only and tested including a planted TEST ATLAS row: V01  **[proof run 2026-11-10: PASS]**

## G. Things Sentinel must decide or verify (NOT established by this PR)
- [ ] Sentinel's own conditions (not available to this job)
- [ ] the prod baseline is a **transcription**: run PRECHECK-12A and the DRIFT_QUERY (first row `S0_original`); if `DRIFT`, STOP
- [ ] prod specifics unverified here: real `auth.uid()`, ownership by `postgres` vs `supabase_admin`, default privileges on new objects (guarded by post-checks), PostgREST exposed-schemas must NOT include `private`, pgbouncer + advisory locks, SQL-executor behaviour with multi-statement transactions
- [ ] qr_token DEFAULT expression and entropy (DC-17): not captured; capture it (PRECHECK-13A) before relying on token secrecy
- [ ] open decisions (DERIVED-CONDITIONS): per-seat vs per-order (DC-15), token-existence oracle (DC-18), scan throttling (DC-19), audit table (DC-20), event status/date window (DC-28), staff/delegates (DC-29)
- [ ] order: **12A first, then 13A** (13A's guard refuses 13A-first). The forged-order / organizer-UPDATE / TRUNCATE findings (A01-A03; DC-08, DC-27) stay open until 13A is applied
- [ ] optional UNIQUE index pack (`packs/optional/`, proof U01-U06): decide whether wanted; it is NOT in the required chain and has NOT been reviewed
- [ ] backup: single definition in `db/proposed/13a-orders-hardening/RUNBOOK-APPLY-BACKUP-ROLLBACK.md` section 2 (definition capture run twice and compared, no-data-change proof J22, dashboard backup optional and not a pg_dump); not restated here
