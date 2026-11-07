-- NOT APPLIED. Do not run against production from this pull request.
-- Revert only. Running this file does not apply the new covers.
-- Forward, in its own file: sql/draft-agent-blog-covers-not-applied.sql
--
-- Puts the four Pollinations cover URLs back. Each UPDATE matches the local
-- path this change wrote. Expected updated rows: 1, 1, 1, 1. A different count
-- raises and rolls this transaction back.
-- This file restores the previous host, so it does not use the forward file's
-- outside-image check.
-- The old images are not copied into this repo.

BEGIN;

DO $apply$
DECLARE
  n bigint;
BEGIN
UPDATE public.agent_blog_posts SET cover_url='https://image.pollinations.ai/prompt/afrobeats%20amapiano%20neon%20dance%20crowd%20purple%20stage%20lights%20abstract%20no%20text?width=1200&height=630&nologo=true'
 WHERE id=13 AND cover_url='/assets/artists/groove-trooper/blog-post-13-1200x630-v1.1.webp';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'agent_blog_posts id 13: expected 1 updated row, got %', n;
  END IF;

UPDATE public.agent_blog_posts SET cover_url='https://image.pollinations.ai/prompt/moody%20neon-lit%20country%20acoustic%20guitar%20on%20a%20dark%20stage%2C%20amber%20and%20purple%20stage%20lights%2C%20atmospheric%20haze%2C%20cinematic%2C%20no%20text%2C%20no%20faces?width=1200&height=630&nologo=true&seed=726'
 WHERE id=14 AND cover_url='/assets/artists/groove-trooper/blog-post-14-1200x630-v1.1.webp';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'agent_blog_posts id 14: expected 1 updated row, got %', n;
  END IF;

UPDATE public.agent_blog_posts SET cover_url='https://image.pollinations.ai/prompt/underground%20hip%20hop%20studio%20neon%20purple%20teal%20abstract%20soundwaves%20cinematic%20no%20text%20no%20faces?width=1200&height=630&nologo=true&seed=210'
 WHERE id=16 AND cover_url='/assets/artists/groove-trooper/blog-post-16-1200x630-v1.1.webp';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'agent_blog_posts id 16: expected 1 updated row, got %', n;
  END IF;

UPDATE public.agent_blog_posts SET cover_url='https://image.pollinations.ai/prompt/abstract%20warm%20amber%20nightclub%20dancefloor%20light%20haze%20deep%20house%20atmosphere%20no%20people%20no%20text%20cinematic%20moody?width=1200&height=630&nologo=true&seed=20260731'
 WHERE id=18 AND cover_url='/assets/artists/groove-trooper/blog-post-18-1200x630-v1.1.webp';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'agent_blog_posts id 18: expected 1 updated row, got %', n;
  END IF;

END
$apply$;

COMMIT;
