-- NOT APPLIED. Atlas SELECT 2026-11-06, rewritten with the committed art paths.
-- Do not run against production from this pull request.
-- Placeholders /assets/luna/... are replaced with assets/artists/groove-trooper/.
-- Each UPDATE keeps Atlas's old-value check in the WHERE.
-- Expect 1, 1, 1, 1, 5 rows. If any count differs, ROLLBACK.
--
-- avatar / blog_articles.artist_avatar / campaign media:
--   /assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp
-- cover:
--   /assets/artists/groove-trooper/groove-trooper-cover-desktop-v1.0.webp
-- highlights, in Atlas's order:
--   highlight-01 Groove Cruise, 02 Avalon, 03 R&V Radio,
--   04 Kingdom, 05 Studio, 06 Festivals

BEGIN;
UPDATE public.profile_meta SET avatar_url='/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp'
 WHERE slug='groove-trooper' AND avatar_url='https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg';
UPDATE public.profile_meta SET cover_url='/assets/artists/groove-trooper/groove-trooper-cover-desktop-v1.0.webp'
 WHERE slug='groove-trooper' AND cover_url='https://images.ra.co/06c4bb3109109df1dad229582219f4ded15b11d4.jpg';
UPDATE public.profile_meta SET highlights='[{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-01-v1.0.webp","label":"Groove Cruise"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-02-v1.0.webp","label":"Avalon"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-03-v1.0.webp","label":"R&V Radio"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-04-v1.0.webp","label":"Kingdom"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-05-v1.0.webp","label":"Studio"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-06-v1.0.webp","label":"Festivals"}]'::jsonb
 WHERE slug='groove-trooper' AND highlights='[{"img":"https://images.ra.co/0c08978993ce4ba443b61b007d1de45445ddced3.jpg","label":"Groove Cruise"},{"img":"https://images.ra.co/095b3c97c806dfa2326c4bc5a8239907b4a24815.jpg","label":"Avalon"},{"img":"https://images.ra.co/234c570dd0c0ce4c93d62945d502ef1952b2cf31.jpg","label":"R&V Radio"},{"img":"https://images.ra.co/233912b5340b79213e16e58647ecd297165d0a52.jpg","label":"Kingdom"},{"img":"https://images.ra.co/1bfc214a7b4917efac1afad318fd4dafa631a480.jpg","label":"Studio"},{"img":"https://images.ra.co/0eb69717593e6bb32225fec905e93762454a7894.jpg","label":"Festivals"}]'::jsonb;
UPDATE public.blog_articles SET artist_avatar='/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp'
 WHERE id='7c82ba44-df4f-45e1-be52-4ed4fca7264e' AND artist_avatar='https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg';
UPDATE public.campaign_variants SET media='[{"url":"/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp"}]'::jsonb
 WHERE id IN (6,7,8,9,10) AND media='[{"url":"https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg"}]'::jsonb;
-- Expect: 1,1,1,1,5 rows. If any count differs, ROLLBACK.
COMMIT;

-- Revert (NOT APPLIED). Run only after the update above, and only to put those five statements back.
BEGIN;
UPDATE public.profile_meta SET avatar_url='https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg' WHERE slug='groove-trooper' AND avatar_url='/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp';
UPDATE public.profile_meta SET cover_url='https://images.ra.co/06c4bb3109109df1dad229582219f4ded15b11d4.jpg' WHERE slug='groove-trooper' AND cover_url='/assets/artists/groove-trooper/groove-trooper-cover-desktop-v1.0.webp';
UPDATE public.profile_meta SET highlights='[{"img":"https://images.ra.co/0c08978993ce4ba443b61b007d1de45445ddced3.jpg","label":"Groove Cruise"},{"img":"https://images.ra.co/095b3c97c806dfa2326c4bc5a8239907b4a24815.jpg","label":"Avalon"},{"img":"https://images.ra.co/234c570dd0c0ce4c93d62945d502ef1952b2cf31.jpg","label":"R&V Radio"},{"img":"https://images.ra.co/233912b5340b79213e16e58647ecd297165d0a52.jpg","label":"Kingdom"},{"img":"https://images.ra.co/1bfc214a7b4917efac1afad318fd4dafa631a480.jpg","label":"Studio"},{"img":"https://images.ra.co/0eb69717593e6bb32225fec905e93762454a7894.jpg","label":"Festivals"}]'::jsonb
 WHERE slug='groove-trooper' AND highlights='[{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-01-v1.0.webp","label":"Groove Cruise"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-02-v1.0.webp","label":"Avalon"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-03-v1.0.webp","label":"R&V Radio"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-04-v1.0.webp","label":"Kingdom"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-05-v1.0.webp","label":"Studio"},{"img":"/assets/artists/groove-trooper/groove-trooper-highlight-06-v1.0.webp","label":"Festivals"}]'::jsonb;
UPDATE public.blog_articles SET artist_avatar='https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg' WHERE id='7c82ba44-df4f-45e1-be52-4ed4fca7264e' AND artist_avatar='/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp';
UPDATE public.campaign_variants SET media='[{"url":"https://img1.wsimg.com/isteam/ip/403cc31a-6001-42de-a0a3-68f197acd538/680248119_960171736974630_4503929345921155632_.jpg"}]'::jsonb WHERE id IN (6,7,8,9,10) AND media='[{"url":"/assets/artists/groove-trooper/groove-trooper-avatar-v1.0.webp"}]'::jsonb;
COMMIT;
