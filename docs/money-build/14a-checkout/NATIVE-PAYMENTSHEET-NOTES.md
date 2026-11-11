# 14A native slice: Apple Pay / PaymentSheet for KEEPITIL-run in-person tickets (NOTES, DRAFT)

Status: notes and a handoff patch spec only. **keepitil-app is not changed by this job; no server code is written to prod; no Edge Function is deployed.** The app was read read-only on `origin/app/payments-off` (PR #42, base `app/bundle-refresh`, state OPEN, head `11367dc`).

Target (Thanksgiving build, submit Nov 21): the iOS app allows **in-person ticket checkout for KEEPITIL-run events only** through Stripe with the Apple Pay native PaymentSheet; everything else stays stripped (no shop, services, contest entries, payouts, affiliate / resale links, no Stripe-hosted pages).

## 1. What #42 does today (exact names)

`paymentsInApp` is a **bundle-only boolean**, false by default; there is no per-event or per-product scope. Four layers all key off it:

| layer | file | name / location | effect today |
|---|---|---|---|
| runtime flag | `app-src/kil-native.js:139` (copied to `www/kil-native.js`) | `FLAGS.paymentsInApp: false` | read by the three runtime guards below |
| outbound URL guard | `app-src/kil-native.js:53-55` | `payBlocked(url)`; `openOutside()` returns early | refuses `stripe.com`, `myshopify.com`, `illestratedlifestyle.com`, and `keepitil.com/(shop\|services\|early-access)` |
| CSS hide | `app-src/kil-native.js:608-612` | selector list `.kil-native .tixrow:not(.free)`, `.price-only`, `#modeSell`, `#modeRSVP`, `a[href^="/shop"]`, `a[href^="/services"]`, `#tpl-support` ... | paid tier rows and sell/RSVP switch hidden |
| Buy-button observer | `app-src/kil-native.js:614-619` | MutationObserver on `#tf-buy` | button hidden unless a free tier exists |
| bundle patches | `scripts/build-bundle.mjs:113` `NO_PAYMENT_PATCHES` (applied by `applyNoPaymentPatches`, line ~371) | `event.html` "event buy: no checkout call" replaces the whole `create-checkout` fetch with a "Not available in the app" label; `create-event.html` payout onboarding + panel removed; `vs-app.js` paid entry refused and a payment URL refused; legal copy patched in `privacy.html`, `terms.html`, `ticket-terms.html` (incl. the 5% + $0.99 fee sentence), `refund.html` | every anchor must match exactly once or the build fails |
| commerce anchors | `scripts/build-bundle.mjs:254-258` `COMMERCE_HOSTS`, `COMMERCE_PATHS`, `COMMERCE_ANCHOR`, `COMMERCE_STRIP` (+ `applyCommerceStrip`, `applyArticleStrips`) | amazon, posh, ra.co, ticketmaster, seatgeek, eventbrite, dice, ... anchors stripped, text kept | "no commerce anchors" |
| flag-flip for tests | `scripts/build-bundle.mjs:15-19, 375` `--payments-in-app` | builds the web behaviour so the tests can prove the scan fails on it | never shipped |
| tests | `tests/payments-off.test.mjs` (bundle has no `stripe.com`, no `connect-onboard`, no reachable `create-checkout` except the guarded free-entry call; Capacitor config allow-lists no payment host; negative control; patch anchors; paid rows hidden; legal copy), `tests/commerce-links.test.mjs` ("allowed list of commerce anchors across all of www/ is EMPTY", `COMMERCE_HOSTS` coverage), `tests/v1-basics.test.mjs:318` ("no Stripe hook"), `scripts/smoke.sh:12,42` (fetches bundled `/event.html`, `/create-event.html`, `/vs-app.js` and asserts no stripe/connect string) | all assert "nothing sells" |
| review docs | `docs/release/REVIEW_ACCOUNT.md:17,41` (reviewer note: "no purchasing of any kind"), `docs/APP-V1-CONFIRM-ITEMS.md:37`, `docs/SUBMIT-READINESS.md:13`, `docs/SUBMIT_CHECKLIST.md:12` | the App Review text currently promises there is nothing to buy |

Also: the bundle's own `www/event.html` is an **older copy** with the same anon-key-bearer bug as web `event.html:733` (`origin/main:www/event.html:464`); #42 patches the call out, so the bug is unreachable in the app today, but a PaymentSheet slice must not re-enable that copy.

## 2. Proposed re-scope: "tickets for KEEPITIL-run in-person events only"

Replace the single boolean with a **named, narrow capability** and keep every other commerce path stripped:

* `FLAGS.paymentsInApp` stays `false` (everything above keeps working unchanged: shop, services, payouts, contest entries, affiliate links, Stripe-hosted pages stay blocked, `payBlocked()` stays, `COMMERCE_*` stays, and the "allowed list of commerce anchors is EMPTY" test stays).
* Add `FLAGS.inPersonTicketsInApp: true` (name proposed). It enables exactly one thing: **the native ticket purchase for an event that the server marks as KEEPITIL-run and in-person**. The page never opens a Stripe URL; it calls a native bridge (`KilNative.payTickets({...})`) that presents the PaymentSheet.
* Eligibility is decided **by the server**, not by the page: a new field returned by the event/tier view or by the PaymentIntent function (`keepitil_run = true` AND `in_person = true`, from a column or `platform_config` allow-list of event ids / owner handles chosen by Joe, D7). The page shows the paid tier rows only when the server says so; for any other event the existing hide rules (`.tixrow:not(.free)`, `#tf-buy` observer) apply unchanged. This keeps third-party/organizer events and digital/online events out, which is the App Review constraint.
* Edits, by name:
  1. `app-src/kil-native.js`: new flag; CSS rule for `.tixrow:not(.free)` becomes conditional (`.kil-native:not(.kil-tix-ok) .tixrow:not(.free)`) with `kil-tix-ok` added by the page only after the server confirms eligibility; the `#tf-buy` observer shows the button when an eligible paid tier is selected; `payBlocked()` unchanged (the PaymentSheet is native and opens no web page).
  2. `scripts/build-bundle.mjs`: split the `event.html` "event buy: no checkout call" patch into two: (a) keep removing the web `create-checkout` redirect-to-Stripe fetch, (b) replace it with a call to `KilNative.payTickets` guarded by `FLAGS.inPersonTicketsInApp`. All other `NO_PAYMENT_PATCHES` entries stay. The anchor-must-match-once rule stays.
  3. Legal copy patches (`ticket-terms.html`, `terms.html`, `refund.html`, `privacy.html`) must stop saying "tickets cannot be purchased in the app" and instead describe Apple Pay / Stripe, refunds via the original payment method, and the fee actually decided (D4).
  4. Tests: `payments-off.test.mjs` keeps its assertions for everything except "no reachable create-checkout"; add: bundled `event.html` contains no `functions/v1/create-checkout` and no `stripe.com`, contains exactly one call to the native bridge; the bridge file is the only place that talks to the payment plugin; negative control that a bundle built with the old flag-only logic fails the new test; `smoke.sh` check updated; keep the commerce-anchor test as is.
  5. Docs: `REVIEW_ACCOUNT.md` lines 17 and 41 change from "no purchasing of any kind" to "the only purchase is tickets to KEEPITIL-run in-person events, paid with Apple Pay or card through Stripe PaymentSheet, consumed outside the app" and the reviewer needs a way to see it (a test-mode demo event + sandbox payment instructions, or screenshots/video). Guideline 3.1.3(e) (goods and services consumed outside the app may use payment methods other than IAP, such as Apple Pay) is the intended basis; Joe confirms (D6).
* Native side (new, not in #42): Stripe iOS SDK via Capacitor plugin (`@capacitor-community/stripe` or a small custom plugin, D5), the Apple Pay capability and merchant ID entitlement (`com.apple.developer.in-app-payments`) in the Xcode project, Stripe publishable key (test then live) as a build setting, never in the repo history as a secret (a publishable key is public by design, but keep it out of the committed `www/`).

## 3. Server change needed (handoff patch spec, not applied anywhere)

Today `create-checkout` v58 only creates a **Checkout Session** (hosted page) and returns `{url}`. PaymentSheet needs a **PaymentIntent** (client secret) plus a Customer + **ephemeral key** (optional but recommended for saved cards; not required for Apple Pay only). Proposed shape, as a variant of the same function so the verified-JWT, tier lookup, fee config, sales-window, capacity and kill-switch logic is shared:

* Request: same body plus `mode: "payment_sheet"`.
* Same checks as today: caller() requires a real signed-in user; tiers and prices read server-side; `ticketing_enabled`; sales window; capacity; organizer payouts enabled; fee from `platform_config` keys.
* Eligibility gate (new): reject unless the event is KEEPITIL-run AND in-person (server-side), so the native flow cannot be used for anything else even if a client is modified.
* Creates a PaymentIntent (`amount` = subtotal, `application_fee_amount` and `transfer_data.destination` as for the Session, `automatic_payment_methods` on, `metadata` = the same `{event_id, items:[{t,q,u}], buyer_user_id}` the webhook already expects) and returns `{client_secret, customer, ephemeral_key, publishable_key, amount, currency}`.
* **Webhook:** `stripe-webhook` currently fulfils on `checkout.session.completed` (it needs a Session id: `fulfill_ticket_order(p_session_id, ...)`). A PaymentIntent has no Session. Two options for Joe/KODE: (A) fulfil on `payment_intent.succeeded` when `metadata.event_id` is set, passing the PaymentIntent id as the idempotency key (`p_session_id := pi_...`; the unique index `(stripe_session_id, tier_id)` then dedupes on it, and `refund_ticket_order` already matches by `stripe_payment_intent`, so refunds work unchanged); no DB schema change needed. (B) create a Checkout Session in `ui_mode=custom` (embedded) and keep `checkout.session.completed`; not available to the native PaymentSheet. Option A is proposed. Webhook must not double-fulfil if a future flow emits both events: key on the same id.
* The proposed diff is in `handoff/create-checkout-paymentsheet.PROPOSED.diff` (illustrative, against an assumed v58 structure because the source is not vendored; the real patch is made by whoever owns the function after reading the deployed source).

## 4. Order of work for the Nov 21 submit (slices)

13A done (13A DB hardening, drafted in #138 [CLOSED, superseded by #154, where the inert proposal now lives] + this PR's bearer fix) -> 14A verified webhook issuance, refunds, wallet, door UI (test plan part ii) -> native bundle re-scope (section 2) -> PaymentIntent variant + webhook option A (section 3, needs deploy approval) -> account entry / delete / revoke -> TestFlight evidence -> submit manifest. Every deploy and every SQL apply is a separate Joe-gated step.

## 5. Risks

* App Review: selling anything in an app that previously said "nothing to buy" is the highest review risk; the eligibility gate and the reviewer note carry it.
* The PaymentSheet cannot be exercised headless; it needs a device + TestFlight + Stripe test mode.
* A webhook change touches a live function that also handles vs_entry and wifi remove_ads: deploy only after a staging replay.
