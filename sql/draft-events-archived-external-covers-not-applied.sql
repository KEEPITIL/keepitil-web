-- NOT APPLIED. Optional. Do not run against production from this pull request.
-- Atlas counted outside covers on events that are not in the published list of 22
-- (archived Resident Advisor rows were cited as examples). Those ids were not returned.
-- This clears the same outside hosts on every non-published row, and only when cover_url
-- still starts with one of those hosts. Published rows are left to
-- sql/draft-events-published-external-covers-not-applied.sql.
-- Save a SELECT of id, status, cover_url first if you need to revert.

BEGIN;

UPDATE public.events
SET cover_url = NULL
WHERE status IS DISTINCT FROM 'published'
  AND (
       cover_url LIKE 'https://images.ra.co%'
    OR cover_url LIKE 'https://seatgeekimages.com%'
    OR cover_url LIKE 'https://reggaeriseup.com%'
    OR cover_url LIKE 'https://aegwebprod.blob.core.windows.net%'
    OR cover_url LIKE 'https://d3vhc53cl8e8km.cloudfront.net%'
  );

COMMIT;
