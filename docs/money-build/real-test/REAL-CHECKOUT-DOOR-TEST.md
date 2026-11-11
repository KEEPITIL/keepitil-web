# DRAFT: test-mode checkout + QR door-scan test steps (Thursday go/no-go)

Status: **DRAFT, docs only, 2026-11-10 (rev 2).** Nothing here has been run. No Stripe, no prod connection and no secret was used to write it.

**Rev 2 replaces the earlier LIVE $1 plan.** Grok's directive (2026-11-10, 8:03 / 8:05 PM PT, relayed by KODE) changed it:

> Thu: real TEST-MODE checkout and a QR scan on a phone. Also 18+, sign-in with account deletion, and the legal pages. Fri AM: TestFlight build; submit only if it passes. If Thursday's checkout fails, the submit slips to Mon Nov 16. Ticket fee: Joe decides Wednesday; until then it is a placeholder. LIVE MODE IS OFF.

> Test-mode checkout end to end on an isolated test backend with test keys: 4242 card, order, webhook, wallet QR (self-hosted, no qrserver). No live-mode switch, no real charges.

So: **Stripe TEST mode (card 4242) on a STAGING / isolated backend with test keys that Joe installs. No live key, no live charge, no production write.** The old live $1 purchase is NOT planned (Appendix A, needs a separate Joe approval, not part of Thursday).

Scope of this document: the checkout + QR door-scan test only. The other Thursday items (18+, sign-in with account deletion, legal pages) are separate jobs.

---

## 0. Facts that hold regardless (fee, owner purchase, sitemap)

**Ticket fee is a PLACEHOLDER until Joe decides on Wednesday. No price is changed by this test.** Facts settled by code (KODE read-only look at create-checkout v58, relayed 2026-11-10):

- `create-checkout` reads ONLY `application_fee_bps`, `per_ticket_fee_under10_cents`, `per_ticket_fee_over10_cents` (live values 250 / 49 / 99). `platform_fee_pct = 1` and `per_ticket_fee_cents = 99` are NOT read by checkout.
- A $1.00 ticket = 3c (2.5%, rounded) + 49c = **52c expected `application_fee_amount`**. UNVERIFIED until the test shows the real figure; compare and record it. On the staging backend the values are whatever the replica was seeded with: read them first (P3) and recompute the expectation.
- The `platform_fee_pct = 1` vs 250 bps mismatch is a config-cleanliness question for Joe's Wednesday fee decision. This test changes nothing.
- **Owner self-purchase is ALLOWED** (no buyer-vs-owner check in create-checkout). A second buyer account is still the cleaner door-scan separation.
- **Stripe refund behavior is NOT verified.** For a Connect destination charge, whether a refund reverses the transfer and refunds the application fee depends on `reverse_transfer` / `refund_application_fee` (API) or the matching dashboard options. Check current Stripe docs (KODE) and record what the TEST dashboard actually offers (step R1). UNVERIFIED.

### Sitemap rule (answered from code, 2026-11-10)

| Question | Finding |
|---|---|
| Where is the generator? | **Private repo `KEEPITIL/keepitil.github.io`**, file `.github/internal/scripts/build-sitemaps.mjs` (last changed in commit `0675e714ae061089a85616d8ee493f2b6571928a`). It is NOT in public `keepitil-web` (only the generated `sitemap-events.xml` and a comment in `event.html` mention it); the older copy in `KEEPITIL/cowork-archive` (`claude-cowork/scripts/build-sitemaps.mjs`) is archive. |
| What filter does it apply? | `isListable()`: `status === "published"` AND has a slug AND `(ends_at \|\| starts_at) >= now`. The fetch is `events?status=eq.published&select=slug,status,starts_at,ends_at,created_at,imported_at` with the anon key. |
| Is `show_on_explore` considered? | **NO.** The column is neither selected nor filtered. **A published, not-yet-finished event with Show on Explore OFF IS listed in the sitemap** (as soon as the generator next runs against the DB it is read from). |
| How often does it regenerate? | Workflow `daily-sitemaps.yml` in the private repo: cron `15 9 * * *` (09:15 UTC) plus manual dispatch; it commits `sitemap-events.xml` to the PRIVATE repo only if changed ("Auto: regenerate events sitemap [skip ci]"). Recent runs succeeded (checked 2026-11-10; latest private-repo commit of the file 2026-11-07, 21 events). |
| What publishes it to keepitil.com? | The public site is `KEEPITIL/keepitil-web` (GitHub Pages). Its `sitemap-events.xml` changes only when a "Sync production build from private source" commit lands: `.github/internal/scripts/build-public.mjs` runs the generator with `--out` into the artifact (build refuses an empty or unexplained-loss sitemap). The public file was last committed 2026-09-17 (255 URLs, newest lastmod 2026-09-08), which is why the live file lists 255 events (including archived slugs like `156-silence`) while the private copy lists 21. The daily job does NOT update the public repo. UNVERIFIED: whether any scheduled job performs the public sync; evidence says it is a manual KODE sync. |

