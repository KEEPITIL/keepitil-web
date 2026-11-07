-- Local and test only. Do not run this against production.
-- The seed script sets kil.qa_seed before applying this file.
-- It does not create sign-in accounts.
-- Create the two users first with scripts/seed-qa-owners.mjs, or run that
-- script alone. It writes these same rows through the local API.

DO $$
BEGIN
  IF current_setting('kil.qa_seed', true) IS DISTINCT FROM 'local' THEN
    RAISE EXCEPTION 'qa owner seed is local and test only';
  END IF;
END $$;

INSERT INTO public.profile_meta (
  slug, display_name, handle, account_type, status,
  profile_public, admin_approved, is_minor, under_18, age_verified, public_fields, bio, tagline
) VALUES
  ('qa-brand', 'QA Brand', 'qa-brand', 'brand', 'published',
   true, true, false, false, true,
   ARRAY['display_name','handle','bio','tagline']::text[],
   'Local QA brand. Not a real profile.', 'QA only'),
  ('qa-member', 'QA Member', 'qa-member', 'subscriber_profile', 'published',
   false, true, false, false, true,
   ARRAY['display_name']::text[],
   'Local QA member. Not a real profile.', 'QA only')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  handle = EXCLUDED.handle,
  account_type = EXCLUDED.account_type,
  status = EXCLUDED.status,
  profile_public = EXCLUDED.profile_public,
  admin_approved = EXCLUDED.admin_approved,
  is_minor = EXCLUDED.is_minor,
  under_18 = EXCLUDED.under_18,
  age_verified = EXCLUDED.age_verified,
  public_fields = EXCLUDED.public_fields,
  bio = EXCLUDED.bio,
  tagline = EXCLUDED.tagline;

INSERT INTO public.profile_owners (profile_slug, owner_id) VALUES
  ('qa-brand', '11111111-1111-4111-8111-111111111111'),
  ('qa-member', '22222222-2222-4222-8222-222222222222')
ON CONFLICT (profile_slug) DO UPDATE SET owner_id = EXCLUDED.owner_id;
