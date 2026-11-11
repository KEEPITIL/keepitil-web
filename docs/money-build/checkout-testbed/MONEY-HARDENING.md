# Checkout money hardening (DRAFT, PROPOSAL ONLY: nothing applied, nothing deployed)

Answers Atlas must-fixes 1-8 and Sentinel S1-S4 on PR #157 (2156054 / e87e201 review), and the ROUND 2 list (Atlas 1-4 at 7668ad63, Sentinel 11:15 PT): see "Round 2" below. Everything below is local: PostgreSQL 17 on a Unix socket, simulated Stripe, no secrets.
Run: `KIL_SCENARIO=scenario-money.mjs ./scripts/checkout-testbed/run.sh` (27 proofs after round 2). The earlier 40-step and 10-step scenarios still pass and now run through the same redactor.

## What is new (all under `scripts/checkout-testbed/`)
| File | What |
|---|---|
| `proposed/14a_01_checkout_money_hardening_APPLY_PROPOSED.sql` (+ `_ROLLBACK_`) | private ledgers (`stripe_event_ledger`, `payment_ledger`, `order_hold`) and three NEW definer functions `fulfill_ticket_order_v2`, `refund_ticket_order_v2`, `dispute_ticket_order`; all `SET search_path = ''`, service_role only. The captured baselines are not modified. |
| `proposed/14a_02_retire_legacy_checkout_functions_APPLY_PROPOSED.sql` (+ `_ROLLBACK_`) | cutover: revokes service_role EXECUTE on the legacy `fulfill_ticket_order` / `refund_ticket_order` AFTER the new webhook is live. |
| `patches/stripe-webhook-money-hardening.PROPOSED.diff` | v53 against the pinned deployed v52 (md5 33840e79...). Supersedes the payment-settled patch (included). |
| `patches/create-checkout-staging-site.PROPOSED.diff` | STAGING-ONLY, fail closed: no production default; `KIL_SITE_URL` must be the staging site, unset / keepitil.com / keepitil.github.io is refused (500). Replaces the round-1 `create-checkout-site-env` patch. NEVER deploy to the production project. |
| `lib/redact.mjs`, `lib/guards.mjs` (`assertLocalPgHost`), `lib/pgdb.mjs` | no-token logging; local-only Postgres; cleanup limited to what the run created. |

## Item -> proof (scenario-money.mjs)
| Review item | Fix | Proof |
|---|---|---|
| Atlas 1, S1: disposable DB only; remote Postgres | `assertLocalPgHost` runs at import (socket dir / 127.0.0.1 / ::1 / localhost only); `dropDb` refuses a database the run did not create; `dropRoles` only the roles it created; a pre-existing role is refused, never reused or dropped | s1a (7 remote hosts refused), s1b, `tests/pgdb-guard.test.mjs` |
| Atlas 2, S4: tokens in logs | v53 logs counts only; the DB function returns no tokens; `redact.mjs` scrubs every scenario/evidence write; QR SVG artifacts no longer written | l1 (0 redactions in the money run; v52 source shown to log `rpc data`), md5/hex scan of all out files |
| Atlas 3: failed refund returned 200 | any DB failure answers 500 | f1 (injected fault: 500, order unchanged; same event retried applies once; replay no-op) |
| Atlas 4, S3: partial / pending refund revoked everything | decided from Stripe's own record: sum of SUCCEEDED refunds vs charge amount; partial or pending only records | f2, f2b (still scans, then remainder revokes once), f3 (pending then succeeded) |
| Atlas 5, S2 ledger: out-of-order | `payment_ledger` remembers refund / dispute per payment intent; a later payment event issues no live ticket | f4, d2 |
| S2: reconcile amount, currency, order id; replay ledger | `fulfill_ticket_order_v2` checks tier, event, unit price, currency, quantity and total against server-side values; event-id ledger | r1, r1b, r2 (7 mismatch cases), r2b (control) |
| S3: disputes | opened = held (door refuses), won = restored, lost = seat released | d1, d2 |
| Atlas 6: capacity not atomic | tier row lock inside the v2 function; overflow lines are not issued and v53 asks Stripe to refund exactly their price (idempotency key) | c1 (5 concurrent connections: 3 live, 2 overflow; baseline control sells 5 of 3), c2 |
| Atlas 7: search_path | new functions `''`, fully schema-qualified, baselines byte-identical (md5) | sp1, sp2 |
| Atlas 8, S5 (checkout redirects) | staging patch has NO production default (fail closed) | g1 (staging ok; unset, apex, www, subdomain, github.io, empty, junk all refused with no session) |

