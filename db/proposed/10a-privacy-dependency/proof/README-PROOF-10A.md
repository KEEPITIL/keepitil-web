# proof-10a.mjs: what it proves and what the replica stands in for

Run: `PGLITE_DIR=<dir with node_modules/@electric-sql/pglite> node proof-10a.mjs` (exit 0 only if every positive check passes and every negative control fails its named checks). Last output: `proof-10a-run.txt` (**71 positive checks, 13 negative controls, 0 skipped**; PGlite 0.5.16 = PostgreSQL 18.6; the Nexus Mac, load 2-3 during the run).

Nothing here touches a hosted project. Stack under test, in order: `replica-91.sql` + `replica-92-add.sql` + `replica-10a-add.sql`, then `upstream/APPLY-1.sql` (byte-identical to `supabase/migrations/20261107014000_profile_public_read_add.sql`), `upstream/APPLY-1B-kind-check.sql`, `upstream/APPLY-92.sql` (the pack's reviewed rewrite, not the PR's original), the #91 data steps (house attestation, founder_self, owner opt-in), then `APPLY-1C-grant-narrowing_PROPOSED.sql`.

## Scenarios
| | what |
|---|---|
| S1 | post-1C state: owner save (14 columns, 1 column, insert fallback), 10 columns owners cannot write (update) + 3 insert denials, the pre-#129 upsert refused, TRUNCATE/DELETE denied, profile_content owner flows intact, anon cannot write content, privilege matrix, `events` 44 columns + RLS policy and DEFINER reader of `submitted_by` still work, anon RPC paths, `public.profiles` + `get_approved_profile` closed, book_email still open (information), idempotency |
| S2 | an F3-style BEFORE trigger still sends a published page to review after the narrowing (owner holds no UPDATE on status) |
| S3 | the drift guard refuses and changes nothing for 8 drifted states, and before APPLY-1 |
| S4 | order: 1C then the 44-column APPLY-92 variant ends in the same privilege state as APPLY-92 then 1C; the stock APPLY-92 refuses after 1C (stale baseline); the 44-col variant refuses before 1C; re-running APPLY-1 after 1C re-opens account_type/status (hazard) |
| S5 | APPLY-2 after 1C leaves the narrowing alone and closes book_email; `ROLLBACK-2-after-1C` vs the stock `ROLLBACK-2` (the stock one undoes the narrowing) |
| S6 | `ROLLBACK-1C`: placeholder unfilled / wrong fingerprint abort; exact restore (table, column and function ACLs identical, fingerprint equal); idempotent; refuses after APPLY-2 |
| S7 | all 26 `PRECHECK-10A.sql` statements run inside a READ ONLY transaction; block H fingerprint; block E finds the profile_meta writers |
| S8 | static: the 14 UPDATE and 19 INSERT grants against `origin/draft/10b-noop-save` (#129) `profile.html` and its test's ALLOWED/NEVER sets (needs that ref fetched; reported SKIP otherwise) |

Negative controls (mutated 1C / rollback; each must fail its named checks, all caught): N1 account_type left UPDATE-able; N2 TRUNCATE on profile_content forgotten; N3 submitted_by left readable; N4 table-wide UPDATE shortcut; N5 over-revocation (owner INSERT/DELETE on profile_content removed); N6 get_approved_profile left executable; N7 REFERENCES/TRIGGER on profile_owners forgotten; N8 guard removed on a drifted state; N9 slug left UPDATE-able; N10/N11 rollbacks that forget a restore and have no fingerprint check; N12 rollback run after APPLY-2; N13 the PostgreSQL 17+ MAINTAIN revoke forgotten.

## What the replica is NOT (stand-ins)
* **PostgreSQL 18 (PGlite), not 17.6.** MAINTAIN exists in both; anything 18-only was not used on purpose, but this is not a 17.6 run.
* **Roles are `create role`d by hand** (`anon`, `authenticated`, `service_role`); Supabase's extra roles (`supabase_admin`, `authenticator`, `dashboard_user`) and platform default privileges are absent. The `aclexplode` fingerprint therefore cannot see grants held by roles that do not exist here.
* **Policies not captured from prod are stand-ins:** `events` (`events_public_read`, `events_owner_all` on a stand-in `owner_id` column that does not exist on prod, `events_submitter_read` as the worst case for revoking `submitted_by`), `profile_content` (per-command owner policies written from PRECHECK-RESULTS P-9 prose), `applications` (not exercised).
* **Function bodies not captured:** `get_event_view` (stand-in), `claim_profile`, `get_profile_events`, `get_my_tickets`, the real `profile_meta_publish_gate` (reduced) and Atlas's F3 trigger (a 6-line stand-in in S2, not Atlas's SQL).
* **Column sets are copied from the packs, not re-read from prod:** the 22 APPLY-1 columns (APPLY-1 text), the 45 `events` columns (PRECHECK-92 Q-1 as reported), profile_meta's real 23-29 columns (the replica has the columns the SQL names).
* **PostgREST is not involved.** "Owner save" is the SQL PostgREST would generate (`UPDATE ... SET <diff keys>`, `INSERT <payload keys>`), with the key sets taken from #129's own test (S8). A real browser save through the real client against a staging project is still required (Sentinel's "preview test must run the real owner save after the swap").
* **Collation:** the replica database uses C ordering; prod is en_US-style. The 1C guard compares column sets by set difference, not array order, for that reason; this is untested on a non-C database.
