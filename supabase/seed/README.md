# Local QA owners

This seed is for a local or test Supabase only. Do not point it at production. The script refuses the production project hosts.

It creates two sign-in accounts and the profiles they own:

| Email | Profile | Public page |
|---|---|---|
| `qa-brand@example.test` | `/profile?slug=qa-brand` | Public brand page |
| `qa-member@example.test` | `/profile?slug=qa-member` | Private stub |

Neither address is a real mailbox. The password is whatever you put in `QA_OWNER_PASSWORD`. It is not stored in the repo.

## Run it

Start the local Supabase stack, then read the local service role from `supabase status`. Do not commit that key.

```sh
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=//p')"
export QA_OWNER_PASSWORD='choose-a-local-password'
node scripts/seed-qa-owners.mjs
```

The password must be at least 8 characters. Pick one for the session and leave it out of git.

`supabase/seed/qa_owner_profiles.sql` writes the same profile rows and will not run unless the session has `kil.qa_seed` set to `local`. It does not create the auth users. Use the script above so sign-in works.

## Edit-modal check

1. Open the local site and sign in at `/apply` as `qa-brand@example.test` with `QA_OWNER_PASSWORD`.
2. Open `/profile?slug=qa-brand`. Edit Profile should open, and Save should keep the row.
3. Sign out. Open `/profile?slug=qa-member` while logged out. The page should be the private stub: ring, “THIS PROFILE IS PRIVATE”, and Discover events. No share card.
4. Sign in as `qa-member@example.test` and open `/profile?slug=qa-member`. Edit Profile should open for that owner.
