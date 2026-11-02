# asc-doorbell

Hourly Cloudflare Worker (free plan, $0). It reads the App Store review state of TUITEA, KMOB, the
KEEPITIL app and KAI TARAKO from the App Store Connect API and posts to a NEXUS crew room **only when
a state changes** (e.g. Waiting for Review → In Review → Approved / Rejected).

- Cron `0 * * * *` (24 runs/day; well inside the free tier).
- Last state per app is kept in Workers KV (`state:<bundleId>`); about 4 reads + ≤4 writes per run.
- The first run after deploy only records state; it posts nothing.
- A changed state is saved only after the post succeeds, so a failed post is retried the next hour.
- The ASC token is an ES256 JWT signed inside the Worker (15-minute expiry). Nothing secret is logged.

Not deployed. Deploy needs Joe's go.

## One-time setup (Joe)

### 1. App Store Connect API key
App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → **+**.
Role **Developer** is enough (read-only use). Download the `.p8` (only possible once) and note the
**Issuer ID** and **Key ID**.

### 2. Poster account in NEXUS (dojmswwxmdtizrtoirem)
1. Supabase dashboard → Authentication → Users → **Add user**: e.g. `doorbell-poster@keepitil.com`,
   a long random password, *Auto Confirm User* on. This is a dedicated account; don't reuse a person's.
2. Pick the crew room (`select id, title from crew_rooms;`) and add the poster row (SQL editor):
   ```sql
   insert into public.crew_posters (user_id, label, room_id, auto_run, added_by)
   values ('<poster user id>', 'asc-doorbell', '<crew room id>', false, '<Joe''s user id>');
   ```
   `auto_run = false`: the doorbell only informs and should never trigger crew work. RLS
   (`crew_messages_poster_insert`) then lets this account insert `kind = 'message'` rows into
   that room only. Revoke any time with `update crew_posters set revoked_at = now() where label = 'asc-doorbell';`.

### 3. Cloudflare (from this folder)
```sh
npx wrangler kv namespace create DOORBELL_KV   # paste the id into wrangler.toml
# put the crew room id into CREW_ROOM_ID in wrangler.toml
npx wrangler secret put ASC_ISSUER_ID
npx wrangler secret put ASC_KEY_ID
npx wrangler secret put ASC_PRIVATE_KEY        # paste the whole .p8, BEGIN/END lines included
npx wrangler secret put NEXUS_ANON_KEY         # NEXUS project's anon/publishable key
npx wrangler secret put POSTER_EMAIL
npx wrangler secret put POSTER_PASSWORD
npx wrangler deploy
```
Secrets go only into Worker secrets: not this repo, chat or logs. Delete the local `.p8` afterwards or
keep it in a password manager.

### 4. KAI TARAKO
Its `bundleId` in `wrangler.toml` is empty (skipped) until it has an App Store Connect record. Fill it in and redeploy.

## Check it
- `npm test` runs the unit tests (ASC and NEXUS mocked, no network).
- After deploy: `npx wrangler tail`, then trigger from the dashboard (Worker → Settings → Triggers → cron → *Trigger*).
  The first run is silent; change state in KV (`npx wrangler kv key put --binding DOORBELL_KV state:com.keepitil.app '{"version":"0","state":"X"}'`)
  to force one test post.

## Note on location
keepitil-web is served by GitHub Pages, so this folder's source is publicly readable at
keepitil.com/workers/asc-doorbell/. It holds no secrets, but if that's unwanted, move it to a private repo.
