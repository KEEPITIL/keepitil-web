-- replica-10a-add.sql : applied AFTER replica-91.sql and replica-92-add.sql. Stand-ins for slice 10A only (PGlite, in memory, nothing hosted).
-- Every object here is a STAND-IN: the real bodies/policies were not readable (no prod access). Marked where it matters.

-- pg_cron stand-in so PRECHECK-10A block E3 (cron.job) parses. Empty, like prod (P-18: no job mentions these tables).
create schema cron;
create table cron.job(jobid int, jobname text, command text);

-- events: an RLS policy that REFERENCES submitted_by. The real events_owner_read / events_auth_insert expressions were not captured; Atlas's MF2 names
-- "submitted_by = caller" as the ownership pattern, so this is the worst case for revoking the column: the policy must keep working without the caller's column privilege.
create policy events_submitter_read on public.events for select to public using (submitted_by = auth.uid());

-- get_event_view stand-in. LIVE BODY NOT CAPTURED (that is why REVIEW-TEMPLATE-get_event_view-organizer-mask_PROPOSED.sql is a template). SECURITY DEFINER, search_path=public;
-- it reads submitted_by the way a definer may, so the proof can show a definer path survives the column revoke.
create function public.get_event_view(p_slug text) returns table(slug text, title text, starts_at timestamptz, owner_handle text, has_submitter boolean)
  language sql stable security definer set search_path = public as $$
  select e.slug, e.title, e.starts_at, e.owner_handle, (e.submitted_by is not null) from public.events e where e.slug = p_slug and e.status = 'published' $$;

-- profile_content policies: replica-91 shipped one loose stand-in ("pc_owner_write ... with check (true)"). PRECHECK-RESULTS P-9 says: "read all" (public, true) and insert/update/delete OWN
-- (authenticated, via profile_owners). Replace the stand-in with per-command own-policies so the proof can show a stranger is still refused by RLS.
drop policy pc_owner_write on public.profile_content;
create policy "profile_content insert own" on public.profile_content for insert to authenticated
  with check (exists (select 1 from public.profile_owners o where o.profile_slug = profile_content.profile_slug and o.owner_id = auth.uid()));
create policy "profile_content update own" on public.profile_content for update to authenticated
  using (exists (select 1 from public.profile_owners o where o.profile_slug = profile_content.profile_slug and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.profile_owners o where o.profile_slug = profile_content.profile_slug and o.owner_id = auth.uid()));
create policy "profile_content delete own" on public.profile_content for delete to authenticated
  using (exists (select 1 from public.profile_owners o where o.profile_slug = profile_content.profile_slug and o.owner_id = auth.uid()));
