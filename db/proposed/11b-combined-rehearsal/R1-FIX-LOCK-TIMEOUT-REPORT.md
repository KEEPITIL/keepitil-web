# R1-FIX follow-up: lock_timeout in every locked pack, and the accepted UPDATE-implies-LOCK risk (proposal only)

Draft PR `draft/r1-fix-f3-acl-locks`. Nothing touched production or any hosted database; real PostgreSQL 17.6 on the Nexus Mac (Unix socket, synthetic data), started for the run and stopped after.
Directive (KODE, 2026-11-10): (1) `SET LOCAL lock_timeout = '5s'` right after the advisory lock in the locked wrappers; (2) document the UPDATE-implies-LOCK point on the media tables as accepted risk.

## What changed

* `build-variants.mjs`: `LOCK_SQL` now emits `SET LOCAL lock_timeout = '5s';` / `SELECT pg_advisory_xact_lock(KEY);` / `SET LOCAL lock_timeout = '5s';` after the first `BEGIN;`. All 16 generated APPLY/ROLLBACK packs (locked wrappers and the F3 forward/rollback) carry it; `--check` clean (18 files).
* Deviation from the literal wording, deliberate and proven: the timeout is ALSO set before the lock. A timeout set after the lock statement cannot bound that statement's own wait, so the directive's goal (a second runner fails after ~5 s instead of waiting) is only met with the line before the lock. LK.5c is the negative control showing the post-only placement waits unbounded.
* Harness (`lib/realpg.mjs`): `LK.static` now asserts the exact BEGIN / timeout / lock / timeout sequence (tightened from "lock is the first statement"); `unlock` (used by the CC.7c negative control) strips the whole block; new LK.5, LK.5c, LK.6.

## Results (real PG 17.6, `run-combined.mjs --engine=pg`, R1 packs)

| | before | after |
|---|---:|---:|
| cases EXECUTED-PASS / FAIL / PARTIAL / BLOCKED | 23 / 0 / 2 / 1 | 23 / 0 / 2 / 1 |
| matrix sub-checks | 205 / 205 | 205 / 205 (unchanged: the new checks are real-PG-only, not matrix cases) |
| order post-checks | 81 / 81 | 81 / 81 |
| mutant negative controls | 19 / 19 | 19 / 19 |
| reverse-order rollback pass | 13 / 13 | 13 / 13 |
| real-PG-only checks | 32 / 32 | 35 / 35 (+LK.5, LK.5c, LK.6) |

* LK.5 (probe pack, exact lock text): B fails 55P03 after 5003 ms behind a 7 s holder; A commits normally (7004 ms), B left no row, the advisory lock is free.
* LK.5c (negative control, timeout only after the lock): B waits 8504 ms (the holder's whole hold plus its own 1.5 s) and succeeds: unbounded.
* LK.6 (real R1 APPLY-1 pair): second run 55P03 after 5003 ms, took no public-table lock, catalog equals exactly one APPLY-1.
* The existing no-lock negative controls (LK.2, CC.7c) still pass, as do CC.2 (F3 forward vs a 7 s owner transaction: 55P03 after ~5 s) and LK.1/3/4, CC.7.

## Accepted risk: UPDATE implies LOCK TABLE on event_media/venue_media

Authenticated owners can still take table locks on `event_media` / `venue_media` via their UPDATE privilege. This is not MAINTAIN (R1 revokes MAINTAIN; anon is refused 42501, CC.8), it needs an authenticated owner, not anon, and F3 needs UPDATE for the owner flows.
Changing it is a later design call. Accepted by KODE 2026-11-10. Replaces finding 1 as "open"; finding 2 (unbounded advisory wait) is closed by this change.

## Not verified

PostgreSQL 16 behaviour (no PG16 server); production's server version (assumed 17.6, as in 11B); the real PR #91/#92 files were not re-locked here (use `node build-variants.mjs --lock`).
