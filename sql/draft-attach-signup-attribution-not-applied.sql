-- NOT APPLIED. Do not run against production from this pull request.
-- The browser sends only the five campaign fields, and only for a signed-in session.
-- This function reads that session and writes the fields on the account's
-- marketing_contacts row. It does not take an email or a handle from the caller.
-- Confirm the table's columns before running. If utm_content or utm_term are
-- absent, the ALTER statements add them. Expect the function to replace any
-- older copy of the same name.

BEGIN;

ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS utm_term text;

CREATE OR REPLACE FUNCTION public.attach_signup_attribution(
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text,
  p_utm_term text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  SELECT email INTO em FROM auth.users WHERE id = uid;
  IF em IS NULL OR btrim(em) = '' THEN
    RAISE EXCEPTION 'attach_signup_attribution: signed-in user has no email';
  END IF;

  src := CASE WHEN p_utm_source IS NULL OR length(btrim(p_utm_source)) = 0 OR length(btrim(p_utm_source)) > 120 OR btrim(p_utm_source) LIKE '%@%' OR btrim(p_utm_source) !~ '^[A-Za-z0-9._~-]+$' THEN NULL ELSE btrim(p_utm_source) END;
  med := CASE WHEN p_utm_medium IS NULL OR length(btrim(p_utm_medium)) = 0 OR length(btrim(p_utm_medium)) > 120 OR btrim(p_utm_medium) LIKE '%@%' OR btrim(p_utm_medium) !~ '^[A-Za-z0-9._~-]+$' THEN NULL ELSE btrim(p_utm_medium) END;
  camp := CASE WHEN p_utm_campaign IS NULL OR length(btrim(p_utm_campaign)) = 0 OR length(btrim(p_utm_campaign)) > 120 OR btrim(p_utm_campaign) LIKE '%@%' OR btrim(p_utm_campaign) !~ '^[A-Za-z0-9._~-]+$' THEN NULL ELSE btrim(p_utm_campaign) END;
  content := CASE WHEN p_utm_content IS NULL OR length(btrim(p_utm_content)) = 0 OR length(btrim(p_utm_content)) > 120 OR btrim(p_utm_content) LIKE '%@%' OR btrim(p_utm_content) !~ '^[A-Za-z0-9._~-]+$' THEN NULL ELSE btrim(p_utm_content) END;
  term := CASE WHEN p_utm_term IS NULL OR length(btrim(p_utm_term)) = 0 OR length(btrim(p_utm_term)) > 120 OR btrim(p_utm_term) LIKE '%@%' OR btrim(p_utm_term) !~ '^[A-Za-z0-9._~-]+$' THEN NULL ELSE btrim(p_utm_term) END;

  IF src IS NULL AND med IS NULL AND camp IS NULL AND content IS NULL AND term IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.marketing_contacts
     SET utm_source = src,
         utm_medium = med,
         utm_campaign = camp,
         utm_content = content,
         utm_term = term
   WHERE email = em;
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n = 0 THEN
    INSERT INTO public.marketing_contacts (email, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
    VALUES (em, 'signup', src, med, camp, content, term);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_signup_attribution(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_signup_attribution(text, text, text, text, text) TO authenticated;

COMMIT;
