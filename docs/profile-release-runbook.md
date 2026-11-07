# Profile release runbook

Not applied by the pull request. Do not run these statements just because the files are in the repo. Take a backup first. Nothing here inserts an attestation row.

Ship PR #92's event migration in the same window as step 1, immediately after it. Until that file replaces `get_profile_events`, the old anon function stays open. Roll #92 back before #91. #91's down file does not drop `get_profile_events`.

`founder_self` allows only these two accounts, by exact uuid equality: `4f1ff687-e287-496e-8eb4-c444f8e556d1` (tuitea) and `d1ef5687-7410-4027-b94d-e4de393c27d9` (fobbinhard). Joe has not confirmed a quote or a date, so this runbook does not insert that row.

## 1. Backup

Save the live `get_profile_events(text)` definition and its grants before either migration:

```sql
SELECT pg_get_functiondef('public.get_profile_events(text)'::regprocedure);
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'get_profile_events';
```

Keep that output with the backup. #92's down file is where it is restored.

## 2. Step 1

Apply `supabase/migrations/20261107014000_profile_public_read_add.sql`.

## 3. Close the old events RPC

Apply `supabase/migrations/20261107020000_profile_event_summary.sql` from PR #92. Do not leave the old `get_profile_events` callable after this window.

## 4. Web deploy

Deploy the web branch. Check Spotlight, Connect, browse host names, `/member`, `/profile`, and a signed-in profile save.

## 5. Admin attests the real owners

Three owner accounts exist. Attest each one that should stay public. `admin_attested` is refused when the caller and the user id are the same. Joe's own accounts use `founder_self` and must include his quote and the date he states, as text. Do not invent them here.

```sql
-- Someone else's account, called by a different admin:
-- SELECT public.admin_set_account_age('<owner-user-id>'::uuid, true, 'admin_attested');

-- Joe, only after he supplies the quote and the date, and only for
-- 4f1ff687-e287-496e-8eb4-c444f8e556d1 or d1ef5687-7410-4027-b94d-e4de393c27d9:
-- SELECT public.admin_set_account_age(
--   '4f1ff687-e287-496e-8eb4-c444f8e556d1'::uuid, true, 'founder_self',
--   '<joe quote>', '<joe date>'
-- );
```

An adult attestation sets `is_minor` and `under_18` to false on that owner's person and business pages. A page already marked minor (`true`) is left unchanged.

## 6. House pages, one name at a time

Record the house account first (`method` `house`, and that user must be in `app_admins`). Then move each reviewed page by name. `groove-trooper` is the published editorial page. Do not move every editorial row in one statement.

```sql
-- SELECT public.admin_set_account_age('<house-user-id>'::uuid, true, 'house');
-- SELECT public.admin_move_house_page('groove-trooper', '<house-user-id>'::uuid);
```

Repeat `admin_move_house_page` once for each other page an admin has checked. Confirm each depicted person is an adult, or that the page is a fictional or brand persona, before the call.

## 7. Verification queries

Run these before step 2. `tuitea` and `groove-trooper` should be true after the calls above. `fobbinhard` and `keepitil-audit` stay false while they are in review.

```sql
SELECT slug, private.profile_is_public(slug) AS is_public
FROM public.profile_meta
WHERE slug IN ('tuitea', 'groove-trooper', 'fobbinhard', 'keepitil-audit')
ORDER BY slug;
```

The one approved `public.profiles` row must belong to an attested adult. This query should return no row.

```sql
SELECT p.slug
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.profile_owners po
  JOIN private.account_age a ON a.user_id = po.owner_id
  WHERE po.profile_slug = p.slug
    AND a.verified IS TRUE
    AND a.method IN ('founder_self', 'admin_attested', 'house')
);
```

## 8. Step 2

Apply `supabase/migrations/20261107014100_profile_public_read_revoke.sql` only after the queries above look right. A page that already passes `private.profile_is_public` stays public. Anything still unverified goes private.

Check the same pages again, including a signed-in save, as anon and as the owner.

## Rollback

Revert the web deploy first.

If #92 was applied, run `supabase/rollbacks/20261107020000_profile_event_summary_down.sql` first and restore the saved `get_profile_events` body and grants from step 1 of this runbook.

Then run `supabase/rollbacks/20261107014000_profile_public_read_down.sql`. That file does not drop `get_profile_events`. It does restore the old public owner policies. House owner rows that an admin already wrote are kept.