**Consequence for the test event:** a published TEST event would be added to the sitemap at the next generator run and would reach keepitil.com only at the next public sync (so exposure is bounded, but not zero: and `/event?e=<slug>` already serves 200 for non-published events, so link-only is not access control). **Recommendation (unchanged): assume NOT excluded.** Run the test on the staging backend (not prod, so the prod sitemap is not involved at all); if any prod event is ever used, unpublish/delete it right after the test and confirm its slug is absent from `sitemap-events.xml` after the next generator run AND the next public sync. Not recommended as a fix here: adding a `show_on_explore` filter (separate decision for Joe/KODE; mention it in the Wednesday agenda).

Live read-only facts (2026-11-10): the only two `show_on_explore=false` events are non-published (`cancelled-smerz-20260906`, `checkout-qa-1dollar-hidden`: an earlier archived $1 checkout QA event, 1 tier, 0 orders), so the live data cannot confirm the exclusion either way; the code above does.

---

## 1. What we know vs what is simulated

| Area | Known (cite) | Only simulated / not yet proven |
|---|---|---|
| Local testbed | keepitil-web **#157**, head `4e6f99ec5f51467cc2c3fa5f8fa22d1745cc9984` (db-inputs refreshed to #154 b09180903b17b792f121e4772f2b709e798c713d): simulated Stripe against the deployed create-checkout v58 / stripe-webhook v52 logic on a 12A+13A-hardened replica; 40/40 checks pass. Proves the app-side flow (session creation, order row, webhook fulfilment, qty_sold, refund flip, scan results) behaves as designed. | **Real Stripe is not involved**: no real Checkout page, no real webhook signature delivery, no real Connect account, no Apple Pay. Replica schema, not the real staging project. |
| Bearer fix | #153, head `081aec45170275cb77dbb989693826f42d17f284`: `event.html` sends the session token to create-checkout. **Required for any signed-in purchase**; without it create-checkout (verify_jwt=true) answers 401 / `needs_account`. | Deployed state on the staging web path: UNVERIFIED (P4). |
| DB hardening | #154, head `ffa7f357d19c7909eaf579d0432f8e44cb7cb90e`: db/proposed R1 + 12A (door) + 13A (orders) extraction, apply-order doc and `RUNBOOK-APPLY-BACKUP-ROLLBACK.md`; db-proofs CI green. **NOT applied to prod:** live prod still has the original `check_in_ticket` / `event_checkin_scan`, `orders_anon_insert WITH CHECK true`, organizer UPDATE on all columns, anon TRUNCATE. | Whether the staging project has 12A/13A applied is up to what Joe/KODE load into it (P2). |
| Self-hosted QR | #158 (`0eaf73809ae6d68e7f5a3c9ca4facce588b90821`): web pins the self-hosted wallet QR. Web main already self-hosts; app main still used `api.qrserver.com`, fixed in keepitil-app **#52** (`6ab1c53cceb39f78c4f28b1278bcc73a1bdbbeb2`). The Nov 13 candidate comes from the app draft stack, which is already clean. | Rendering on a real phone: part of this test (step B6). |
| Door scanner UI | web #141 (`70b7ceaf784d108b152dd7c9623a63dc935bf89a`) and #142 (`e45fa4e3c0a355dd34ca7c7982ca19bf4d197f14`, iPhone camera via vendored jsQR): drafts stacked on #139, NOT on main. App **#46** (`349ecd8c3e53e907f5717235bc154e27ffa00b26`): door page unlinked in the shipping bundle. **KODE decision 2026-11-10: the door entry point is added only after 12A is live.** App **#49** (`87fa7a7f548161251cb48edf36a9b95b835d3ac2`) has the `--door-test-variant` non-shipping build. | Camera scanning on a real device: never run. |
| Atlas door checklist | #159, head `13e03aea2024e0a329f29254c6e6100a2ec571e9` (I08). | Not yet reviewed against this test. |
| Stripe refund semantics | none | UNVERIFIED (section 0). |
| Fee value on staging | none | read in P3. |

---

## 1a. Local replica run, 2026-11-10 night (mocked Stripe, local Postgres 17.6, nothing remote)

