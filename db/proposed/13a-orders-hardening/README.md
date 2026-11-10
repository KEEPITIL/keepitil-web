# 13A orders hardening (DRAFT, proposal only, nothing applied anywhere)

Status: **DRAFT PR, base `draft/12a-door-hardening` (PR #137).** No prod connection was made by this job; prod facts are the read-only captures in `baseline/PROD-FACTS-13A.md` and `../12a-door-hardening/baseline/PROD-FACTS-12A.md`. `db/` is excluded from the Pages publish; nothing applies these files. No live page, Edge Function, adapter or locked file is touched.

**Apply gate (binding): NO prod SQL without Joe's relayed yes + a Sentinel pass + a backup.** Run `PRECHECK-13A.sql` first, compare with the baseline, then pack 01.

## The finding being fixed

`public.event_orders` is the ticket ledger the 12A door trusts. Captured prod state: table ACL `ALL` (incl. TRUNCATE, MAINTAIN) for `anon` and `authenticated`; policy `orders_anon_insert` (anon + authenticated INSERT, `WITH CHECK true`); policy `event_orders_organizer_update` (an organizer may UPDATE any column of their events' orders, incl. `status`, `qr_token`, `checked_in_at`, `amount_cents`). Consequences, all reproduced on the replica (matrix rows A/B/C/E01): anyone can insert a forged `paid` order with their own `qr_token` and be admitted at the door; an organizer can rewrite revenue and tokens; anon can `TRUNCATE` the table (5 orders in prod today).

## The real checkout path (details and file:line in PATH-REPORT.md)

Stripe -> `stripe-webhook` (service_role) -> `fulfill_ticket_order` (SECURITY DEFINER, ACL postgres + service_role only) inserts; `refund_ticket_order` (same ACL) refunds; 12A's `event_checkin_scan` / `check_in_ticket` (DEFINER) set `checked_in_at`. **No other writer exists in keepitil-web or keepitil-app (all branches).** `create-checkout` does not insert; free-ticket RSVP writes `event_registrations`, not `event_orders`. Clients only SELECT (profile.html Events tab, as authenticated and as anon) or call RPCs.

## Contents

| file | what |
|---|---|
| `packs/13a_01_event_orders_APPLY_PROPOSED.sql` | **F-A + F-B + F-C** in one transaction: drift guard, `DROP POLICY orders_anon_insert`, `DROP POLICY event_orders_organizer_update`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, `GRANT SELECT ... TO anon, authenticated`, post-check, retained evidence SELECT |
| `packs/13a_01_event_orders_ROLLBACK_PROPOSED.sql` | restores the captured policies (same predicates) and the table `GRANT ALL` for anon + authenticated |
| `packs/13a_02_get_ticket_APPLY_PROPOSED.sql` / `_ROLLBACK_` | **F-D, OPTIONAL, independent**: `get_ticket(p_qr)` stops returning the buyer e-mail |
| `packs/13a_POSTCHECKS_*`, `packs/13a_DRIFT_QUERY_PROPOSED.sql` | one read-only SELECT each; DRIFT_QUERY classifies orders `S0_original / S1_after-pack01 / DRIFT` and get_ticket `G0_original / G1_after-pack02 / DRIFT` |
| `PRECHECK-13A.sql` | ONE read-only statement (catalog + aggregate counts, never row contents) to run on prod first |
| `build.mjs` | generates every pack and PRECHECK from `baseline/` + `src/` (all md5 / ACL literals computed, never typed); `node build.mjs --check` |
| `proof/` | real-PG replica + `prove.mjs` + `run-proof.sh` (starts Postgres on a Unix socket, **always stops it**, samples load/memory; refuses to start if load > 8 or free memory < 25%) + `report.mjs`; `proof/out/` has the run log, results, peak load |
| `MATRIX-RESULTS.md`, `PATH-REPORT.md` | results; repo grep + verdict |

Pack frame (same as #136 / #137): `BEGIN; SET LOCAL lock_timeout='5s'; SELECT pg_advisory_xact_lock(2979301232487107403); SET LOCAL lock_timeout='5s';` as the first statements, run as `postgres`, one transaction, drift guard that aborts on any difference from the captured state, sorted-ACL fingerprints, post-check inside the transaction, ROLLBACK pack, DRIFT_QUERY, POSTCHECKS.

## What the fix does and what it deliberately keeps

* F-A: policy `orders_anon_insert` dropped. F-B: policy `event_orders_organizer_update` dropped (no client UPDATE exists; check-in and refund go through DEFINER functions). F-C: table privileges `ALL -> SELECT` for anon and authenticated, PUBLIC revoked (no PUBLIC grant exists today); `service_role` and `postgres` untouched (`arwdDxtm`).
* **Kept on purpose: `SELECT` for `anon`.** KODE's expectation was "SELECT to authenticated only". The repo grep shows the profile Events tab runs `event_orders` SELECT for signed-out visitors and today gets `[]`; removing anon SELECT turns that into a 42501 and the page says "Could not load your tickets" (proved on the replica, X01). The privilege is harmless: there is no anon policy, anon sees zero rows (R03). It also protects any policy on another table that sub-selects `event_orders` while evaluated as anon (R05; `PRECHECK-13A.sql` lists such policies/views/functions on prod, so the question can be answered with data). To drop it later: `REVOKE SELECT ON public.event_orders FROM anon;` after the profile.html query is skipped for signed-out viewers and PRECHECK shows no anon-evaluated dependent.
* Policies `event_orders_organizer_read` and `event_orders_owner_read` are untouched (byte-identical text, C08). RLS stays enabled, not forced. `fulfill_ticket_order`, `refund_ticket_order`, `create-checkout`, `stripe-webhook` are **unchanged** and verified working after the fix (S01-S05, E02).

## Proven (real PostgreSQL 17.6, socket-only; see MATRIX-RESULTS.md)

37/37 behavioural tests (17 negative controls FAIL on the original as required, 20 regression tests pass on both), 31/31 pack / structural / mutant / F-D tests, 3/3 informational findings. Highlights:

* anon cannot INSERT a forged paid order (original: inserts); authenticated buyer and organizer cannot INSERT (A01-A03); service_role INSERT still works (A04).
* organizer cannot UPDATE `status`, `qr_token`, `checked_in_at`, `amount_cents` or any other column (B01-B05; original: all succeed); cannot swap `qr_token` to admit a forged token at the door (B06); other organizers / buyers cannot update either (B07).
* anon / authenticated cannot TRUNCATE (original: TRUNCATE succeeds, C01-C02), DELETE or UPDATE (privilege refusal, C03-C04); exact privilege sets and sorted ACL `{anon=r, authenticated=r, postgres=arwdDxtm, service_role=arwdDxtm}` (C05-C07).
* service path intact: `fulfill_ticket_order` inserts 2 items with 32-char tokens, resolves the buyer handle, increments `qty_sold`; duplicate (session, tier) is idempotent; `refund_ticket_order` refunds by session and by payment intent and restores `qty_sold`; anon/authenticated cannot execute either (S01-S05).
* readers intact: buyer sees own orders via owner_read, organizer theirs via organizer_read, anon zero rows without error; the profile.html query shape; DEFINER/INVOKER readers return the same results (R01-R06).
* **12A door regression and forged-order end to end:** with 12A applied, the door admits / refuses exactly as before (D01-D04); a forged paid order is admitted at the door on the original and cannot exist after the fix (E01); legit fulfil -> buyer sees -> door admits -> refunded order refused (E02).
* apply / rollback: ROLLBACK restores sorted ACL, column ACLs, every policy text and role list, indexes, RLS flags and data byte-for-byte (P06; the raw `relacl` entry ORDER differs after a rollback because GRANT appends, which is semantically identical and is the reason fingerprints are sorted); apply -> rollback -> apply works (P07); second run refuses at the guard (P05); 11 drift cases abort with nothing changed, incl. a non-postgres runner, a column ACL, a widened fulfill ACL, an altered fulfill body (P08); lock serialises two runs (P09), packs share the lock (P10), 55P03 after ~5 s with a negative control showing the unbounded behaviour without the pre-lock timeout (P11, P11c); POST-CHECK rolls a partial pack back (P37).
* **Mutants (partial fixes) are caught** by the suite and by POSTCHECK S1 (P30-P36): drop policies but keep GRANT; revoke only anon; leave REFERENCES/TRIGGER/MAINTAIN; leave UPDATE + organizer policy; over-revoke SELECT from authenticated; column-grant remnant.
* **Ordering vs 12A:** 12A first, then 13A works. **13A first, then 12A: 12A's guard REFUSES** (its guard expects the original orders ACL/policies; P20), so the order is fixed. Rollbacks go in reverse: 13A rollback first, then 12A (rolling back 12A first refuses, P21). 12A's hardened functions run correctly on a 13A-hardened table (P22).
* F-D (G01-G06): see below. `PRECHECK-13A.sql` runs in a READ ONLY transaction, returns the qr_token DEFAULT expression, all four policy texts, column-ACL count, full function bodies, and leaks no fixture row content (P12-P13).

## Apply order and interaction

1. 12A packs (step 1, step 2) first - they are unchanged by this PR and their guards require the original orders state.
2. `PRECHECK-13A.sql` on prod; compare with `baseline/PROD-FACTS-13A.md`; resolve anything unexpected (see OPEN QUESTIONS 1-3).
3. 13A pack 01, retain its evidence SELECT; run POSTCHECKS S1.
4. Optional: pack 02 (F-D) any time, before or after pack 01 (independent; shares the advisory lock).
5. Smoke after apply: a Stripe **test-mode** purchase through create-checkout -> webhook -> `fulfill_ticket_order` (service_role) produces an order; a test refund flips it. This is the one thing the replica cannot prove about the real Stripe/Edge Function wiring.
6. Rollback: 13A pack 01 rollback BEFORE any 12A rollback.

## F-D: `get_ticket(p_qr)` buyer e-mail (optional pack 02)

`get_ticket` is anon-executable and returns the buyer's e-mail for any paid order token (token = bearer secret, but the e-mail is contact data). Its prod body was **not captured**, so pack 02 does not rewrite it: it renames the live function to `get_ticket__orig_13a` (same oid and body, ALL grants revoked, original ACL stashed in its comment), installs a `SECURITY DEFINER`, `search_path=''` wrapper that returns the original result minus the `buyer` key (every other key byte-equal, G01; NULL/unknown/refunded/empty inputs unchanged, G02), and gives the wrapper exactly the original's EXECUTE grants (G03). Rollback drops the wrapper, renames the original back, restores the stashed ACL: same oid, byte-identical `pg_get_functiondef`, raw ACL, config, no comment (G04). Guards refuse on a comment, existing helper name, dependent objects (a view/policy bound by oid would keep pointing at the renamed original), SECURITY INVOKER original, grant options, non-jsonb return (G05). Independent of pack 01 in both orders (G06).
Callers: **none in keepitil-web or keepitil-app** (the app's profile links to a `/ticket.html` that exists in neither repo), so no key is known to be consumed; dropping `buyer` cannot be confirmed safe against an external caller. Review the PRECHECK output (language, secdef, body, whether `buyer` is a top-level key) before applying; if the original nests the e-mail, the wrapper would not remove it.

## NOT verified

* Nothing was run against prod or any hosted DB. Replica assumptions: `qr_token` DEFAULT (`md5(random()||clock)`), `my_handle()/my_email()` bodies, the readers (`get_my_tickets`, `has_event_ticket`, `organizer_dashboard`) and `get_ticket` are approximations; **`refund_ticket_order` is written from the facts description, not verbatim** (its body is not in the facts file); `fulfill_ticket_order` is verbatim from the facts (whitespace-insensitive fingerprint guards it). `PRECHECK-13A.sql` prints every real body for byte-compare.
* Policy predicate text is guarded by tokens (`my_handle`, `owner_handle`, `buyer_email`, `my_email`, `with check true`) plus names/commands/roles, because the exact prod `pg_get_expr` text was not captured; the full texts are printed by PRECHECK for a human compare, and the ROLLBACK recreates them from the facts (byte identical on the replica, equal in meaning on prod).
* Column ACLs on `event_orders` and the `event_orders_id_seq` ACL were not in the captured facts: the guard aborts if any column ACL exists; PRECHECK prints both.
* The real Stripe -> `stripe-webhook` -> `fulfill_ticket_order` chain, `create-checkout`, the Edge Function sources (not in the repos), external callers outside these repos, and the live PostgREST/RLS stack (the replica uses stand-in roles) were not exercised.
* Whether any policy/view/function on prod evaluates `event_orders` as anon (answered by PRECHECK; the pack keeps anon SELECT so nothing depends on the answer).
* Timing bounds (P11: 4.5-6.5 s) are for this machine.

## OPEN QUESTIONS

1. **anon SELECT**: keep (this pack) or drop? Dropping needs profile.html to skip the query for signed-out viewers (client change, not wired here) and a PRECHECK showing no anon-evaluated dependent. X01 shows the effect.
2. **Organizer read exposes `buyer_email` and `qr_token`** (`event_orders_organizer_read`, X02). A token lets the event's own door owner admit a token; they are the door, so not a privilege escalation, but it is a PII/credential exposure to organizers. A column-level SELECT without `qr_token`/`buyer_email` would break `organizer_dashboard`-style invoker reads and the agent tool's column list; a DEFINER-only organizer export would be the clean design. **Not changed** (not clearly safe).
3. **`qr_token` uniqueness**: only a non-unique index exists; 12A's door refuses a duplicate as ambiguous, and with INSERT closed the only generator is the column DEFAULT (collision-resistant at 32 chars). `PRECHECK` reports `agg.qr_token_duplicate_surplus_rows`; a UNIQUE index (the 12A sketch) needs that to be 0 and its own pack. Not bundled.
4. `event_registrations` (RSVP / attendee data, anon-insertable from event.html) was not captured and is not covered here.
5. `get_ticket` (F-D): apply it? And should `ticket.html` (linked from the app, absent from both repos) be located first?
6. Is the `create-checkout` call from event.html with the anon-key bearer a real defect against v58's signed-in requirement (PATH-REPORT observation 1)?
7. Existing forged/duplicate rows: PRECHECK shows aggregates only (5 paid today); reviewing real rows is a separate, explicitly approved step.

## Reproduce

```
cd db/proposed/13a-orders-hardening
node build.mjs --check            # packs + PRECHECK equal their inputs
proof/run-proof.sh                # real PG 17.6 on a Unix socket, always stops Postgres
node proof/report.mjs             # regenerates MATRIX-RESULTS.md
node --test ../12a-door-hardening/adapter/door-scan-adapter.test.mjs   # 12A adapter, unchanged (10/10)
```
