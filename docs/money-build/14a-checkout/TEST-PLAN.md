# 14A ticket money path: TEST PLAN (DRAFT)

Status: draft. Nothing in this document has been executed against Stripe or prod. **GATES: NO live checkout, NO Stripe access of any kind, NO prod SQL, NO Edge Function deploy without Joe's relayed yes.** Part (i) is already done offline; parts (ii) and (iii) are what Joe is asked to approve.

Money path under test (facts: `db/proposed/13a-orders-hardening/PATH-REPORT.md`, `baseline/PROD-FACTS-13A.md`):

```
event.html Buy --(Bearer <user access token>)--> create-checkout v58 (verify_jwt=true) --> Stripe Checkout Session
Stripe --checkout.session.completed--> stripe-webhook v52 (verify_jwt=false, signature check) --service_role--> fulfill_ticket_order --> event_orders (+qty_sold)
Stripe --charge.refunded / charge.refund.updated--> stripe-webhook --> refund_ticket_order --> status=refunded (qty_sold restored)
buyer: tickets.html / get_my_tickets (QR)      door: 12A event_checkin_scan / check_in_ticket
```

## (i) Proven offline / on the replica (done)

| what | where | result |
|---|---|---|
| event_orders is not forgeable or editable by clients; service path intact; refund by session and by payment intent restores qty_sold, using the **verbatim prod `refund_ticket_order` body** | PR #138, real PostgreSQL 17.6 (socket-only) | matrix 37/37 (17 negative controls fail on the original), packs 31/31, adjacent 3/3 |
| door SQL hardening (admit once, refuse refunded / unknown / non-owner) | PR #137 | see its MATRIX-RESULTS.md |
| ACL / lock order of the earlier packs | PR #136 | see its README |
| **the page sends the signed-in user's access token, not the anon key, to create-checkout; no session -> no call and a sign-in redirect with a return path; 401 needs_account -> account prompt; free RSVP unchanged; static guard against any anon-key bearer on create-checkout** | this PR, `assets/js/event-checkout-bearer.test.mjs` (jsdom, no network) | 9/9; on the ORIGINAL event.html the bearer test and the static guard fail (negative control, run for real) |

Not proven offline (the reason for part ii): the real Edge Functions (source is not vendored), the real Stripe wiring, real JWT verification at the Supabase gateway, real PostgREST/RLS roles, Apple Pay.

## (ii) Needs Stripe TEST MODE and Joe's OK

### Preconditions (all of them, before anything runs)

1. Joe's relayed yes to the approval request below, naming the date and who runs it.
2. **Stripe test mode only.** The Stripe account is the one already behind create-checkout; the test-mode secret key and the test-mode webhook signing secret exist ONLY as Edge Function secrets (names to be confirmed from the function, never pasted in chat, files or a PR). If the deployed functions currently hold live keys, a test run needs a separate staging function / project or a deliberate, reversible secret swap that Joe approves; **do not point the live webhook at test events**. Decision for Joe (D1).
3. A **throwaway buyer account** that Joe creates himself (email + password he types; Claude never types or sees the password). A second throwaway as the organizer is NOT needed: use an existing KEEPITIL-run test event owned by an account Joe designates (D2), with a Connect account in test mode.
4. A test event with: one $0 tier, one $5 tier, one $25 tier (capacity small, e.g. 3), one tier with `sales_end` in the past, one sold-out tier. Created in the product UI (no SQL) or by SQL Joe approves.
5. A backup / snapshot of `event_orders`, `ticket_tiers`, `platform_config` taken by the owner before the first run (the table holds real paid orders today: 5 rows at the 12A capture).
6. Cleanup SQL, written in advance, scoped to the throwaway buyer and the test event ids only, reviewed and approved by Joe before it runs (template at the end). No `DELETE` without a `WHERE` that names the test event id AND the throwaway buyer email.
7. Ticket sales kill switch known: `platform_config.ticketing_enabled='0'` pauses paid sales; the plan includes proving it (step 12).

### Steps, expected results, evidence

Evidence for every step: a screenshot (real browser, not a mock), the HTTP status + redacted headers of each request (token values redacted to their first 6 characters), the Stripe test-mode dashboard event id, and one read-only SQL SELECT result limited to the test rows. Save under `docs/money-build/14a-checkout/evidence/<step>/` (no card numbers other than the published test card, no secrets). Report each step as PASS / FAIL / NOT RUN.

