-- 11A / MF2 (Atlas): upload ownership boundary. PROPOSED, NOT APPLIED. Needs Sentinel's pass and Joe's relayed approval.
--
-- public.can_upload_event_media(p_event_slug text) -> boolean
--
-- True only when the CALLER (auth.uid(), i.e. the verified JWT subject) owns the event:
--     events.submitted_by = auth.uid()
--  OR EXISTS (profile_owners: profile_slug = events.owner_handle AND owner_id = auth.uid())
-- which is exactly the non-admin ownership pattern of the live events_owner_read policy (Atlas MF2).
--
-- Why a SECURITY DEFINER function and not a caller-RLS read of events.submitted_by:
--   10A APPLY-1C revokes SELECT (submitted_by) on public.events from anon/authenticated. A caller-RLS
--   read of that column would then fail. The function runs as its owner (postgres), so it still reads
--   submitted_by and profile_owners (whose anon/authenticated reads 1C also narrows), and it sees
--   draft/review parents that the caller's own RLS may hide from them (draft-parent owners must pass).
--
-- Hardening:
--   * search_path pinned to '' and every reference schema-qualified (immune to search_path shadowing).
--   * identity comes from auth.uid() inside the function; the only parameter is the event slug. There is
--     no subject/handle parameter to spoof.
--   * returns boolean only: submitted_by / owner ids never leave the function. A nonexistent event and a
--     non-owned event are indistinguishable (both false).
--   * REVOKE ALL from PUBLIC, anon, authenticated, service_role, then GRANT EXECUTE to authenticated only.
--   * STABLE, no writes, no dynamic SQL.
-- Idempotent (CREATE OR REPLACE). ROLLBACK_PROPOSED.sql removes it.

begin;

create or replace function public.can_upload_event_media(p_event_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and p_event_slug is not null
     and exists (
       select 1
         from public.events e
        where e.slug = p_event_slug
          and (
                e.submitted_by = auth.uid()
             or exists (
                  select 1
                    from public.profile_owners po
                   where po.profile_slug = e.owner_handle
                     and po.owner_id = auth.uid()
                )
          )
     );
$$;

revoke all on function public.can_upload_event_media(text) from public, anon, authenticated, service_role;
grant execute on function public.can_upload_event_media(text) to authenticated;

comment on function public.can_upload_event_media(text) is
  '11A/MF2: true iff auth.uid() is the event submitter or owns the event''s owner_handle profile (profile_owners). Boolean only; never exposes submitted_by. Called by agent-tool-invoke upload_event_photo BEFORE storage signing.';

-- post-assert: fail the whole transaction if the grants are not exactly authenticated-only.
do $$
begin
  if has_function_privilege('anon', 'public.can_upload_event_media(text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.can_upload_event_media(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.can_upload_event_media(text)', 'EXECUTE') then
    raise exception '11A post-assert: can_upload_event_media grants are not authenticated-only';
  end if;
  if (select prorettype::regtype::text from pg_proc where oid = 'public.can_upload_event_media(text)'::regprocedure) <> 'boolean' then
    raise exception '11A post-assert: return type is not boolean';
  end if;
end $$;

commit;
