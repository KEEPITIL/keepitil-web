-- ADDED BY THE PR AUTHOR (Claude), NOT part of Atlas's document. READ-ONLY, counts only, no row content.
-- Why: Atlas's FORWARD removes the old "already published -> return early" branch of public.profile_meta_publish_gate().
-- After that, EVERY write to a published row (including a service/postgres backfill that only touches updated_at or a new
-- column, e.g. PR #91's APPLY-1 UPDATEs) runs the full completeness checks and raises check_violation if the row does not
-- satisfy them. Run this against production READ-ONLY, by Atlas/Sentinel, before any apply (and before PR #91 step 1 if
-- this proposal lands first). Expect published_failing_gate = 0; anything else needs a data fix (done separately, with
-- approval) or a decision to keep the early return for trusted roles.
-- Mirrors the checks in the gate function from the FORWARD file; keep the two in sync if the function changes.
SELECT
  count(*) FILTER (WHERE status = 'published') AS published_rows,
  count(*) FILTER (WHERE status = 'published' AND NOT (
        nullif(btrim(coalesce(display_name,'')),'') IS NOT NULL
    AND account_type IS NOT NULL
    AND nullif(btrim(coalesce(entity_category,'')),'') IS NOT NULL
    AND CASE WHEN jsonb_typeof(sources) = 'array' THEN EXISTS (
          SELECT 1 FROM jsonb_array_elements(sources) s
          WHERE coalesce(s->>'url','') <> '' AND (s->>'http_status') = '200') ELSE false END
    AND nullif(btrim(coalesce(about, bio, '')),'') IS NOT NULL
    AND last_reviewed_at IS NOT NULL
    AND ( (CASE WHEN nullif(btrim(coalesce(avatar_url,'')),'') IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN nullif(btrim(coalesce(location,'')),'') IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN nullif(btrim(coalesce(entity_category,'')),'') IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN jsonb_typeof(socials) = 'object' AND socials <> '{}'::jsonb THEN 1 ELSE 0 END)
        + (CASE WHEN jsonb_typeof(links) = 'array' AND jsonb_array_length(links) > 0 THEN 1 ELSE 0 END) ) >= 2
  )) AS published_failing_gate
FROM public.profile_meta;