## Round 2 (Atlas 1-4, Sentinel 11:15 PT)
| Item | Fix | Proof |
|---|---|---|
| Atlas 1: launchers must never stop a Postgres they did not start | `run.sh` refuses (exit 7) if a socket / listener already exists on the testbed port; `STARTED=1` only after OUR `pg-start.sh`; cleanup stops only then. `run-settled.sh` is now a scenario selector over `run.sh`. | `tests/launcher-ownership.sh` (stub pg scripts: existing instance -> 7 and no stop; clean -> one start, one stop; failed start -> 8 and no stop) |
| Atlas 2: candidate error logs leaked contact / token values | `redact.mjs` also removes emails, phones, contact fields, PG `Key (..)=(..)` details and registered secrets; edge-host and fake-Stripe error bodies pass through it; token and contact counters are separate | `tests/pgdb-guard.test.mjs`; l1 (0 token AND 0 contact redactions from the candidate); CI greps every artifact for contact / token values |
| Atlas 3 + Sentinel: replay of a DIFFERENT event at full capacity refunded an issued purchase | `fulfill_ticket_order_v2` checks each line for an existing order of that session BEFORE any capacity test: replays are `skipped_duplicate`, never oversold | n1 (async + second completed id on a full tier: no refund, no new order), n2 (SQL level) |
| Sentinel: payment-to-order binding must be immutable | unique `payment_ledger.session_id`; trigger forbids changing `payment_intent` / `session_id` once set; a second session on a paid payment, or an issued session with another payment, is `rejected` (200, recorded) | n5 (both rejections, direct rebind refused, no new order, binding unchanged) |
| Atlas 4 + Sentinel: lost dispute before the order / late 'created' | `dispute_closed` / `dispute_lost` are terminal; LOST revokes a live never-held ticket AND a held one and releases the seat once; a late 'created' is recorded and ignored; WON after lost is ignored | n3 (lost with no created -> cancelled, seat released once, replay no-op, late created does not hold), n4 (won then late created stays paid) |
| Sentinel S1: explicit prod refusal | `refuseProductionRefs`: the production ref is refused in ANY environment variable, kode / NEXUS / staging refs in database-ish variables; names only, never values; runs in `guardEnv` and at `pgdb` import | `tests/guards.test.mjs` |
| Sentinel S5: staging checkout defaulted to production | see `create-checkout-staging-site` patch above | g1 |
| Sentinel: CI only ran asset tests | `.github/workflows/checkout-testbed.yml`: PostgreSQL 17 service, unit tests, launcher test, scenarios (40, 40 patched, 10, 27 minimum counts), artifact scan, no leftover roles | the workflow itself |

Known limit of the dispute state: it is per PAYMENT, not per dispute id. A second, distinct dispute on the same charge after a first one closed would be ignored. Stripe allows one dispute per charge in practice; confirm in the real run.

## Honest limits (not proven here)
- Real Stripe object shapes for disputes, async payment methods and `refund.updated` are hand-built; the real test-mode run must confirm them (see PR #160 plan).
- Capacity is enforced when payment lands, so a sold-out race ends in an automatic refund, not a prevented checkout. True seat holds at session creation are a larger change, not done.
- Transfer / application-fee reversal on refund and dispute fee handling are not modelled.
- `vs_refund_entry_payment` is a no-op stub in the replica (prod has the real one); the v53 change that makes its failure a 500 is therefore untested against the real function.
- The v2 functions assume `ticket_tiers.currency` and `qty_total` exist as the deployed create-checkout reads them; confirm with the read-only drift query before any apply.

## Apply order (all gated: Atlas + Sentinel review, verified backup, Joe's relayed yes)
1. 14A-01 (adds objects only). 2. Deploy webhook v53 (+ create-checkout site-env patch on STAGING only). 3. Verify. 4. 14A-02 retires the legacy functions. Rollback: redeploy v52, 14A-02 rollback, 14A-01 rollback (ledgers kept).
