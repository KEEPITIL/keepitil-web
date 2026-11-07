-- NOT APPLIED. Do not run against production from this pull request.
-- The browser sends only the five campaign fields, and only for a signed-in session.
-- This function reads that session and writes the fields on the one marketing_contacts
-- row for auth.uid(). It does not take an email, a handle, or a target user id.
-- Confirm the table before running. The unique index on user_id makes the UPDATE
-- match at most one row; the function also raises if the count is anything else
-- but 0 or 1. Owner is postgres, the usual Supabase trusted owner. Confirm that
-- role before applying.

BEGIN;

ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS utm_term text;
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_user_id_uidx
  ON public.marketing_contacts (user_id);

CREATE OR REPLACE FUNCTION public.attach_signup_attribution(
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text,
  p_utm_term text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  em text;
  src text;
  med text;
  camp text;
  content text;
  term text;
  n integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'attach_signup_attribution: expected a signed-in user';
  END IF;

  SELECT users.email INTO em
    FROM auth.users AS users
   WHERE users.id = uid;
  IF em IS NULL OR pg_catalog.btrim(em) = '' THEN
    RAISE EXCEPTION 'attach_signup_attribution: signed-in user has no email';
  END IF;

  src := CASE
    WHEN p_utm_source IS NULL THEN NULL
    WHEN pg_catalog.length(pg_catalog.btrim(p_utm_source)) = 0
      OR pg_catalog.length(pg_catalog.btrim(p_utm_source)) > 120
      OR pg_catalog.btrim(p_utm_source) LIKE '%@%'
      OR pg_catalog.btrim(p_utm_source) !~ '^[A-Za-z0-9._~-]+$' THEN NULL
    ELSE pg_catalog.btrim(p_utm_source)
  END;
  med := CASE
    WHEN p_utm_medium IS NULL THEN NULL
    WHEN pg_catalog.length(pg_catalog.btrim(p_utm_medium)) = 0
      OR pg_catalog.length(pg_catalog.btrim(p_utm_medium)) > 120
      OR pg_catalog.btrim(p_utm_medium) LIKE '%@%'
      OR pg_catalog.btrim(p_utm_medium) !~ '^[A-Za-z0-9._~-]+$' THEN NULL
    ELSE pg_catalog.btrim(p_utm_medium)
  END;
  camp := CASE
    WHEN p_utm_campaign IS NULL THEN NULL
    WHEN pg_catalog.length(pg_catalog.btrim(p_utm_campaign)) = 0
      OR pg_catalog.length(pg_catalog.btrim(p_utm_campaign)) > 120
      OR pg_catalog.btrim(p_utm_campaign) LIKE '%@%'
      OR pg_catalog.btrim(p_utm_campaign) !~ '^[A-Za-z0-9._~-]+$' THEN NULL
    ELSE pg_catalog.btrim(p_utm_campaign)
  END;
  content := CASE
    WHEN p_utm_content IS NULL THEN NULL
    WHEN pg_catalog.length(pg_catalog.btrim(p_utm_content)) = 0
      OR pg_catalog.length(pg_catalog.btrim(p_utm_content)) > 120
      OR pg_catalog.btrim(p_utm_content) LIKE '%@%'
      OR pg_catalog.btrim(p_utm_content) !~ '^[A-Za-z0-9._~-]+$' THEN NULL
    ELSE pg_catalog.btrim(p_utm_content)
  END;
  term := CASE
    WHEN p_utm_term IS NULL THEN NULL
    WHEN pg_catalog.length(pg_catalog.btrim(p_utm_term)) = 0
      OR pg_catalog.length(pg_catalog.btrim(p_utm_term)) > 120
      OR pg_catalog.btrim(p_utm_term) LIKE '%@%'
      OR pg_catalog.btrim(p_utm_term) !~ '^[A-Za-z0-9._~-]+$' THEN NULL
    ELSE pg_catalog.btrim(p_utm_term)
  END;

  IF src IS NULL AND med IS NULL AND camp IS NULL AND content IS NULL AND term IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.marketing_contacts
     SET utm_source = src,
         utm_medium = med,
         utm_campaign = camp,
         utm_content = content,
         utm_term = term
   WHERE user_id = uid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 1 THEN
    RAISE EXCEPTION 'attach_signup_attribution: expected at most 1 row, updated %', n;
  END IF;

  IF n = 0 THEN
    INSERT INTO public.marketing_contacts (user_id, email, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
    VALUES (uid, em, 'signup', src, med, camp, content, term);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'attach_signup_attribution: expected 1 inserted row, got %', n;
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION public.attach_signup_attribution(text, text, text, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.attach_signup_attribution(text, text, text, text, text) FROM PUBLIC;

DO $revoke$
DECLARE
  role_name text;
  grantee_oid oid;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE pg_roles.rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.attach_signup_attribution(text, text, text, text, text) FROM %I',
        role_name
      );
    END IF;
  END LOOP;

  FOR grantee_oid IN
    SELECT DISTINCT acl.grantee
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(proc.proacl) AS acl
     WHERE ns.nspname = 'public'
       AND proc.proname = 'attach_signup_attribution'
       AND pg_catalog.pg_get_function_identity_arguments(proc.oid)
           = 'p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text'
       AND acl.grantee <> 0
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.attach_signup_attribution(text, text, text, text, text) FROM %I',
      pg_catalog.pg_get_userbyid(grantee_oid)
    );
  END LOOP;
END
$revoke$;

GRANT EXECUTE ON FUNCTION public.attach_signup_attribution(text, text, text, text, text) TO authenticated;

COMMIT;
