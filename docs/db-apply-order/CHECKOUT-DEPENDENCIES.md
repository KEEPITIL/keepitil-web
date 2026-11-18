# Checkout dependencies of the DB hardening plan (DRAFT, PROPOSAL ONLY)

**MERGING THIS DOES NOT FIX PROD.** This PR (#154) is inert (`db/` and `docs/` are not served).

## Decision (Sentinel blocker 4: "checkout sends the wrong bearer")

The wrong-bearer bug is in `event.html` (the page sent the ANON key as the bearer to `create-checkout`, which answers `401 needs_account`). It is fixed in a SEPARATE PR, **#153** (branch `draft/20a-checkout-bearer-fix`, head `081aec45170275cb77dbb989693826f42d17f284`). The live-site change stays there: #154 is an inert `db/proposed` + docs PR and does not touch any served file (`event.html` is not in this diff).

**Rule: #153 MUST be merged and deployed BEFORE any ticket purchase test or any checkout-dependent smoke step of the DB plan** (runbook step A4). Without it a signed-in buyer cannot complete a purchase, so a "the test purchase created an order" check would fail for a reason unrelated to the packs.

Not included here by default, so nothing is silently mixed. If Sentinel decides blocker 4 can only be closed by carrying the `event.html` fix inside #154, say so and it will be added as one clearly separated commit touching only `event.html` and its test, copied exactly from #153.

## Evidence

* Local checkout testbed, PR #157 (branch `draft/21a-checkout-testbed`): step `i1` reproduces the bug (anon-key bearer -> 401 `needs_account`; the user's session token with the same body -> 200) against the DEPLOYED `create-checkout` v58 source, unmodified.
* Webhook "payment settled" gap (the other half of blocker 4): `docs/db-apply-order/handoff/stripe-webhook-payment-settled.PROPOSED.diff` and the testbed scenarios in #157.

## Order for the real test (unchanged otherwise)

1. #153 deployed (web).
2. DB plan A0-A3 with the gates of the runbook.
3. Stripe TEST-mode purchase + door test.
