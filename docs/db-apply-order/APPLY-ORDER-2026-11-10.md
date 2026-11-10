# DRAFT: database apply order proposal, 2026-11-10

Status: DRAFT, proposal only. **Nothing here is approved to apply.** No SQL in this PR changed; no prod connection was made to write this. Sources: READMEs of 12A (#137/#150), 13A (#138), 17A (#146), 10A (#131), 11A (#133), R1 (#136), F3 (#121). Where a dependency was not read in full it is marked UNVERIFIED.

## What "deploy" means for these changes

- Merging this PR (or the stack) to `main` triggers `.github/workflows/pages.yml` (on push to main). `db/` and `docs/` are listed in `.github/pages-exclude.txt` (`db/`, `docs/`), so the Pages artifact serves nothing new: a merge is **inert** for the live site, and no workflow applies SQL.
- "Deploy" of the SQL therefore means **KODE applying the packs to prod by hand**, one function/pack at a time, after the gates below. CI never does it.
- Exception, different PR: `DRAFT: event.html: send session token to create-checkout (bearer fix)` (#153) changes a live public page (`event.html`). Under Joe's 13:42 policy (relayed by KODE) it can ship after Atlas + Sentinel PASS without a separate Joe go. It is independent of every SQL step below (web fix only).

## Gates (apply to every SQL step)

| Gate | Meaning |
|---|---|
| G-Atlas | Atlas review of the pack text and proof |
| G-Sentinel | Sentinel PASS (12A: conditions in `SENTINEL-CHECKLIST-12A.md`; note Atlas's source doc was unavailable, conditions were re-derived) |
| G-Joe | Joe's explicit relayed yes for THAT step |
| G-Backup | Definition capture (PRECHECK / DRIFT_QUERY / VERIFY outputs retained) is the read-only backup the connector can produce. A **full data backup is Joe's dashboard action** (Supabase dashboard) and must precede the first write. |

Standing rules in every pack: one transaction, advisory lock key 2979301232487107403 with `lock_timeout 5s`, drift guard aborts with nothing changed, retain the final evidence SELECT. On ANY `DRIFT` stop and report; never edit literals in place.

## Global order (one numbered list)

| # | Step | Depends on | Gates | Independent? |
|---|---|---|---|---|
| 0 | Joe: dashboard data backup. KODE: read-only captures `PRECHECK-12A.sql`, `12a_DRIFT_QUERY_PROPOSED.sql` (first row must read `S0_original`), `VERIFY-12A.sql`, `PRECHECK-13A.sql`; attach outputs | none | Joe (backup) | yes, read-only |
| 1 | **12A step 1**: `12a_01_event_checkin_scan_APPLY_PROPOSED.sql` (schema `private` + `private.door_checkin_core`, replaces `public.event_checkin_scan`). Then `POSTCHECKS_S1`; Sentinel isolated tests (raw token, `KIL-`, null-owner, anon, replay) | step 0 | Atlas, Sentinel, Joe, Backup | no |
| 2 | **12A step 2**: `12a_02_check_in_ticket_APPLY_PROPOSED.sql`. Then `POSTCHECKS_S2`, `VERIFY-12A.sql`; zero TEST ATLAS rows | step 1 verified | Atlas, Sentinel, Joe | no |
| 3 | **13A pack 01**: `13a_01_event_orders_APPLY_PROPOSED.sql` (drops `orders_anon_insert` and `event_orders_organizer_update`, table ACL ALL -> SELECT for anon/authenticated; anon SELECT kept on purpose). `POSTCHECKS_S1` | steps 1-2 (13A's drift guard REFUSES 13A-first) | Atlas, Sentinel, Joe | no |
| 4 | Real purchase + door test (separate doc `docs/money-build/real-test/REAL-CHECKOUT-DOOR-TEST.md`, #154) | web bearer fix live (#153); step 3 recommended so the test also proves orders hardening; door UI needs its own extraction if the camera UI is wanted | Joe | n/a |
| 5 | OPTIONAL **13A pack 02** (F-D `get_ticket` stops returning buyer e-mail; renames live function to `get_ticket__orig_13a`). Review PRECHECK output (body not captured in repo) first; callers outside these repos unknown | step 0 for 13A; shares the lock; independent of pack 01 order | Atlas, Sentinel, Joe | yes (before or after step 3) |
| 6 | OPTIONAL `12a_OPT_qr_token_unique` UNIQUE partial index (non-transactional; PRECHECK must show zero duplicates) | AFTER 13A (13A drift guard asserts the exact index list) | Atlas, Sentinel, Joe | no |
| 7 | **17A storage packs** in order `P0 -> P4 -> P1 -> P5 -> P2 (+ move runbook) -> P3a (+ copy + data update) -> deploy web PR-B -> P3b -> P3c -> P6 -> deploy web PR-C -> flip vs-entries`. P0 is an idempotent record of Grok's applied revoke (11 `_bak_` tables, `shirt_hd_anon_insert`). P3b/P3c/P6 refuse without P1; P3c refuses without P3a and moved assets. P4 (profile_content read policies) overlaps with #131 APPLY-1C ACL narrowing: P4 changes policies only and accepts both ACL classes; not a conflict, but re-run P4's PRECHECK after whichever lands second. P5B (no_svg) must NOT be applied yet. | after 12A/13A (same lock; different objects); web PRs B/C are separate | per pack | partly (each pack independently rollbackable) |
| 8 | **#91 / #92 / 10A (#131) packs**: `APPLY-1`, `APPLY-1B-kind-check`, `APPLY-2`, `APPLY-92` (or `APPLY-92-44col` when 1C precedes #92), `APPLY-1C-grant-narrowing`; order and caveats per `ORDER-10A.md` (not re-read in full here, UNVERIFIED) | #91/#92 web code decisions; NOT approved | Atlas, Sentinel, Joe | no |
| 9 | **11A** `can_upload_event_media_PROPOSED.sql` (#133). Needs `public.events` and `public.profile_owners` (the #91/#92 stack). Deploy order per its README: pack, then agent-tool-invoke v45, rollback = redeploy v44 first then drop function | #91/#92; must precede publish-gate activation | NEXUS lane + Joe | partly |
| 10 | **F3 publish-gate (#121)**: HOLD. Before any apply, re-capture the baseline with the R1 `DRIFT_QUERY` (R1 variants fix order-dependent ACL fingerprints and add REVOKE MAINTAIN) because #121's original fingerprints are order-dependent | R1 variants; 11A (MF2) live before gate activation | Atlas, Sentinel, Joe | no |

R1 itself (#136 content) applies nothing: it supplies the advisory-lock key, the order-independent ACL fingerprint helper (`aclSorted`) used by 12A/13A generators and proofs, and locked/ACL-sorted variants of the F3, 10A, 11A, #91, #92 packs (`db/proposed/r1-fix-f3-acl-locks/packs/`). Whenever steps 8-10 are eventually applied, use the R1 variants, not the originals.

## Rollback order (reverse of apply)

1. 17A (reverse of its own order; P0 has no rollback by design).
2. Optional UNIQUE index rollback.
3. 13A pack 02 rollback (any time).
4. **13A pack 01 rollback BEFORE any 12A rollback** (12A rollback first refuses; proved P21).
5. 12A step 2 rollback, then 12A step 1 rollback (restores captured original bodies and ACLs verbatim, then drops core + schema).
6. 11A: redeploy agent-tool-invoke v44, then `ROLLBACK_PROPOSED.sql`.
7. #91/#92/10A rollbacks per `ORDER-10A.md`.

## What can be applied independently

- Read-only captures (step 0): anytime.
- 13A pack 02 (F-D): independent of pack 01.
- 17A packs: independent of 12A/13A objects (only serialised by the lock), but internally ordered.
- 12A -> 13A -> UNIQUE index: strict chain.

## NOT approved to apply yet (explicit)

Everything above. In particular: no 12A, 13A, F-D, UNIQUE index, 17A, #91/#92/10A, 11A or F3 SQL is approved. The `_bak_` tables drop is Kode's separate item and is not part of this order. Merging this PR does not apply anything.

## NOT verified

- Proofs were not re-run from this extracted tree (heavy job, later). The committed proof outputs are those of #136/#137/#138/#150 as last run on their own stacks.
- The prod baselines are transcriptions of captures; PRECHECK/DRIFT on prod is the real check.
- The live Stripe -> webhook -> `fulfill_ticket_order` chain is untested by the replica; the real purchase test covers it.
- Dependencies inside steps 8-10 were read from READMEs only.
