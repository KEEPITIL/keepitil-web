# proof/ - local PGlite stand-in proof (NOT Sentinel's matrix, NOT production)

Run on the tower: `set PGLITE_DIR=D:\work\delrunbook\pgl` then `node proof-f3.mjs` in this directory. Exit 0 only if every
positive check passes and every negative control fails the checks it is meant to fail. Nothing here connects to any
hosted database; the replica file CREATEs ROLEs and must never be run against Supabase.

Last output: `proof-f3-run.txt` (PostgreSQL 17.5 as bundled by PGlite; production is 17.6).

## How it works
- `replica-f3-LOCAL-REPLICA-NOT-FOR-PROD.sql` builds an in-memory replica. Table shapes, policies and ACLs for
  `event_media`, `venue_media`, `profile_meta` come from Atlas's Appendix A and section 2; the original
  `tag_event_media`, `tag_venue_media` and `profile_meta_publish_gate` bodies are Atlas's verbatim rollback copies; the
  trigger name is `profile_meta_publish_gate_trg`.
- The FORWARD/ROLLBACK files are executed as committed. The only edit is swapping Atlas's baseline literal
  (`c917a7df...`) for the replica's own fingerprint, computed with the DRIFT_QUERY file under
  `search_path = public, extensions`. One check runs the unmodified forward to show the stale baseline aborts.
- Roles `anon`, `authenticated`, `service_role` (bypassrls) are real PG roles; checks use `SET ROLE` plus a stubbed
  `auth.uid()` that reads `request.jwt.claim.sub`.
- The owner "save" is replayed as the SQL PostgREST generates for `.upsert(meta)`:
  `INSERT ... ON CONFLICT (slug) DO UPDATE SET <each of the 19 keys> = EXCLUDED.<key>`.

## Replica simplifications (every one)
1. `events`, `venues`, `app_users`, `app_admins`, `profile_owners` carry only the columns the proposal reads; their other columns, policies and ACLs are not modelled. `events_owner_read` is not modelled (the proposal's ownership helper is a definer that reads the tables directly).
2. `is_admin()` is `exists(select 1 from app_admins where user_id = auth.uid())` (Atlas: reads `app_admins`); `app_admins` has RLS with a self-select policy and no client write path.
3. `claim_profile` is a stand-in (real body not captured): definer, inserts a fixed new-profile payload and the owner row.
4. `profile_owners` policies are the names listed in the Nov 9 read-only PRECHECK-RESULTS (P-9); `profile_meta` policy names/predicates are Atlas's Appendix A.
5. The `account_type` CHECK is Atlas's enum. No FKs exist on the media tables (as in production). 19 published orphan event_media rows plus one parented row are synthetic.
6. Not modelled: PostgREST/JWT claims, Storage, edge functions, `delete_event`, `post_collaborators`, platform roles, the other ~480 public functions (the fingerprint is therefore the replica's, not production's), concurrency.
7. Production default privileges are mimicked only for schema `public`; global (`defaclnamespace = 0`) defaults are absent, as Atlas states for production.
