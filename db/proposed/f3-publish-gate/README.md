# F3: Media RLS + Connect publish-gate proposal (Atlas v2) - NOT APPLIED, NOT AUTO-APPLIED

**Status: PROPOSAL ONLY. HOLD.** Do not merge into any auto-apply path. Do not run any file here against production.

Source: Atlas, "Media RLS + Connect publish-gate proposal v2" (2026-11-07 01:58 PST). The SQL files are Atlas's text
verbatim (markdown backslash escapes removed, a comment header added). Nothing in them was changed by the PR author.

Applying any of it needs ALL of:

1. Sentinel's isolated test matrix (Atlas section 6) run against a database built from the real catalog. The local proof
   in `proof/` is a stand-in, not that matrix (see "What the local proof covers").
2. Joe's explicit live-change authorization (there is also a standing HOLD on keepitil-web merges and settings changes).
3. A **re-baselined fingerprint** (next section). The one in the file is stale.
4. The open client/edge work listed under "Not in this PR".

## Files

| File | What it is |
|---|---|
| `2026-11-09_f3_media_rls_connect_publish_gate_FORWARD_PROPOSED.sql` | Atlas section 3: one transaction. Aborting drift pre-check, quarantine of the 19 orphan `event_media` rows, media RLS + private-schema SECURITY DEFINER helpers, trigger-only Connect gate, TRUNCATE revokes. |
| `..._ROLLBACK_PROPOSED.sql` | Atlas section 5. Restores today's grants/policies/function bodies (emergency use; re-opens the old holes). |
| `..._POSTCHECKS_PROPOSED.sql` | Atlas section 4: 8 read-only SELECTs. |
| `..._DRIFT_QUERY_PROPOSED.sql` | Atlas Appendix C: the read-only fingerprint query. |
| `..._GATE_READINESS_READONLY_PROPOSED.sql` | **Added by the PR author, not Atlas.** Read-only count of published `profile_meta` rows that would fail the completeness gate once the early return is removed (REVIEW NOTE 1). |
| `proof/proof-f3.mjs`, `proof/replica-f3-LOCAL-REPLICA-NOT-FOR-PROD.sql`, `proof/proof-f3-run.txt`, `proof/README-PROOF.md` | The local PGlite stand-in proof and its last output. |

## Why this location is not auto-applied

`db/` is listed in `.github/pages-exclude.txt` (not published by the Pages build) and no workflow or script references
`db/`, `supabase`, `psql` or any migration runner (checked by grep over `.github/workflows/*.yml` and `scripts/*.mjs`).
The `node tests` workflow runs only `assets/js/*.test.mjs`, so the proof is not part of CI either (it needs
`@electric-sql/pglite`, which is not a dependency of this repo; the tower runs it from `D:\work\delrunbook\pgl`).
Every SQL file ends in `_PROPOSED.sql`. Do not move these into `supabase/migrations/`.

## The fingerprint baseline is STALE: the forward WILL abort today

