# RUNBOOK-STORAGE-MOVES (DRAFT, for KODE to run LATER, only with Joe's relayed yes + Sentinel pass + Atlas review + a backup)

Nothing here has been run. **No step deletes any object or row.** Storage object moves/copies are **Storage API operations, not SQL**: the packs contain no DML on `storage.objects` (a SQL write there does not move bytes and hosted Supabase refuses/warns on SQL deletes). Placeholders: `<PROJECT_URL>`, `<SERVICE_ROLE_KEY>` (never paste real keys into files, tickets or chat), `<ADMIN_JWT>`.

## Step 1: protect the unpublished cover `posts/lyric-mryyphmm-card.svg` (agent-posts is PUBLIC; anyone with the URL can fetch it)
Options assessed
* (a) **Move that object to a private bucket** (recommended, one object). Needs the P2 pack (creates private `agent-drafts`, admin-only SELECT).
* (b) Make agent-posts private entirely: **rejected**. 474 objects (430 `posts/`, 44 `competitions/`); published pages and social posts (Postiz fetches the image URL from the outside) use `getPublicUrl`/stored public URLs; blast radius = every published post image.
* (c) **Publish-gated copy flow** (recommended as the standing process, a follow-up): generators write drafts to `agent-drafts`; on approval (`approveFeed` in the dashboard) a service-role step COPIES the object to `agent-posts` and stores the public URL. This also fixes future drafts. Needs an edge-function change (not in this repo; spec only).
How the cover is referenced (code grep, no prod rows queried): the admin review dashboard (`dashboard.html:717+`) lists agent drafts from RPCs `get_feed_review_admin` / `get_agent_posts_admin` and renders `p.cover` as `<img src>`; drafts are `profile_content` rows flagged `data->>'autopilot'='true'` with a review/approved-pending status (see `get_system_ai_metrics` review_queue). The exact row that holds this cover's URL is not discoverable without a prod read: **KODE to find it with the read-only inventory (`PRECHECK-17A-INVENTORY_READONLY.sql` query 2 pattern, `strpos(col, 'lyric-mryyphmm')`) before moving.**

1a. Apply `17a_P2_private_drafts_bucket_APPLY_PROPOSED.sql` (private bucket + admin SELECT).
1b. Move (Storage API, service role). supabase-js (needs a version supporting `destinationBucket`; UNVERIFIED on this project):
```js
const sb = createClient('<PROJECT_URL>', '<SERVICE_ROLE_KEY>');
const { error } = await sb.storage.from('agent-posts').move('posts/lyric-mryyphmm-card.svg', 'posts/lyric-mryyphmm-card.svg', { destinationBucket: 'agent-drafts' });
```
REST equivalent: `POST <PROJECT_URL>/storage/v1/object/move` with `Authorization: Bearer <SERVICE_ROLE_KEY>`, JSON `{"bucketId":"agent-posts","sourceKey":"posts/lyric-mryyphmm-card.svg","destinationBucket":"agent-drafts","destinationKey":"posts/lyric-mryyphmm-card.svg"}`.
**If the platform version does not support cross-bucket move, STOP.** A copy alone leaves the public original reachable; removing the original is a delete and is NOT in this runbook: it needs Joe's explicit separate yes.
1c. Verify: anonymous `GET <PROJECT_URL>/storage/v1/object/public/agent-posts/posts/lyric-mryyphmm-card.svg` is no longer served; an admin `createSignedUrl('posts/lyric-mryyphmm-card.svg', 3600)` on `agent-drafts` works; a non-admin cannot sign.
1d. Dashboard patch spec (dashboard.html is not locked; draft only if Joe approves): where `p.cover` is rendered, if the URL matches `/object/public/agent-posts/` and 404s, resolve via `supa.storage.from('agent-drafts').createSignedUrl(path, 3600)`. Same helper as PR-B (`assets/js/kil-storage-urls.js`).
1e. Rollback: move back with the same call reversed (`bucketId:agent-drafts`, `destinationBucket:agent-posts`), then P2 ROLLBACK (drops the policy; bucket row stays).

