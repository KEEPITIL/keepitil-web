-- NOT APPLIED. Do not run against production from this pull request.
-- Atlas SELECT 2026-11-06, published events with an outside cover (22 rows).
-- The SELECT listed id, slug, and host. It did not list the full cover_url,
-- so each statement checks the id AND that cover_url still begins with that host.
-- NULL clears the outside image. Discover then draws the KEEPITIL mark and keeps source_url.
-- Run the SELECT first and save it if you need a revert. This file cannot put the old URLs back.

-- SELECT id, slug, status, cover_url
-- FROM public.events
-- WHERE id IN (92,94,96,97,99,100,101,104,107,163,164,165,166,400,401,402,403,404,405,406,407,408)
-- ORDER BY id;

BEGIN;

UPDATE public.events SET cover_url = NULL
 WHERE id = 92 AND cover_url LIKE 'https://images.ra.co%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 94 AND cover_url LIKE 'https://images.ra.co%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 96 AND cover_url LIKE 'https://images.ra.co%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 97 AND cover_url LIKE 'https://images.ra.co%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 99 AND cover_url LIKE 'https://images.ra.co%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 100 AND cover_url LIKE 'https://images.ra.co%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 101 AND cover_url LIKE 'https://images.ra.co%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 104 AND cover_url LIKE 'https://images.ra.co%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 107 AND cover_url LIKE 'https://images.ra.co%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 163 AND cover_url LIKE 'https://d3vhc53cl8e8km.cloudfront.net%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 164 AND cover_url LIKE 'https://reggaeriseup.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 165 AND cover_url LIKE 'https://reggaeriseup.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 166 AND cover_url LIKE 'https://aegwebprod.blob.core.windows.net%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 400 AND cover_url LIKE 'https://seatgeekimages.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 401 AND cover_url LIKE 'https://seatgeekimages.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 402 AND cover_url LIKE 'https://seatgeekimages.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 403 AND cover_url LIKE 'https://seatgeekimages.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 404 AND cover_url LIKE 'https://seatgeekimages.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 405 AND cover_url LIKE 'https://seatgeekimages.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 406 AND cover_url LIKE 'https://seatgeekimages.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 407 AND cover_url LIKE 'https://seatgeekimages.com%';
UPDATE public.events SET cover_url = NULL
 WHERE id = 408 AND cover_url LIKE 'https://seatgeekimages.com%';

-- Expect 22 rows. If the total differs, ROLLBACK.
COMMIT;