The forward starts with an aborting pre-check that compares a catalog fingerprint
(`c917a7dfbc778913b7e46b332aeeb348`, Atlas's v2 baseline; v1 was `d3a386920e08894ace89b10164e74648`) with production.
That fingerprint was taken on Nov 7. Production has changed since, and the fingerprint covers all `public` function
definitions/ACLs and the ACLs/policies/columns of `events`, `profile_meta`, `profile_owners` and others. Known changes:

- the #39 `events` column-grants chain (column ACLs on `events` are in the fingerprint);
- the scoped account-deletion functions added to `public` on Nov 9 (every `public` function is in the fingerprint);
- anything else merged or applied since (not enumerated here; the point is that it is unknown without re-running).

So the pre-check will raise `Catalog drift: stop and re-review (no changes applied)`. That is the designed behaviour and
is proven locally (proof check "STALE-BASELINE"). Do **not** edit the literal by hand to make it pass.

Re-baselining, in order:

1. Atlas or Sentinel runs the DRIFT_QUERY file **read-only** on production with `SET search_path = public, extensions;`
   first (the forward computes under that path; the md5 is search_path-sensitive, proof check "FP").
2. Diff the returned `state` JSON against Atlas's snapshot, item by item. Every difference must be re-reviewed against
   the proposal (not just accepted): a changed policy, ACL or function that the forward replaces or restores must be
   re-derived. The ROLLBACK text embeds original function bodies and ACLs and must be regenerated from the new state.
3. Only then replace the literal in FORWARD and ROLLBACK, re-run the Sentinel matrix and re-approve.

## Overlap and conflicts with held work (collision matrix; the efforts are NOT merged here)

Whichever lands second must be rebased on the first. Because the fingerprint includes relation ACLs, policies and all
`public` function hashes, **Atlas's forward aborts if PR #91/#92 (or the Step 1 additions) land first**, by design.
Conversely, #91 step 1 aborts or misbehaves if Atlas lands first in the ways listed. Media tables, `tag_*_media` and the
`event_media`/`venue_media` policies are untouched by #91/#92: no semantic conflict there. Statement-level collisions:

| # | Atlas FORWARD / ROLLBACK statement | PR #91 (APPLY-1 / `20261107014000_profile_public_read_add.sql`) or #92 or checklist "Step 1 additions" | Result |
|---|---|---|---|
| 1 | `REVOKE TRUNCATE ON public.event_media, venue_media, profile_meta FROM anon, authenticated` | #91: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON profile_meta FROM anon, PUBLIC` and `REVOKE DELETE, TRUNCATE ON profile_meta FROM authenticated` | Redundant on `profile_meta` (idempotent), but changes `relacl`: second to land hits the drift abort. |
| 2 | `REVOKE UPDATE, DELETE, REFERENCES, TRIGGER ON ... profile_meta FROM anon` | #91 revokes anon INSERT/UPDATE/DELETE/TRUNCATE | Overlap on UPDATE/DELETE; REFERENCES/TRIGGER only Atlas. |
| 3 | **ROLLBACK:** `GRANT UPDATE, DELETE, REFERENCES, TRIGGER ... profile_meta TO anon` and `GRANT TRUNCATE ... profile_meta TO anon, authenticated` | #91 deliberately removed UPDATE/DELETE/TRUNCATE for anon and TRUNCATE for authenticated (REFERENCES/TRIGGER were only revoked by Atlas) | If #91 lands, then Atlas, then Atlas is rolled back, rollback **re-opens what #91 closed**. The rollback must be rebased onto the post-#91 state. |
| 4 | Atlas leaves `authenticated` table-wide INSERT/UPDATE on `profile_meta` ("deliberately remain") | #91: `REVOKE INSERT, UPDATE` from authenticated, then column grants (adds `status`, `profile_public`, `public_fields`; excludes the four server flags). Step 1 additions: grants for every column the live `profile.html` upsert sends (the 19 keys: slug, display_name, handle, location, bio, tagline, pronouns, book_email, about, links, links_label, badges, account_type, avatar_url, cover_url, cover_mobile_url, socials, highlights, updated_at) minus `admin_approved`, `age_verified`, `is_minor`, `under_18`; authenticated loses TRUNCATE | Compatible in behaviour (proof group X2: the 19-key upsert, review reset and refusal of `status`/`sources`/`last_reviewed_at` all work with 19-column grants). Atlas's post-check line "UPDATE/INSERT grants deliberately remain" and its fingerprint no longer hold afterwards. #91's grant of `status` is superfluous for the live payload (live save sends no `status`) and should be dropped when the Step 1 list is finalized; Atlas's trigger refuses owner `status` writes anyway. Keep the seeded QA test owner out of prod migrations (#91 `supabase/seed/` stays out of `supabase/migrations/`). |
| 5 | `CREATE OR REPLACE FUNCTION public.profile_meta_publish_gate()` (new body, `SET search_path TO ''`, early return removed), trigger `profile_meta_publish_gate_trg` unchanged | Prod already has this trigger/function (PRECHECK-RESULTS B). #91 does not replace it, but its **APPLY-1 backfill UPDATEs** (`admin_approved`, `profile_public`, `public_fields`, `is_minor`/`under_18` on published rows) and the SECURITY DEFINER `admin_set_account_age`, `admin_move_house_page`, `set_profile_admin_approved` write published rows | With the early return removed, every one of those writes runs the full completeness gate. If a published row lacks sources/last_reviewed_at/entity_category/account_type, the write raises `check_violation` and **aborts #91's single-transaction step 1**. Run the GATE_READINESS file first. Proof check X1 demonstrates it. |
| 6 | Atlas's 19 "content columns" (explicit `IS DISTINCT FROM` list) | #91 adds `profile_public`, `public_fields`, `admin_approved`, `age_verified`, `is_minor`, `under_18` | The new columns are **not** in Atlas's list: an owner toggling `profile_public`/`public_fields` (granted by #91) changes public exposure without resetting review. Needs an Atlas/Muse decision; not silently changed here. |
| 7 | Atlas C10: "`claim_profile` normal creation succeeds" | #91 revokes EXECUTE on every `claim_profile` overload from PUBLIC, anon, authenticated and replaces the flow with request/approve | After #91 that matrix case no longer applies as written; creation goes through `approve_profile_claim` (inserts `profile_owners` only). Re-derive the Connect creation cases on the post-#91 catalog. |
| 8 | `atlas_media_guard.owns_parent` reads `profile_owners` (SECURITY DEFINER, owner postgres) | #91 drops "profile_owners claim"/read policies, revokes anon, adds `profile_owners_select_own`, removes owner UPDATE/DELETE | No functional conflict (the definer bypasses RLS; not FORCE RLS). Positive overlap: #91 closes the self-claim of unclaimed slugs that Atlas lists as an unresolved limitation (S3). Fingerprint covers these policies/ACLs, so order matters. |
| 9 | Fingerprint covers `events`, `get_profile_events` and every `public` function | #92 replaces `get_profile_events`, adds `get_profile_event_summary`, and swaps table-level `SELECT` on `events` for column grants | No semantic conflict (`owns_parent` is a definer and reads only slug/owner_handle/submitted_by/status). Drift abort if #92 lands first. |

## REVIEW NOTES on Atlas's SQL (not changed; for Atlas/Sentinel)

1. **Early-return removal affects trusted writers** (collision row 5). Any UPDATE of an evidence-less published row now raises. Prod has 2 published rows; whether they satisfy the gate was not checked (no production access in this PR).
2. **Content edit sends the row to `review` on every owner save**, including saves that change nothing the owner touched: Atlas's own MF1 finding is that the live `profile.html` form renders legacy account-type options and does not initialise `epAcct`, so a no-edit save writes `account_type: null` (proof check "C5-INFO"). After apply, owners' pages would drop out of Connect's published-only query on their next save. The client fix must ship first.
3. **Trigger trusts `current_user in ('postgres','service_role')`**. Other privileged roles (for example `supabase_admin`) are treated as untrusted owners. Every SECURITY DEFINER function owned by postgres that writes `profile_meta` bypasses the owner guard (Atlas S4 acknowledges this); each such function needs its own caller check.
4. **Admins are exempt from the owner evidence guard and the content reset** (`public.is_admin()`), but still pass the completeness gate; an admin who also owns a profile can publish it with self-supplied evidence (proof check C8d). Intended per Atlas; flagging because it is an authority concentration.
5. **Owner SELECT policies are not limited to pending rows.** `atlas_event_media_owner_read` / `atlas_venue_media_owner_read` have no status predicate, so parent owners can also read `hidden` (moderated-out) rows including `author_handle`. The decision text says "pending".
6. **`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA atlas_media_guard FROM PUBLIC, anon` plus `GRANT EXECUTE ... TO authenticated`** gives signed-in users EXECUTE on `owns_parent` (an ownership oracle for any slug, scalar boolean) and on the two submit functions. Not exposed through the Data API if the schema is not in the exposed list (Atlas says keep it out); that is a dashboard setting this PR cannot verify or change.
7. **Appendix C does not set `search_path`**, but the forward computes the same query under `SET LOCAL search_path = public, extensions`. Running Appendix C in a session with another path can return a different md5 (proof check "FP" shows the sensitivity). Use the SET shown above.
8. **Forward `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE`** on 8 tables incl. `app_users` and `app_admins` (read by `is_admin()`) with `lock_timeout 5s`: the whole API is blocked for readers of those tables while it waits; run in a quiet window as Atlas says.
9. **Rollback restores the original gate body** (including its early return) from a `pg_get_functiondef` copy taken Nov 7. If the function was edited in between, the rollback pre-check aborts (good), but the rollback text itself must then be regenerated.
10. **Hard-coded names/counts**: `venue_media_status_check`, exactly 19 orphans, `profile_meta` 23 columns. Any of these changing aborts the forward (intended), which is another reason it cannot be applied without re-baselining.

## What the local proof covers (stand-in for, not a replacement of, Sentinel's matrix)

`proof/proof-f3.mjs` loads a replica (PGlite, PostgreSQL 17.5 WASM) of the involved tables into memory, applies the
committed FORWARD and ROLLBACK files unmodified except for swapping the 32-hex baseline literal for the replica's own
fingerprint, and runs: **102 positive checks, 12 negative controls** (last run in `proof/proof-f3-run.txt`).

Exercised: C1-C10 (all of Connect: owner cannot publish via UPDATE/INSERT/upsert, every one of the 18 non-key content
columns plus NULL/JSON transitions sends a published row to review, no-op saves keep it, admin exempt, unrelated
authenticated denied, `claim_profile` stand-in creates with review defaults, early-return removal), M1-M8, M10, M12
(anon/non-owner/owner/fan-RPC/service cases, TRUNCATE), the section 4 post-check statements, the S2 quarantine,
D1 (8 drift mutations abort the forward before any change, plus the stale-baseline demonstration), R1/R1b/R2/R3
(rollback restores the exact fingerprint; aborts on pending venue rows, on later edits to patched or unrelated
objects and on changed quarantined rows), coexistence with 19-column grants (X2), and the added gate-readiness query.

Negative controls (mutated forward must fail the named checks; all caught): early return kept (C8b, C8c, C8d, X1);
owner INSERT guard removed (C2 forged-evidence cases); owner UPDATE evidence guard removed (C1, C6); content reset
removed (C3, C4, C7); TRUNCATE revoke removed (M12 + post-state); event insert policy admitting `published` (M5);
owner-read policy removed (M3, M5); anon INSERT revoke removed and S1 revokes removed (post-state ACL checks);
fan RPC publishing (M6); drift check bypassed (D1); rollback forward-state check bypassed (silent overwrite of a later
policy edit).

**Not exercised** (needs the real system or tables the replica cannot reproduce faithfully): PostgREST/Data API and JWT
claims (uid is a stub), Storage and the signed-upload edge tool (M9), `delete_event` (M11), `post_collaborators` (P1),
the real `claim_profile`, `events_owner_read` and the real `app_users`/`events`/`venues` shapes (stand-ins; only the
columns the proposal reads), the real production catalog (so the real fingerprint, the real 492-function hash set, real
ACLs and any unknown policies), the real `profile.html` code (the 19-key payload is replayed as the SQL PostgREST
would generate), concurrency/lock behaviour, and Supabase platform roles other than `anon`/`authenticated`/`service_role`.
A green local run says the SQL parses and behaves as Atlas describes on a clean replica; it says nothing about
production drift.

## Not in this PR (Atlas's open items)

- MF2: the `agent-tool-invoke` edge tool must verify ownership before signing uploads; non-owner uploads need a
  moderated path. Not implemented here.
- Client fix so `profile.html` preserves `account_type` (and non-edited JSON shapes) on no-op saves.
- A human/service moderation path for pending media (the deployed `moderation-run` does not moderate these tables).
- S3 (event-creation binding, editorial-profile claim restriction) and Sentinel's XSS fixes remain separate.
