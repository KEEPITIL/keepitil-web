# Checkout testbed (DRAFT) - the money path end to end on a LOCAL backend with SIMULATED Stripe

Status: DRAFT, proposal only. Nothing here touches prod, live mode, or real Stripe. Fee numbers are a PLACEHOLDER (see "Fee placeholder").

## What it is

One command starts an isolated local Postgres database, runs the DEPLOYED `create-checkout` (v58) and `stripe-webhook` (v52) function sources, a FAKE Stripe API with a SIMULATED hosted-checkout page (4242 test card) that sends SIGNED webhooks, then walks the whole ticket path and prints a PASS/FAIL table.

Design used: **Option A, adapted to Node (Deno is not installed on the build Mac, and nothing may be downloaded).** The two deployed sources are committed byte-for-byte under `scripts/checkout-testbed/deployed/` (md5-pinned, re-verified at every start; they are NOT edited) and executed by Node 22 (built-in TypeScript stripping) with a resolve hook that maps their imports (`https://esm.sh/stripe@14...`, `npm:stripe@16`, `https://esm.sh/@supabase/supabase-js@2`, `npm:@supabase/supabase-js@2`) to small local shims, plus a 2-function `Deno` shim (`Deno.env.get`, `Deno.serve`). This is preferred over a hand port because the code under test is the code that is deployed.

| Deployed function | Version | md5 of the saved copy | Supabase bundle sha256 (ezbr) |
|---|---|---|---|
| create-checkout | v58 | `aad74a1bf95522b914578d2ebc78c6d6` | `79dbf80a4bf2101e86fcf3f3c3912d769168a76f772778618fcfcf493d39166a` |
| stripe-webhook | v52 | `33840e79eebb15fbb5d8a2a02787e002` | `5d27f786bc80cc8cf9a0faabe75874999cec7f295a4181b74a3ebe38ddc5d345` |

