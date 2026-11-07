-- NOT APPLIED. Do not run against production from this pull request.
-- Forward only. Running this file does not revert.
-- Revert, in its own file: sql/draft-groove-trooper-atlas-revert-not-applied.sql
--
-- Atlas SELECT 2026-11-06, rewritten with the committed art paths.
-- Placeholders /assets/luna/... are replaced with assets/artists/groove-trooper/.
-- Each UPDATE keeps Atlas's old-value check in the WHERE.
-- Expected updated rows: 1, 1, 1, 1, 5. A different count raises and rolls this
-- transaction back.
--
-- avatar / blog_articles.artist_avatar / campaign media:
--   /assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp
-- cover:
--   /assets/artists/groove-trooper/groove-trooper-cover-desktop-v1.0.webp
-- highlights, in Atlas's order:
--   highlight-01 Groove Cruise, 02 Avalon, 03 R&V Radio,
--   04 Kingdom, 05 Studio, 06 Festivals

BEGIN;

DO $apply$
DECLARE
  n bigint;
BEGIN
UPDATE public.profile_meta SET avatar_url='/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp'
 WHERE slug='groove-trooper' AND avatar_url='https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'profile_meta.avatar_url: expected 1 updated row, got %', n;
  END IF;

UPDATE public.profile_meta SET cover_url='/assets/artists/groove-trooper/groove-trooper-cover-desktop-v1.0.webp'
 WHERE slug='groove-trooper' AND cover_url='https://images.ra.co/06c4bb3109109df1dad229582219f4ded15b11d4.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'profile_meta.cover_url: expected 1 updated row, got %', n;
  END IF;

UPDATE public.profile_meta SET highlights='[{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-01-v1.0.webp","label":"Groove Cruise"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-02-v1.0.webp","label":"Avalon"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-03-v1.0.webp","label":"R&V Radio"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-04-v1.0.webp","label":"Kingdom"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-05-v1.0.webp","label":"Studio"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-06-v1.0.webp","label":"Festivals"}]'::jsonb
 WHERE slug='groove-trooper' AND highlights='[{"img":"https://images.ra.co/0c08978993ce4ba443b61b007d1de45445ddced3.jpg","label":"Groove Cruise"},{"img":"https://images.ra.co/095b3c97c806dfa2326c4bc5a8239907b4a24815.jpg","label":"Avalon"},{"img":"https://images.ra.co/234c570dd0c0ce4c93d62945d502ef1952b2cf31.jpg","label":"R&V Radio"},{"img":"https://images.ra.co/233912b5340b79213e16e58647ecd297165d0a52.jpg","label":"Kingdom"},{"img":"https://images.ra.co/1bfc214a7b4917efac1afad318fd4dafa631a480.jpg","label":"Studio"},{"img":"https://images.ra.co/0eb69717593e6bb32225fec905e93762454a7894.jpg","label":"Festivals"}]'::jsonb;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'profile_meta.highlights: expected 1 updated row, got %', n;
  END IF;

UPDATE public.blog_articles SET artist_avatar='/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp'
 WHERE id='7c82ba44-df4f-45e1-be52-4ed4fca7264e' AND artist_avatar='https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'blog_articles.artist_avatar: expected 1 updated row, got %', n;
  END IF;

UPDATE public.campaign_variants SET media='[{"url":"/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp"}]'::jsonb
 WHERE id IN (6,7,8,9,10) AND media='[{"url":"https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg"}]'::jsonb;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN
    RAISE EXCEPTION 'campaign_variants.media: expected 5 updated rows, got %', n;
  END IF;

END
$apply$;

-- Post-apply check. Lists outside image URLs still stored on the rows above.
-- An outside image URL is an absolute (or protocol-relative) URL whose host is
-- not keepitil.com, including any subdomain, when it sits in an image column
-- (avatar_url, cover_url, cover_mobile_url, highlights, artist_avatar,
-- image_url, hero_image, media), or anywhere in the row if the host is
-- pollinations.ai or the path is an image file.
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
  SELECT 'profile_meta'::text AS source, slug AS row_id, 'avatar_url'::text AS field, avatar_url AS value
    FROM public.profile_meta
   WHERE slug = 'groove-trooper'
  UNION ALL
  SELECT 'profile_meta', slug, 'cover_url', cover_url
    FROM public.profile_meta
   WHERE slug = 'groove-trooper'
  UNION ALL
  SELECT 'profile_meta', slug, 'cover_mobile_url', cover_mobile_url
    FROM public.profile_meta
   WHERE slug = 'groove-trooper'
  UNION ALL
  SELECT 'profile_meta', slug, 'highlights', highlights::text
    FROM public.profile_meta
   WHERE slug = 'groove-trooper'
  UNION ALL
  SELECT 'blog_articles', id::text, 'artist_avatar', artist_avatar
    FROM public.blog_articles
   WHERE id = '7c82ba44-df4f-45e1-be52-4ed4fca7264e'
  UNION ALL
  SELECT 'blog_articles', id::text, 'image_url', image_url
    FROM public.blog_articles
   WHERE id = '7c82ba44-df4f-45e1-be52-4ed4fca7264e'
  UNION ALL
  SELECT 'blog_articles', id::text, 'hero_image', hero_image
    FROM public.blog_articles
   WHERE id = '7c82ba44-df4f-45e1-be52-4ed4fca7264e'
  UNION ALL
  SELECT 'campaign_variants', id::text, 'media', media::text
    FROM public.campaign_variants
   WHERE id IN (6, 7, 8, 9, 10)
),
row_text AS (
  SELECT 'profile_meta'::text AS source, slug AS row_id, row_to_json(p)::text AS value
    FROM public.profile_meta AS p
   WHERE slug = 'groove-trooper'
  UNION ALL
  SELECT 'blog_articles', id::text, row_to_json(b)::text
    FROM public.blog_articles AS b
   WHERE id = '7c82ba44-df4f-45e1-be52-4ed4fca7264e'
  UNION ALL
  SELECT 'campaign_variants', id::text, row_to_json(c)::text
    FROM public.campaign_variants AS c
   WHERE id IN (6, 7, 8, 9, 10)
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
    RAISE EXCEPTION 'outside image URLs still on the Groove Trooper rows (%): %', n, listing;
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
