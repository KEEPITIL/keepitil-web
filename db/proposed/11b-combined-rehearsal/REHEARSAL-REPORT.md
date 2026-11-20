# REHEARSAL-REPORT.md - slice 11B "Combined RLS rehearsal" (PARTIAL, PGlite; proposal only)

**Status: PROPOSAL / EVIDENCE ONLY. Nothing here was or can be applied to production.** `db/` is excluded from Pages and no workflow reads it. No production access of any kind was used (no connector, REST, psql, network). No Postgres server was installed: the only engine is the free PGlite (PostgreSQL **18.6** WASM; production is **17.6**), in memory, one throwaway database per step.

This rehearses the COMBINED final order of ORDER-10A (#131) on ONE replica and runs as much of Atlas's 26-case matrix as PGlite can honestly run on the combined catalog. It is **not** Sentinel's matrix against the real catalog (B3).

Run it: `PGLITE_DIR=$HOME/work/pgl-scratch node db/proposed/11b-combined-rehearsal/run-combined.mjs` (about 100 s; PGlite is also found at `~/work/pgl-scratch` without the variable; exit 0 only if every expected result occurred). Output: `out/run-combined-output.txt`, `matrix-results.json`, `MATRIX-RESULTS.md` (generated, so the numbers cannot drift), `out/matrix-results-full.json`.

## 1. Result in one screen

| | |
|---|---|
| order run | baseline S0 -> APPLY-1 -> APPLY-1B -> APPLY-92 (45-col, corrected) -> attestation (admin functions, `set_config` identity) -> client window (#129 web + bundled-app payloads) + owner opt-in -> **1C** -> F3 (stale abort shown, re-baselined, COPY run) -> 11A -> APPLY-2 |
| post-check blocks | 11 blocks, 80 assertions, **80 pass** (table in MATRIX-RESULTS.md) |
| Atlas matrix (26) | **23 EXECUTED-PASS, 0 EXECUTED-FAIL, 2 PARTIAL (M9, P1), 1 BLOCKED (M11)**; 203 sub-checks, all pass. Cases that changed meaning: C3, C5, C6, C8 (8d), C10; C1/C2 changed layer |
| rollback pass (reverse order) | **exact** (sorted-ACL catalog diff = 0) for ROLLBACK-2-after-1C, 11A, F3 (regenerated), 1C, 92, 1B; **ROLLBACK-1 not exact**: leaves 6 columns + 1 CHECK (documented) and the tightened ACL of schema `private` (undocumented). F3's rollback as committed **refuses** after 1C |
| negative controls | **19 mutants, 19 behaved as required** (the correct order passes all 15 probes first) |
| bundled app save after 1C(+F3) | **refused: `42501 permission denied for table profile_meta`**, nothing written, page unchanged = the designed "app copy breaks until the bundle is rebuilt" result |
| top findings | F3 rollback unusable after 1C as committed and ACL-order-sensitive; early-return removal aborts trusted/DEFINER writers on any evidence-less published page; MAINTAIN left on media tables; APPLY-2 makes 1C's account_type/status part redundant (section 5) |

## 2. How the branch was built

`git worktree add ~/work/wt-11b -b draft/11b-combined-rehearsal origin/draft/10a-privacy-dependency` (the #131 head), identity set repo-local, then one ordinary merge of `origin/draft/f3-publish-gate-proposal` (#121), `origin/draft/11a-upload-ownership` and `origin/draft/10b-noop-save` (#129). All merged **without conflict** (no SQL/JS conflicts). PR base = `draft/10a-privacy-dependency` (stacked on #131).

## 3. The order actually run and what each step proved

Every step ran the committed file in one transaction and then an assertion block (`lib/steps.mjs`, `lib/steps2.mjs`); the same catalog snapshot function (`rehearsal.catalog_snapshot()`, in `COMBINED-REPLICA.sql`) was taken after every step and used by the rollback pass.

| step | notes beyond "assertions passed" |
|---|---|
| S0 baseline | 20 relations, 13 functions, 26 policies; privilege fingerprint FP0 `f6b23015...`; the existing prod gate is installed verbatim (with its early return) |
| S1 APPLY-1 | 22/22 column grants, `profile_owners` reduced to `_select_own`, `claim_profile` revoked from PUBLIC/anon/authenticated, backfill UPDATEs of the published rows **pass the production gate** (S1.9: the early return is still there at this point), pre-existing `private` incident tables survive |
| S1B | before 1B the "request a business type" insert is rejected by the 9-kind CHECK (S1B.0); after, accepted |
| S92 | Q-1 after = 45 columns, hash unreadable, `get_profile_events` owner-gated; the captured live body is replaced |
| S4 attestation | A (house + move), B (founder_self), C (admin_attested) through `admin_*` with `set_config('request.jwt.claim.sub')` + `SET ROLE authenticated`; non-admin refused; `groove-trooper` visible to anon, `tuitea`/review/unattested/unknown fail closed |
| S5 client window | real #129 web payloads (no-op = ZERO profile_meta writes; bio edit; link edit; business-type request; public toggle; insert fallback) and the real bundled-app payload all work on the 22-column grants (the deliberate compatibility window); key-set check: every web key is inside 1C's UPDATE-14, the insert fallback equals INSERT-19 exactly |
| S6 1C | FP2 `d18bcc76...` -> FP3 `f6b67a9e...`; INSERT=19/UPDATE=14, MAINTAIN/REFERENCES/TRIGGER/TRUNCATE gone, events 44 columns, RLS policy and DEFINER reader of `submitted_by` still work, `get_approved_profile` closed. Idempotent. **Alternate order** (1B, 1C, then `APPLY-92-44col`) ends in a catalog snapshot **identical** to 92-then-1C. Stock APPLY-92 refuses after 1C (stale baseline) and changes nothing. Re-running APPLY-1 after 1C re-grants `account_type`/`status` (hazard reproduced) |
| S7 | after 1C: all web saves work, the bundled app save is refused (table in MATRIX-RESULTS.md) |
| S8 F3 | **(a)** committed forward with Atlas's literal `c917a7df...` aborts `Catalog drift` and changes nothing (the expected stale-baseline abort); **(b)** DRIFT_QUERY re-run on the replica under `SET search_path = public, extensions` -> `73d74020...`; **(c)** a COPY with the literal substituted (written to `out/generated/`, git-ignored, "REPLICA ONLY") applies; 8 post-check statements report 19 backup / 19 hidden / 0 orphan-published. F3's ACL lines for `profile_meta` are **no-ops** after 1C (ACLs identical before/after, F3.5) |
| S9 11A | grants authenticated-only; works for submitter / mapped owner / draft-parent owner **after 1C and F3** although callers cannot read `submitted_by` |
| S10 APPLY-2 | anon reads of `profile_meta` closed, owner reads own row, RPC path unchanged, 1C grants untouched |

**On prod the same re-baseline has to be done from a read-only capture (DRIFT_QUERY under the documented `SET search_path`), reviewed difference by difference, never auto-refreshed** (and the fingerprint must be re-taken after APPLY-1/92/1C and after any grant/revoke cycle: finding F2). The generated replica copy must never be used anywhere else.

## 4. Rollback pass (reverse order, catalog diff against the snapshot before each forward step)

Compared: schemas, relations, columns (type/default/identity), column and relation ACLs (exploded, sorted), policies, triggers, constraints, indexes, function definitions (md5), owners, default ACLs.

| rollback | vs snapshot before its forward step |
|---|---|
| ROLLBACK-2-after-1C | **exact** (the stock ROLLBACK-2 would re-grant `account_type`/`status`: reproduced, RB.10b) |
| 11A ROLLBACK | **exact** |
| F3 ROLLBACK as committed | **refuses** and changes nothing: its blanket re-grants (TRUNCATE to anon+authenticated; UPDATE/DELETE/REFERENCES/TRIGGER to anon on `profile_meta`) would re-open what 1C closed (RB.8a; forced past the check in a scratch clone it does re-open them, R1.stock-would-reopen) |
| F3 ROLLBACK **regenerated** (2 lines: `profile_meta` removed from the two re-grants) | **exact** |
| ROLLBACK-1C with `{{PRE_1C_FINGERPRINT}} = FP2` | **exact**, and block-H fingerprint equals FP2 |
| ROLLBACK-92 (placeholders filled from PRECHECK-92 Q-2) | **exact** (old body and ACL back) |
| ROLLBACK-1B | **exact** |
| ROLLBACK-1 (Option A = exact pre-state; placeholders filled) | all ACLs/policies/functions/md5s back to baseline; residue = the 6 added `profile_meta` columns + `profile_meta_minor_flags_agree` (documented in the file) **and the ACL of schema `private`** (APPLY-1's `REVOKE ALL ON SCHEMA private` is never reversed; undocumented; harmless tightening but the prod baseline ACL of `private` was not captured). Option B (the pack's default) additionally leaves anon without INSERT/UPDATE/DELETE/TRUNCATE on `profile_meta` and without everything but SELECT on `profile_owners` (documented, deliberate) |

Mechanical fills/regenerations (all in `run-combined.mjs`, nothing else is edited): ROLLBACK-1 `{{GET_APPROVED_PROFILE_OLD_DEF}}` removed (did not exist, P-3), `{{CLAIM_PROFILE_GRANTS}}` = `GRANT EXECUTE ... TO PUBLIC, anon, authenticated`, Option A swapped in; ROLLBACK-92 placeholders from Q-2; F3 rollback regenerated as above. The `rollbacks/` folder holds byte-copies of ROLLBACK-1/1B/92 from the notes pack (they are not on the #131 branch).

## 5. Findings (combined state inconsistent, or worth a decision)

1. **F3 ROLLBACK is unusable after 1C as committed** (fail-safe: it aborts, nothing re-opens). It must be regenerated from the post-1C capture (ORDER-10A already says so; the 2-line edit is proven exact). **F3's fingerprints hash `relacl::text` and are ACL-order sensitive (F2):** after a legitimate APPLY-2 then ROLLBACK-2-after-1C round trip the catalog is semantically identical (sorted snapshot diff = 0, RB.8pre2) but F3's rollback guard refuses `Forward catalog changed`, and the pre-F3 literal no longer matches (RB.8c shows the two `state` JSONs are identical once ACL entry order is normalised). The reverse-order rollback therefore needs a deliberate, reviewed refresh of `atlas_media_guard.rollback_guard` (done on the replica only, RB.8guard). Suggest Atlas fingerprint over sorted `aclexplode`, as PRECHECK-10A block H does.
2. **Early-return removal vs trusted writers (F3 README row 5, now reproduced):** an evidence-less published row makes APPLY-1's backfill abort (FIND.backfill) and makes `admin_move_house_page` / `set_profile_admin_approved` raise `23514` (FIND.definer). In the stack order APPLY-1 runs before F3 so the backfill passes (S1.9), but every later DEFINER admin call on a published page that fails the gate will fail. The replica fixtures are COMPLETE (an assumption); prod must run `GATE_READINESS` (needs `published_failing_gate = 0`).
3. **MAINTAIN (PostgreSQL 17+)**: 1C removes it on `profile_meta`/`profile_owners`/`profile_content`; F3's S1 revokes name only UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE, so anon and authenticated keep MAINTAIN on `event_media` and `venue_media` and anon can take `ACCESS EXCLUSIVE` locks on them (reproduced, FIND.maintain). Suggest a version-guarded MAINTAIN (and authenticated REFERENCES/TRIGGER) revoke for the media tables. Replica caveat: media-table ACLs are the default `ALL`; check Atlas's Appendix A.
4. **APPLY-2 makes the `account_type`/`status`/`slug` part of 1C redundant** (APPLY-2 revokes the same columns). The negative controls for 1C had to skip APPLY-2 to see it. 1C's lasting value is: UPDATE 14 / INSERT 19 (drops `tagline`, `pronouns`, `book_email`, `badges`, `highlights` UPDATE), REFERENCES/TRIGGER/TRUNCATE/MAINTAIN, `events.submitted_by`, `get_approved_profile`, anon DML on `profile_content`, and the window between step 6 and APPLY-2.
5. **Meaning changes** (stricter #91/1C column denial takes precedence over legacy F3 expectations): C1/C2 now denied at the privilege layer (the trigger layer is proven separately by re-granting the columns in a scratch clone); **C3** `account_type`, `tagline`, `pronouns`, `book_email`, `badges`, `highlights`, `entity_category` are refused (42501) instead of resetting review, the 11 owner-writable content columns still reset review, `profile_public`/`public_fields` do not reset review (F3 README row 6, a visibility change that skips re-review: needs an Atlas/Muse decision); **C5-INFO** the legacy no-op payload can no longer demote a page (it is refused first; it demotes only in the "F3 before 1C" order, N4); **C6** re-assigning the old gate value is refused; **C8d** admin+owner self-publication is closed on the client path (README note 4); **C10** `claim_profile` is revoked, creation is request -> approve -> first save.
6. **Bundled app after 1C+F3**: `INSERT ... ON CONFLICT` with the old 19 keys is refused `42501` before the trigger; the UPDATE leg alone is refused too; compat window (22-col grants): accepted; "F3 before 1C": accepted and **demotes the published page to review** (links 6 -> 4, socials members dropped, `account_type` written as NULL by the blank legacy select). Owners of the 3 pages cannot save from the iOS bundle's editor until the bundle is rebuilt.
7. **APPLY-1 revokes only PUBLIC for `i_own_profile`, `request_profile_claim`, `approve_profile_claim`, `set_profile_admin_approved`**; with Supabase default privileges anon keeps EXECUTE. Bodies refuse anonymous callers (S1.6b), nothing leaks; an explicit `FROM anon` would make it a privilege-layer denial.
8. **ORDER-10A text vs the file**: it says ROLLBACK-92's guard "must be given the 44-column list or it will refuse"; the pack's ROLLBACK-92 has no executable guard (comment only): run after 1C it succeeds and leaves events at 44 columns (S6.rb92-after-1C). Update the text or add the guard.
9. **F3's guard scope** (relations/columns/policies/functions of 8 tables + all `public` functions) does not cover `profile_content`, `profile_claim_requests`, `private.account_*`: a 1C privilege re-granted on `profile_content` after F3 is invisible to F3's rollback (FIND.scope). Only 1C's block H covers them.
10. The two ownership predicates (`atlas_media_guard.owns_parent('event')` and `public.can_upload_event_media`) are identical today; keep them in sync or make one call the other. The `REVOKE SELECT (event_password_hash)` in the corrected APPLY-92 is a no-op on prod (never granted, Q-1) and in the replica; harmless.
11. Confirmed OK: the 44-column variant order equals the 45-then-1C order; stock APPLY-92 refuses after 1C; 1C is idempotent; re-running APPLY-1 after 1C re-opens (do not); F3 forward/rollback are re-runnable; D1: 11 drifts (8 from the F3 proof + 3 combined: 1C undone, events grant, a #91 policy) abort the forward before any change.

## 6. Replica: conflicts resolved and stand-ins (nothing was read from prod)

**Conflicts between the four replicas, and how they were resolved** (`COMBINED-REPLICA.sql` header and sections): (1) `events`: 92-add invented `owner_id`/`internal_notes`/`stripe_acct`; PRECHECK-92 Q-5 says prod has 46 columns (45 + hash) and **no owner_id** -> removed; `id` uuid (92) vs bigint (f3) -> uuid; policies renamed to Q-5's (`events_public_read`, `events_owner_read`, `events_auth_insert`, bodies are stand-ins referencing `submitted_by`/`my_profile_slug()`/`is_admin()`), 92's `events_owner_all` and 10A's `events_submitter_read` dropped. (2) `profile_meta`: f3's 23 real columns (`highlights` NOT NULL default `[]`, 91 had it nullable); the six #91 columns are left to APPLY-1. (3) publish gate: 92-add's simplified gate replaced by Atlas's **verbatim** original; seed rows therefore carry complete evidence. (4) `app_admins`: f3's RLS version (91's had none, which with the blanket grants would let a client write admins). (5) signup trigger vs f3's explicit `app_users` inserts: handles updated after the trigger. (6) `profile_content` policies: 10A per-command policies (91's `with check (true)` stand-in dropped). (7) 91's blanket `grant all on all tables` removed; `profiles` view ACL = SELECT-only (P-10). (8) pre-existing `private` incident tables added (PRECHECK A). (9) `get_profile_events` = the **captured live body** (Q-2), so ROLLBACK-92 can be exact.

**Stand-ins (real bodies/policies not captured)**: `claim_profile`, `my_profile_slug`, `get_event_view`, `get_my_tickets`, `event_orders`, `handle_new_user`/consent/deletion triggers, `events` policies, `venues`, `post_collaborators` (shape only), `cron.job`, the 4 published profile rows (assumed gate-complete), 4 admins (prod has 1), `applications`, all synthetic uuids/rows, `auth.uid()` via `request.jwt.claim.sub` + `SET ROLE` (real roles, but hand-made `anon`/`authenticated`/`service_role`; no Supabase platform roles, no PostgREST, no JWT, no Storage). PGlite is PostgreSQL 18.6 on C collation; prod is 17.6 (MAINTAIN exists in both; 1C's version guard takes the >= 17 branch).

**Verbatim / real**: APPLY-1, 1B, 92 (corrected), 1C, 92-44col, ROLLBACK-1C, ROLLBACK-2(-after-1C), F3 FORWARD/ROLLBACK/DRIFT_QUERY/POSTCHECKS/GATE_READINESS (only the baseline literal is replaced, and the rollback regenerated as described), 11A function + rollback, Atlas's original `tag_*`/gate bodies, the real web `saveEditProfile` (#129 `profile.html` through the repo's own vm harness) and the real bundled-app `saveEditProfile` (www/profile.html of the iOS bundle copy, built from keepitil-web c111ac1, through a small vm).

## 7. What remains for the real-Postgres run (B3) and Sentinel

* Run the same order on a database built from the **real catalog** (17.6, real roles/default privileges, collation) and re-do the re-baseline from a read-only capture; compare its fingerprint trail with FP0-FP3 here.
* **M9** (real Storage signed upload + deployed `agent-tool-invoke`), **M11** (`delete_event` body; check F3's `REVOKE DELETE` on media against an INVOKER body), **P1** (real `pc_insert`/`pc_update`), PostgREST/Data API + JWT for every case, concurrency/lock timing of F3's 8-table `ACCESS EXCLUSIVE`, the 492-function hash set.
* Prod questions the replica could only assume: `GATE_READINESS` = 0 failing published rows; the real ACLs of the media tables and of `venues`/`app_users`/`app_admins` (MAINTAIN/TRUNCATE); prod `private` schema ACL; whether `claim_profile` is called by anything else.
* Decisions: regenerate F3 rollback and decide on sorted-ACL fingerprints; MAINTAIN on media tables; opt-in fields and review reset (F3 row 6); whether APPLY-2 keeps its redundant column revokes.
* A real owner save in a real browser against staging after step 6, and the iOS bundle rebuild.

## 8. Unverified / caveats

Nothing was run against Postgres 17.6 or any hosted system. The "complete evidence" assumption for the 4 seeded published rows decides finding 2's blast radius. The harness proves what is in the files, not that prod matches the PRECHECK captures. The 11A edge harness was run by reference (38/38, mocked Storage). Counts for sub-checks include the same check on two states.