(The copies were read with the Supabase connector's read-only get_edge_function on the prod project; the ezbr hash is the bundle hash reported by the connector and cannot be recomputed from the file alone. The md5 is of the saved file.)

## How to run (one command)

```
scripts/checkout-testbed/run.sh            # env KIL_OUT=<dir> for logs (default scripts/checkout-testbed/out)
```

Requirements on the Nexus Mac: node 22, the local Postgres helpers in `~/work/pg-local` (socket only, port 54329; the script starts it and ALWAYS stops it). Load gate: refuses to start at 1-min load >= 8, aborts and stops Postgres at > 10. No Docker, Deno, Xcode, sudo, brew, or downloads.
Step d2 always decodes the rendered QRs with the vendored jsQR 1.4.0 (`scripts/checkout-testbed/vendor/jsqr/`, same bytes as PR 142, Apache-2.0, sha256 `bc40c8a1...fee0859` checked at load). It never skips: if the decoder is missing or altered, or the decoded text differs from the expected payload (`KIL-<token>` for /tickets, raw token for /profile), d2 FAILS.
Unit tests (no DB, incl. the d2 negative controls: missing/altered decoder, wrong token, corrupted QR): `node --test scripts/checkout-testbed/tests/guards.test.mjs scripts/checkout-testbed/tests/qr-decode.test.mjs`.

## What is real vs simulated

| Piece | Status |
|---|---|
| create-checkout v58 and stripe-webhook v52 logic (auth gate, price from DB, fee formula, metadata, signature check call, fulfil/refund RPC calls) | REAL deployed source, unmodified (Node instead of Deno) |
| Postgres engine, RLS, GRANT/REVOKE, plpgsql | REAL local PostgreSQL |
| fulfill_ticket_order, refund_ticket_order, get_my_tickets, get_ticket | REAL bodies, VERBATIM from prod captures (13A baseline) |
| event_orders columns/constraints/unique idempotency index/policies/ACL | REPLICA of the captured prod state (the 13A/12A replica); the 12A packs 01+02 and 13A pack 01 are applied by running the committed pack files, whose drift guards must accept the replica |
| qr_token default | ASSUMED: md5(random()||clock) (32 chars), the 13A replica's assumption; the prod default expression is captured only by PRECHECK-13A |
| ticket_tiers.currency/sales_start/sales_end, app_users.stripe_account_id/payouts_enabled, platform_config | ASSUMED column names/types (the deployed v58 selects them); platform_config holds the PLACEHOLDER fee |
| Supabase gateway verify_jwt, GoTrue getUser, PostgREST | SIMULATED by shims/edge-host (HS256 JWT with a runtime fake secret; role switching and claims done the PostgREST way) |
| `stripe` npm library | SHIM (own implementation of the 4 calls used + Stripe's documented v1 signature scheme); the real library is NOT run |
| Stripe API (sessions, PaymentIntent, refunds) | FAKE local server |
| Hosted checkout page, the 4242 card | SIMULATED local page, labelled "NOT Stripe's hosted checkout" |
| Webhook signing | Stripe v1 scheme (`t=...,v1=HMAC-SHA256`) with a fake `whsec_localtest...`, verified by the shim |
| Wallet QR | REAL shipped `assets/js/vendor/qrcode.js` + `kil-ticket-qr.js`, rendered locally (always decoded with the vendored jsQR) |
| Door scanner | REAL hardened SQL functions called as the authenticated organizer (no scanner UI/network layer) |
| Keys | fake, generated at runtime, in memory/env only, never written to a file |

## Scenario and expected results

40 checks; all PASS on the recorded run (peak load 3.05, min free memory 61%):

| Step | What is proven (evidence in the run log) |
|---|---|
| a1 | no Authorization header -> 401 `Invalid JWT` (gateway emulation; the function is not reached) |
| a2 | anon key as bearer -> 401 `needs_account: true` |
| a3 | $1.00 ticket, client claims price 1c: Stripe line item is 100c from the DB; `application_fee_amount` = 52c (round(100x250/10000)=3 + 49 flat) = formula over platform_config; metadata event_id/items/buyer_user_id; customer_email = account email |
| a4 | 2 x $25.00: fee 324c (per ticket round(2500x250/10000)=63 + 99 = 162c); amount_total 5000c |
| b1-b4 | simulated page labelled; non-4242 card declined; 4242 -> signed webhook -> exactly one `paid` row with 32-char qr_token, qty_sold incremented, buyer_handle resolved from account email, fee and destination recorded from the PaymentIntent |
| c1-c6 | same event twice: still one row, qty_sold unchanged; invalid / wrong-secret / missing / stale-timestamp signatures -> 400 and no row; control: valid signature on the same body IS accepted |
| d1-d2 | get_my_tickets returns the ticket (and nothing for another account); QR payload `KIL-<token>` (/tickets) and raw token (/profile) rendered locally and decoded |
| e1-e5 | hardened `event_checkin_scan`: raw token admitted once then `already_used`; `KIL-` token admitted; non-owner `forbidden`; anon cannot execute (42501); no buyer email in any response; null-owner hole closed in `check_in_ticket` (original replica admits it: negative control) |
| f1-f3 | fake refund -> signed `charge.refunded` -> `refund_ticket_order`: order `refunded`, qty_sold decremented, re-scan refused (`unpaid`), retry is idempotent, ticket leaves the wallet |
| g1-g3 | anon forged paid INSERT, organizer UPDATE of status/qr_token, anon TRUNCATE all refused (42501) on the hardened replica; the S0 replica allows all three (negative control) |
| h1-h8 | sold out, qty > remaining, sales not open, sales ended, organizer without payouts, empty cart, unknown tier, ticketing paused (503) -> the documented errors |
| i1-i3 | bearer bug (#153) reproduced: anon key as bearer cannot buy, the user's session token can; tampered webhook body -> 400; nothing left 127.0.0.1 and a direct fetch to stripe.com is blocked |
| j1-j2 | NO-LIVE-MODE guards (below) |

## NO-LIVE-MODE and LOCAL-ONLY guards

- The testbed refuses to start if any environment value is a live key (`sk_live_`, `pk_live_`, `rk_live_`), a `whsec_` secret that is not the local fake (`whsec_localtest...`), or a real-looking Stripe TEST key (`sk_test_`/`pk_test_` that is not `..._local_FAKE...`): real test keys belong in a staging project, never in this bed.
- It refuses if any `KIL_/SUPABASE_/STRIPE_/FAKE_` URL/host variable is not `127.0.0.1`.
- A fetch / http.request egress guard blocks every non-127.0.0.1 destination (no byte can reach stripe.com); the Stripe shim accepts only the fake key.
- Each guard has a negative control in `tests/guards.test.mjs` and in scenario steps j1/j2/i3.

## Fee placeholder

The ticket fee is a PLACEHOLDER until Joe decides on Wednesday. The testbed changes no price and hardcodes none: `create-checkout` reads `application_fee_bps` (250), `per_ticket_fee_under10_cents` (49) and `per_ticket_fee_over10_cents` (99) from `platform_config`, and the scenario asserts the fee against the formula evaluated over those rows. Change the three rows in `db-inputs/testbed-additions.sql` (or in a staging config) and the assertions follow. Live mode stays OFF.

## BLOCKED-ON-JOE: what only real Stripe TEST mode can prove

UNVERIFIED by this testbed (the fake cannot prove them):

1. Stripe's real hosted checkout page accepting 4242 4242 4242 4242 with the real session this function creates (the real library's request shape, API version 2024-06-20 acceptance).
2. Real webhook delivery: the real endpoint secret, real signature header, delivery retries and event ordering, the real `stripe` library's verification.
3. Real PaymentIntent behaviour: `application_fee_amount` and `transfer_data.destination` on a Connect destination charge, the fee actually collected, the transfer to the organizer's connected account, minimum-fee/currency rules.
4. Apple Pay / wallets / 3-D Secure.
5. Refunds reversing the transfer and the application fee (the function does not request `reverse_transfer`/`refund_application_fee`; what Stripe does with a plain dashboard refund must be observed).
6. The Deno runtime and the real supabase-js client (this bed runs the same source on Node with shims).

**BLOCKED-on-Joe. Needed (nothing is pasted in chat or committed):**
- Stripe TEST-mode keys: publishable (`pk_test_`), secret (`sk_test_`) and a TEST webhook endpoint signing secret (`whsec_`), installed by Joe as secrets in a STAGING Supabase project (or a local env file Joe creates), never in the repo.
- A Connect TEST account for the organizer (`acct_...`, payouts enabled) mapped to a staging organizer row.
- A staging project/path with the replica schema, the 12A/13A packs and the two functions deployed; prod config unchanged, live mode OFF.
The steps for the real run are in `docs/money-build/14a-checkout/TEST-PLAN.md` and the REAL.md checklist.

## NOT verified here

The VS entry-fee and wifi-remote branches (not ticket paths; `vs_*` functions are not replicated, so the webhook's `vs_refund_entry_payment` call logs an error that is expected and harmless here); prod table/column details marked ASSUMED above; the QR scan by a real camera; Postgres version differences between the local build and Supabase; concurrency/race behaviour of the door beyond sequential scans.

## Provenance of the vendored DB inputs

`db-inputs/` copies, unchanged, the 13A replica, the VERBATIM baselines, the original door-function bodies, the 12A pack 01/02 and 13A pack 01 APPLY files from the PR #154 extraction (`origin/draft/20a-db-proposed-extraction` @ ffa7f357d19c7909eaf579d0432f8e44cb7cb90e); `db-inputs.SHA256` lists their hashes. `lib/pgdb.mjs` is the 11B real-Postgres adapter from the same tree. `testbed-additions.sql` is new.