| # | step | expected | evidence |
|---|---|---|---|
| 1 | Signed-out buyer presses Buy on a paid tier | no call to create-checkout; browser goes to `/apply?next=<event url>`; after sign-in the buyer returns to the same event | screenshot of redirect + network log showing zero `create-checkout` requests |
| 2 | Signed-in throwaway buyer, $5 x1, test card `4242 4242 4242 4242`, any future expiry, any CVC | request has `Authorization: Bearer <user JWT>` (not the anon key); 200 + Stripe URL; Checkout opens in test mode; payment succeeds; return `?paid=1` shows the "You're in" banner | network log (JWT redacted), screenshot of Checkout and of the banner |
| 3 | Webhook delivery for step 2 | Stripe shows `checkout.session.completed` delivered 200; `stripe-webhook` log shows signature OK | Stripe dashboard event + function log line |
| 4 | Order row | exactly one `event_orders` row `status='paid'`, `amount_cents` = 500, `application_fee_cents` per the fee table, `organizer_acct` set, 32-char `qr_token`; `ticket_tiers.qty_sold` +1 | read-only SELECT (test event only) |
| 5 | **Idempotency**: resend the same event from the Stripe dashboard (test mode "Resend") twice | still one row; `qty_sold` unchanged (fulfill returns `skipped_duplicate`) | SELECT before/after + webhook responses |
| 6 | Bad signature: replay the webhook payload with a wrong `Stripe-Signature` (test-mode secret NOT used) | 400, no row change | request/response, SELECT |
| 7 | Buyer's tickets | `/tickets` shows the order with a QR; `get_my_tickets` returns it for the buyer only | screenshot (signed in as buyer); signed-out request returns nothing |
| 8 | Door scan after purchase (12A must be applied first; separate Joe gate) | owner admits the QR once; second scan refused; refunded ticket refused | scanner result screens + SELECT of `checked_in_at` |
| 9 | **Refund**: refund the test charge in the Stripe test dashboard | `charge.refunded` delivered 200; order `status='refunded'`; `qty_sold` back to prior value; a second `charge.refund.updated` changes nothing; door now refuses the token | SELECT, door result |
| 10 | Multi-item cart ($5 x2 + $25 x1) | one session, two order rows (one per tier), `qty_sold` +2 / +1, fee per table | SELECT, Stripe session line items |
| 11 | Sales window / sold out | past-`sales_end` and sold-out tiers show no stepper; a crafted request for them is refused by the function (not only hidden by the page) | screenshot + the function's error body |
| 12 | Kill switch | with `ticketing_enabled='0'` the page disables paid steppers and the function refuses a direct call | screenshot + error body; restore value afterwards |
| 13 | Organizer without payouts (no Connect account / not payouts-enabled) | the buyer gets a clear error, no Stripe session is created, no order | error body, Stripe dashboard shows no session |
| 14 | Expired / invalid user token (use a deliberately edited token on a copy of the request, in a scratch browser profile) | 401; page shows the account prompt and routes to sign-in | network log, screenshot |
| 15 | Free RSVP | no checkout call; `event_registrations` row only; no `event_orders` row | SELECT |
| 16 | Stripe Checkout cancel path (`cancel_url`) | returns to the event, no order, nothing charged | screenshot, SELECT |

Out of scope for this plan but listed so nobody assumes it was tested: promo checkout (`create-promo-checkout` has no caller in either repo), VS contest entry via `create-checkout` `kind=vs_entry`, wifi/kmob webhooks, Eventbrite ticketing functions.

### Application fee table (config values, never hardcoded)

Keys in `platform_config` as in create-checkout: `application_fee_bps` (default 250), `per_ticket_fee_under10_cents` (49), `per_ticket_fee_over10_cents` (99). The create-checkout source is not vendored, so the formula below is an **assumption to confirm in step 4 by comparing with the observed `application_fee_amount`**: `fee = round_half_up(subtotal_cents * bps / 10000) + sum(qty * per_ticket(unit))`, where `per_ticket` is the "under10" value for a unit price below $10.00 and the "over10" value otherwise (boundary at exactly $10.00 to confirm; rounding mode to confirm).

| cart | subtotal | percent part (250 bps) | per-ticket part | expected application fee | organizer before Stripe processing |
|---|---|---|---|---|---|
| $5 x1 | 500 | 13 (12.5) | 49 | 62 | 438 |
| $5 x2 | 1000 | 25 | 98 | 123 | 877 |
| $9.99 x1 | 999 | 25 (24.975) | 49 | 74 | 925 |
| $10.00 x1 (boundary) | 1000 | 25 | 99 (or 49 if the bucket is `<=`) | 124 | 876 |
| $25 x1 | 2500 | 63 (62.5) | 99 | 162 | 2338 |
| $25 x4 | 10000 | 250 | 396 | 646 | 9354 |
| $100 x2 | 20000 | 500 | 198 | 698 | 19302 |
| $5 + $25 (mixed) | 3000 | 75 | 148 | 223 | 2777 |
| free tier | 0 | 0 | 0 | 0 (no Stripe) | n/a |

