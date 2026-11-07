# Profile release runbook

Not applied by the pull request. Do not run these statements just because the files are in the repo. Take a backup first. Nothing here inserts an attestation row.

One order. Apply step 1, then PR #92's event migration in the same window, then deploy, then attest, then the owner opt-in, then the named house moves, then the verification queries, then step 2. Do not apply step 2 before #92.

`founder_self` allows only these two accounts, by exact uuid equality: `4f1ff687-e287-496e-8eb4-c444f8e556d1` (tuitea) and `d1ef5687-7410-4027-b94d-e4de393c27d9` (fobbinhard). Joe has not confirmed a quote or a date, so this runbook does not insert that row. `admin_attested` is refused when the caller and the target are the same user.

## 1. Backup

Save the live function and its grants before either migration. #92's down file aborts if this restore block is still empty.

```sql
SELECT pg_get_functiondef('public.get_profile_events(text)'::regprocedure);
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'get_profile_events';
```

Also save the rows and grants that exist today. Do not select `profile_public`, `public_fields`, `is_minor`, `under_18`, `age_verified`, or `admin_approved` here. Those columns are created by step 1.

```sql
SELECT slug, display_name, handle, account_type, status
FROM public.profile_meta
WHERE slug IN ('tuitea', 'groove-trooper', 'fobbinhard', 'keepitil-audit');

SELECT profile_slug, owner_id
FROM public.profile_owners
WHERE profile_slug IN ('tuitea', 'groove-trooper', 'fobbinhard', 'keepitil-audit');

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('profile_meta', 'profile_owners', 'profiles', 'events')
ORDER BY table_name, grantee, privilege_type;
```

`groove-trooper` has no owner row today. Keep that result. Do not invent one.

## 2. Step 1

Apply `supabase/migrations/20261107014000_profile_public_read_add.sql`. It is one transaction.

After it commits, snapshot the new columns:

```sql
SELECT slug, profile_public, public_fields, is_minor, under_18, age_verified, admin_approved
FROM public.profile_meta
WHERE slug IN ('tuitea', 'groove-trooper', 'fobbinhard', 'keepitil-audit');
```

## 3. Close the old events RPC

Apply `supabase/migrations/20261107020000_profile_event_summary.sql` from PR #92 in this same window, immediately after step 1. Do not leave the old `get_profile_events` callable, and do not apply step 2 yet.

A published event stays readable as a listing even when the organizer's profile is private. Anon and authenticated do not receive `owner_handle` or `owner_id` from `public.events`. The organizer is returned only by `get_profile_event_summary`, and only when `private.profile_is_public` is true for that profile.

## 4. Web deploy

Deploy the web branch. Check Spotlight, Connect, browse host names, `/member`, `/profile`, and a signed-in profile save.

## 5. Attest real owners

Do not attest `keepitil-audit`. That owner row is a test account and stays unverified.

`tuitea`'s owner is `4f1ff687-e287-496e-8eb4-c444f8e556d1`. Joe calls `founder_self` himself, and only after he supplies his own quote and date. Do not invent them.

`fobbinhard`'s owner is `d1ef5687-7410-4027-b94d-e4de393c27d9` and is not in `app_admins`, so `founder_self` is not the path for that account. A different admin may record `admin_attested`. The page stays private while its status is `review`.

```sql
-- Joe, only after he supplies the quote and the date:
-- SELECT public.admin_set_account_age(
--   '4f1ff687-e287-496e-8eb4-c444f8e556d1'::uuid, true, 'founder_self',
--   '<joe quote>', '<joe date>'
-- );

-- A different admin, for fobbinhard's account. The page stays in review.
-- SELECT public.admin_set_account_age(
--   'd1ef5687-7410-4027-b94d-e4de393c27d9'::uuid, true, 'admin_attested'
-- );
```

A verified write is refused when the target already owns any page with `is_minor` or `under_18` true. An adult attestation sets those flags false only on person and business pages that are not already marked minor. It does not set `profile_public` or `public_fields`.

## 6. Owner opt-in

Attestation alone leaves a page private when `profile_public` is NULL or `public_fields` is `[]`. The owner turns the page on in Edit Profile. An admin does not do it. Save sends `profile_public` and the fields the owner checks. The page stays private until the box is on and at least one field is checked.

This applies to:

| Page | After step 1 | What the owner does |
|---|---|---|
| `tuitea` | `subscriber_profile`, published. `profile_public` stays NULL. `public_fields` becomes `[]`. | Joe opens Edit Profile, turns on “Show this page publicly”, and picks the fields. Until then `get_public_profile('tuitea')` returns no row. |
| `fobbinhard` | No account type, status `review`. `profile_public` stays NULL. `public_fields` becomes `[]`. | Stays private while it is in review, even after an opt-in. |
| `keepitil-audit` | No account type, status `review`. `profile_public` stays NULL. `public_fields` becomes `[]`. | Do not attest this account and do not publish it. |
| `groove-trooper` | `editorial_artist`, published. Step 1 already sets `profile_public` true and the directory field list. | No opt-in. It becomes public only after the named house move below. |

## 7. House pages, one name at a time

Record the house account first (`method` `house`, and that user must be in `app_admins`). Then move each reviewed page by name. `groove-trooper` is the published editorial page. Do not move every editorial row in one statement.

