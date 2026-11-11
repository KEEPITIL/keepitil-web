# DRAFT: extraction manifest for stack #136 / #137 / #138 / #150

Status: DRAFT, LIGHT static analysis only (gh file lists, git trees, grep, `node --check`). No proof, test or build was run. Nothing merged, no existing branch pushed.

## Dependency finding

The stack is #138 (13A) -> #137 (12A) -> #136 (R1) -> #135 (11B real PG) -> #134 (11B rehearsal) -> #131 (10A) -> #92 -> #91 -> `draft/m3-browse`. **Merging #138 as-is merges its whole ancestry to `main`, including #91 and #92 (real web changes, not approved), #131 (10A) and the 11B web-adjacent work.** #138 on its own touches only `db/proposed/13a-orders-hardening/`, but its base chain does not.

## (a) File sets and inertness (each PR's own diff vs its base)

| PR | Files | Location | Inert? | Depends on lower-PR files |
|---|---|---|---|---|
| #136 R1 | 37 | 20 under `db/proposed/r1-fix-f3-acl-locks/`, 17 under `db/proposed/11b-combined-rehearsal/` (reports, `lib/*.mjs`, `out/*`, `run-combined.mjs`) | ALL under `db/proposed/` | `build-variants.mjs` regenerates packs from sources in OTHER dirs: `f3-publish-gate/` (#121), `10a-privacy-dependency/` and `10a-privacy-dependency/upstream/` (#131/#91/#92), `11a-upload-ownership/` (#133), `11b-combined-rehearsal/rollbacks/` (#134). The generated `packs/` are committed, so the packs themselves are standalone SQL. |
| #137 12A | 28 | all `db/proposed/12a-door-hardening/` | ALL under `db/proposed/` | `build.mjs` imports `LOCK_KEY`/`aclSorted` from R1 `build-variants.mjs` (pure exports; importing reads no files). `proof/prove.mjs` imports `11b-combined-rehearsal/lib/pgdb.mjs` (first from #135) and R1 `build-variants.mjs`. |
| #138 13A | 25 | all `db/proposed/13a-orders-hardening/` | ALL under `db/proposed/` | `build.mjs` imports R1 `build-variants.mjs`; `proof/prove.mjs` imports `11b-combined-rehearsal/lib/pgdb.mjs`, 12A `build.mjs` (`ORIG`, `HARD`), R1 `build-variants.mjs`; reads 12A `packs/*.sql`. |
| #150 12A final | 17 | all `db/proposed/12a-door-hardening/` (DERIVED-CONDITIONS, SENTINEL-CHECKLIST, VERIFY-12A, SUSPECTED-DEFECT, contract cross-check + test, optional qr_token UNIQUE pack, re-run proof outputs; updates README/MATRIX-RESULTS/prove.mjs). Base = #137 tip d24e604 (merge-base verified), so its head 091171c supersedes #137's 12A docs/proof. | ALL under `db/proposed/` | same as #137 |

Verdict: **all of #136, #137, #138, #150 are `db/proposed/`-only**: no web file, no `assets/js` test, no workflow, no Edge Function. `db/` is in `.github/pages-exclude.txt`; `node-tests.yml` runs only `assets/js/*.test.mjs` (not `db/`). So their only live effect on merge is a Pages redeploy that serves nothing new. The danger is solely the ancestry.

## (b) Clean extraction (this PR)

New branch from `origin/main` (23d718a) containing, built by checking out paths from tips (no cherry-pick, no history):

- `db/proposed/r1-fix-f3-acl-locks/` from #136 tip `c34cad0` (20 files)
- `db/proposed/12a-door-hardening/` from #150 tip `091171c` (38 files; #150 contains #137 `d24e604` as its parent, so this is #137 + #150 final)
- `db/proposed/13a-orders-hardening/` from #138 tip `9e79b99` (25 files)
- `db/proposed/11b-combined-rehearsal/lib/pgdb.mjs` (1 file): the ONLY 11B file the 12A/13A proofs import
- `docs/db-apply-order/` (this manifest and APPLY-ORDER-2026-11-10.md)

Deliberately NOT included: #136's 17 `db/proposed/11b-combined-rehearsal/*` report/log/lib files (11B documentation, not imported by 12A/13A), everything from #91/#92/#131/#134/#135 except `pgdb.mjs`, #139/#141/#142 web files, #146 storage packs.

Light static self-consistency check (done): every relative `import` in the 84 extracted `.mjs` files resolves to a file in the tree (list below); `node --check` passes on all `.mjs`; no path outside `db/` and `docs/` is touched.

| importer | resolves to |
|---|---|
| 12a `build.mjs` | `../r1-fix-f3-acl-locks/build-variants.mjs` |
| 12a `proof/prove.mjs` | `../../11b-combined-rehearsal/lib/pgdb.mjs`, `../build.mjs`, `../../r1-fix-f3-acl-locks/build-variants.mjs`, `../adapter/door-scan-adapter.mjs` |
| 12a adapter tests | `./door-scan-adapter.mjs`, `./door-contract-check.mjs` |
| 13a `build.mjs` | `../r1-fix-f3-acl-locks/build-variants.mjs` |
| 13a `proof/prove.mjs` | `../../11b-combined-rehearsal/lib/pgdb.mjs`, `../build.mjs`, `../../12a-door-hardening/build.mjs`, `../../r1-fix-f3-acl-locks/build-variants.mjs` |