**Mismatch to resolve (decision D4):** `ticket-terms.html` tells buyers the platform fee is "5% + $0.99 per ticket", while the config defaults above amount to 2.5% + $0.49 / $0.99. The fee amounts are Joe's decision; they stay config values read at purchase time, and the legal copy must be changed to match whatever Joe chooses (that copy is also patched in the app bundle by keepitil-app #42). The test run records the observed fee so the two can be compared.

### Apple Pay

* **Web (Stripe Checkout hosted page):** Apple Pay shows automatically in Checkout on supported Safari / iOS devices once the Stripe account has the domain registered; for a hosted Checkout page Stripe's own domain is used, so no extra work on keepitil.com is required. To confirm in test mode: open Checkout on an iPhone Safari with a wallet and a test card added.
* **Native PaymentSheet (the Thanksgiving build):** see `NATIVE-PAYMENTSHEET-NOTES.md`. Requires an Apple Merchant ID, the Apple Pay capability + entitlement in the app, Stripe's Apple Pay certificate (CSR from the Stripe dashboard, uploaded to the Apple developer account), the Stripe SDK / Capacitor plugin, and a server flow that returns a PaymentIntent client secret + ephemeral key. None of this exists today.
* Test-mode evidence: PaymentSheet presented in a TestFlight build, payment with a test card in the sheet, `payment_intent.succeeded` / `checkout`-equivalent webhook fulfilment, refund path as in step 9.

### Decisions Joe must make

* D1: how test mode is run (separate staging function/project vs a reversible secret swap) and who holds the test keys.
* D2: which account owns the test event, and which Connect account (test mode) receives funds.
* D3: yes/no to the live-checkout approval below (test mode, throwaway buyer).
* D4 (B4): the fee decision: keep 250 bps + 49/99 cents, or the 5% + $0.99 in the terms, or other. Values stay in `platform_config`.
* D5: native: Stripe SDK choice (official Stripe Capacitor plugin vs a custom plugin), Apple Merchant ID name, who creates the Apple/Stripe certificate.
* D6: the app scope sentence for App Review ("tickets for KEEPITIL-run in-person events only", Guideline 3.1.3(e): services consumed outside the app may use non-IAP payment such as Apple Pay); confirm wording and that it is accurate for the build.
* D7: whether the same PaymentIntent flow also covers organizer events or only KEEPITIL-run ones in v1 (affects `application_fee_amount` and Connect `transfer_data`).

### Live-checkout approval request (wording for Joe)

> Joe: may I run a **Stripe TEST-MODE** ticket purchase end to end? Scope: one throwaway buyer account you create, one KEEPITIL test event (owned by the account you name), test card 4242 4242 4242 4242, steps 1-16 of `docs/money-build/14a-checkout/TEST-PLAN.md`. No real card is charged and no live key is used. Test keys live only as Edge Function secrets. It writes test rows to `event_orders` / `ticket_tiers` / `event_registrations` on prod unless you choose a staging project (D1); I will remove them afterwards with a cleanup SQL scoped to the test event and the throwaway email, which you approve before it runs. Reply "yes, run test-mode checkout on <date>" and answer D1-D2. Until then nothing runs.

### Cleanup SQL template (NOT to be run without Joe's approval; fill in ids)

```sql
-- SCOPED to the throwaway buyer and the test event only; run as postgres in one transaction; review the SELECT first.
BEGIN;
SELECT id, status, buyer_email, stripe_session_id FROM public.event_orders WHERE event_id = :test_event_id AND buyer_email = :throwaway_email;
DELETE FROM public.event_orders        WHERE event_id = :test_event_id AND buyer_email = :throwaway_email;
DELETE FROM public.event_registrations WHERE event_id = :test_event_id AND buyer_email = :throwaway_email;
-- restore qty_sold from the pre-run snapshot, per test tier id (named, not a pattern)
UPDATE public.ticket_tiers SET qty_sold = :snapshot_qty_sold WHERE id = :test_tier_id;
-- COMMIT only if the row counts match the SELECT above
```

## (iii) Evidence checklist per step

Screenshot of the page state; request line, status and redacted headers; Stripe test-mode event id (and delivery attempt status); the read-only SELECT over test rows only (columns: id, status, qty, amount_cents, application_fee_cents, stripe_session_id, checked_in_at; never emails other than the throwaway); the function log line; a one-line PASS / FAIL. Store under `docs/money-build/14a-checkout/evidence/`; commit only redacted material.
