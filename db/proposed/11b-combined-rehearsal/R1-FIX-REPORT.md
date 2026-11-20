# R1-FIX report - real PostgreSQL 17.6 re-run of the 11B matrix (proposal only)

Draft PR `draft/r1-fix-f3-acl-locks`, stacked on #135. Nothing touched production or any hosted database. Engine: the throw-away PostgreSQL 17.6 on the Nexus Mac (Unix socket, synthetic data, started for the runs and stopped after).
What changed and why: `../r1-fix-f3-acl-locks/README.md`. Raw output: `out/run-combined-output-real-pg-r1fix.txt`, `matrix-results-real-pg-r1fix.json`, `MATRIX-RESULTS-real-pg-r1fix.md`.

> **Follow-up 2026-11-10 (KODE):** finding 2 below (unbounded advisory-lock wait) is superseded: every locked pack now sets a 5 s `lock_timeout` before and after the lock, and finding 1 is recorded as an accepted risk. See `R1-FIX-LOCK-TIMEOUT-REPORT.md` and the README of `r1-fix-f3-acl-locks`. The numbers below are the baseline of the R1 commit.

## Result

| | 11B real-PG baseline (`--packs=orig`, re-run today) | R1-FIX (`--packs=r1`, default) |
|---|---:|---:|
| cases EXECUTED-PASS | 22 | **23** |
| cases EXECUTED-FAIL | 1 (R1) | **0** |
| PARTIAL (M9, P1) | 2 | 2 |
| BLOCKED (M11) | 1 | 1 |
| sub-checks passed | 203 / 205 | **205 / 205** |
| order post-checks | 80 / 80 | 81 / 81 (new F3.7 MAINTAIN check) |
| mutant negative controls | 19 / 19 | 19 / 19 |
| reverse-order rollback pass | 15 / 15 | 13 / 13 (the two workaround steps RB.8pre and RB.8guard are no longer needed; RB.8b now runs unbypassed) |
| real-PG-only checks (RP, CC, PG17, ACLO, LK) | 22 / 22 | 32 / 32 |
| overall failures | 1 | **0** |

The baseline reproduces exactly with `--packs=orig` (output in `out/run-combined-output-real-pg-orig-reproduction.txt`), so the harness edits are mode-neutral. PARTIAL / BLOCKED cases are unchanged
and still need the real catalog (Storage, `delete_event`, real `post_collaborators` policies).

## Negative controls (each shows the defect with the old behaviour, then passes with the fix)

* **ACL order, scratch tables (ACLO.1 / ACLO.2 / ACLO.3).** Old `relacl::text` / `attacl::text` / `proacl::text`: fingerprint DIFFERS after revoke + re-grant moved the anon entry to the end (the assertion "equal" FAILS; ACLO.1 passes because it shows the difference). Sorted expression: EQUAL; still changes on a real privilege change; NULL stays distinct from `{}`.
* **ACL order, real packs (ACLO.real-control, R1.exact, R1.fp-roundtrip, RB.8b, RB.8c, `diag-f3-roundtrip-pg.mjs`).** Original F3 forward + original regenerated rollback: refused with "Rollback did not restore original catalog" (`out/diag-f3-roundtrip-orig.txt`: fingerprint DIFFERENT, only `functions/22/acl` and `functions/23/acl` differ, same entries reordered). R1 pair: rollback runs with ALL guards intact and the fingerprint is EQUAL (`out/diag-f3-roundtrip-r1.txt`), also after the full forward -> APPLY-2 -> ROLLBACK-2-after-1C -> 11A rollback -> F3 rollback round trip (RB.8b/RB.8c).
* **MAINTAIN (CC.8, CC.8-control, F3.7, FIND.maintain).** Original F3: an anonymous session takes `LOCK TABLE event_media ... ACCESS EXCLUSIVE` and a second anonymous read blocks ~0.8 s (CC.8-control). R1 forward: anon refused 42501 on both tables, no MAINTAIN for anon/authenticated/PUBLIC, `maintain_prior_grants` equals exactly the pre-F3 `m` entries (4 rows on the replica), the rollback restores them (R1.exact: whole-catalog snapshot identical; R1.fp-roundtrip).
* **Lock (LK.1 - LK.4, CC.7, CC.7c, LK.static).** Two real connections, same lock text as every pack: B shows an ungranted advisory lock on key 2979301232487107403 in `pg_locks` and its first statement runs only after A committed (B.start >= A.end, 1 ms after). Control without the lock statement (LK.2): B starts 1.5 s BEFORE A ends (overlap). Abort also releases (LK.3, A dies with 22012, B proceeds). Cross-pack (LK.4): R1 F3 forward vs R1 11A install on the replica: 11A waits ~2 s, both succeed. Real packs (CC.7): two APPLY-1 at once now queue (second holds no public relation lock while waiting, then completes idempotently on the committed state, catalog == one APPLY-1); control CC.7c with the lock stripped reproduces `tuple concurrently updated`. LK.static: 16/16 pack files have the lock as the first statement after BEGIN, same key.

## Findings that remain (not papered over)

1. **`authenticated` can still take ACCESS EXCLUSIVE locks on `event_media` / `venue_media`** through its UPDATE privilege (CC.8 metric `authenticated:event_media:ALLOWED`, `authenticated_has_UPDATE_on_both: true`). `LOCK TABLE` is not subject to RLS. This is not MAINTAIN and F3 needs that UPDATE for owner flows, so R1 does not change it; mitigation would need a different design (e.g. no direct UPDATE grant, or a statement/lock timeout role setting). Needs a decision.
2. The advisory-lock wait is **unbounded** unless the running session sets `lock_timeout` (the lock is deliberately the first statement, before F3's `SET LOCAL lock_timeout = '5s'`).
3. The F3 baseline literal is still stale and **must be re-captured on prod with the R1 `DRIFT_QUERY`**; a forward applied from the ORIGINAL F3 file cannot be rolled back with the R1 rollback (its stored guard hash is order-sensitive and will not match); apply R1 pairs only.
4. Not verified: PostgreSQL 16 behaviour of the version guards (no PG16 server available; the DO blocks use dynamic `EXECUTE` so the file parses there, but that branch is untested); production's server version was assumed 17.6 per 11B, not queried; the locked wrappers were derived from the in-repo copies of the #91/#92 files (`cmp`-identical to the notes-pack originals), not from the PR branches themselves; no run on Supabase's real roles/PostgREST.

## Resources

Mac load 1-min: 2.61 before, 4.11 after, peak 5.92 (sampled every 20 s; limit ~8). Free memory 64% before, minimum 63% during, 64% after (limit 25%). Postgres stopped after the runs (`pg-status.sh`: no server running). Each matrix run took ~60-80 s.
