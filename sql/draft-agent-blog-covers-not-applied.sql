-- NOT APPLIED. Do not run against production from this pull request.
-- Forward only. Running this file does not revert.
-- Revert, in its own file: sql/draft-agent-blog-covers-revert-not-applied.sql
--
-- agent_blog_posts ids 13, 14, 16, 18. Luna cover map v1.1, primary 1200x630 WebP.
-- Each UPDATE changes one row only when cover_url is still the old Pollinations URL.
-- Expected updated rows: 1, 1, 1, 1. A different count raises and rolls this
-- transaction back.
-- The old images are not copied into this repo.
-- The old URLs stay in this file on purpose: they are the WHERE checks, not pages.

BEGIN;

DO $apply$
DECLARE
  n bigint;
BEGIN
UPDATE public.agent_blog_posts SET cover_url='/assets/artists/groove-trooper/blog-post-13-1200x630-v1.1.webp'
 WHERE id=13 AND cover_url='https://image.pollinations.ai/prompt/afrobeats%20amapiano%20neon%20dance%20crowd%20purple%20stage%20lights%20abstract%20no%20text?width=1200&height=630&nologo=true';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'agent_blog_posts id 13: expected 1 updated row, got %', n;
  END IF;

UPDATE public.agent_blog_posts SET cover_url='/assets/artists/groove-trooper/blog-post-14-1200x630-v1.1.webp'
 WHERE id=14 AND cover_url='https://image.pollinations.ai/prompt/moody%20neon-lit%20country%20acoustic%20guitar%20on%20a%20dark%20stage%2C%20amber%20and%20purple%20stage%20lights%2C%20atmospheric%20haze%2C%20cinematic%2C%20no%20text%2C%20no%20faces?width=1200&height=630&nologo=true&seed=726';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'agent_blog_posts id 14: expected 1 updated row, got %', n;
  END IF;

UPDATE public.agent_blog_posts SET cover_url='/assets/artists/groove-trooper/blog-post-16-1200x630-v1.1.webp'
 WHERE id=16 AND cover_url='https://image.pollinations.ai/prompt/underground%20hip%20hop%20studio%20neon%20purple%20teal%20abstract%20soundwaves%20cinematic%20no%20text%20no%20faces?width=1200&height=630&nologo=true&seed=210';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'agent_blog_posts id 16: expected 1 updated row, got %', n;
  END IF;

UPDATE public.agent_blog_posts SET cover_url='/assets/artists/groove-trooper/blog-post-18-1200x630-v1.1.webp'
 WHERE id=18 AND cover_url='https://image.pollinations.ai/prompt/abstract%20warm%20amber%20nightclub%20dancefloor%20light%20haze%20deep%20house%20atmosphere%20no%20people%20no%20text%20cinematic%20moody?width=1200&height=630&nologo=true&seed=20260731';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'agent_blog_posts id 18: expected 1 updated row, got %', n;
  END IF;

END
$apply$;

-- Post-apply check. Lists outside image URLs still stored on agent_blog_posts
-- 13, 14, 16, and 18. An outside image URL is an absolute (or protocol-relative)
-- URL whose host is not keepitil.com, including any subdomain, when it is
-- cover_url, or anywhere in the row if the host is pollinations.ai or the path
-- is an image file.
-- Relative /assets paths are not listed. https://keepitil.com/... is not listed.
-- Empty result is required. Any row raises, and this transaction rolls back.
DO $drop_outside$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE c.relname = 'draft_outside_image_urls'
       AND n.nspname LIKE 'pg_temp%'
  ) THEN
    DROP VIEW pg_temp.draft_outside_image_urls;
  END IF;
END
$drop_outside$;
CREATE TEMP VIEW draft_outside_image_urls AS
WITH image_fields AS (
  SELECT 'agent_blog_posts'::text AS source,
         id::text AS row_id,
         'cover_url'::text AS field,
         cover_url AS value
    FROM public.agent_blog_posts
   WHERE id IN (13, 14, 16, 18)
),
row_text AS (
  SELECT 'agent_blog_posts'::text AS source,
         p.id::text AS row_id,
         row_to_json(p)::text AS value
    FROM public.agent_blog_posts AS p
   WHERE p.id IN (13, 14, 16, 18)
),
found AS (
  SELECT f.source, f.row_id, f.field, m[1] AS url, true AS from_image_column
    FROM image_fields AS f
    CROSS JOIN LATERAL regexp_matches(
      COALESCE(f.value, ''),
      'https?://[^[:space:]''"<>]+|//[^[:space:]''"<>]+',
      'g'
    ) AS m
  UNION ALL
  SELECT r.source, r.row_id, 'row'::text, m[1], false
    FROM row_text AS r
    CROSS JOIN LATERAL regexp_matches(
      COALESCE(r.value, ''),
      'https?://[^[:space:]''"<>]+|//[^[:space:]''"<>]+',
      'g'
    ) AS m
),
hosts AS (
  SELECT source,
         row_id,
         field,
         url,
         from_image_column,
         lower(substring(regexp_replace(url, '^//', 'https://') FROM 'https?://([^/:]+)')) AS host
    FROM found
)
SELECT source, row_id, field, url
  FROM (
    SELECT DISTINCT ON (source, row_id, url)
           source, row_id, field, url
      FROM hosts
     WHERE COALESCE(host, '') !~ '(^|\.)keepitil\.com$'
       AND (
         from_image_column
         OR host ~ '(^|\.)pollinations\.ai$'
         OR url ~* '\.(jpe?g|png|gif|webp|avif|svg)([?#]|$)'
       )
     ORDER BY source, row_id, url, CASE WHEN field = 'row' THEN 1 ELSE 0 END, field
  ) AS deduped;

SELECT source, row_id, field, url
  FROM draft_outside_image_urls
 ORDER BY source, row_id, field, url;

DO $outside$
DECLARE
  n bigint;
  listing text;
BEGIN
  SELECT count(*),
         string_agg(source || ' ' || row_id || ' ' || field || ' ' || url,
                    E'\n' ORDER BY source, row_id, field, url)
    INTO n, listing
    FROM draft_outside_image_urls;

  IF n <> 0 THEN
    RAISE EXCEPTION 'outside image URLs still on agent_blog_posts 13, 14, 16, 18 (%): %', n, listing;
  END IF;
END
$outside$;

DO $drop_outside$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE c.relname = 'draft_outside_image_urls'
       AND n.nspname LIKE 'pg_temp%'
  ) THEN
    DROP VIEW pg_temp.draft_outside_image_urls;
  END IF;
END
$drop_outside$;

COMMIT;
