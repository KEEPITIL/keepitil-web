# STEP 1 apply runbook: #67 (event_orders guard) + #182 (payout-flag lock)

**Status:** draft. **NOT APPLIED.** Run only on Joe's/Grok's **GO**, by the person with prod access.
It is dry-run end to end in PGlite against the live baselines:
`node --test proposed/supabase/tests/step1-runbook.dryrun.pglite.test.mjs` runs this runbook's own files in this order.

**What changes in prod:**
- one trigger on `public.event_orders` (#67);
- on `public.app_users`, one trigger plus revoked client grants (#182);
- one new service-role function (#182);
- one new Edge Function, `connect-status`;
- one page change (`create-event.html`).

No data is changed. No Stripe setting changes: `connect-status` uses the existing `STRIPE_SECRET_KEY`, which is a TEST key in prod today.

## 0. Before you start
- **Repos:** check out the two at the reviewed commits.
  - `keepitil.github.io` **#67** at `742e818`: `.github/internal/supabase/proposed/event_orders_guard/`.
  - `keepitil-web` **#182** at this commit: `proposed/supabase/sql/`, `proposed/supabase/functions/connect-status/`, `proposed/runbook/`, `create-event.html`.
- **Connection:** an env var `KIL_PROD_DB_URL` that holds the **session pooler** URI (port 5432, user `postgres.<project-ref>`), from the Supabase dashboard → Database → Connection string.
  - **Never paste it into a doc, PR, chat or shell history.** Load it from your password manager into the shell for this session only.
  - Use the session pooler, not the transaction pooler (6543), for the DDL.
- **Tools:** `psql` and `pg_dump` at version ≥ the server's major version (check `select version();`). `supabase` CLI logged in, with `KIL_PROJECT_REF` set.
- **psql flags:** every command uses `-X` (no `~/.psqlrc`) and `-v ON_ERROR_STOP=1` (the first error stops the file).
  - Each SQL file is **one transaction** (`begin … commit`) with its own PRECHECK and VERIFY.
  - An error aborts the transaction, so **nothing from that file is applied**. Do not add `-1`: the files already contain their transaction.
- **Expected live baselines** (the PRECHECKs pin these; the backup prints them):

| function | md5 |
|---|---|
| `mark_payouts_enabled()` | `975786ee803b22f894ef01af63f20d5c` |
| `check_in_ticket(text)` | `bc0a07ce552ea84acd4c0130a5cf8df3` |
| `event_checkin_scan(text)` | `d6f2977aa8a0f8eebaadfac021892cbb` |

## 1. Backup (read-only)
```bash
B="$HOME/kil-backups/step1-$(date -u +%Y%m%dT%H%MZ)"; mkdir -p "$B"; chmod 700 "$B"
# the two touched tables: schema + data + policies + grants + triggers, custom format (restore with pg_restore)
pg_dump "$KIL_PROD_DB_URL" --no-owner -Fc --table=public.event_orders --table=public.app_users -f "$B/tables.dump"
# the same, schema only, as readable SQL for review
pg_dump "$KIL_PROD_DB_URL" --no-owner --schema-only --table=public.event_orders --table=public.app_users -f "$B/tables.schema.sql"
# the three touched functions: definition + md5 + ACL (pg_dump cannot pick single functions)
psql "$KIL_PROD_DB_URL" -X -v ON_ERROR_STOP=1 -A -F '|' -f proposed/runbook/backup-functions.sql -o "$B/functions.txt"
```
- **Check the md5s:** the three in `functions.txt` must equal the table above. Otherwise **STOP**: prod changed since review.
- **Where the backup lives:** the backup holds personal data (`app_users`, `event_orders` buyer emails). It stays in `~/kil-backups/…` on the operator's encrypted machine, **never in a repo or a chat**. Delete it when Joe says (suggested: 30 days after a clean step 1).

## 2. Apply, in this order (each step has a check; any failure → section 6)
**A. #67 SQL: the event_orders organizer write guard**
```bash
psql "$KIL_PROD_DB_URL" -X -v ON_ERROR_STOP=1 -f .github/internal/supabase/proposed/event_orders_guard/event_orders_guard.PROPOSED.sql
```
- **Expect:** ends with `COMMIT`, and no `ERROR` or `PRECHECK` / `VERIFY` exception.
- **Then:** run section 4; rows 1–3 must be `t`. Rows 4–8 stay `f` until step D.

**B. Deploy `connect-status`** (#182; uses the existing TEST `STRIPE_SECRET_KEY`; no secret changes)
```bash
supabase functions deploy connect-status --project-ref "$KIL_PROJECT_REF"
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://$KIL_PROJECT_REF.supabase.co/functions/v1/connect-status"
```
- **Expect:** `401` without a session.
- **Rollback:** the function only reads Stripe and calls a writer that doesn't exist yet, so deploying it first is harmless.

**C. Ship the #182 page** (`create-event.html`: `connect-status` replaces the client `rpc('mark_payouts_enabled')`)
- Merge the page part of keepitil-web #182 and let the site deploy.
- Check the live page: it contains `functions/v1/connect-status` and no `mark_payouts_enabled`.
  ```bash
  curl -s https://keepitil.com/create-event.html | grep -c "connect-status"
  ```
  expects ≥ 1, and
  ```bash
  curl -s https://keepitil.com/create-event.html | grep -c "mark_payouts_enabled"
  ```
  expects 0.
- **Why before the SQL:** after the SQL, the old page's call would fail. Shipping the page first means no visitor ever hits a revoked call.

**D. #182 SQL: the payout-flag lock**
```bash
psql "$KIL_PROD_DB_URL" -X -v ON_ERROR_STOP=1 -f proposed/supabase/sql/payouts_flag_lock.PROPOSED.sql
```
- **Expect:** `COMMIT`.
- **Then:** run section 4; all 8 rows must be `t`.

## 3. Hold points
- **Pause and report** after each of A, B, C and D (the step name + "checks ok"). Only then continue.
- **Partial result:** if C can't ship today, stop after B. The guard (A) stands alone, and the dry-run proves #182 can also apply later on its own.

## 4. Post-apply checks (read-only)
```bash
psql "$KIL_PROD_DB_URL" -X -v ON_ERROR_STOP=1 -f proposed/runbook/postapply-checks.sql
```
It prints 8 rows `check_name | ok`, and **all must be `t` after D**:
1. the event_orders guard trigger is present and enabled;
2. the guard function is not executable by clients;
3. `check_in_ticket` / `event_checkin_scan` are unchanged (md5);
4. `mark_payouts_enabled` is not executable by PUBLIC / anon / authenticated;
5. its body is unchanged (md5);
6. the `guard_stripe_columns` trigger is present on `app_users`;
7. `set_payouts_from_stripe` is service_role only;
8. no client UPDATE / INSERT column grants remain on `stripe_account_id` / `payouts_enabled`.

Before the apply, rows 1, 2, 4, 6, 7 and 8 read `f`; those are today's holes. The dry-run checks both states.

**Optional smoke test**, as a test organizer in the browser: the door scan still admits a paid test ticket. `create-event.html` returning from Stripe (`?payouts=done`) shows "still checking" until Stripe has enabled payouts.

## 5. Rollback (reverse order; each is one transaction with PRECHECK / VERIFY)
**D′. #182 SQL rollback.** This **reopens** the payout hole; use it only to undo a bad apply.
```bash
psql "$KIL_PROD_DB_URL" -X -v ON_ERROR_STOP=1 -f proposed/supabase/sql/payouts_flag_lock.ROLLBACK.sql
```
**C′. Revert the page** (git revert the #182 page commit, then deploy).
- Until C′ is live, a host returning from Stripe sees "still checking", because `connect-status`'s writer is gone. No wrong state results.

**B′. `connect-status`** can stay deployed: without the writer it answers an error and changes nothing. Or delete it:
```bash
supabase functions delete connect-status --project-ref "$KIL_PROJECT_REF"
```

**A′. #67 SQL rollback.** This **reopens** the organizer write hole.
```bash
psql "$KIL_PROD_DB_URL" -X -v ON_ERROR_STOP=1 -f .github/internal/supabase/proposed/event_orders_guard/event_orders_guard.ROLLBACK.sql
```

**After a full rollback:** run section 4. Rows 1, 2, 4, 6, 7 and 8 read `f` again, and rows 3 and 5 `t`; that's the live baseline. The dry-run proves the catalog is **identical** to before: function md5s, ACLs as sets, triggers, policies, and table and column grants.

**Last resort:** restore from the backup.
- **Tables:**
  ```bash
  pg_restore --no-owner -d "$KIL_PROD_DB_URL" --clean --if-exists -t event_orders -t app_users "$B/tables.dump"
  ```
  Only with Joe's GO: it replaces the data with the backup's.
- **Functions:** run the definitions and grants printed in `functions.txt`.

## 6. Stop rule
- **Any failure → stop:** any `ERROR`, any PRECHECK or VERIFY exception, any section-4 row that should be `t` but reads `f`, or any unexpected check result in B or C.
- **Do not retry or edit SQL on the spot.** The failing file has already rolled itself back; it's one transaction.
- **Roll back what this session already applied**, in reverse order (section 5).
- **Run section 4** to confirm the state.
- **Report to Kode / Grok:** the step, the exact error text, and the section-4 output.

## Dry-run result (PGlite, live baselines; nothing applied)
`node --test proposed/supabase/tests/step1-runbook.dryrun.pglite.test.mjs` → **4 pass, 0 fail**:
1. #67's vendored files are byte-exact (`proposed/runbook/vendor/MANIFEST.json`, sha256).
2. **Full run:**
   - the backup query prints the 3 baseline md5s;
   - the checks read 6 × `f` before the apply;
   - #67 then #182 apply, and the checks read 8 × `t`;
   - behaviour matches: an organizer's status write gets 42501; self-mark is refused; the direct flag write gets "only be set by the server"; the server writer works; the door scan admits;
   - rollback #182, then rollback #67, gives an **identical catalog**.
3. **Stop rule:** a changed `mark_payouts_enabled` makes #182's PRECHECK abort with **nothing applied**; rolling back #67 then works; #67 refuses a second apply.
4. **#182 alone**, if #67 has to wait: checks 1–2 `f` and 3–8 `t`, so the checks tell the two apart.
