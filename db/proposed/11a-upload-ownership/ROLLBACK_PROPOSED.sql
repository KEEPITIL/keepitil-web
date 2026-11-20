-- 11A rollback. PROPOSED, NOT APPLIED.
-- ORDER: first redeploy agent-tool-invoke v44 (or any build that does not call can_upload_event_media).
-- The patched upload_event_photo fails CLOSED when this function is missing (every upload errors), so
-- dropping the function before reverting the edge tool turns uploads off rather than open.
begin;
drop function if exists public.can_upload_event_media(text);
commit;