- Packs applied: #154 `b09180903b17b792f121e4772f2b709e798c713d` (12A 01, 12A 02, 13A 01) on the prod-shaped replica; every pack applied with its own drift checks passing.
- Original flow scenario (deployed create-checkout v58 + stripe-webhook v52, **unpatched**): **40/40 PASS** (checkout, signed webhook, order, wallet QR, door admit once / KIL- prefix / forbidden / no contact, refund flip + idempotent retry, hardening negatives, egress guards). Peak load 3.64.
- Webhook payment-settled patch scenario: **10/10 PASS** (unpatched v52 fulfils an unpaid completed session; patched does not, fulfils on async success, idempotent, normal paid path regression-clean, bad signature still refused). Peak load 4.37.
- Not covered: the full 40-step flow incl. refund was not re-run against the *patched* webhook; only the normal paid path (p4) is. Real Stripe, real Supabase, Connect and Apple Pay remain unproven; staging pairing waits on Joe's passkey.

## 2. Decisions / approvals Joe must give (via KODE) before starting

1. **Create the staging/isolated backend and install TEST keys himself** (never in the repo, chat or an artifact): Stripe TEST `pk_test_`, `sk_test_`, and the webhook signing secret `whsec_`, as secrets in the staging project / a local env file he controls.
2. **Stripe TEST Connect account** for the test organizer, with payouts enabled in test mode (Joe, Stripe TEST dashboard).
3. **Staging Supabase project** with the replica schema, the packs and the functions (create-checkout, stripe-webhook, and the door RPC) deployed (Joe/KODE; deploying is a write and needs Joe's yes).
4. **Door route**: A (raw token, pre-12A) or B (12A applied on staging, KIL- QR). See section 5.
5. **Fee**: nothing to decide for the test; the staging value is a placeholder. Wednesday decision is separate.
6. Cleanup: staging data is disposable; any prod write is NOT part of this test.
7. **The live-mode switch is not touched.** Any live action needs a new, separate approval.

## 3. Preconditions (who verifies)

| # | Precondition | Verifier | Notes |
|---|---|---|---|
| P1 | Staging Supabase project exists, separate from prod (different project ref). | Joe | The test must never write to prod. Record the ref (not the keys). |
| P2 | Replica schema + packs + functions deployed on staging; 12A/13A state recorded (applied or not). | KODE read-only look after Joe deploys | Decides door route A vs B. |
| P3 | Fee config on staging recorded read-only (`application_fee_bps`, `per_ticket_fee_under10_cents`, `per_ticket_fee_over10_cents`); recompute the expected `application_fee_amount` for a $1.00 ticket. | KODE | Placeholder until Joe decides Wednesday. |
| P4 | A web build that **points at the staging project** (staging Supabase URL + anon key) AND **contains the #153 bearer fix** (`Bearer '+sess.access_token` in the create-checkout fetch). UNVERIFIED how this staging web path is served (local server, preview, or a non-prod host): Joe/KODE decide; it must not be the prod keepitil.com bundle. | KODE reads the served source | Hard blocker: without the bearer fix the purchase fails `needs_account`/401. |
| P5 | Test keys + `whsec_` installed as secrets on staging; the Stripe TEST dashboard has a webhook endpoint pointing at the staging stripe-webhook URL for `checkout.session.completed`, `charge.refunded` (and `charge.refund.updated`). | Joe | No key is pasted anywhere shared. |
| P6 | Stripe TEST Connect account for the test organizer, `stripe_account_id` stored on the staging organizer profile, `payouts_enabled` true. | Joe sets; KODE read-only boolean check (no ids in the log) | If false the buyer gets an error and no session: abort, fix onboarding first. |
| P7 | TEST event on staging: title starts `TEST - do not buy`, ONE paid tier $1.00 (capacity 1-2), **Show on Explore OFF**, status published. | Joe creates in the organizer UI of the staging web build | Show on Explore OFF is a hygiene measure only (sitemap does not honor it, section 0). |
| P8 | Buyer account on staging (second email, second browser profile / second phone profile); organizer account signed in elsewhere. Passwords are typed by Joe, never by Claude. | Joe | |
| P9 | Baseline aggregates before the test: paid-order count, checked-in count, refunded count, test tier `qty_sold` (expected 0). | KODE read-only, aggregates only | Never PII (no emails, handles, tokens). |
| P10 | Door route chosen. Route B additionally needs 12A applied on staging per #154's apply-order doc and a door UI served (#141/#142 merged, or app #49 `--door-test-variant`). | KODE / Joe | Until then route A only. |
| P11 | Kill switch known: `platform_config.ticketing_enabled='0'` pauses paid sales on that project. | KODE read-only | |
| P12 | Phone ready for the QR scan: camera access, the test site/app build installed. | Joe | |

## 4. Purchase steps (Joe, buyer profile; evidence = screenshot with keys/tokens redacted + KODE read-only aggregates)

B1. Signed OUT, open the TEST event on the staging build, press Buy on the $1.00 tier. **Expect:** no create-checkout call; redirect to `/apply?next=...`. Sign in as the buyer; you return to the event.
B2. Signed IN, tier x1, Buy. **Expect:** Stripe Checkout in **TEST mode (a "test mode" banner shows; this is the OPPOSITE of the old live plan)**, amount $1.00, `customer_email` prefilled.
B3. Pay with the **4242 4242 4242 4242** test card (any future expiry, any CVC, any postal code). **Expect:** return to `/event.html?e=<slug>&paid=1` with the paid banner. (Apple Pay is NOT covered by this test.)
B4. Stripe TEST dashboard (Joe): the payment, the connected (test) account, **`application_fee_amount`** (compare with P3's expectation; record the difference), and the `checkout.session.completed` webhook delivery returning 200.
B5. **Webhook fulfilment (KODE, read-only SELECT, aggregates only):** exactly one new order row `status='paid'` for the TEST event, `amount_cents`=100, `application_fee_cents` recorded, connected-account id set, `qr_token` LENGTH 32 (report the length, never the token), `qty_sold` 0 -> 1. No email/handle/token in what is posted.
B6. **My Tickets (buyer, on the phone):** `/tickets` shows the order with a **self-hosted QR** (no network request to `api.qrserver.com`; Joe checks DevTools Network on the desktop build or KODE reads the served source) encoding **`KIL-<token>`**; `/profile` shows the raw `<token>`. Screenshot with the QR redacted if shared.

## 5. Door scan (organizer session)

**Route A: staging pre-12A, raw token only.** 1) Buyer profile: open `/profile`, read the raw 32-hex token (treat it as the ticket; never paste into chat or a shared screenshot). 2) Organizer profile, on the staging dashboard: browser console `await supa.rpc('event_checkin_scan',{p_qr_token:'<RAW TOKEN>'})` (if `supa` is not defined on that page, stop: that is a finding). **Expect:** admitted. Note: pre-12A the response may carry buyer contact data; redact it. 3) Same call again: **already used**. 4) KODE read-only: checked-in aggregate 0 -> 1. 5) Negative control: `KIL-<token>` is expected to be refused pre-12A; record the actual code.

