# ORDER-10A: one reviewed order for #91 + #92 + F3 (#121) + 1C + 10B (#129) + the KODE fix (#130)

**Proposal only. Nothing here may be applied to production** without: Sentinel's isolated tests, Joe's relayed approval **per window**, and a backup (point-in-time restore point noted). Nothing in this slice was run against prod. The merged order below was rehearsed only on a local PostgreSQL replica (`proof/proof-10a.mjs`: 71 checks, 13 negative controls; stand-ins in `proof/README-PROOF-10A.md`).

Files used: `upstream/` (APPLY-1, APPLY-1B, APPLY-2, APPLY-92, ROLLBACK-2; copies of the #91/#92 packs), this directory (`APPLY-1C-grant-narrowing_PROPOSED.sql`, `ROLLBACK-1C_PROPOSED.sql`, `PRECHECK-10A.sql`, `APPLY-92-44col_PROPOSED.sql`, `ROLLBACK-2-after-1C_PROPOSED.sql`, the get_event_view template), `db/proposed/f3-publish-gate/` on #121.

## The order (phase letters match: add / client / opt-in / visibility proof / revoke)

| # | phase | step | gate to continue | rollback point |
|---|---|---|---|---|
| 0 | evidence | Decisions D1-D16 (#91 README) + the 10A questions (GAP-ANALYSIS section 8). Backup. Run **all** read-only prechecks: #91 `PRECHECKS.sql`, `PRECHECK-92.sql`, **`PRECHECK-10A.sql`** (blocks D1, E, G, I are the new facts). Save block H fingerprint as **FP0**. | every EXPECT matches; block E lists no function that assigns account_type/status; block G lists no INVOKER reader of `submitted_by`; D1 captured | none (read-only) |
| 1 | evidence | **Sentinel isolated rehearsal** of steps 2-7 on a database built from the real catalog (use `proof-10a.mjs` as the script skeleton), including a real-client owner save after step 6 | all green incl. rollback | none |
| 2 | **add** | `upstream/APPLY-1.sql` (own transaction), then `APPLY-1B` (kind check) after PRECHECK Q-8, then **`APPLY-92.sql` (45-column guard) in the same window**. Capture **FP1**. | VERIFY A of #91; PRECHECK-92 Q-1 = 45 before, still 45 after | `ROLLBACK-92` -> `ROLLBACK-1B` -> `ROLLBACK-1` (tested in the packs). Data (backfill) is not reverted |
| 3 | **opt-in (house/age)** | ATTESTATION-BATCH A (house account + `admin_move_house_page('groove-trooper', house)`) **before** the web merge so the only public page stays public; B (founder_self, Joe's own quote+date). Needs Joe's admin session; decision Q1 (who is the house account) | `get_public_profile('groove-trooper')` returns 1 row | delete the `private.account_age` rows (APPLY-3 UNDO) |
| 4 | **client** | **One Pages deploy**: #91 stack (+ noindex patch) + #92 web + **#129 (10B)** + **#130 (KODE restore)**. Wait for the Pages run, hard-reload. Grants are still 22/22 here, so old and new saves both work: this window is deliberately compatible with the pre-#129 page that may still be cached | VERIFY B pages ok; Network tab shows PATCH on `profile_meta` with only the diff keys and no `account_type`; KODE sign-in resolves | revert the merge(s); step 2 stays |
| 5 | **opt-in (owners)** + **visibility proof** | owners switch "Show this page publicly" and tick fields; fobbinhard via a different admin; anon calls to `get_public_profile`/`public_profile_list` return exactly the attested + opted-in pages and nothing else; private/minor/ownerless/unknown fail closed | #91 VERIFY C; logs show the old callers (`claim_profile`, anon `profile_owners`, pre-#129 saves) stopped | undo = data steps |
| 6 | **revoke (1C)** | soak >= 7 days (D11). Preconditions: #129 web has been live longer than the HTML cache (~10 min) **and** the log watch shows no `account_type`/`status` in `profile_meta` writes **and** PRECHECK-10A E/G still clean **and** Joe accepted that the iOS bundle's owner profile editing breaks until the app release (3 owner accounts). Capture **FP2** (block H) right before. Then `APPLY-1C-grant-narrowing_PROPOSED.sql`. Capture **FP3**. | the 1C post-asserts pass (in-transaction); then step 7 | `ROLLBACK-1C_PROPOSED.sql` with `{{PRE_1C_FINGERPRINT}} = FP2` (refuses unless the restore is exact) |
| 7 | visibility proof | a **real owner save** through the real client (staging first) after the swap; anon RPCs unchanged; TRUNCATE denied (as a test role); `events` readable columns = 44; the KODE pages; `get_approved_profile` denied | Sentinel's preview test passes | as step 6 |
| 8 | server gate | **F3 forward (Atlas, #121) after re-baselining** (run its drift query after step 6; its own README says the literal is stale). Preconditions Atlas states: MF2 shipped (and **not** reading `events.submitted_by` as the caller, GAP section 4), C5 client fix live (= #129), Sentinel's matrix. F3's ACL lines for `profile_meta` (TRUNCATE, anon UPDATE/DELETE/REFERENCES/TRIGGER) become no-ops after 1C; its ROLLBACK must be regenerated so it does not re-grant what 1C removed | F3 matrix green | F3 ROLLBACK (regenerated), then reassess |
| 9 | revoke (read side) | after the app release carrying the #129 `profile.html` and a >= 7-day clean log: `upstream/APPLY-2.sql` (closes `book_email`/handle reads; its column revokes are no-ops after 1C). Rollback uses **`ROLLBACK-2-after-1C_PROPOSED.sql`** | VERIFY E of #91 | that file |
| 10 | deferred | `get_event_view` organizer mask (needs D1 body, template only), then `events.owner_handle` revoke after `kil-browse.js:112`, `kil-show.js:115`, `index.html:3155` move to a masked source; `applications` ACL (GAP I11-8d); `profile_content` read exposure (D13); the I10 buyer 18+ gate (undesigned) | each its own review | each its own |

If 1C must precede #92 (not recommended), use **`APPLY-92-44col_PROPOSED.sql`** instead of `APPLY-92.sql` (the 1C guard accepts 45 or 44). Both orders end in an identical privilege state (proof ORD-alt).

## Why this order (dependencies)

1. **Add before everything**: the web calls RPCs (`get_public_profile`, `public_profile_list`, `i_own_profile`, `request_profile_claim`) that do not exist until APPLY-1; #92 needs `private.profile_is_public` (it aborts otherwise: #92 pack N5; 1C also checks it).
2. **House/age data before the web merge** (#91 ORDER step 4): otherwise `groove-trooper`, the only public page, renders "private" from deploy until someone runs the admin calls.
3. **Client before revoke (the point of this slice)**: APPLY-1 deliberately keeps `account_type`, `status` and `slug` in the owner grants because the *deployed* save (main, the iOS bundle) sends them. 1C may only land after the page that stops sending them (#129) is the page users actually run. Proof: `PRE-legacy` (legacy save works before 1C) vs `COMPAT-legacy` (refused after).
4. **Every legitimate writer confirmed before 1C** (PRECHECK-10A E): a definer or admin tool that assigns `account_type`/`status` through the client roles would break; definers/service_role are unaffected by column grants (proof TRIG-1).
5. **10B/MF2/C5 client ports precede publish-gate activation** (Atlas): F3's trigger resets a published page to `review` on any content change; main's no-op save writes `account_type:null` (a real change), so activating the trigger first would unpublish pages on every owner save. #129 is that client fix; the F3 trigger therefore comes **after** the #129 web is live, which in turn needs APPLY-1 (the RPCs). This is why F3 cannot simply go first, although its own README expects to.
6. **F3 depends on the owner payload shape**: its 19 content columns exclude `profile_public`/`public_fields` (owner opt-ins do not reset review: decision for Atlas/Muse, F3 README collision row 6) and `status/sources/last_reviewed_at` are protected by the trigger *and now also ungrantable* (defense in depth, proof S2).
7. **APPLY-2 last**: it breaks every anon `profile_meta` reader (old caches, the iOS bundle). 1C is the part of APPLY-2 that does not (account_type/status/slug), which is exactly why it can run earlier.
8. **MAINTAIN**: prod is PostgreSQL 17.6; APPLY-1 leaves MAINTAIN, 1C removes it (version-guarded).

## Stale-baseline caveat (read before re-using any upstream number)

* **F3 fingerprint `c917a7df...` is already stale** (F3 README: #39 chain, the Nov 9 deletion functions). It includes ACLs of `events`, `profile_meta`, `profile_owners` and every `public` function. APPLY-1/92 change it (step 2) and **1C changes it again** (profile_content ACLs, profile_meta column ACLs, `events.submitted_by`, `get_approved_profile` ACL). F3 must be re-baselined after step 2 and after step 6; never edit the literal by hand.
* **The 45-column `events` list is 44 after 1C**: PRECHECK-92 Q-1 (EXPECT 45), APPLY-92's guard and ROLLBACK-92's guard ("the events column grants must still be the live 45-column set", VERIFY-92 V-3) all describe the pre-1C state. After 1C, Q-1 must show 44 with `submitted_by_readable = false` (PRECHECK-10A A2), and ROLLBACK-92's guard must be given the 44-column list or it will refuse (it re-grants no events columns itself, so it cannot re-open `submitted_by`).
* **Do not re-run APPLY-1 after 1C** (proof RERUN-A1: it re-grants account_type/status).
* `PRECHECK-RESULTS.md` P-10 ("anon and authenticated have ALL") is the pre-everything state; the state table below is the one 1C is written against.

State 1C assumes (checked by its guard; `profile_meta` authenticated INSERT = UPDATE = the 22 APPLY-1 columns):

| relation | anon | authenticated |
|---|---|---|
| `profile_meta` | SELECT, REFERENCES, TRIGGER, MAINTAIN | SELECT, REFERENCES, TRIGGER, MAINTAIN + column INSERT/UPDATE (22) |
| `profile_owners` | none | SELECT, REFERENCES, TRIGGER, MAINTAIN |
| `profile_content` | ALL | ALL |
| `events` | 45 SELECT columns | 45 SELECT columns |

## Collision matrix (what each piece does to the others)

| | vs #91 (APPLY-1 / APPLY-2) | vs #92 (APPLY-92) | vs #121 F3 | vs #129 (10B) | vs #130 (KODE) |
|---|---|---|---|---|---|
| **1C** | APPLY-1 first (guard). APPLY-1 re-run after 1C undoes it. APPLY-2's account_type/status/slug revokes become no-ops; stock ROLLBACK-2 undoes 1C (use the `-after-1C` file) | events guard 45 vs 44: stock APPLY-92 refuses after 1C; `APPLY-92-44col` for that order; Q-1 expectation changes | F3 fingerprint must be re-baselined; F3 `REVOKE TRUNCATE`/anon `REVOKE ... REFERENCES, TRIGGER` on profile_meta overlap (idempotent) but its **ROLLBACK re-grants them** (reopens what 1C closed): regenerate. F3 trigger needs no column grant. `owns_parent` (DEFINER) reads `submitted_by` fine; **MF2 reading it as the caller breaks** | 1C's INSERT 19 / UPDATE 14 are exactly #129's payload (static check S8); 1C must come after #129 is live | 1C revokes `get_approved_profile`; the #91 kode edits would call it: #130 must be merged first |
| **#129** | needs APPLY-1 RPCs and grants (22) at deploy | stacked on #92 head | removes the C5 blocker (no-op save writes nothing) | | |
| **#130** | independent of SQL | | | | |
| **F3** | F3 README rows 1-9 (TRUNCATE/ACL overlaps, 19-col vs new columns, claim_profile revoked) | F3 fingerprint covers `get_profile_events` | | | |

## Not in this slice

The buyer-side 18+ gate (I10-1..3), the `get_event_view` body, `applications`, `profile_content` read policy, avatar-in-OG, the privacy page text (Muse), `supabase/` in the Pages exclude list. All listed in `GAP-ANALYSIS-10A.md` with who has to decide.