```sql
-- SELECT public.admin_set_account_age('<house-user-id>'::uuid, true, 'house');
-- SELECT public.admin_move_house_page('groove-trooper', '<house-user-id>'::uuid);
```

Repeat `admin_move_house_page` once for each other page an admin has checked. Confirm each depicted person is an adult, or that the page is a fictional or brand persona, before the call.

## 8. Verification queries

Run these before step 2.

```sql
SELECT slug, private.profile_is_public(slug) AS is_public
FROM public.profile_meta
WHERE slug IN ('tuitea', 'groove-trooper', 'fobbinhard', 'keepitil-audit')
ORDER BY slug;

SELECT * FROM public.get_public_profile('tuitea');
SELECT * FROM public.get_public_profile('groove-trooper');
SELECT * FROM public.get_public_profile('fobbinhard');
SELECT * FROM public.get_public_profile('keepitil-audit');
```

`groove-trooper` should return a public row after the named move. `tuitea` returns a public row only after Joe's attestation and his own opt-in. `fobbinhard` and `keepitil-audit` return no public row.

`public.profiles` has `id` and `slug`, not `handle`. `get_approved_profile` returns the real columns only when `private.profile_is_public` is true for that slug and the field is in `public_fields`. `joseph-tuitea` has no `profile_owners` row. Do not insert one. This query should return no row.

```sql
SELECT p.slug
FROM public.profiles p
WHERE NOT (
  EXISTS (
    SELECT 1
    FROM private.account_age a
    WHERE a.user_id = p.id
      AND a.verified IS TRUE
      AND a.method IN ('founder_self', 'admin_attested', 'house')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profile_owners po
    JOIN public.profile_meta m ON m.slug = po.profile_slug
    WHERE po.owner_id = p.id
      AND (m.is_minor IS TRUE OR m.under_18 IS TRUE)
  )
);
```

## 9. Step 2

Apply `supabase/migrations/20261107014100_profile_public_read_revoke.sql` only after the queries above look right. A page that already passes `private.profile_is_public` stays public. Anything still unverified goes private.

Check the same `get_public_profile` calls again, including a signed-in save, as anon and as the owner.

## Undo for each stage

Use the backup from section 1. Do not run #92's down file while its restore block still raises. Paste the saved `pg_get_functiondef` output and the saved `GRANT EXECUTE` statements over that block first.

### After step 1 only

#92 is not applied and the web is not deployed. Run `supabase/rollbacks/20261107014000_profile_public_read_down.sql`. Do not run the #92 down file. That restores the previous `profile_meta` and `profile_owners` policies and grants, drops `private`, and grants `SELECT` on `public.profiles` back to anon and authenticated. The added columns stay.

### After the #92 migration

The web is not deployed and nobody has been attested. Paste the section 1 function definition and grants into `supabase/rollbacks/20261107020000_profile_event_summary_down.sql`, then run that file. It also restores table `SELECT` on `public.events`, which includes `event_password_hash`, the previous grant. Then run the #91 down file. Do not revert a deploy that has not happened.

### After the web deploy, before attestation

Revert the web deploy. Then run the filled #92 down file so the previous site gets the original `get_profile_events`. Leave step 1 in place: `profile_owners` no longer has the public read or owner write policies, and that hardening stays. Do not run the #91 down file for a web-only failure.

### After attestation and house moves, before step 2

To undo the data and keep step 1, restore the saved `profile_owners` rows and the saved minor flags from section 1, and delete only the `private.account_age` rows written in this window. House owner rows are data. Restoring the saved `profile_owners` result puts `groove-trooper` back to having no owner. Do not delete any other owner row.

To unwind the database as well, revert the web deploy, run the filled #92 down file, then run the #91 down file. The #91 down file drops `private.account_age`, so the attestations go away, and it keeps house owner rows. Restore `profile_owners` from section 1 when the move itself must be undone.

### After step 2

This puts back step 2's read policies and the step 1 column grants. It does not give anon `profile_owners`, and it does not restore owner `UPDATE` or `DELETE`.

```sql
BEGIN;
DROP POLICY IF EXISTS "profile_meta read all" ON public.profile_meta;
CREATE POLICY "profile_meta read all" ON public.profile_meta
  FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS profile_meta_read ON public.profile_meta;
CREATE POLICY profile_meta_read ON public.profile_meta
  FOR SELECT TO public USING (true);
GRANT SELECT ON TABLE public.profile_meta TO anon;
GRANT INSERT (
  slug, display_name, handle, location, bio, tagline, pronouns, book_email,
  about, links, links_label, badges, account_type, status, avatar_url,
  cover_url, cover_mobile_url, socials, highlights, updated_at,
  profile_public, public_fields
) ON TABLE public.profile_meta TO authenticated;
GRANT UPDATE (
  slug, display_name, handle, location, bio, tagline, pronouns, book_email,
  about, links, links_label, badges, account_type, status, avatar_url,
  cover_url, cover_mobile_url, socials, highlights, updated_at,
  profile_public, public_fields
) ON TABLE public.profile_meta TO authenticated;
COMMIT;
```

A full unwind from here is still: revert the web deploy, run the filled #92 down file, then run the #91 down file, then restore `profile_owners` from section 1 if a house move must be undone.
