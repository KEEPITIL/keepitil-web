# Live keepitil-prod baseline for the payouts change (read-only catalog reads by Kode, 2026-11-17 ~03:15 PT)

`mark_payouts_enabled.live.sql` is a byte-exact `pg_get_functiondef` snapshot, md5 `975786ee803b22f894ef01af63f20d5c`. It is `LANGUAGE sql SECURITY DEFINER`, and its whole body is `update public.app_users set payouts_enabled = true where id = auth.uid();`.

## public.app_users columns
| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | |
| handle | text | NO | |
| display_name | text | YES | |
| created_at | timestamptz | YES | now() |
| stripe_account_id | text | YES | |
| payouts_enabled | boolean | NO | false |
| notifications_enabled | boolean | NO | true |
| avatar_url | text | YES | |

The four `stripe_*` status columns in the PROPOSED SQL don't exist yet. The proposed `alter table … add column` adds them.

## Grants that matter
- Function `mark_payouts_enabled()`: EXECUTE for **PUBLIC**, anon, authenticated and service_role.
- Table `app_users`:
  - anon: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE (no SELECT).
  - authenticated: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE (no table SELECT).
  - service_role: all.
- Column grants: `authenticated` has UPDATE and INSERT on `stripe_account_id` and `payouts_enabled`, and SELECT on `payouts_enabled`. `anon` has UPDATE and INSERT on both.

## RLS policies on app_users (5)
- `app_users_insert` INSERT to PUBLIC: check `auth.uid() = id`.
- `app_users_self_insert` INSERT to authenticated: check `id = auth.uid()`.
- `app_users_self_select` SELECT to authenticated: using `id = auth.uid()`.
- `app_users_self_update` UPDATE to authenticated: using and check `id = auth.uid()`.
- `app_users_update` UPDATE to PUBLIC: using `auth.uid() = id`, with **no WITH CHECK**.

## What this means
1. Any signed-in user can make themselves "payout ready" in two ways. One is `rpc('mark_payouts_enabled')`. The other is a direct `update app_users set payouts_enabled=true, stripe_account_id='acct_…'` on their own row, which is allowed by the table and column grants plus the self-update policies. The proposed trigger covers both. The REVOKE alone would not cover the second.
2. anon's write grants are blocked only by RLS: `auth.uid()` is null, so no policy matches. The trigger also covers anon, because `current_user` is `anon`.
3. Rows today: 1 user has `payouts_enabled = true`, and 1 has a `stripe_account_id`. Re-verify that account with Stripe before trusting the flag (open item 3).

## Definer functions that write the payout columns (checked)
Only `mark_payouts_enabled` is a SECURITY DEFINER function in `public` that writes `stripe_account_id` or `payouts_enabled` on `app_users`. Once the proposed REVOKE runs, it is the only `current_user = postgres` path, and nothing else would bypass the trigger. The search matched `update … app_users` in function source that mentions either column.
