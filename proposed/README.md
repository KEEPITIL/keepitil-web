# proposed/: drafts that are NOT deployed

Nothing in this folder runs on keepitil.com or in Supabase. Each item needs review, and deploying or applying it needs the owner's explicit go-ahead (Joe for payments and DDL; Grok's GO to merge).

## Stripe Connect payouts, TEST MODE ONLY (for the Friday test)

| Path | What it is |
|---|---|
| `supabase/functions/_shared/stripe-test-guard.ts` | `requireTestKey` refuses anything but a secret test key (`sk_test_…`). `requireTestObject` refuses any Stripe object unless `livemode === false` |
| `supabase/functions/_shared/payouts-status.ts` | The one rule: `verified = charges_enabled && payouts_enabled && no disabled_reason`, from an account the server read |
| `supabase/functions/connect-onboard` | Creates the organizer's Express test account (once), stores its id server-side, returns the Stripe onboarding link. Never sets payouts |
| `supabase/functions/connect-status` | Server refresh: reads the account from Stripe, stores the verified status, returns it for the host dashboard |
| `supabase/functions/connect-webhook` | `account.updated` from Stripe: checks the signature with the test webhook secret, refuses live events, stores the status |
| `supabase/functions/connect-test-payout` | A $1–$100 test destination charge (`pm_card_bypassPending`) to the organizer's account, only once Stripe says payouts are enabled. Returns the connected account's test balance |
| `supabase/sql/payouts_verified_by_stripe.PROPOSED.sql` | Revokes the client-callable `mark_payouts_enabled()`, adds a trigger so only the server can change the Stripe columns, and adds the service-role-only writers |
| `supabase/tests/payouts-sql.pglite.test.mjs` | Runs that SQL in PGlite against a **stand-in** of the live table and function |

- **Secrets:** the functions read `STRIPE_TEST_SECRET_KEY` and `STRIPE_TEST_CONNECT_WEBHOOK_SECRET`, never the live `STRIPE_SECRET_KEY`. No key is in this repo.
- **Tests:** `assets/js/connect-payouts.test.mjs` runs as part of `npm test` and uses in-memory Stripe and Supabase fakes, with no network.