Known limitations of the extracted tree (not defects in the SQL packs):
1. `r1-fix-f3-acl-locks/build-variants.mjs` `buildAll()` / `--check` (regenerating or verifying the R1 locked variants) READS `f3-publish-gate/`, `10a-privacy-dependency/(upstream/)`, `11a-upload-ownership/`, `11b-combined-rehearsal/rollbacks/`. Those directories are not in this tree, so R1's generator cannot be re-run here. The committed generated packs are unaffected. 12A/13A generators only import the pure helpers and are self-contained (their `src/` and `baseline/` are in their own directories).
2. The proofs (`proof/run-proof.sh`) need a local PostgreSQL 17 and the `pg` module via `pgdb.mjs`'s environment variables. **Proof re-run from the extracted tree is a later heavy job.** The committed `proof/out/*` are the results from the original stacks.
3. R1's own 11B matrix reports (in #136 only) are not carried; they stay with #136/#134 history.

## What happens to #136, #137, #138, #150 after the extraction merges (NOT done here)

Recommendation only, for KODE/Joe: once this extraction is merged, #136/#137/#138/#150 are superseded for their `db/proposed` content. Close them as superseded with a pointer to the extraction PR (do not merge them: it would drag #91/#92/10A/11B). Their branches are kept (never delete). Downstream drafts based on them (#139, #141, #142, #146, #149) would need retargeting to `main` or to their own extraction. #139's live part is extracted separately (#153). Door UI (#141/#142) and storage packs (#146) need their own extractions; they are not in this PR.

## Live-behaviour note

This PR is inert for the site. The separate PR `DRAFT: event.html: send session token to create-checkout (bearer fix)` (#153) is a LIVE public change; under Joe's 13:42 policy (relayed by KODE) it can ship after Atlas + Sentinel PASS without a separate Joe go. It does not depend on this PR.

## Not approved

Merging this PR does not apply any SQL. No SQL here is approved to run. See `APPLY-ORDER-2026-11-10.md`.

## Update 2026-11-10 (JOB 22, fixes after Atlas/Sentinel review of this PR)

* New `.github/workflows/db-proofs.yml` (separate from `node-tests.yml`; `permissions: contents read`; postgres:17 service, trust auth on the runner loopback): runs the 12A and 13A real-PostgreSQL proofs, the 12A adapter tests and the generator `--check`s; a missing Postgres fails the job.
* `db/proposed/_ci/` (package.json + lockfile): pins `pg@8.23.1` (published 2026-09-30) for CI only.
* `db/proposed/11b-combined-rehearsal/lib/pgdb.mjs`: env-driven connection (PGHOST/PGPORT/PGUSER/PGDATABASE; unset = the previous local socket defaults).
* 13A: `baseline/live-readers.VERBATIM.sql` (prod bodies), replica now loads them, F-D drift guard pins the verbatim `get_ticket` body, `DIFF.md`, `RUNBOOK-APPLY-BACKUP-ROLLBACK.md`, `CAPTURE-READONLY.sql`.
* R1's proof harness (`run-combined.mjs`, 11B matrix) is still not in this tree; it cannot run from here.

## Update 2026-11-10 (JOB 30, fixes for Sentinel's FAIL of this PR; still DRAFT, MERGING THIS DOES NOT FIX PROD)

* Blocker 1 (chain): the 12A packs no longer require schema `private` to be absent; the guard accepts absent or exactly prod's four postgres-only incident tables and aborts on anything else; the packs create only `private.door_checkin_core`, fingerprint-check the four tables, never drop the schema. Proofs `_job30/prove.mjs` J01-J07 (prod-shaped and fresh replicas, pre-fix pack fails, 12 negative controls).
* Blocker 2 (rollback): default `*_ROLLBACK_PROPOSED.sql` refuse (fail closed); `*_ROLLBACK_REOPEN_HOLES_UNSAFE_PROPOSED.sql` need `SET kil.rollback_reopen_ack` (J10-J16).
* Blocker 3 (backup, hardening): one backup definition (runbook section 2), capture verify row, `replay-from-capture.mjs`, no-data-change proof, search_path scan, default-privilege hardening (J20-J23, J30-J32, J40-J44).
* Blocker 4: checkout bearer stays in PR #153 (`CHECKOUT-DEPENDENCIES.md`); webhook payment-settled handoff diff `handoff/stripe-webhook-payment-settled.PROPOSED.diff`, proved in PR #157's testbed.
* `db/proposed/_shared/` (prod-shaped replica SQL), `db/proposed/_job30/` (proof + pre-fix fixture), pgdb.mjs gains a `supabase_admin` stand-in role; db-proofs.yml gains the Sentinel-fix step.
