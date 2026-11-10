# MATRIX-RESULTS (17A, real PostgreSQL 17.6, replica + synthetic data)

Engine: PostgreSQL 17.6 (embedded-postgres, Unix socket only). Run time 59s. Last run peak/min: peak load1=5 min free mem pct=57. (An earlier full run on the same Mac peaked at 12.46 load1 while other jobs were running; the preflight load was 4.1; free memory stayed >= 57%.)

**Behavioural matrix 42/42** (negative controls "detects": 25/25 fail on the original and pass hardened; "baseline": 17/17 pass on both = nothing legitimate broke). **Pack mechanics 17/17. Partial-fix mutants caught 9/9. Adjacent 3/3.** Fatal: none.

**Not reproducible on plain Postgres (UNVERIFIED against real Supabase Storage):** real public-URL serving (modelled by `public_url_readable(bucket,name)` = bucket.public), `createSignedUrl` issuance/expiry (modelled as SELECT visibility for the signing user; the expiry arithmetic is a pure-JS test in PR-B), upload/download through the Storage API, MIME/size enforcement, `move`, SVG headers. Replica assumptions (marked `A:` in proof/replica.sql): owner-scoped write predicates, `is_admin()`/`vs_is_admin()` bodies, profile_owners RLS, vs_entries columns.

## A. Behavioural matrix (hardened vs original replica)

