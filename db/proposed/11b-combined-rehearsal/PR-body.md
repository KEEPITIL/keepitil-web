## db/proposed 11B combined RLS rehearsal (partial, PGlite; proposal only)

**PROPOSAL / EVIDENCE ONLY. Nothing here is applied or appliable** (`db/` is excluded from Pages; no workflow reads it). No production access of any kind was used. No Postgres server was installed: the only engine is the free PGlite (PostgreSQL 18.6; prod is 17.6). Stacked on #131 (base = `draft/10a-privacy-dependency`); the other proposals (#121 F3, 11A, #129/10B) were merged in without conflict to build this branch.

Rehearses the COMBINED order of ORDER-10A on ONE replica (`COMBINED-REPLICA.sql`, a union of replica-91 / 92-add / 10a-add / f3 with every conflict resolved and listed) and runs Atlas's 26-case matrix as far as PGlite honestly can: `node db/proposed/11b-combined-rehearsal/run-combined.mjs` (about 100 s).

Order run, with an assertion block after each step: APPLY-1 -> 1B -> APPLY-92 (45-col) -> attestation (admin functions, `set_config` identity) -> client window (real #129 web payloads + real bundled-app payload) + owner opt-in -> **1C** -> **F3** -> 11A -> APPLY-2 -> reverse-order rollback with an exact catalog diff.

**Results** (details: `MATRIX-RESULTS.md`, `REHEARSAL-REPORT.md`, `matrix-results.json`):
* 80/80 step assertions pass. Matrix: **23 EXECUTED-PASS, 0 EXECUTED-FAIL, 2 PARTIAL (M9, P1), 1 BLOCKED (M11)**; stricter #91 column denial takes precedence over legacy C3 type-edit expectations (C3, C5, C6, C8d, C10 changed meaning, C1/C2 layer).
* F3 FORWARD: the committed forward aborts with the expected stale-baseline `Catalog drift`; re-baselined from the DRIFT_QUERY on the replica into a COPY, which applies. **On prod the same re-baseline has to be done from a read-only capture, reviewed difference by difference, never auto-refreshed.**
* Bundled app save (old 19-key upsert incl. `account_type`) after 1C (+F3): refused `42501 permission denied for table profile_meta`, nothing written = the designed "app copy breaks until the bundle is rebuilt". Under F3 without 1C it demotes a published page to review (negative control N4).
* Rollback pass: exact for ROLLBACK-2-after-1C, 11A, F3 (regenerated), 1C, 92, 1B; ROLLBACK-1 leaves its documented residue plus the tightened `private` schema ACL. F3's rollback as committed refuses after 1C.
* 19 negative controls (mutants of the order), all behave as required.

**Top findings:** F3 rollback unusable after 1C as committed and its fingerprints are ACL-order-sensitive (a legitimate APPLY-2 round trip makes it refuse); removing the gate's early return aborts APPLY-1's backfill and the DEFINER admin functions on any evidence-less published page (run GATE_READINESS on prod); PG17 MAINTAIN stays on `event_media`/`venue_media` (anon can lock them); APPLY-2 makes 1C's `account_type`/`status` part redundant.

**Not covered (needs real Postgres/PostgREST, B3, and Sentinel):** M9 real Storage/edge, M11 `delete_event`, P1 real policies, HTTP/JWT, concurrency, the real catalog. Stand-ins are listed in the report.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
