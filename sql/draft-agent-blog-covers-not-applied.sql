-- NOT APPLIED. Do not run against production from this pull request.
-- agent_blog_posts ids 13, 14, 16, 18. Luna cover map v1.1, primary 1200x630 WebP.
-- Each statement changes one row only if cover_url is still the old Pollinations URL.
-- Expect 1 row each. If any count differs, ROLLBACK.
-- The old images are not copied into this repo.
-- These old URLs stay in this file on purpose: they are the WHERE checks, not pages.

BEGIN;
UPDATE public.agent_blog_posts SET cover_url='/assets/artists/groove-trooper/blog-post-13-1200x630-v1.1.webp'
 WHERE id=13 AND cover_url='https://image.pollinations.ai/prompt/afrobeats%20amapiano%20neon%20dance%20crowd%20purple%20stage%20lights%20abstract%20no%20text?width=1200&height=630&nologo=true';
UPDATE public.agent_blog_posts SET cover_url='/assets/artists/groove-trooper/blog-post-14-1200x630-v1.1.webp'
 WHERE id=14 AND cover_url='https://image.pollinations.ai/prompt/moody%20neon-lit%20country%20acoustic%20guitar%20on%20a%20dark%20stage%2C%20amber%20and%20purple%20stage%20lights%2C%20atmospheric%20haze%2C%20cinematic%2C%20no%20text%2C%20no%20faces?width=1200&height=630&nologo=true&seed=726';
UPDATE public.agent_blog_posts SET cover_url='/assets/artists/groove-trooper/blog-post-16-1200x630-v1.1.webp'
 WHERE id=16 AND cover_url='https://image.pollinations.ai/prompt/underground%20hip%20hop%20studio%20neon%20purple%20teal%20abstract%20soundwaves%20cinematic%20no%20text%20no%20faces?width=1200&height=630&nologo=true&seed=210';
UPDATE public.agent_blog_posts SET cover_url='/assets/artists/groove-trooper/blog-post-18-1200x630-v1.1.webp'
 WHERE id=18 AND cover_url='https://image.pollinations.ai/prompt/abstract%20warm%20amber%20nightclub%20dancefloor%20light%20haze%20deep%20house%20atmosphere%20no%20people%20no%20text%20cinematic%20moody?width=1200&height=630&nologo=true&seed=20260731';
-- Expect: 1,1,1,1. If any count differs, ROLLBACK.
COMMIT;

-- Revert (NOT APPLIED).
BEGIN;
UPDATE public.agent_blog_posts SET cover_url='https://image.pollinations.ai/prompt/afrobeats%20amapiano%20neon%20dance%20crowd%20purple%20stage%20lights%20abstract%20no%20text?width=1200&height=630&nologo=true'
 WHERE id=13 AND cover_url='/assets/artists/groove-trooper/blog-post-13-1200x630-v1.1.webp';
UPDATE public.agent_blog_posts SET cover_url='https://image.pollinations.ai/prompt/moody%20neon-lit%20country%20acoustic%20guitar%20on%20a%20dark%20stage%2C%20amber%20and%20purple%20stage%20lights%2C%20atmospheric%20haze%2C%20cinematic%2C%20no%20text%2C%20no%20faces?width=1200&height=630&nologo=true&seed=726'
 WHERE id=14 AND cover_url='/assets/artists/groove-trooper/blog-post-14-1200x630-v1.1.webp';
UPDATE public.agent_blog_posts SET cover_url='https://image.pollinations.ai/prompt/underground%20hip%20hop%20studio%20neon%20purple%20teal%20abstract%20soundwaves%20cinematic%20no%20text%20no%20faces?width=1200&height=630&nologo=true&seed=210'
 WHERE id=16 AND cover_url='/assets/artists/groove-trooper/blog-post-16-1200x630-v1.1.webp';
UPDATE public.agent_blog_posts SET cover_url='https://image.pollinations.ai/prompt/abstract%20warm%20amber%20nightclub%20dancefloor%20light%20haze%20deep%20house%20atmosphere%20no%20people%20no%20text%20cinematic%20moody?width=1200&height=630&nologo=true&seed=20260731'
 WHERE id=18 AND cover_url='/assets/artists/groove-trooper/blog-post-18-1200x630-v1.1.webp';
COMMIT;