| id | test | hardened | original | control |
|---|---|---|---|---|
| S01-agent-posts | anon cannot list/SELECT any object of agent-posts through the table (original: lists everything) | PASS | fails | detects (met) |
| S01-chat-images | anon cannot list/SELECT any object of chat-images through the table (original: lists everything) | PASS | fails | detects (met) |
| S01-playlist-covers | anon cannot list/SELECT any object of playlist-covers through the table (original: lists everything) | PASS | fails | detects (met) |
| S01-vs-entries | anon cannot list/SELECT any object of vs-entries through the table (original: lists everything) | PASS | fails | detects (met) |
| S02 | public URL path still works for ALL objects of the four buckets (public_url_readable: bucket.public, no SELECT policy needed) | PASS | passes | baseline (met) |
| S03 | public flags of the four buckets unchanged (true) | PASS | passes | baseline (met) |
| S04 | playlist-covers: owner sees own cover, a non-owner does NOT see it (original: sees everyone's) | PASS | fails | detects (met) |
| S05 | vs-entries: owner sees own entry media only; a non-owner cannot see another user's PENDING entry media (original: bucket-wide) | PASS | fails | detects (met) |
| S06 | agent-posts: a signed-in non-admin sees nothing (original: everything) | PASS | fails | detects (met) |
| S07 | admin sees every object in all four buckets (moderation / review / signed URLs) | PASS | passes | baseline (met) |
| S08 | chat-images: profile owner A sees profiles/artist-a/* (uploader rows AND legacy NULL-owner rows) + own event flyer, NOT artist-b's (original: all 4) | PASS | fails | detects (met) |
| S09 | chat-images: B sees only profiles/artist-b/p2.jpg (original: all) | PASS | fails | detects (met) |
| S10 | UPSERT (INSERT ... ON CONFLICT DO UPDATE, the Storage API shape of upload upsert:true) of a NEW path by its owner works: playlist-covers (the playlist-submit.js x-upsert flow) and vs-entries | PASS | passes | baseline (met) |
| S11 | UPSERT that OVERWRITES the owner's own existing object works (needs SELECT + UPDATE on the existing row): playlist-covers and vs-entries | PASS | passes | baseline (met) |
| S12 | a non-owner cannot UPSERT over another user's object, nor write into another user's folder (insert policy unchanged) | PASS | passes | baseline (met) |
| S13 | download()/createSignedUrl model: the owner can sign own objects, a non-owner cannot sign another user's, admin can sign any, anon cannot (original: anyone could) | PASS | fails | detects (met) |
| S14 | service_role (edge functions / generators, BYPASSRLS) still reads and writes everything incl. agent-posts | PASS | passes | baseline (met) |
| S15 | the unpublished cover posts/lyric-mryyphmm-card.svg is not listable/signable by anon or a non-admin through the table (P1 alone); the public URL still serves it until it is MOVED (P2 runbook) | PASS | fails | detects (met) |
| R01 | anon sees only non-archived rows (archived=false AND NULL); original: also the archived autopilot/review row | PASS | fails | detects (met) |
| R02 | anon cannot fetch an archived row by id (review-queue item stays private) | PASS | fails | detects (met) |
| R03 | owner A sees own rows INCLUDING archived, not the other profile's archived row | PASS | fails | detects (met) |
| R04 | non-owner B cannot see A's archived row (post_saves embed of it returns null for B) | PASS | fails | detects (met) |
| R05 | admin (is_admin) sees ALL rows incl. archived (review queue / moderation) | PASS | passes | baseline (met) |
| R06 | service_role (autopilot) reads everything | PASS | passes | baseline (met) |
| R07 | owner can ARCHIVE and UN-ARCHIVE own row the way profile.html does (UPDATE ... WHERE id): the unarchive needs the owner SELECT policy | PASS | passes | baseline (met) |
| R08 | owner INSERT/DELETE own rows still work; a non-owner can neither update, delete nor insert into another profile | PASS | passes | baseline (met) |
| R09 | the legacy NULL-archived row stays public (archived IS NOT TRUE, not '= false') | PASS | passes | baseline (met) |
| R10 | order independence with 10A APPLY-1C: after 1C's ACL narrowing the hardened results hold (anon A1 ACL: SELECT only) | PASS | fails | detects (met) |
| R10b | with 1C's ACL, hardened anon sees only non-archived (original under 1C still shows archived: 1C alone does not fix read exposure) | PASS | fails | detects (met) |
| C01 | chat-images INSERT: another user cannot write into profiles/artist-a/ and a user cannot write an arbitrary path (original: any signed-in user, any path) | PASS | fails | detects (met) |
| C02 | chat-images INSERT: the three shapes still allowed: uid-prefixed (chat convention), legacy profiles/<owned slug>/ (profile.html), legacy event-flyers/<file> (create-event.html) | PASS | passes | baseline (met) |
| C03 | chat-images SELECT after P3b: only uploader / profile owner / admin (anon none): chat 'participants' cannot be derived from the path (see OPEN QUESTIONS) | PASS | fails | detects (met) |
| C04 | public-assets: owner inserts profiles/<owned slug>/ and event-flyers/<own uid>/; others cannot; anon cannot; uploads by a non-owner of the slug are refused | PASS | passes | baseline (met) |
| C05 | public-assets has NO listing for anon / non-owners (owner-scoped SELECT only) while its public URLs serve | PASS | fails | detects (met) |
| C06 | public-assets: owner can delete own file (account-deletion sweep) but not another owner's; (chat-images has no DELETE policy today = that sweep silently fails) | PASS | fails | detects (met) |
| C07 | after P3c: chat-images is PRIVATE (public URL no longer serves), public-assets URLs still serve the moved assets; signed URL (SELECT) still possible for uploader/admin only | PASS | fails | detects (met) |
| V01 | anon can SELECT (so sign / list) media of an APPROVED entry only: not pending, rejected, nor a malformed folder (no cast error) | PASS | fails | detects (met) |
| V02 | reviewer (vs_is_admin only) sees every entry's media; a plain user does not see others' pending media | PASS | fails | detects (met) |
| V03 | owner A sees own pending + rejected media; the approval flips visibility: after entry 1 is approved anon sees it, still no listing for others' pending | PASS | passes | baseline (met) |
| V04 | bucket stays PUBLIC and every vs-entries public URL still serves (vs-app.js uses getPublicUrl until its change ships) | PASS | passes | baseline (met) |
| V05 | an owner's UPSERT/overwrite and a non-owner's refusal are unchanged by P6 | PASS | passes | baseline (met) |
| V06 | approval is evaluated live: approve entry 1 as service_role, then anon sees its media | PASS | fails | detects (met) |

## B. Pack mechanics (apply/rollback byte-identity, drift guards, lock, 55P03, order, read-only checks)

| id | test | result |
|---|---|---|
| P0-01 | P0 on the post-Grok state is a NO-OP: nothing changes (fingerprint identical), all post-checks ok; a second run is also ok (idempotent) | PASS |
| P0-02 | P0 on the PRE-Grok state (anon/authenticated still hold grants on the 11 _bak_ tables + shirt_hd_anon_insert exists) performs exactly Grok's changes and nothing else; second run no-op | PASS |
| P0-03 | P0 post-check catches a regressed state: one _bak_ table re-granted to anon, or an anon INSERT policy on shirt-hd (POSTCHECKS ok=false); P0 apply then repairs it | PASS |
| K-P1 | P1: APPLY from the captured state (post-checks ok, DRIFT_QUERY says POST) then ROLLBACK restores the original byte-for-byte (policy text, sorted ACLs, bucket rows, object set); second APPLY refuses cleanly; second ROLLBACK refuses | PASS |
| K-P4 | P4: APPLY from the captured state (post-checks ok, DRIFT_QUERY says POST) then ROLLBACK restores the original byte-for-byte (policy text, sorted ACLs, bucket rows, object set); second APPLY refuses cleanly; second ROLLBACK refuses | PASS |
| K-P5 | P5: APPLY from the captured state (post-checks ok, DRIFT_QUERY says POST) then ROLLBACK restores the original byte-for-byte (policy text, sorted ACLs, bucket rows, object set); second APPLY refuses cleanly; second ROLLBACK refuses | PASS |
| K-P5B | P5B: APPLY from the captured state (post-checks ok, DRIFT_QUERY says POST) then ROLLBACK restores the original byte-for-byte (policy text, sorted ACLs, bucket rows, object set); second APPLY refuses cleanly; second ROLLBACK refuses | PASS |
| K-P2 | P2: APPLY from the captured state (post-checks ok, DRIFT_QUERY says POST) then ROLLBACK restores the original byte-for-byte (policy text, sorted ACLs, bucket rows, object set); second APPLY refuses cleanly; second ROLLBACK refuses | PASS |
| K-P3a | P3a: APPLY from the captured state (post-checks ok, DRIFT_QUERY says POST) then ROLLBACK restores the original byte-for-byte (policy text, sorted ACLs, bucket rows, object set); second APPLY refuses cleanly; second ROLLBACK refuses | PASS |
| K-P6 | P6: APPLY from the captured state (post-checks ok, DRIFT_QUERY says POST) then ROLLBACK restores the original byte-for-byte (policy text, sorted ACLs, bucket rows, object set); second APPLY refuses cleanly; second ROLLBACK refuses | PASS |
| K-second-apply | every pack: a SECOND apply on the applied state refuses at the guard (DRIFT, ABORT) and changes nothing | PASS |
| K-guard-drift | guards ABORT on drift with nothing changed: altered listing policy (P1), extra bucket-wide anon policy (P1), RLS off on profile_content (P4), unexpected ACL (P4), extra SELECT policy (P4), bucket limits already set (P5), SVG-less mime list present in existing objects (P5B), missing is_admin (P1/P4) | PASS |
| K-orderchain | recommended order P0,P4,P1,P5,P2,P3a,P3b,[assets moved],P3c,P6 applies end-to-end with every post-check ok; reverse-order rollbacks bring back the original (except the two inert bucket rows); P3b/P3c/P6 refuse without P1; P3c refuses without P3a | PASS |
| K-p3c-guards | P3c refuses while ANY public table still references chat-images (events.cover_url / jsonb / chat message image_url), while public-assets holds fewer than the minimum assets, and passes once references are rewritten to public-assets and the assets exist; the scan returns counts only | PASS |
| K-lock | pack runs serialise on the repo-wide advisory lock and time out cleanly: while one pack holds the lock a second pack fails with 55P03 after ~5s and changes nothing; once released the second runs | PASS |
| K-nodelete | no pack contains a DELETE/TRUNCATE statement or any DML on storage.objects (grep over the generated files, comments stripped) | PASS |
| K-readonly | PRECHECK-17A.sql, the INVENTORY queries, every POSTCHECKS file and the DRIFT_QUERY run READ ONLY (SET TRANSACTION READ ONLY) on the replica and change nothing; the inventory returns names + counts and classifies the synthetic chat-images objects | PASS |

## C. Partial-fix mutants (each must be caught)

| id | mutant | result |
|---|---|---|
| M01 | P1 mutant: three of the four listing policies dropped, vs_media_read left: caught by behaviour (anon lists vs-entries), by POSTCHECKS(P1 POST) and by DRIFT_QUERY (P1 = DRIFT) | CAUGHT |
| M02 | P1 mutant: listing fixed but NO owner SELECT (admin-only replacements): the owner's UPSERT-overwrite breaks (the very flow the path report protects): caught | CAUGHT |
| M03 | P1 mutant: a stray bucket-wide anon SELECT policy added back after the fix: caught by DRIFT_QUERY and POSTCHECKS | CAUGHT |
| M04 | P4 mutant: 'profile_content read all' dropped, public policy added, NO owner policy: owner cannot UN-ARCHIVE (profile.html Archive list) -> caught | CAUGHT |
| M05 | P4 mutant: public policy written 'archived = false': the legacy NULL-archived row disappears from public pages -> caught | CAUGHT |
| M06 | P4 mutant: policies fixed but RLS then switched OFF (grants to anon left): anon reads archived rows again -> caught by behaviour, POSTCHECKS(req.rls_on_not_forced) and DRIFT_QUERY | CAUGHT |
| M07 | P4 mutant: a permissive 'USING (true)' SELECT policy re-added next to the fix: caught | CAUGHT |
| M08 | P3c mutant: chat-images flipped private BEFORE the references were rewritten: caught by the P3c reference scan (a hand-flip leaves references -> POSTCHECKS(P3c) refuse)  | CAUGHT |
| M09 | P1 mutant: policies fixed but one bucket flipped private by mistake (playlist-covers): public playlist art stops serving -> caught (public URL model + invariant) | CAUGHT |

## D. Adjacent

| id | test | result |
|---|---|---|
| X01 | chat-images paths are NOT uid-prefixed in the shipped clients (profiles/<slug>/..., event-flyers/<file>): a uid-only INSERT policy would break both uploads (documented why P3b keeps the two legacy shapes) | PASS |
| X02 | storage.objects policies of other buckets (manatua_media_member_read) are byte-identical through every pack (invariant inv.other_policies_md5 enforced inside each pack) | PASS |
| X03 | RLS performance shape: owner policies use (SELECT auth.uid()) initPlan form and storage.foldername(name); is_admin() is only evaluated for authenticated (anon policies contain no function calls) | PASS |
