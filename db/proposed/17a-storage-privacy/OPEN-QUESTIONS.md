# OPEN QUESTIONS / decisions (17A)

**Review path:** Atlas reviews the migrations and Sentinel reviews before merge, on this draft PR itself. No Sentinel files are coming (prod data stays off Drive); Sentinel's `prod-buckets-bak-check.md`, `prod-privacy-fix-chat-inventory.md`, `prod-privacy-fix-backup.sql` are **NOT reviewed**.

## Decisions recorded 2026-11-10 (Joe, relayed by KODE from the KODE PROJECT LOG entries 12:31Z/12:36Z)
Full text: README.md "Decisions (2026-11-10)". Status of the questions below:
* Q1 (move the cover): **decided PRIVATE NOW**, but the move is a Storage API action and stays DRAFTED; **needs a SEPARATE go to run**. Still open: removal of the public original if cross-bucket `move` is unsupported (separate yes).
* Q2 (P3c timing): **decided: wait until after the next iOS update**; P3c is not scheduled. **UNRESOLVED (Joe): what counts as "the next iOS update"** (build number, App Store release vs adoption threshold, whether stragglers are acceptable).
* Q3 (P5 vs P5B): **decided: SVG BLOCKED; P5B primary, P5 alternate (not to be applied).** New open item: the generator follow-up (server-side PNG render, or SVG allowed only for `posts/*-card.svg` via a separate path). Unverified: whether the MIME allow-list applies to the service role (staging test).
* Q4, Q5 (D13 / profile_content): unchanged, still open.
* Review: Atlas + Sentinel before merge; no Sentinel files exist; Sentinel reviews the draft PR itself.

## Findings to carry (from KODE/Grok)
* (a) `chat images auth upload` (INSERT, authenticated, `WITH CHECK bucket_id = 'chat-images'`) lets any signed-in user write anywhere in the bucket: no uid-prefixed path check. P3b scopes it; the shipped clients do not use uid-prefixed paths, so the legacy shapes are kept until PR-B and the old app builds are retired.
* (b) agent-posts holds 211 SVG objects of 474 and has no `file_size_limit` and no `allowed_mime_types`. P5 limits NEW uploads; existing SVGs need the sanitise plan (RUNBOOK step 3).

## Decisions for Joe
1. **Approve the move of `posts/lyric-mryyphmm-card.svg`** (runbook step 1) and the follow-up publish-gated copy flow; if cross-bucket `move` is unsupported, is a separate explicit yes to remove the public original acceptable? (no delete is in any pack.)
2. **P3c timing vs old app builds**: shipped iOS bundles carry old `profile.html`/`create-event.html` that upload to chat-images and store public URLs. After the flip those images will not display. Delay P3c until the app update with PR-B is adopted, or accept broken images for stragglers?
3. **P5 (SVG kept) vs P5B (SVG blocked)**: P5B only after the `gen-post-image` / `gen-product-post` source is checked (not in any repo available to this draft).
4. D13 (10A): P4 makes public = `archived IS NOT TRUE`. Non-archived `account_type_request` rows (#91) and any other kind stay public. Restrict by kind? And rows with NULL archived stay public by design (count is in PRECHECK).
5. `profile.html:1340` reads profile_content with no archived filter, so archived rows have been visible on public profile pages until now; after P4 they disappear for visitors (intended) but owners keep seeing them.

## For Atlas
* Guard facts are shape + predicate-token based for NEW policies and exact normalised text only for the four captured bucket-wide policies; the unseen owner-scoped insert/update/delete policies (playlist-covers names unknown) are protected by "other policies unchanged" invariants (md5 of every other storage.objects policy), not by name.
* `public.is_admin()` / `vs_is_admin()` bodies are not captured (PRECHECK-17A dumps them with ACLs). Packs require existence + EXECUTE for authenticated. `vs_entry_media_is_approved(text)` is new SECURITY DEFINER, `search_path=''`, owner postgres, EXECUTE only anon/authenticated/service_role; it casts the entry id only after a digit-only regex (malformed paths return false, proved V01).
* P3c's reference scan uses `query_to_xml` over every public text/varchar/json/jsonb column (counts only). Cost on prod is a few sequential scans; `statement_timeout` is raised to 120 s for that pack.
* The packs create three bucket rows (agent-drafts, public-assets) and leave them after rollback by design (no DELETE).

## For Sentinel
* `PRECHECK-17A.sql` returns catalog/aggregate data only (proved: no object names in its output). The names-returning query is isolated in `PRECHECK-17A-INVENTORY_READONLY.sql`.
* Not covered: chat "participants" (no schema link between chat rooms and storage paths exists in the repo: uploader / profile owner / admin only); objects outside the four buckets; Storage-API-level controls (rate limits, CORS).

## NOT verified (UNVERIFIED against real Supabase Storage)
Public-URL serving without a SELECT policy; upsert/download/signed-URL behaviour and expiry; bucket MIME/size enforcement for service_role; hosted-Supabase permissions for `postgres` on `storage.objects` policies / `storage.buckets` UPDATE and bucket-flag caching; SVG response headers; cross-bucket move. Test plan: RUNBOOK "Supabase STAGING test plan".

## Other
6. `kode/app.html` uses a bucket `post-media` that is not in the prod catalog capture (dead code or missing bucket).
7. Account-deletion sweep in keepitil-app lists `chat-images/profiles/<slug>` but chat-images has no DELETE policy (always silently failing); it should also sweep `public-assets` (keepitil-app follow-up; locked/other repo).
8. Locked files: no change was needed in `index.html`, `connect/index.html`, `culture/index.html`, `earn/index.html`, `keepitil-shell.js`, `assets/js/keepitil-ai.js`. (`connect/index.html:1107` only reads `community_chat_messages.image_url`.) No "touches locked files" patch spec is required.
9. Next (not drafted as packs): P3d strict uid-only chat-images INSERT; flip vs-entries private after PR-C; dashboard signed-URL change for private drafts; generator publish-gate; SVG sanitiser.
10. (Updated 2026-11-10) PR-B deploy is gated by P3a + asset copy, and may precede the iOS update only because old bundles keep uploading to `chat-images` (permitted by P3b's two legacy path shapes; bucket stays public while P3c is deferred). Web draft PRs: **PR-B** `draft/17a-b-public-assets-uploads` (uploads to `public-assets` + `assets/js/kil-storage-urls.js` helper + tests) and **PR-C** `draft/17a-c-vs-signed-media` (vs-app.js signs pending-entry media; approved entries keep public URLs while the bucket is public), both with base = `draft/17a-storage-privacy`. Deploy PR-B only AFTER P3a + the asset copy; PR-C is safe before the vs-entries flip (falls back to the public URL if signing fails).