**Route B: 12A applied on staging + door UI (preferred; proves the real QR).** Organizer opens the door page (web `door.html` after #141/#142 are merged and 12A applied, or the app door variant from #49 `--door-test-variant`; the shipping app bundle has no door link by KODE decision) on a phone and scans the buyer's `/tickets` QR (`KIL-` form; iPhone camera needs the vendored jsQR from #142). **Expect:** admitted with event title / tier / quantity only (no contact data); second scan **already used**; an organizer who does not own the event: **Not your event**. Evidence per #159 (Atlas I08 checklist) and the 15A test plan in #141.

## 6. Refund (Joe, Stripe TEST dashboard)

R1. Refund the $1.00 test charge. **Record exactly which options the TEST dashboard offers** (reverse transfer / refund application fee) and what Joe chose. Compare with Stripe docs (KODE). UNVERIFIED until then.
R2. `charge.refunded` delivered 200. KODE read-only: test order `status='refunded'`, `qty_sold` back to 0, refunded count +1; a later `charge.refund.updated` changes nothing.
R3. **Re-scan the ticket (route A or B): expect refused** (not paid / already used; record the exact code). Behavior of a checked-in-then-refunded ticket on the pre-12A function is UNVERIFIED: record, do not assume.

## 7. Pass / fail table (fill in during the test)

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Signed-out Buy | no create-checkout call, redirect to `/apply?next=` | |
| 2 | Signed-in Buy | 200 + Stripe Checkout in TEST mode, $1.00 | |
| 3 | 4242 payment + return | `paid=1` banner | |
| 4 | Webhook | `checkout.session.completed` delivered 200 | |
| 5 | Order row | 1 new paid row, qty_sold 0->1 | |
| 6 | Application fee | observed vs P3 expectation (52c if staging has the live values) | |
| 7 | My Tickets / QR | shown, self-hosted, `KIL-<token>` | |
| 8 | First door scan | admitted | |
| 9 | Second door scan | already used | |
| 10 | Checked-in aggregate | 0 -> 1, nothing else changes | |
| 11 | Refund | order refunded, qty_sold back to 0 | |
| 12 | Re-scan after refund | refused | |
| 13 | No PII, no key/token in any posted evidence | none | |
| 14 | Prod untouched | no prod request, no prod row changed | |

## 8. Abort criteria (stop immediately, report to KODE)

- Any sign the page or functions talk to the PROD project, or a live key (`pk_live_` / `sk_live_` / `whsec_` of live) is in play.
- Stripe Checkout does not show test mode, or shows an amount/merchant/currency Joe does not expect.
- create-checkout returns an error other than a documented one (needs_account, payouts not enabled), or the page falls back to the anon key (bearer fix missing).
- More than one order row for the single purchase, or any row other than the TEST event's changes (webhook double-fulfil, other tiers/orders).
- Webhook not delivered 200 within a few minutes (do not resend events without KODE).
- A scan reveals data to a non-owner, or admits twice.

## 9. Cleanup

1. Refund via Stripe TEST (section 6); the webhook flips the row. Do not edit order rows by hand.
2. Staging data is disposable. To hide the TEST event on staging: Joe unpublishes it in the organizer UI. Any scoped SQL (even on staging) needs KODE + Joe's yes; this document supplies no SQL.
3. If a PROD event was ever used (not planned): unpublish/delete it, then confirm the slug is absent from `sitemap-events.xml` after the next generator run and the next public sync (section 0).
4. Rotate/delete the TEST webhook endpoint and keys when done if they will not be reused (Joe).

## 10. Who does what

| Step | KODE (read-only unless noted) | Joe |
|---|---|---|
| Create staging project, install TEST keys/`whsec_`, Connect TEST account, webhook endpoint | | yes |
| Deploy replica schema/packs/functions to staging | only with Joe's yes | approves |
| Confirm bearer fix in the served staging web source; fee config; baselines; payouts boolean | yes | |
| Create TEST event/tier, sign in as buyer/organizer, pay with 4242 | | yes |
| Stripe TEST dashboard (payment, fee, webhook delivery, refund options) | reads Stripe docs | yes |
| Phone QR scan / console scan | | yes |
| Post-step aggregate SELECTs (counts, lengths, statuses) | yes | |
| Apply 12A on staging (route B) | yes, per #154 runbook, after gates | approves |
| Any PROD write | not part of this test | |

## 11. Thursday go/no-go (for the Friday TestFlight build)

**GO (all must pass):** pass-fail rows 1-5 and 7-12 are PASS: checkout end to end in test mode (4242 card, order row, webhook 200), the wallet QR is self-hosted and scans on a phone (admitted, then already used), and the test refund flips the order and refuses the re-scan; rows 13-14 PASS (no PII, prod untouched). Row 6 (fee) is recorded, not a gate: the fee is a placeholder until Joe decides Wednesday.
**Then:** Fri AM TestFlight build; **submit only if it passes.**
**NO-GO (fallback):** if Thursday's checkout fails (any of rows 1-5, 7 or 11 fails, or an abort criterion triggers) the submit slips to **Mon Nov 16**. Record the failing row, fix, re-run the failed rows (not the whole test) before Monday.
Also required for the submission but outside this document: 18+, sign-in with account deletion, legal pages (separate jobs). Door scanning for organizers stays unlinked in the shipping app until 12A is live (KODE decision 2026-11-10); a door pass on the day is route A or the non-shipping variant.

## 12. Not verified
- create-checkout / stripe-webhook source is not vendored in the repos: the fee formula and the owner-purchase rule come from KODE's relayed read of v58.
- Stripe refund semantics (reverse_transfer / refund_application_fee / processing fee).
- How the staging web build is served and pointed at the staging project (P4).
- That `supa` is reachable from the console of the staging dashboard page (route A).
- Pre-12A response shapes and result codes of `event_checkin_scan` for refunded/used tickets.
- Whether any scheduled job performs the public sitemap sync (evidence says manual).
- Nothing in this document was run.

## Appendix A: LIVE $1 purchase (NOT PLANNED, needs a separate Joe approval)

The earlier plan (live-mode Stripe charge on Joe's own card, $1.00 TEST event on prod, refund in the live dashboard) is **withdrawn** by the directive "LIVE MODE IS OFF; no live-mode switch, no real charges". It is kept only as a pointer: if it is ever wanted again it needs a new explicit Joe approval, the live fee decision made, the #153 fix deployed to prod, and the prod sitemap rule in section 0 applied (unpublish right after, confirm the slug is gone after the next generator run and public sync). Not part of Thursday.

DRAFT. Nothing is approved. No merge, no prod write, no Stripe action is performed by this document.
