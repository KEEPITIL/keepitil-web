-- DRAFT ONLY. Do not apply to production from this change.
-- Atlas / Sentinel: review, then run by hand if the stored Groove Trooper
-- profile still points at outside image hosts.
--
-- The public page already rewrites these file ids in the browser. This file
-- updates the stored rows so the database stops holding them.
-- Host names are not written here. Matches are the file ids from Luna's slot map.
-- Confirm column types (json vs jsonb) before running. profile_meta.highlights
-- is read by the site as a JSON array of {label, img, alt}.

BEGIN;

UPDATE public.profile_meta
SET avatar_url = '/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp'
WHERE slug = 'groove-trooper'
  AND avatar_url LIKE '%680248119_960171736974630%';

UPDATE public.profile_meta
SET cover_url = '/assets/artists/groove-trooper/groove-trooper-cover-desktop-v1.0.webp',
    cover_mobile_url = COALESCE(
      NULLIF(cover_mobile_url, ''),
      '/assets/artists/groove-trooper/groove-trooper-cover-mobile-v1.0.webp'
    )
WHERE slug = 'groove-trooper'
  AND cover_url LIKE '%06c4bb3109109df1dad229582219f4ded15b11d4%';

UPDATE public.profile_meta
SET cover_mobile_url = '/assets/artists/groove-trooper/groove-trooper-cover-mobile-v1.0.webp'
WHERE slug = 'groove-trooper'
  AND cover_mobile_url LIKE '%06c4bb3109109df1dad229582219f4ded15b11d4%';

-- Square highlight art for the six editorial circles. Gallery studies that share
-- a file id are a different slot and are handled on profile_content below.
UPDATE public.profile_meta AS p
SET highlights = mapped.new_highlights
FROM (
  SELECT m.slug,
         jsonb_agg(
           CASE
             WHEN elem->>'img' LIKE '%0c08978993ce4ba443b61b007d1de45445ddced3%' THEN
               jsonb_set(jsonb_set(elem, '{img}', to_jsonb('/assets/artists/groove-trooper/groove-trooper-highlight-01-v1.0.webp'::text), true),
                         '{alt}', to_jsonb('Groove Trooper in white lettering with blue abstract grooves for the Groove Cruise editorial highlight; not a photograph.'::text), true)
             WHEN elem->>'img' LIKE '%095b3c97c806dfa2326c4bc5a8239907b4a24815%' THEN
               jsonb_set(jsonb_set(elem, '{img}', to_jsonb('/assets/artists/groove-trooper/groove-trooper-highlight-02-v1.0.webp'::text), true),
                         '{alt}', to_jsonb('Groove Trooper in white lettering with blue abstract grooves for the Avalon editorial highlight; not a photograph.'::text), true)
             WHEN elem->>'img' LIKE '%234c570dd0c0ce4c93d62945d502ef1952b2cf31%' THEN
               jsonb_set(jsonb_set(elem, '{img}', to_jsonb('/assets/artists/groove-trooper/groove-trooper-highlight-03-v1.0.webp'::text), true),
                         '{alt}', to_jsonb('Groove Trooper in white lettering with blue abstract grooves for the R&V Radio editorial highlight; not a photograph.'::text), true)
             WHEN elem->>'img' LIKE '%233912b5340b79213e16e58647ecd297165d0a52%' THEN
               jsonb_set(jsonb_set(elem, '{img}', to_jsonb('/assets/artists/groove-trooper/groove-trooper-highlight-04-v1.0.webp'::text), true),
                         '{alt}', to_jsonb('Groove Trooper in white lettering with blue abstract grooves for the Kingdom editorial highlight; not a photograph.'::text), true)
             WHEN elem->>'img' LIKE '%1bfc214a7b4917efac1afad318fd4dafa631a480%' THEN
               jsonb_set(jsonb_set(elem, '{img}', to_jsonb('/assets/artists/groove-trooper/groove-trooper-highlight-05-v1.0.webp'::text), true),
                         '{alt}', to_jsonb('Groove Trooper in white lettering with blue abstract grooves for the Studio editorial highlight; not a photograph.'::text), true)
             WHEN elem->>'img' LIKE '%0eb69717593e6bb32225fec905e93762454a7894%' THEN
               jsonb_set(jsonb_set(elem, '{img}', to_jsonb('/assets/artists/groove-trooper/groove-trooper-highlight-06-v1.0.webp'::text), true),
                         '{alt}', to_jsonb('Groove Trooper in white lettering with blue abstract grooves for the Festivals editorial highlight; not a photograph.'::text), true)
             ELSE elem
           END
           ORDER BY ord
         ) AS new_highlights
  FROM public.profile_meta AS m
  CROSS JOIN LATERAL jsonb_array_elements(m.highlights::jsonb) WITH ORDINALITY AS e(elem, ord)
  WHERE m.slug = 'groove-trooper'
    AND m.highlights IS NOT NULL
    AND jsonb_typeof(m.highlights::jsonb) = 'array'
  GROUP BY m.slug
) AS mapped
WHERE p.slug = mapped.slug;

