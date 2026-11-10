# db/proposed/17a-storage-privacy: PROD STORAGE PRIVACY (DRAFT, proposal only, nothing applied)

Job 13 (Grok directive via KODE, 2026-11-09 21:50). **DRAFT PR. Nothing in this directory is applied anywhere, no prod connection was used, no Storage API call was made, nothing deletes any object or row.**
Base: `draft/13a-orders-hardening` (PR #138), so the pack frame, the real-Postgres harness and the repo-wide advisory-lock key are shared and the packs stay serialised with R1/12A/13A.

## Review and apply gate
* Review happens **on this draft PR itself**: Atlas reviews the migrations, Sentinel reviews before merge. KODE/Grok confirmed (2026-11-10) that **no Sentinel files will be provided** (prod data stays off Drive). Sentinel's `prod-buckets-bak-check.md`, `prod-privacy-fix-chat-inventory.md` and `prod-privacy-fix-backup.sql` were **NOT reviewed** and were not reachable from the build Mac. All expectations come from the read-only catalog capture in `baseline/PROD-FACTS-17A.md`.
* **No prod SQL and no Storage API operation without Joe's relayed yes + Sentinel's pass + Atlas's review of the migrations + a backup.** Every pack runs as `postgres`, one transaction, with the R1/12A/13A frame: `lock_timeout 5s` / repo-wide advisory lock / `lock_timeout 5s`, drift guard (aborts on anything but the captured state), invariant snapshot, the fix, post-checks, invariant compare, retained evidence.

## Findings called out by KODE/Grok (both are fixed by packs here, both remain OPEN until applied)
* **(a) `chat images auth upload` lets any signed-in user write anywhere in chat-images** (`WITH CHECK bucket_id = 'chat-images'`: no uid-prefixed path check). Fixed by **P3b** (INSERT scoped to uid-prefixed paths, or the two legacy shapes the shipped clients still use). Note the clients do NOT use uid-prefixed paths today (`profiles/<slug>/...`, `event-flyers/<file>`), so a uid-only policy would break both uploads (proved: X01); P3b therefore keeps the two legacy shapes until the clients move to `public-assets` (PR-B) and a later strict variant can drop them.
* **(b) agent-posts has 211 SVG objects (of 474) and no `file_size_limit` / `allowed_mime_types`** (script-capable uploads are possible). Fixed for NEW uploads by **P5** (10 MiB + MIME allow-list). Existing SVGs stay and need the sanitise/serve-as-attachment plan below. P5 deliberately keeps `image/svg+xml` allowed (see decision), **P5B** is the SVG-blocked variant for after the generators are confirmed.

## Packs, apply order, status
| # | pack (APPLY + ROLLBACK + POSTCHECKS in `packs/`) | item | state |
|---|---|---|---|
| P0 | `P0_grok_applied_record` (APPLY only, idempotent, no rollback by design) | record Grok 21:47: 11 `_bak_` tables revoked, `shirt_hd_anon_insert` gone | **complete** (proved no-op on the applied state; repairs the pre-Grok state; regression caught) |
| P4 | `P4_profile_content_read` | (4) `profile_content read all` -> public(`archived IS NOT TRUE`) + owners + admins | **complete** |
| P1 | `P1_listing_policies` | (1) drop 4 bucket-wide listing SELECT policies, owner/admin-scoped replacements | **complete** (+ PATH-REPORT-STORAGE.md) |
| P5 | `P5_agent_posts_limits` (and `P5B_..._no_svg` variant, do not apply yet) | (5) size/MIME limits for new uploads | **complete** (SQL part); SVG sanitiser = spec + runbook |
| P2 | `P2_private_drafts_bucket` + `RUNBOOK-STORAGE-MOVES.md` | (2) unpublished cover `posts/lyric-mryyphmm-card.svg` | **partial**: SQL bucket+policy complete; the object MOVE is a Storage API runbook step (Joe's yes) |
| P3a | `P3a_public_assets_bucket` + runbook copy/data-update | (3)(i) dedicated public bucket for the 6 public assets | **complete** (SQL); copy + DB reference rewrite are runbook/template steps |
| P3b | `P3b_chat_images_scoped_insert` | (3)(iii) INSERT scoping + size/MIME limits | **complete** |
| P3c | `P3c_chat_images_private` | (3)(ii) flip chat-images private | **complete, double-gated** (refuses unless P1+P3a, >= 6 assets in public-assets, and zero public-table references to chat-images) |
| P6 | `P6_vs_entries_reviewer_approved` | (6) reviewer + approved-entry SELECT; bucket STAYS public | **complete** (SQL); the flip itself is **next** (after vs-app.js PR-C ships) |
| - | vs-entries flip private, chat-images strict uid-only INSERT (P3d), SVG sanitiser rollout, agent-posts publish-gated copy flow | | **next** (plans in OPEN-QUESTIONS.md / RUNBOOK) |

**Recommended apply order** (each pack is independently rollbackable; rollbacks go in reverse):
`P0 -> P4 -> P1 -> P5 -> P2 (+ move runbook) -> P3a (+ copy + data update) -> deploy PR-B -> P3b -> P3c -> P6 -> deploy PR-C -> (next) flip vs-entries`.
P3b, P3c and P6 refuse (drift abort) without P1; P3c refuses without P3a and the moved assets (proved K-orderchain). Apply AFTER 12A/13A in the stack (same lock key; they touch different objects).

### profile_content overlap with #91 / #92 / #131 (read in their branches)
* #91 `APPLY-1`/`APPLY-2` do not touch `profile_content` policies or ACL; `APPLY-1B` only replaces `profile_content_kind_check` (adds `account_type_request`). No conflict; P4 does not touch constraints.
* #131 (10A) `APPLY-1C` narrows the profile_content **ACL** (anon keeps SELECT only; authenticated loses TRUNCATE/REFERENCES/TRIGGER/MAINTAIN; its guard G5 checks only WRITE policies, so P4's SELECT policies do not trip it). P4 changes **policies only** and its guard accepts BOTH captured ACL classes (A0 before 1C, A1 after 1C), so either order works (proved R10/R10b). P4 revokes nothing: after 1C the anon table grant is SELECT-only and RLS now limits it to non-archived rows.
* Open item for D13 (10A "profile_content read exposure"): P4 implements "public = non-archived". Non-archived `account_type_request` rows written by #91 are still public; see OPEN-QUESTIONS.
* Callers checked (repo grep, `PATH-REPORT-STORAGE.md`): `profile.html` reads without an archived filter and the Archive list needs owner SELECT of archived rows (owner policy), service_role/autopilot and SECURITY DEFINER RPCs (e.g. `get_system_ai_metrics`) are unaffected, `post_saves` embeds `profile_content(...)` as invoker: a saved row that is archived and not yours now embeds as null (R04).

## Decisions made in this draft (flag if you disagree)
1. **Public URLs keep working** because public buckets serve `/storage/v1/object/public/<bucket>/<path>` without any SELECT policy (modelled, not observed: UNVERIFIED against real Storage). The listing policies only enabled list/select/download through the API.
2. **Upsert/download paths**: every client upload is `upsert:false` except `keepitil-playlist-submit.js` (`x-upsert: true`, but a unique `cover-<timestamp>.jpg` name each time). Owner-scoped SELECT keeps owner overwrite/sign/list working (proved S10-S13; the admin-only mutant breaks it, M02).
3. **P5 keeps SVG allowed.** The 211 existing SVG cards imply the generators (`gen-post-image` / `gen-product-post`) upload SVG, and their source is not in any repo available to this draft. Blocking SVG could break generation, so the default pack does not block it; P5B is ready for when the source confirms. The pack also refuses if any existing agent-posts object has a MIME outside the allow-list (existing objects are evidence of what generators send).
4. **chat-images is not a chat feature in the shipped clients**: it holds profile images and event flyers (the 17 objects: 13 at depth 3 = `profiles/<slug>/f`, 4 at depth 2 = `event-flyers/f`). No client writes chat message images (`community_chat_messages.image_url` is read in `connect/index.html` but never written). "Participants" cannot be derived from the path, so chat-images SELECT is uploader / profile owner / admin; a participants RPC is proposed only if a real chat-image feature appears.
5. Bucket rows created by P2/P3a are **left in place by their rollbacks** (no DELETE anywhere); an empty inert bucket remains.

## What is proven and what is NOT
Proven on **real PostgreSQL 17.6** (socket-only, NOSUPERUSER stand-in roles, JWT-claim emulation), `MATRIX-RESULTS.md`: anon/non-owner/owner/admin/reviewer access on all four buckets with negative controls, pending vs approved vs-entries media, profile_content visibility, upsert paths, INSERT scoping, apply/rollback byte-identity, guards, lock serialisation and 55P03, partial-fix mutants.
**NOT verified** (cannot be reproduced on plain Postgres; see `OPEN-QUESTIONS.md` for the Supabase staging test plan): real Storage API behaviour (public-URL serving without SELECT, upsert, `download()`, `createSignedUrl` issuance and expiry, MIME-limit enforcement incl. for service_role, cross-bucket `move`, SVG response headers), whether `postgres` may DDL `storage.objects` policies and UPDATE `storage.buckets` on hosted Supabase and whether the Storage API caches bucket flags, the real bodies of `is_admin()` / `vs_is_admin()`, the unseen predicates of the owner-scoped insert/update/delete policies, Sentinel's files.

## Contents
`packs/` generated SQL (`node build.mjs --check` fails on drift) | `build.mjs` | `PRECHECK-17A.sql` (read-only, catalog/aggregates, no names) | `PRECHECK-17A-INVENTORY_READONLY.sql` (read-only; object NAMES + counts; classifies the 11 unreferenced objects; DO NOT DELETE) | `PATH-REPORT-STORAGE.md` | `RUNBOOK-STORAGE-MOVES.md` | `CLASSIFICATION.md` | `MATRIX-RESULTS.md` | `OPEN-QUESTIONS.md` | `proof/` (replica, `prove.mjs`, `run-proof.sh`) | `baseline/PROD-FACTS-17A.md`.
Web drafts are separate small draft PRs (see OPEN-QUESTIONS): PR-B (chat-images/event/profile uploads -> `public-assets` + signed-URL helper) and PR-C (vs-app.js signed URLs for pending entries), both based on this branch.