## Step 2: dedicated public bucket and the 6 public event/profile assets (before chat-images goes private)
2a. Run `PRECHECK-17A-INVENTORY_READONLY.sql` query 1/2 (read-only) and fill `CLASSIFICATION.md`. The assets to move are the ones categorised `referenced-by-profile-or-event` (expected 6). **The 11 unreferenced objects are NOT moved and NOT deleted.**
2b. Apply `P3a` (creates public bucket `public-assets`: images only, 5 MiB, owner-scoped insert/select/delete, **no anon/public policy, public read is by URL only**).
2c. COPY each of the 6 objects (download with the service role, upload to the same relative path in `public-assets`, `upsert:false`):
```js
const { data: blob } = await sb.storage.from('chat-images').download('<path>');
await sb.storage.from('public-assets').upload('<path>', blob, { contentType: '<mimetype>', upsert: false });
```
Paths stay `profiles/<slug>/<file>` (owner-scoped by profile) or `event-flyers/<file>` (copy as-is; new uploads use `event-flyers/<uid>/<file>`). Verify each public URL `<PROJECT_URL>/storage/v1/object/public/public-assets/<path>` returns the same bytes (compare sha256) and content-type.
2d. DB reference rewrite (**TEMPLATE; columns come from inventory query 2; prod write; separate approval**). Back up the affected rows first (`\copy (select ...) to ...` outside the DB, never a new table). For each `<table>.<column>` and ONLY the 6 object names:
```sql
BEGIN;  -- run as postgres, after the same lock/timeout frame as the packs
UPDATE public.<table> SET <col> = replace(<col>, '/object/public/chat-images/<path>', '/object/public/public-assets/<path>')
 WHERE strpos(<col>, '/object/public/chat-images/<path>') > 0;           -- text/varchar
UPDATE public.profile_content SET data = replace(data::text, '/object/public/chat-images/<path>', '/object/public/public-assets/<path>')::jsonb
 WHERE strpos(data::text, '/object/public/chat-images/<path>') > 0;      -- jsonb (re-check the row count equals the inventory count)
COMMIT;
```
Rollback = the same statements with the two bucket names swapped. P3c's guard re-scans every text/varchar/json/jsonb column of every public base table (excluding `_bak_` tables) and refuses while ANY reference to `chat-images` remains.
2e. Deploy PR-B (clients upload to `public-assets`), then apply P3b, then P3c. Old app builds (iOS bundle copies of profile.html/create-event.html) keep uploading to chat-images until updated; images they upload after the flip will not display (see OPEN-QUESTIONS 7: decide whether to delay P3c until the app update is adopted).
2f. Rollback order: P3c (flip public=true) -> P3b -> reverse the DB rewrite -> P3a (bucket row stays; copies stay).

## Step 3: agent-posts SVG (211 existing objects): plan, not a pack
* Risk: Supabase serves SVG as `image/svg+xml`; scripts in an SVG execute when the object URL is opened directly. The storage origin (`<ref>.supabase.co`) is a **different origin from keepitil.com**, so keepitil.com cookies/localStorage/sessions are not exposed to such a script. What remains: phishing/redirects from a trusted-looking storage URL, scripted content in anything that embeds it via `<object>/<iframe>` (not `<img>`, where scripts do not run), and exfiltration of anything on the storage origin itself. Whether Storage adds a sandboxing `Content-Security-Policy` header is UNVERIFIED (KODE: `curl -sI` one public SVG URL and read the headers during the approved window).
* Plan: (1) P5 now: stops NEW uploads of HTML/other types and caps size. (2) Confirm the generator source; if it emits SVG, add a sanitiser step to the generator (allow-list elements/attributes, strip `<script>`, `on*` attributes, `javascript:`/external `href`, `<foreignObject>`) and rasterise to PNG/WebP for social posts. (3) For the 211 existing: classify (`PRECHECK-17A.sql` aggregates), scan each for `<script`/`on*=`/`foreignObject` with a read-only fetch job in a sandbox, re-upload sanitised copies by Storage API copy (NO delete), then switch to P5B. (4) Optionally serve as attachment via a CDN rule (`Content-Disposition: attachment` for `.svg`) if public inline viewing is not needed.
* Does the bucket MIME allow-list apply to service_role uploads? **UNVERIFIED** (believed yes: enforced by the Storage API regardless of role). P5 keeps SVG allowed so generation cannot break either way; staging test below.

## Supabase STAGING test plan (replaces what plain Postgres cannot prove)
1. Clone/branch project; apply packs in order. 2. Anonymous `GET /object/public/<bucket>/<path>` for each of the 4 buckets works after P1 (expect 200). 3. `POST /object/list/<bucket>` as anon returns empty; as owner returns own prefix; as admin everything. 4. `upload` with `x-upsert:true` over an own existing path (playlist-covers, vs-entries) succeeds; over another user's path fails. 5. `download()` of own object works, of another's fails. 6. `createSignedUrl` expiry: request 60 s, fetch at 30 s (200) and 90 s (400). 7. Upload `text/html` and a 20 MB file to agent-posts as service_role and as authenticated: record whether P5 blocks them. 8. Upload SVG after P5 (allowed) and P5B (blocked). 9. `UPDATE storage.buckets SET public=false` as `postgres`: confirm the public URL stops serving within seconds (cache?) and that the Dashboard/`updateBucket` API shows the same state; confirm `postgres` may CREATE/DROP policies on `storage.objects`. 10. cross-bucket `move`.
