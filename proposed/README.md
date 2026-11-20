# proposed/: drafts that are NOT deployed

Nothing here runs on keepitil.com or in Supabase until a person deploys or applies it with the owner's go-ahead: Joe for payments and DDL, and Grok's GO to merge.

## Payout-flag lock (standalone; ships before the Stripe Connect work in #181)

| Path | What it is |
|---|---|
| `supabase/baseline/` | Byte-exact keepitil-prod baseline (read-only reads, 2026-11-17): `mark_payouts_enabled()` and `app_users` columns, grants and policies |
| `supabase/sql/payouts_flag_lock.PROPOSED.sql` | One transaction: PRECHECK (md5 of the live function) → revoke the client rpc and the explicit column grants → `guard_stripe_columns` trigger on `stripe_account_id` and `payouts_enabled` → service-role-only `set_payouts_from_stripe` → VERIFY |
| `supabase/functions/connect-status` | Minimal server check. It reads the organizer's account from Stripe and sets `payouts_enabled` through the writer. After the lock, this is the only way a host becomes payout-ready |
| `supabase/tests/payouts-flag-lock.pglite.test.mjs` | The SQL in PGlite against the live baseline, with negative controls |

**Order:** deploy `connect-status` and the `create-event.html` change before or with the SQL. Otherwise new hosts can't become payout-ready.
