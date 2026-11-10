# 11A: upload ownership boundary (MF2) - PROPOSAL ONLY

Handoff patch for the edge function `agent-tool-invoke` (deployed v44, tool `upload_event_photo`) plus one proposed SQL function.
Nothing here is deployed or applied. No production access was used. The `agent-tool-invoke` bundle belongs to the NEXUS lane:
this directory only works on a COPY of its source and delivers a patch.

## What and why
Today `upload_event_photo` (`media.ts` v44, lines 72-115) checks only that the caller can SEE the event (a caller-RLS read of `events`),
then asks Storage for a signed upload URL, then inserts the `event_media` row under the caller's RLS. Any signed-in user can therefore obtain
signing credentials for ANY visible event. A storage signature is not parent ownership (Atlas, "Storage boundary"). Once Atlas's media INSERT
policy lands, a non-owner would still get a signed URL/token and only fail afterwards at the row insert, leaving a live upload token for a path
no row refers to. MF2 requires the ownership check BEFORE any signing.

The patched tool, before `services.createSignedUpload`:
1. requires a verified subject: `ctx.actor_id` (from `deriveServerContext` -> `userDb.auth.getUser()`), never model args / `ctx.handle` / user_metadata;
2. refuses slugs that could escape the storage prefix (`/`, `\`, `..`);
3. calls `db.rpc("can_upload_event_media", { p_event_slug })` under the caller's JWT and requires the result to be exactly `true`
   (`false`, `null`, a missing function or an RPC error all mean "no signing"; an error is thrown, so the runtime reports it and releases any hold);
4. only then resolves the target, signs, and does the unchanged caller-RLS INSERT (kept as defense in depth);
5. the note no longer tells clients to "mark the row published". The row stays `pending_upload`; publication is a reviewer/service action.

Denial result: `{ ok:false, reason:"upload_ownership_denied" }` (also used for a missing parent, so existence of drafts is not an oracle),
`{ ok:false, reason:"authentication_required" }` when there is no verified subject. No `upload` object, URL or token in either.
`tag_event_media` (the fan path) is untouched. No venue variant of this tool exists in v44, so none is added; if one is added later it must use only the
`profile_owners` binding to `venues.owner_handle` (no `submitted_by` branch).

## Design choice: DB-side SECURITY DEFINER function via `db.rpc` (not a service-role read)
`public.can_upload_event_media(p_event_slug text) returns boolean`: `auth.uid()` is the subject; true iff `events.submitted_by = auth.uid()` OR
`EXISTS profile_owners(profile_slug = events.owner_handle AND owner_id = auth.uid())`, the live `events_owner_read` pattern (EXISTS, so a multi-profile
owner works; no `my_profile_slug()` LIMIT 1).

| | A. definer RPC under the caller JWT (chosen) | B. service-role read in a new `services.*` capability |
|---|---|---|
| survives 10A APPLY-1C (REVOKE SELECT (submitted_by) on events, and narrowed `profile_owners` reads) | yes: runs as owner | yes |
| identity root | the DB's own `auth.uid()` from the same JWT `userDb` carries; no subject parameter exists to spoof | `ctx.actor_id` passed from app code |
| sees draft/review parents the caller's RLS hides (draft-parent owners must pass) | yes | yes |
| edge code change | `media.ts` only | `media.ts` + `runtime.ts` (`ToolServices`/`types.ts`) = bigger change in NEXUS-owned core, more service-role surface |
| new DB object | one boolean function (Sentinel/Joe approval) | none |
| fits existing patterns | same as the agent_* RPCs and "caller-RLS for domain work, named capability only for privileged ops" (this is not a privileged op) | fits `services` but widens it |
| failure mode if undeployed | tool fails CLOSED (every upload errors) | n/a |
Tradeoff accepted: A needs the SQL to land first. B was rejected because it adds service-role reads of `submitted_by` and edits NEXUS runtime files for no gain.

SQL hardening: `SECURITY DEFINER`, `STABLE`, `set search_path = ''` with every reference schema-qualified, boolean-only return (no `submitted_by` leak; nonexistent
and not-owned look the same), `REVOKE ALL` from PUBLIC/anon/authenticated/service_role then `GRANT EXECUTE` to `authenticated` only, post-assert inside the transaction.

## Deployment order (whoever owns agent-tool-invoke - NEXUS lane)
1. Sentinel pass + Joe's relayed approval for `can_upload_event_media_PROPOSED.sql` (idempotent, one transaction). Needs `public.events` and `public.profile_owners` (the #91/#92 stack).
2. Deploy `agent-tool-invoke` with `media.PROPOSED.ts` as `media.ts` (see `media.ts.PATCH`; no other file changes).
3. MF2 must be live BEFORE publish-gate activation / before Atlas's media INSERT policy relies on it. Coordinate with 10A/1C: either order of 1C vs this function is safe
   (proof below runs both), but do not deploy the edge change without the function (all uploads would error, closed).
4. Rollback: redeploy v44 FIRST, then run `ROLLBACK_PROPOSED.sql` (drops the function). Reverse order turns uploads off, not open.

## Tests (all local, no network)
Run from this directory (Node 22, no installs for the harness; PGlite scratch install `~/work/pgl-scratch` for the SQL proof):
```
node --experimental-strip-types --test harness/upload-ownership.test.mjs harness/runtime-level.test.mjs
PGLITE_DIR=$HOME/work/pgl-scratch node proof-11a.mjs
```
Results are in `proof/harness-run.txt` and `proof/proof-11a-run.txt`.

* How the Deno source runs in Node: `media.ts` and the files it needs are copied verbatim (`harness/deployed-v44/`, sha256 pinned) and imported by Node 22's native
  TypeScript stripping. Their only non-local import is `import type ... "./types.ts"` (erased); `jsr:` is imported only by `index.ts`, which is not copied. No loader, no esbuild/tsx, nothing installed.
* Layer 1 (`upload-ownership.test.mjs`): the real `upload_event_photo.validate/execute` from `media.PROPOSED.ts`, mocked caller db (events/profile_owners/event_media with caller-RLS visibility and insert policy, the definer function modelled on the caller JWT) and a counting `createSignedUpload`.
  27 cases + 4 meta tests (31 tests): Atlas list (anonymous, non-owner on visible published event with signing 0 / insert 0, mapped owner and submitted_by owner with signing 1 and one `pending_upload` insert/RETURNING, draft-parent owners, missing parent, spoofed args and `ctx.handle`, multi-profile owner, other-profile owner, signing failure, insert failure returns no credentials, note), plus fail-closed on RPC error/missing/null/"true"/1, traversal slug, path prefix, RPC args exactly `{p_event_slug}`. The patch is applied to deployed v44 with `patch` and compared byte for byte with `media.PROPOSED.ts`.
* Layer 2 (`runtime-level.test.mjs`): the real `runtime.ts invokeTool`, `identity.ts deriveServerContext`/identity boundary and `registry.ts`, with only the supabase clients mocked and signing counted at `storage.createSignedUploadUrl` (after the real `createSignedUpload`).
* NEGATIVE CONTROL: the same cases against the unpatched deployed `media.ts`: 9 of 12 deny-cases fail (signing-count 1; with an open INSERT policy the non-owner receives credentials AND a row), owner flows still pass, the note still says "mark the row published"; end to end storage signing count = 1 for a non-owner.
* SQL (PGlite replica of events/profile_owners, `proof-11a.mjs`): 14 checks x pre/post-1C + 4 post-1C extras + lifecycle = 33; 7 mutants (visibility-only, unpinned search_path, default grants, leaks submitter id, SECURITY INVOKER, LIMIT-1 owner, user-controlled claim) each fail their named checks.

## What is NOT verified
No production access: the real `events` RLS policies, `profile_owners` data and the real media INSERT policy were not read (replicas/stand-ins; see `proof/`).
No real Storage signing, no real Supabase client (`.rpc`/`.from` are mocks), no Deno runtime (Node 22 stripping, PGlite is not Postgres 17.6).
Atlas's `event_media` INSERT policy and `pending_upload` status CHECK are modelled, not applied. The live `agent_tool_policies` row, credits settlement and the real `index.ts` HTTP entry were not exercised.

## Open questions
* Sentinel: is returning `false` for both "missing" and "not yours" the wanted contract (no enumeration), and should `service_role` stay without EXECUTE?
* NEXUS lane: a tool that returns `{ok:false}` is reported by `invokeTool` as action `proceed` and settles the reservation; confirm `upload_event_photo` credit_cost is 0 so denied calls are not billed.
* Sign-then-insert leaves an orphan signed token if the INSERT fails (it still throws and returns no credentials); signing needs the bucket from the same step, so reordering is not free. Acceptable, or add a reaper?
* Joe: approval relay for the SQL function.
