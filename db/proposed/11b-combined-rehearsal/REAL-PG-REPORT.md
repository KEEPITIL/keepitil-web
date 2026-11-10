# REAL-PG-REPORT.md - slice 11B combined RLS rehearsal on REAL PostgreSQL 17.6 (localhost, Unix socket; proposal only)

**Status: PROPOSAL / EVIDENCE ONLY. Nothing here was or can be applied to production.** PROPOSAL ONLY: no prod apply. `db/` is excluded from Pages and no workflow reads it. No production access of any kind was used (no connector, REST, psql, network to any hosted database). The engine is a throwaway local PostgreSQL **17.6** (the same minor as production) on the NEXUS Mac, one fresh database per step, all synthetic data. This is still **not** Sentinel's matrix against the real catalog (B3).

Same harness as the PGlite run (#134), ported behind a flag: `node db/proposed/11b-combined-rehearsal/run-combined.mjs --engine=pg` (about 60 s; default remains PGlite). Outputs: `matrix-results-real-pg.json`, `MATRIX-RESULTS-real-pg.md`, `out/matrix-results-full-real-pg.json`, `out/run-combined-output-real-pg.txt`. The PGlite outputs are untouched. PGlite mode was re-run after the port: unchanged (203/203, 0 failures).

## 1. Result in one screen

| | PGlite 18.6 (#134) | **real PostgreSQL 17.6** |
|---|---|---|
| post-check blocks (steps S0-S10) | 80 / 80 pass | **80 / 80 pass** (identical) |
| Atlas matrix (26 cases) | 23 PASS, 0 FAIL, 2 PARTIAL, 1 BLOCKED | **22 PASS, 1 FAIL (R1), 2 PARTIAL, 1 BLOCKED** |
| matrix sub-checks | 203 / 203 | 205 / 203 (2 extra R1 sub-checks added for real PG; the 2 failing ones are R1.exact and R1.reapply) |
| negative controls (19 mutants) | 19 / 19 | **19 / 19** (identical mutant outcomes) |
| rollback pass (reverse order, exact catalog diff) | 15 / 15 | **15 / 15** (identical) |
| fingerprint trail FP0 .. FP3 | f6b23015.. d18bcc76.. d18bcc76.. f6b67a9e.. | **identical** |
| F3 re-baselined fingerprint (replica) | 73d74020.. | b1faae71.. (differs, see 3.1) |
| real-PG-only checks (new) | - | **22 / 22 pass** (section 4) |

Line-by-line the two run transcripts are identical except: the engine banner, **R1**, the N14 count (a consequence of R1), and the new real-PG section. Nothing else changed between PGlite 18.6 and real 17.6.

## 2. What now fails: R1 (F3 forward then rollback does not restore the fingerprint)

`R1.exact` and `R1.reapply` fail on real PostgreSQL 17.6 with `Rollback did not restore original catalog (or unrelated drift): stop`. This is the F3 rollback's own final guard, firing right after the F3 FORWARD, with **no APPLY-2 involved**.

Cause (isolated with `diag-f3-roundtrip-pg.mjs`): the state JSON before the forward and after the regenerated rollback differ in exactly two paths, the `acl` of `tag_event_media(...)` and `tag_venue_media(...)`. Before: `{=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,postgres=X/postgres}`. After the rollback: `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. The rollback re-grants in a fixed order (PUBLIC, postgres, anon, authenticated, service_role). With aclitem entries normalised the two states are **identical (0 differing paths)**. Semantic exactness holds: the new `R1.exact-semantic` (rollback with only its final ORDER-sensitive guard bypassed, scratch) restores the pre-F3 snapshot exactly with sorted ACLs, and `R1.reapply-semantic` shows a second forward then needs a **re-baselined literal** (the pre-F3 literal aborts `Catalog drift`).

Why PGlite did not show it: the replica's `tag_*` functions come out of CREATE with a different initial entry order in the two environments (PGlite: `=X, postgres, anon, authenticated, service_role`; real PG: `=X, anon, authenticated, service_role, postgres`) although the SQL is the same. The reordering mechanism itself is identical on both engines (micro-test, PG17.4 here, PGlite 18.6 reproduced separately). I did not isolate why the initial order differs. **Consequence for prod:** whether F3's rollback guard accepts depends on the original `proacl::text` entry order of the production `tag_*` functions (and every other fingerprinted object), which only a read-only capture can show. Recommendation unchanged and now stronger: fingerprint over sorted `aclexplode`, as PRECHECK-10A block H does, or the rollback must be expected to refuse and be re-baselined by hand.

## 3. Real vs PGlite differences found (every case whose result changed)

| item | PGlite 18.6 | real 17.6 | note |
|---|---|---|---|
| R1.exact, R1.reapply | pass | **fail** | section 2 |
| N14 (rollback pre-check bypassed) | 5/11 R checks fail | 7/13 | R1.exact/R1.reapply now also fail; the control still behaves as required |
| F3 re-baselined fingerprint | 73d74020.. | b1faae71.. | follows from the different original ACL entry order, not isolated further |
| FIND.scope | rollback proceeds | needs the final guard bypassed | the scope question concerns the START guard; end guard refuses for the R1 reason |
| F3 ACL-order refusal after APPLY-2 round trip (RB.8pre, RB.8c) | reproduced (PG 18) | **reproduced on 17.6** | the finding is engine independent |
| everything else (all 80 step checks, 19 mutants, 13 other rollback checks, appPayload, ROLLBACK-1 residue, Option B) | | identical | |

### 3.1 PG17 ACL-order result (asked explicitly)
Confirmed on real 17.6: **the APPLY-2 then ROLLBACK-2-after-1C round trip changes aclitem entry ORDER and F3's rollback then refuses** `Forward catalog changed` (RB.8pre; the catalog is semantically unchanged: sorted-ACL snapshot diff 0, RB.8pre2; ROOT CAUSE RB.8c: the two DRIFT_QUERY state JSONs are identical once ACL entries are sorted). Micro-tests (PG17.4 to PG17.6): revoking a role's whole entry and granting it back moves it to the END of `relacl::text`; a plain re-GRANT of a privilege already held does not reorder; function ACLs behave the same. F3's guard hashes `relacl::text`, so the guard is order-sensitive. Plus the new finding of section 2: the same sensitivity bites F3's own forward-then-rollback.

PG17.x default ACLs and MAINTAIN: a fresh database has no `pg_default_acl` rows; `GRANT ALL` on a table yields `arwdDxtm` (the `m` = MAINTAIN is part of ALL on 17), GRANT SELECT does not; a new function has NULL `proacl` and PUBLIC (hence anon) may EXECUTE it.

## 4. Real-PostgreSQL-only checks (22 / 22 pass; not counted in the 26-case totals)

Timings are wall-clock on a tiny synthetic database: they show who waits and for how long relative to the lock window, not production timings. The F3 forward's natural transaction time here is **37 ms** (prod data will be larger). To hold locks for a measurable window, a script's final `COMMIT;` is replaced by `SELECT pg_sleep(n); COMMIT;` (timing instrument, the only edit to a pack file); synchronisation is by `pg_stat_activity` wait events (deterministic), not sleeps.

**PostgREST-style requests in separate real connections (RP.1-RP.4).** Connection role `authenticator` (LOGIN NOINHERIT, no privileges of its own; membership of the three API roles like Supabase) does `BEGIN; SET LOCAL ROLE x; set_config('request.jwt.claims' / 'request.jwt.claim.sub', ..., true); query; COMMIT`. Results: the bare connection role is refused (42501) and cannot `SET ROLE postgres`; anon: `get_public_profile` works and direct `profile_meta` reads are refused after APPLY-2; claims do not leak into the next request on the same connection; owner reads only its own row, bio edit accepted, `account_type` and `status` refused 42501, another user's UPDATE touches 0 rows; two simultaneous identities do not cross-talk. This is SQL-level PostgREST semantics, **not** PostgREST (no HTTP, no JWT signature check).

**Concurrency (CC.0-CC.8).**

| case | what | result |
|---|---|---|
| CC.1 | owner save open ~1.5 s when F3 forward arrives | forward's `LOCK TABLE` waits **1548 ms** (= owner hold), then applies; owner's edit kept |
| CC.2 | owner txn held 7 s (> `lock_timeout` 5 s) | forward fails **55P03 after 5001 ms**, changes nothing (snapshot identical, no guard schema) |
| CC.3 | forward holds its 8-table ACCESS EXCLUSIVE (3 s) | owner save blocked **2995 ms**, anon read of `event_media` blocked **2987 ms**, then both succeed. **A DRIFT_QUERY capture started in that window is also blocked (2700 ms) and returns the POST-forward fingerprint**: a capture cannot be taken "during" an apply |
| CC.4 | two F3 forwards at once | second waits **1995 ms** on the lock, then aborts (`Private schema already exists: stop and re-review`); end state = exactly one forward, one guard row |
| CC.5 | two F3 rollbacks at once (final guard bypassed, scratch) | second waits **2004 ms**, then aborts (`Forward patch is absent or incomplete`); end state = pre-F3 (sorted) |
| CC.6a | two saves of the same row by the same owner, different columns | second waits **531 ms** (row lock), then applies on top; no lost update |
| CC.6b | two owners, different rows | no blocking (5 ms): there is no table-level lock on the owner path |
| **CC.7** | **two APPLY-1 runs at once (no advisory locks in any pack)** | second waits **1985 ms**, then **fails `tuple concurrently updated`** and rolls back; catalog = exactly one APPLY-1. APPLY scripts must be serialised by the operator |
| **CC.8** | **anon `LOCK TABLE event_media IN ACCESS EXCLUSIVE MODE` after F3** | **allowed** (MAINTAIN still granted); a second anon read blocked **1507 ms** for as long as it is held (reproduces finding 3 with real concurrency). CC.8b: a version-guarded `REVOKE MAINTAIN ON event_media, venue_media FROM anon, authenticated` makes it 42501 (scratch only, PROPOSAL). CC.8c: after 1C the same LOCK on `profile_meta`, `profile_owners`, `profile_content` is refused |

Reading: the F3 forward is safe against in-flight owner saves in the sense that it either waits or aborts cleanly with no change, and a second forward/rollback aborts cleanly; the operational cost is that every reader and writer of the 8 tables queues behind it for the transaction's duration, and a long-open owner transaction (>5 s) makes the forward fail (retry).

## 5. Matrix cases re-evaluated

No case changed status because of the engine: the blockers are missing data or services, not Postgres.

| case | status | what still blocks it |
|---|---|---|
| M9 | PARTIAL (7/7 executed pass) | real Storage signed upload and the deployed `agent-tool-invoke` edge function (Supabase Storage / edge runtime, not Postgres); PostgREST + JWT over HTTP. Executed: the SQL ownership boundary `can_upload_event_media` on the combined catalog with real roles, and 11A's mocked edge-tool harness by reference |
| M11 | BLOCKED | the `delete_event` body is not captured (needs the real catalog, read-only). Hazard to check there: F3 revokes DELETE on the media tables, an INVOKER body would now fail its cleanup |
| P1 | PARTIAL (4/4) | the real `pc_insert` / `pc_update` policy predicates are not captured (needs the real catalog); only the stand-in shape was executed |
| PostgREST / JWT over HTTP, all cases | blocked | needs PostgREST (a separate approval) |

M1-M8, M10, M12, C1-C10, D1, R2 are EXECUTED-PASS on real PG with the same sub-check counts as before; R1 is EXECUTED-FAIL (section 2).

## 6. Install and environment facts (for reproducibility)

PostgreSQL 17.6 via npm `embedded-postgres@17.6.0-beta.15` + `@embedded-postgres/darwin-x64@17.6.0-beta.15` + `pg@8.23.1`, `~/work/pg-local` on the NEXUS Mac (macOS 14.8 x86_64), started on demand. **Spec change** (relayed by KODE, 2026-11-10): Unix-domain socket only (`listen_addresses=''`, port 54329 only as the socket suffix), directory mode 0700, `local all all trust`, no passwords anywhere. Stand-in roles `anon`, `authenticated`, `service_role`, `authenticator`, `postgres` (NOSUPERUSER owner stand-in) are created and dropped by the harness (`lib/pgdb.mjs`); a fresh database `kil_rehearsal_<run>_<n>` per step, snapshots via `CREATE DATABASE ... TEMPLATE`, all dropped at the end.

## 7. Unverified / caveats

* Hand-made roles and default privileges, not Supabase's platform roles; no PostgREST, JWT signature, Storage, edge runtime, pg_cron. Replica fixtures and stand-ins are those listed in REHEARSAL-REPORT.md section 6.
* Lock timings are for a tiny database; production table sizes and traffic will lengthen the forward's lock window.
* The original-ACL-order difference between the PGlite and real replicas is observed, not explained.
* Nothing was compared against the real catalog: whether prod's `proacl::text` order makes F3's rollback guard pass is unknown until a read-only capture.
* 4 published seed rows assumed gate-complete (as before); `GATE_READINESS` must be run on prod.
