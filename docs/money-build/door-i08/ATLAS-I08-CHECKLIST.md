> **STATUS: DRAFT reviewer checklist, docs only, 2026-11-10. NOT a Sentinel pass. NOT Atlas's document.** Atlas's `checkin-scan-fix.md` was never available; the 12A conditions were re-derived from code (`DERIVED-CONDITIONS.md`). Nothing here is applied to prod, nothing here was run by this job (read-only review of branches with `git show` / `gh`). Where this job saw no evidence, the cell says **UNVERIFIED**.

# Atlas I08 checklist: door scanner (12A + 13A SQL, door UI, QR)

Atlas's I08 text (quoted from `db/proposed/12a-door-hardening/baseline/PROD-FACTS-12A.md:137`): "actual owner-authorized door scanner UI/network path, atomic single admission, raw/KIL acceptance, repeat/concurrent/refunded/stale-token refusal. Include held event_checkin_scan KIL- fix + check_in_ticket null-owner/anon/search_path hardening. Do not return attendee contacts; names require opt-in."

## 0. Evidence map (what each reference means)

| Ref | What | PR / SHA |
|---|---|---|
| **P12A** | 12A SQL proof, final: 81/81 behavioural (each row on the ORIGINAL prod-captured bodies and the hardened ones), 45/45 pack/structural, 4/4 adjacent, 12/12 cross-check, 10/10 adapter | keepitil-web #150 head `091171cd594acae6bdcbe1bfb8d7297fe4901569` (files under `db/proposed/12a-door-hardening/`: `MATRIX-RESULTS.md`, `DERIVED-CONDITIONS.md` DC-xx, `SENTINEL-CHECKLIST-12A.md`) |
| **X154** | the same 12A + 13A files extracted into `db/proposed/` on `main`'s base; adds `RUNBOOK-APPLY-BACKUP-ROLLBACK.md` and `docs/db-apply-order/APPLY-ORDER-2026-11-10.md`; `db-proofs` CI green (`proofs` 1m43s, `test` x2: seen via `gh pr checks`) | #154 head `ffa7f357d19c7909eaf579d0432f8e44cb7cb90e` (DRAFT, base `main`) |
| **P13A** | 13A orders hardening proof (37/37, 36/36, 3/3 per its README; included in X154) | `db/proposed/13a-orders-hardening/` (original PR #138 is CLOSED; its content lives in X154) |
| **TB** | local testbed: real Postgres replica + deployed `create-checkout` v58 / `stripe-webhook` v52 source on Node + FAKE Stripe; 40/40 PASS; step e = door | #157 head `29a13a9e22474d7f3083324a33ff188aefac00c7` (DRAFT), `docs/money-build/checkout-testbed/README.md` |
| **UI** | door page, adapter copy, 31 jsdom tests (15A) + 20 decoder tests (15B, jsQR 1.4.0 vendored), headless-Chrome evidence with MOCKED session and RPC | #141 head `70b7ceaf784d108b152dd7c9623a63dc935bf89a`, #142 head `f4c24cbe98a9792e926a6b0c5cb44073876c1282` (both DRAFT; **not on `main`, not in X154**) |
| **APP** | iOS bundle: `door.html` + jsQR bundled, camera string, nothing links to it, `.mjs` shipped as `.js` | keepitil-app #46 head `349ecd8c3e53e907f5717235bc154e27ffa00b26` (pins web `f4c24cbe`); #47 head `8c1175192a36999712a9511827329fdfc7431916` (gap list: A19, A33, A35, C2, D1) |
| **QR** | self-hosted QR guard (web) and removal of api.qrserver.com (app) | keepitil-web #158 head `0eaf73809ae6d68e7f5a3c9ca4facce588b90821`; keepitil-app #52 head `6ab1c53cceb39f78c4f28b1278bcc73a1bdbbeb2` |

Status words: **met-proven** = an automated test with a negative control passes on a real PostgreSQL 17.6 replica or as a static/jsdom test; **simulated** = shown only with a mocked session/RPC, a fake camera or the fake-Stripe testbed; **not verified** = no evidence, or an open decision. None of these is prod evidence.

## 1. Requirement table

| # | I08 requirement | Evidence (file / test id / PR+SHA) | Status | What remains |
|---|---|---|---|---|
| 01 | Owner-authorized UI path | `door.html` + `assets/js/kil-door-scanner.js` (UI #141/#142): no session redirects to `/apply?next=%2Fdoor.html` before any RPC; 31+20 jsdom tests; headless Chrome 375/1280 px with mocked session/RPC (`docs/money-build/15a-door-scanner/evidence/`). Server-side owner check: P12A M11, M12, M12b, M13, M14, M31 | **simulated** (UI mocked; SQL proven separately) | UI never ran against the real RPC with a real session. UI is not in X154/main: needs its own extraction/merge. Real sign-in on a device (TEST-PLAN rows 1, 6) |
| 02 | Network path: authenticated RPC, user JWT bearer, no anon key as bearer | `kil-door-scanner.js` `makeRpc`: `POST /rest/v1/rpc/event_checkin_scan`, `Authorization: Bearer <session.access_token>`, `apikey: <publishable key>` (the apikey header is the gateway key and is expected; the bug in #139 was the anon key as BEARER), body `{p_qr_token}` only. Asserted with fake `fetch` incl. a negative control (UI tests). Server: M19, M35 (anon refused 42501; authenticated role with no JWT subject gets `unauth`); CALLER-CONTRACT.md | **simulated** (header shape asserted on a fake fetch; refusal proven on replica with stand-in roles) | Real PostgREST + real Supabase `auth.uid()` (replica reads `request.jwt.claim.sub`; Supabase reads `request.jwt.claims`): **UNVERIFIED**. TEST-PLAN row 10 (proxy log of one real scan) |
| 03 | Atomic single admission | `core:73-82`: one conditional `UPDATE ... WHERE checked_in_at IS NULL AND status='paid' AND <caller still owns event>`. M06 (two real connections, row-lock handshake), M07 (10 parallel), mutation self-check D01 | **met-proven** (replica) | Real Supabase pooling (pgbouncer + advisory locks) UNVERIFIED |
| 04 | Raw and `KIL-` acceptance, prefix case-insensitive | M01, M02, M03 (`kil-`, `Kil-`), M04 (whitespace), M34 (`KIL-KIL-`, `KIL -`, `KIL_`, `KIL:` refused). On the ORIGINAL, `event_checkin_scan` rejected every prefixed form (M02/M03/M04 `detects`); original `check_in_ticket` already took `KIL-`/`kil-` but did not trim (M04.ticket). TB e1, e2 | **met-proven** (replica); TB repeats raw and `KIL-` | Prod still has the original (section 3) |
| 05 | Repeat refusal | M05, M05b: second scan `already_used` with the original time (retry after a lost response is safe). TB e1, e2 | **met-proven** | none beyond apply |
| 06 | Concurrent refusal | M06, M07, D01 (see 03) | **met-proven** (replica only) | TB covers sequential scans only (its README "NOT verified"); no load test |
| 07 | Refunded / cancelled / pending refusal | M08, M08b (`checked_in` status reads `already_used`: the one intended response change), M30 (refund after admission re-scans `unpaid`, time kept), M32 (NULL status was admitted by the original `check_in_ticket`). TB f1: fake refund, signed `charge.refunded`, `refund_ticket_order`, re-scan refused | **met-proven** | none beyond apply |
| 08 | Refund racing a scan | M18 (refund committing while a scan waits on the row is honoured; the ORIGINAL admitted the refunded order on both functions), mutation D02. The race is driven by a direct UPDATE of status, not by the verbatim `refund_ticket_order` (DC-06; verbatim function exercised in 13A proofs S04/E02, not re-read by this job) | **met-proven** (replica) | Real Stripe-driven refund racing a real scan UNVERIFIED |
| 09 | Stale / unknown / malformed / over-long token refusal | M09, M17, M28 (129/1000/100000 chars), M29 (`%`, `_`, quote, backslash, prefix of a token, token+1, uppercased token), M15/M36/D05 (ambiguous duplicate and vanished order fail closed, no exception). UI refuses `://`, whitespace and >128 chars locally without a request (UI tests) | **met-proven** | none beyond apply |
| 10 | FORGED but well-formed paid order cannot be admitted | **Not met by 12A.** A01 shows the forged order is admitted on original AND hardened functions. Closed by 13A pack 01 (drops `orders_anon_insert`, REVOKE ALL then GRANT SELECT): 13A proofs A01-A03/E01; TB g1-g3 (S0 replica allows, hardened refuses) | **met-proven on replica only after 13A**; open on prod | 13A must follow 12A; Atlas/Sentinel/Joe gates |
| 11 | Null-owner / null-handle / empty-string denial | M12 (original `check_in_ticket` ADMITS: `detects`), M12b, M13 (empty-string `''` = `''` admitted by BOTH originals), M14 (case-insensitive handle), M35, M31 (owner moved mid-scan), D04. TB e5 (original replica admits, hardened refuses) | **met-proven** | Atlas's own conditions UNVERIFIED (document unavailable) |
| 12 | `anon` has no EXECUTE | M19 (`check_in_ticket` was anon-executable: `detects`; original `event_checkin_scan` was already not), M20, M25, P04/P05 post-checks. TB e3 (42501) | **met-proven** | Live ACL must be checked with VERIFY-12A V1 after apply |
| 13 | `search_path` pinned and schema-qualified | M23 (`detects`: originals are `search_path=public`), M24, D03 (an unqualified copy IS hijacked, so the test can fail). Honest note in README: the original qualified its relations and was not practically hijackable; this is defense in depth | **met-proven** (posture) | none beyond apply |
| 14 | No attendee contact in any response or UI | M22 (original `detects`: returned `buyer` = handle or email, plus `event_slug`), M37, M38, XC negative control 5 (a `buyer` key fails), X01; adapter whitelist; UI test injects `buyer/email/handle/phone/name/token/order` keys and scans the DOM. TB e4 | **met-proven** (replica + jsdom) | `organizer_dashboard` and organizer read of `buyer_email` on `event_orders` are separate surfaces (DC-27; 13A keeps organizer SELECT: open decision in 13A README) |
| 15 | Names require opt-in | No opt-in column exists in captured `event_orders`/`app_users` (FACTS:130), so no name of any kind is returned (DC-14) | **met by design** (nothing implemented; counts as met-proven in the tally) | Adding names needs a new column, adapter + renderer change, new test |
| 16 | Response / adapter cross-check | `adapter/door-contract-crosscheck.test.mjs` (12 tests, 9 negative controls: unmapped code, renamed status, leaked key, ...), X01 (all 7 result codes through both real RPCs and both adapter functions), `adapter/door-scan-adapter.test.mjs` 10/10; adapter copy byte-identical in #141/#142 (md5 c51a63589620122045bd0986815f50f8 per SENTINEL-CHECKLIST) | **met-proven** | Re-run if the SQL or adapter changes |
| 17 | QR encodings: `/tickets` = `KIL-<token>`, `/profile` = raw token, both accepted | Encoding: `tickets.html:159`, `kil-ticket-qr.js:8`; native `www/tickets.html:158`, `www/profile.html:1235` (DC-02 table). TB d2 renders both with the shipped `qrcode.js`; #158 jsdom test draws both. Acceptance: row 04 | **simulated** (rendered locally; decode only if jsQR is present: whether the recorded TB run decoded is **UNVERIFIED**, its EXPECTED-OUTPUT line is truncated) | A real camera reading a real wallet QR (Joe) |
| 18 | Self-hosted QR, web | #158: repo-wide static scan for third-party QR/chart hosts, with a negative control; `main` already draws locally (`assets/js/vendor/qrcode.js`) | **met-proven** (static + jsdom, DRAFT unmerged guard) | Merge the guard |
| 19 | Self-hosted QR, app | keepitil-app #52: replaces 3 `api.qrserver.com` image URLs in `www/tickets.html`, `profile.html`, `event.html`; 9 tests. Per #52's own body, app `main` (653a0718) STILL calls api.qrserver.com (so a ticket token reaches a third party today) and the stack heads (#46 etc.) are already clean. I did not grep either tree | **met-proven** (static + node:vm; unmerged) | Merge #52 or confirm the stack lands first; no WKWebView render check |
| 20 | Camera decode: `BarcodeDetector` with jsQR fallback | 15B: native detector when it lists `qr_code`, else vendored jsQR 1.4.0 (SHA-256 pinned, lazy, same-origin). 144 generated QR images decoded (scales x EC levels), fake-camera frames through the real page; headless Chrome with `BarcodeDetector` removed admitted a generated QR (`evidence/d1-harness-report.json`) | **simulated** (generated images / canvas stream) | Low light, glare, brightness, speed on an old iPhone (TEST-PLAN rows 13-14) |
| 21 | iPhone camera path on a real device (Safari and the Capacitor WKWebView) | APP #46 docs: "NOT verified: real iPhone camera, WebView permission prompt, getUserMedia under capacitor://localhost, adapter import under the real MIME table" | **not verified** | Joe: real-device test, TEST-PLAN rows 2, 11, 13-15; app gap A19 |
| 22 | Door page not linked in the shipping app until 12A is live (KODE decision 2026-11-10) | APP #46 `tests/door-bundle.test.mjs`: nothing in the bundle links to `door.html`; `dashboard.html:326` is a self-link (`/dashboard`). Gap list A35/D1 | **met-proven** (static test, DRAFT #46) | Joe confirms keep-or-revert of the `NSCameraUsageDescription` door sentence (A35). The entry point is a post-12A change (gap list D1), not yet designed |
| 23 | Door roles beyond the owner handle | DC-29, 15A decision D2: authorisation is `owner_handle` only; no staff table | **not verified** (open decision) | A delegate model is a new server authorisation design |
| 24 | Per-seat vs per-order admission | DC-15: one QR = one order = whole `qty` admitted by one scan (M33 documents it); 4 options in DERIVED-CONDITIONS | **not verified** (open decision; current behaviour proven) | Decision; schema change for options 2/3 |
| 25 | Scan throttling and audit trail | DC-19 (no throttle; gateway limits UNVERIFIED), DC-20 (no audit table; only `checked_in_at`; no scanner identity, no refused attempts) | **not verified** (open; absent in the original too) | Decision; `door_scan_log` is a proposal only, not built |
| 26 | Duplicate `qr_token` / UNIQUE index | Refusal as ambiguous is proven (M15). The UNIQUE partial index is the OPTIONAL pack `packs/optional/12a_OPT_qr_token_unique_*` (U01-U06 on replica), non-transactional, not reviewed, must follow 13A | **not verified** (optional) | After 13A; PRECHECK must show zero duplicates. Token entropy / DEFAULT expression UNVERIFIED (DC-17; PRECHECK-13A captures it) |
| 27 | Real Stripe test-mode order, end to end | TB is a FAKE Stripe, a Node shim of the stripe library and a simulated hosted page; its README lists what only real test mode can prove. Steps: `docs/money-build/14a-checkout/TEST-PLAN.md` | **not verified** (BLOCKED-on-Joe: test keys, Connect test account, staging project) | Joe |
| 28 | Prod apply of 12A (then 13A) | Nothing applied. Gate: Atlas review, Sentinel PASS at the exact SHA (a later push voids it), backup, relayed go, all per step | **not verified** | Section 3 onward |

### Tally (28 requirements)

| Status | Count | Rows |
|---|---|---|
| met-proven (incl. 1 by design) | 17 | 03-16, 18, 19, 22 (15 is by design) |
| simulated | 4 | 01, 02, 17, 20 |
| not verified | 7 | 21, 23-28 |

Reviewer note: 10 is met-proven only on a replica that already has 13A applied; on prod it is **open** until 13A is applied. Rows 03-09 and 11-13 are replica evidence, not Supabase evidence.

## 2. Gaps between the claims and the evidence (honest list)

1. **"Demonstrated end to end in the testbed" is the SQL layer only.** TB's door step calls the hardened functions directly as the authenticated role: no scanner UI, no PostgREST, no real JWT verification, sequential scans only (TB README "What is real vs simulated" and "NOT verified here"). Concurrency evidence comes from P12A (replica), not TB.
2. **The door UI has never talked to a real RPC.** UI tests use a fake Supabase client and a fake `fetch`; the shape contract is covered statically (XC) and by X01 at adapter level, but UI to PostgREST to function was never run.
3. **The door UI is not in X154 or on `main`** (#141/#142 are stacked on `draft/14a-checkout-path`). The apply-order doc says "door UI needs its own extraction". `ENABLE-CHECKLIST.md` (15A) still shows merge order #137 > #138 > #139 > #141 and cites #138, which is CLOSED (content moved into #154); likewise `SUBMIT-READINESS`/gap list cite #137/#138. Stale pointers, not stale logic.
4. **All SQL evidence is a transcription-based replica** on PostgreSQL 17.6 with stand-in roles. The prod baseline is a transcription of KODE's 2026-11-10 capture: `PRECHECK-12A` and `12a_DRIFT_QUERY` (first row must read `S0_original`) are the real check.
5. **Refund race (row 08)** is driven by a direct status UPDATE, not the verbatim `refund_ticket_order` (stated in DC-06).
6. **TB step d2** decodes the rendered QR only when jsQR is present; jsQR is not on `main`. Whether the recorded run decoded is UNVERIFIED.
7. **Atlas's and Sentinel's own conditions are unknown.** SENTINEL-CHECKLIST-12A.md says its boxes are unticked by design.
8. **App `main` still sends ticket QR text to api.qrserver.com** (per #52's body; not re-verified here). The stack is clean; `main` is not until #52 or the stack lands.
9. **12A tests that look like gaps but are not defects:** the original `event_checkin_scan` already refused anon and already handled null-owner (only `check_in_ticket` had those holes); the empty-string owner hole and the refund race existed on BOTH originals; the suspected "unassigned record" defect did NOT reproduce (M36, no SQL change).

## 3. What changes on prod when 12A + 13A are applied (function by function, nothing applied today)

Live prod today (read-only capture 2026-11-10, `baseline/PROD-FACTS-12A.md`): raw token works; `KIL-` is rejected by `event_checkin_scan`; null-owner hole in `check_in_ticket`; anon has EXECUTE on `check_in_ticket`; both functions return `buyer` (handle or email); `event_orders` has `orders_anon_insert`, `event_orders_organizer_update` and table ACL ALL (incl. TRUNCATE) for anon and authenticated.

| Object | Step | Before (live) | After | Grants after |
|---|---|---|---|---|
| `public.event_checkin_scan(text)` | 12A step 1 | `search_path=public`; raw token only (no trim, no prefix); `''` owner admitted; refund race admits; returns `buyer`, `event_slug` | thin wrapper over the core; trims, strips ONE `KIL-` (any case); atomic admission; refund/ownership re-checked in the UPDATE; keys `ok,result,message` + `event_title,tier,qty,checked_in_at` only; `search_path=''` | `REVOKE ALL FROM PUBLIC, anon`; `GRANT EXECUTE TO authenticated, service_role` (sorted ACL `{authenticated,postgres,service_role}`; unchanged from today's effective ACL) |
| `private.door_checkin_core(text)` + schema `private` | 12A step 1 | absent (pack aborts if `private` already exists) | NEW: SECURITY DEFINER, `search_path=''`, owner `postgres` | none to anyone; schema `private` must NOT be exposed in the API settings |
| `public.check_in_ticket(text)` | 12A step 2 (needs step 1) | null-owner hole, NULL status admitted, case-sensitive handle, no trim, returns `buyer`, `search_path=public` | wrapper over the same core; keys `status,event,tier,qty,checked_in,sold,at` (+`order_status` on `notpaid`), no `buyer`; handle match now case-insensitive | **anon EXECUTE revoked**; `authenticated, service_role` kept |
| `public.event_orders` | 13A pack 01 (after 12A) | policies `orders_anon_insert` (WITH CHECK true), `event_orders_organizer_update`; ACL ALL for anon, authenticated | both policies dropped; `REVOKE ALL FROM PUBLIC, anon, authenticated` then `GRANT SELECT TO anon, authenticated` (anon SELECT kept on purpose: profile page for signed-out visitors); read policies untouched; no row data changed | `{anon=r, authenticated=r, postgres=arwdDxtm, service_role=arwdDxtm}` |
| `public.get_ticket(text)` | 13A pack 02, OPTIONAL | returns buyer e-mail to any token holder (live md5 `1814becc056c30ccac38c3adb51019ae`) | wrapper without `buyer`; original renamed `get_ticket__orig_13a` | needs its own go: external callers unknown |
| `event_orders(qr_token)` UNIQUE partial index | OPTIONAL, after 13A | non-unique `event_orders_qr_token_idx` | UNIQUE partial index (non-transactional) | n/a |
| everything else | | | **unchanged** (R01/R02 prove: no table, column, policy, grant, index, constraint, trigger, other function or data change by the 12A packs; `fulfill_ticket_order`, `refund_ticket_order`, `get_my_tickets`, the Edge Functions are untouched by 13A) | |

Behaviour a caller will notice: `buyer` and `event_slug` disappear; `checked_in` status now answers `already_used`; `check_in_ticket` handle match is case-insensitive; duplicate tokens answer `invalid`; anon calls to `check_in_ticket` now fail with 42501 instead of `{"status":"unauth"}`.

## 4. Apply order and rollback (from `RUNBOOK-APPLY-BACKUP-ROLLBACK.md` and `APPLY-ORDER-2026-11-10.md` in X154)

Gates for every write step: Atlas review of the pack text at an exact SHA; Sentinel PASS at that same SHA; Joe's explicit go relayed by Grok/KODE for THAT step; definition capture saved first (the connector has no `pg_dump`; a full data backup is Joe's dashboard action, optional per the runbook). KODE runs one pack at a time as `postgres`, one transaction per pack, advisory lock key 2979301232487107403 with `lock_timeout 5s`. Any `DRIFT`: stop, do not edit literals.

| Step | Apply | Rollback (reverse order; 13A before 12A, always) |
|---|---|---|
| A0 | read-only captures 01-07 (PRECHECK-12A, 12a DRIFT_QUERY = `S0_original`, VERIFY-12A, PRECHECK-13A, 13a DRIFT_QUERY, CAPTURE-READONLY, live-readers md5) | n/a |
| A1 | `packs/12a_01_event_checkin_scan_APPLY_PROPOSED.sql` | R5: `12a_01_..._ROLLBACK_PROPOSED.sql` (restores the captured original body and ACL, drops core and schema `private`); verify `12a_POSTCHECKS_S0_original` |
| A2 | `packs/12a_02_check_in_ticket_APPLY_PROPOSED.sql` | R4: `12a_02_..._ROLLBACK_PROPOSED.sql`; verify `12a_POSTCHECKS_S1_after-step1` |
| A3 | `13a_01_event_orders_APPLY_PROPOSED.sql` (13A-first is refused by 12A's drift guard) | R3: `13a_01_..._ROLLBACK_PROPOSED.sql` (REOPENS the table hazards; only to restore baseline); verify `13a_POSTCHECKS_orders_S0_original` |
| A4 | Smoke: Stripe TEST-mode purchase still creates an order (Joe's gate; row 27) | failure: roll back 13A pack 01 first |
| A5 | optional 13A pack 02 | R2: `13a_02_get_ticket_ROLLBACK_PROPOSED.sql` (md5 back to `1814becc...`) |
| A6 | optional UNIQUE index (after A3) | R1: `12a_OPT_qr_token_unique_ROLLBACK_PROPOSED.sql` |

Rolling back 12A while 13A is applied REFUSES (proof P21). Rollback byte-identity: P09 (12A), P38 (the whole capture/apply/rollback/compare method), `diff` of `06_CAPTURE-READONLY` ignoring `acl_raw` rows (raw ACL order legitimately differs after rollback). Roll back if: a post-check row is not `ok`, a Sentinel isolated test fails, door staff report valid tickets refused, the test purchase creates no order, or `get_my_tickets()` stops returning a buyer's paid tickets.

## 5. What KODE runs after each apply step

All read-only, each as `BEGIN READ ONLY; <file>; ROLLBACK;`, output saved to the dated capture folder. `VERIFY-12A.sql` (`db/proposed/12a-door-hardening/`) returns catalog facts and aggregate counts only (test V01: no token, email, handle or id is ever returned).

| After | Run | Expect |
|---|---|---|
| A1 | the pack's own retained SELECT; `packs/12a_POSTCHECKS_S1_after-step1_PROPOSED.sql`; `packs/12a_DRIFT_QUERY_PROPOSED.sql`; `VERIFY-12A.sql` | every row `ok`; DRIFT_QUERY = `S1_after-step1`. V1: `event_checkin_scan` SECURITY DEFINER, config `search_path=""`, `anon_can_execute=false`, `authenticated_can_execute=true`; `door_checkin_core` has no non-owner grants (`has_function_privilege` false for anon/authenticated). V2 `orders_total/paid/admitted` equal the A0 values (admitted changes only by scans Sentinel/KODE intentionally run on a fixture). V4 policies/table ACL/index/constraint md5s EQUAL A0 (12A must not touch the orders surface). V3 `zero_test_atlas_rows = true`. Then Sentinel's isolated tests on the scan: raw token, `KIL-` token, null-owner, anon, replay |
| A2 | `packs/12a_POSTCHECKS_S2_after-step2_PROPOSED.sql`; DRIFT_QUERY; `VERIFY-12A.sql` again | all `ok`; DRIFT_QUERY = `S2_after-step2`; V1 shows `check_in_ticket` with `anon_can_execute=false` and no PUBLIC grantee; V2/V4 as above; V3 true. Sentinel tests on `check_in_ticket` |
| A3 | `packs/13a_POSTCHECKS_orders_S1_after-pack01_PROPOSED.sql`; `packs/13a_DRIFT_QUERY_PROPOSED.sql`; re-run `CAPTURE-READONLY.sql` into `after/`; `VERIFY-12A.sql` | orders = `S1_after-pack01`. V4 policies_md5 and table_acl_md5 now DIFFER from A0 (expected: 13A changed them); V2 counts unchanged; V1 unchanged from after A2. Door still admits a fixture order (13A proof D01-D04) |
| A5 | `packs/13a_POSTCHECKS_get_ticket_G1_after-pack02_PROPOSED.sql`; DRIFT_QUERY | get_ticket = `G1_after-pack02` |
| After any rollback | DRIFT_QUERY for the state reached; `VERIFY-12A.sql` V5 (definition capture of the two public functions) compared with A0; md5 of `get_ticket`/`get_my_tickets` = `1814becc056c30ccac38c3adb51019ae` / `c3885372304c4f2c1d73c540a6f6834e` | equal to baseline |

Also keep `VERIFY-12A.sql` V5 output taken BEFORE step 1: it is the read-only backup of the two function bodies and ACLs.

## 6. Open decisions (none made here)

Per-seat vs per-order (DC-15); door staff/delegates (DC-29, D2); scan throttling and audit table (DC-19/20); token-existence oracle `forbidden` vs `invalid` (DC-18); event status/date window at the door (DC-28); token DEFAULT/entropy (DC-17, capture first); optional get_ticket F-D; optional UNIQUE index; anon SELECT on `event_orders` (13A keeps it); organizer read of `buyer_email` on `event_orders` (13A README); keep or revert the camera wording in `Info.plist` (A35); door entry point timing (D1: after 12A is live).

## 7. Not covered by this document

Prod behaviour (no connection made); Atlas's `checkin-scan-fix.md`; Sentinel's conditions; real Supabase specifics (auth, pooling, exposed schemas, ownership by `postgres` vs `supabase_admin`, default privileges); real devices; real Stripe; whether the Pages host serves `/assets/js/kil-door-scan-adapter.mjs` as JavaScript (app gap doc says KODE checked `text/javascript` on 2026-11-10; UNVERIFIED by this job).