-- Feed and gallery rows. A shared file id uses the 9:16 gallery study here,
-- not the square highlight, because profile_content photos render as feed cards.
UPDATE public.profile_content
SET data = regexp_replace(
             regexp_replace(
             regexp_replace(
             regexp_replace(
             regexp_replace(
             regexp_replace(
             regexp_replace(
             regexp_replace(
             regexp_replace(
             regexp_replace(
               data::text,
               '[^"[:space:]]*06c4bb3109109df1dad229582219f4ded15b11d4[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-cover-desktop-v1.0.webp', 'g'),
               '[^"[:space:]]*0c08978993ce4ba443b61b007d1de45445ddced3[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-gallery-03-v1.0.webp', 'g'),
               '[^"[:space:]]*095b3c97c806dfa2326c4bc5a8239907b4a24815[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-gallery-02-v1.0.webp', 'g'),
               '[^"[:space:]]*234c570dd0c0ce4c93d62945d502ef1952b2cf31[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-gallery-08-v1.0.webp', 'g'),
               '[^"[:space:]]*233912b5340b79213e16e58647ecd297165d0a52[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-gallery-07-v1.0.webp', 'g'),
               '[^"[:space:]]*1bfc214a7b4917efac1afad318fd4dafa631a480[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-gallery-06-v1.0.webp', 'g'),
               '[^"[:space:]]*0eb69717593e6bb32225fec905e93762454a7894[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-gallery-04-v1.0.webp', 'g'),
               '[^"[:space:]]*07f9c05ddcb8a49e9f957760d870ec493b30a4d9[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-gallery-01-v1.0.webp', 'g'),
               '[^"[:space:]]*1641a2b8fddcee60bb204595abe0a3f20d8a0e51[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-gallery-05-v1.0.webp', 'g'),
               '[^"[:space:]]*288b5245302955ed0864e6f9dad31af0a092984c[^"[:space:]]*',
               '/assets/artists/groove-trooper/groove-trooper-gallery-09-v1.0.webp', 'g')::jsonb
WHERE profile_slug = 'groove-trooper'
  AND data::text ~ '06c4bb3109109df1dad229582219f4ded15b11d4|0c08978993ce4ba443b61b007d1de45445ddced3|095b3c97c806dfa2326c4bc5a8239907b4a24815|234c570dd0c0ce4c93d62945d502ef1952b2cf31|233912b5340b79213e16e58647ecd297165d0a52|1bfc214a7b4917efac1afad318fd4dafa631a480|0eb69717593e6bb32225fec905e93762454a7894|07f9c05ddcb8a49e9f957760d870ec493b30a4d9|1641a2b8fddcee60bb204595abe0a3f20d8a0e51|288b5245302955ed0864e6f9dad31af0a092984c|680248119_960171736974630';

UPDATE public.profile_content
SET data = regexp_replace(
  data::text,
  '[^"[:space:]]*680248119_960171736974630[^"[:space:]]*',
  '/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp',
  'g')::jsonb
WHERE profile_slug = 'groove-trooper'
  AND data::text LIKE '%680248119_960171736974630%';

-- ROLLBACK;
COMMIT;
