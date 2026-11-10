**PROPOSAL ONLY: no prod apply. Draft. Stacked on #134 (base = `draft/11b-combined-rehearsal`).** Evidence only; nothing here can be applied to production and no production access was used.

Re-runs the 11B combined rehearsal on a **real PostgreSQL 17.6** (localhost, Unix socket only, throwaway databases, synthetic data) instead of PGlite 18.6. Harness ported behind `--engine=pg` (default still PGlite, re-verified 203/203). Full write-up: `db/proposed/11b-combined-rehearsal/REAL-PG-REPORT.md`.

## Totals, before (PGlite 18.6) / after (real PG 17.6)
| | before | after |
|---|---|---|
| step post-checks | 80/80 | 80/80 |
| Atlas matrix | 23 PASS / 0 FAIL / 2 PARTIAL / 1 BLOCKED | 22 PASS / **1 FAIL (R1)** / 2 PARTIAL / 1 BLOCKED |
| negative controls | 19/19 | 19/19 |
| rollback pass | 15/15 | 15/15 |
| fingerprints FP0..FP3 | | identical |
| real-PG-only checks | - | 22/22 |

## Differences found
* **R1 now fails**: F3 forward then F3 rollback does not restore the fingerprint on 17.6 (the rollback's final guard refuses, with no APPLY-2 involved). Root cause isolated: aclitem ENTRY ORDER of `tag_event_media` / `tag_venue_media` differs after the rollback's fixed-order re-grants; with ACLs sorted the catalogs are identical (semantic exactness proven). A second forward then needs a re-baselined literal. Depends on prod's original `proacl::text` order (unknown until a read-only capture). Everything else is identical to PGlite.
* **ACL-order finding confirmed on 17.6**: the APPLY-2 then ROLLBACK-2-after-1C round trip reorders ACLs and F3's rollback refuses; engine independent. Suggest fingerprinting sorted `aclexplode`.

## Concurrency (lock waits, tiny DB)
* Owner save in flight (1.5 s) when F3 forward arrives: forward waits 1548 ms, then applies. Owner txn >5 s: forward fails 55P03 after 5001 ms, no change.
* While the forward holds its 8-table ACCESS EXCLUSIVE (3 s): owner save and anon event_media read both block ~3 s; a DRIFT_QUERY capture also blocks and returns the post-forward fingerprint.
* Two forwards / two rollbacks at once: the second waits ~2 s then aborts cleanly; end state = exactly one.
* **Two APPLY-1 runs at once: the second fails `tuple concurrently updated`** (no advisory locks in the packs): serialise by hand.
* Two saves of the same row: second waits 531 ms, no lost update; different rows: no blocking.
* **Anon can `LOCK TABLE event_media IN ACCESS EXCLUSIVE MODE` after F3 (MAINTAIN)** and block readers (reproduced); a version-guarded `REVOKE MAINTAIN` closes it (scratch, proposal).

## Still blocked
M9 real Storage signing + deployed edge function; M11 (`delete_event` body); P1 (real `pc_insert`/`pc_update`); PostgREST/JWT over HTTP (needs PostgREST, separate approval); the real prod catalog (read-only capture).

## Install facts
PostgreSQL 17.6 from npm `embedded-postgres@17.6.0-beta.15` + `@embedded-postgres/darwin-x64@17.6.0-beta.15` + `pg@8.23.1`; 231 MB; RSS idle ~115 MB (6 procs, shared memory double counted), peak ~265 MB (14 procs) during the run; run takes ~60 s; shared Mac load stayed below 5. Unix socket only, mode 0700, `local all all trust`, no passwords anywhere (spec change relayed by KODE).

PROPOSAL ONLY: no prod apply.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
