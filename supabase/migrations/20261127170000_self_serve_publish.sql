-- Self-serve publish (REVISED against the real keepitil-prod schema, 2026-11-27). NOT APPLIED by deploying the website.
-- Apply on keepitil-prod (ovmqtzjfpzrbzrlkxwgw) only after a backup and Grok's sha GO + Joe's GO. Rollback: 20261127170000_self_serve_publish.rollback.sql.
--
-- What changed from the first draft (review of #505 by Grok, 3:05 PM):
--   * WRITES ARE RPC-ONLY. No owner insert/update RLS policy and no new table grant is created, so a signed-in user cannot PATCH
--     featured / source / link_status / event_password_hash / cover_url / status on public.events directly. Only the three RPCs below write,
--     and they write a fixed column list.
--   * PAID TICKETS NEED PAYOUTS: a tier with price_cents > 0 is refused unless the caller is an admin or app_users.payouts_enabled.
--   * REAL SCHEMA, no information_schema guessing: owner columns are events.submitted_by (uuid) + events.owner_handle; paid orders are
--     public.event_orders (event_id, status, tier_id); tiers are public.ticket_tiers (no event_tiers, no public.orders, no public.tickets).
--   * THE "HAS SALES" GUARD FAILS CLOSED: any event_orders row, or any tier with qty_sold > 0, locks the tiers; the lookup is plain SQL with no
--     exception handler, so an error stops the write instead of letting it through.
--   * OWNERSHIP: submitted_by = auth.uid() is set on insert and used in the check. A legacy row (submitted_by null) still belongs to the member whose
--     handle is in owner_handle. A handle is required to publish.
--   * No "when others" fallback to the admin RPCs: these RPCs do the work themselves and keep events_apply_extras (ends_at, spotify/youtube, features,
--     gallery, password) and the tier fields sales_start / sales_end / show_qty / sort.
--   * PER-USER PUBLISH CAP: 10 new events per rolling 24 hours (a series counts one per date).
--   * Status on update is NOT forced: a published event stays published, a taken-down (archived / cancelled / past) or in-review event is not
--     reopened by its owner. Only admins can edit those through these RPCs.
--   * ticket_tiers: the pre-existing policy tiers_owner_insert lets an owner insert tiers (with any price) straight into the table, which would bypass the
--     payouts rule above. Every tier write now goes through the RPCs (no client code inserts into ticket_tiers directly; checked 2026-11-27), so the policy is dropped
--     here. The rollback file recreates it exactly as found.

create or replace function public.kil_bad_link(v text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(btrim(v), '') <> '' and btrim(v) !~* '^https://\S+$';
$$;

-- The caller's handle (null when signed out or the member row has none).
create or replace function public.kil_caller_handle()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.handle from public.app_users a where a.id = auth.uid() limit 1;
$$;

-- True only when the caller owns public.events.id. Fails closed: no caller, no row, no owner = false.
create or replace function public.kil_row_owned(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.submitted_by = auth.uid()
        or (e.submitted_by is null and e.owner_handle is not null and e.owner_handle = public.kil_caller_handle())
    from public.events e where e.id = p_id
  ), false) and auth.uid() is not null;
$$;

-- True when an event has any paid order or any sold ticket. NO exception handler: if this cannot be answered the write fails (closed).
create or replace function public.kil_event_has_sales(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.event_orders o where o.event_id = p_id)
      or exists (select 1 from public.ticket_tiers t where t.event_id = p_id and coalesce(t.qty_sold, 0) > 0);
$$;

-- Tiers are valid and priced only for admins or members whose payouts are enabled. Returns an error code or null.
create or replace function public.kil_tiers_problem(p_tiers jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t jsonb;
  priced boolean := false;
  n int := 0;
  price numeric;
begin
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' then
    return null;
  end if;
  for t in select * from jsonb_array_elements(p_tiers) loop
    n := n + 1;
    if n > 10 then return 'too_many_tiers'; end if;
    if coalesce(t->>'price_cents', '') !~ '^[0-9]{1,7}$' and coalesce(t->>'price_cents', '') <> '' then return 'bad_price'; end if;
    price := coalesce(nullif(t->>'price_cents', ''), '0')::numeric;
    if price > 0 then priced := true; end if;
    if coalesce(t->>'qty_total', '') <> '' and t->>'qty_total' !~ '^[0-9]{1,6}$' then return 'bad_quantity'; end if;
  end loop;
  if priced and not (public.is_admin() or coalesce((select a.payouts_enabled from public.app_users a where a.id = auth.uid()), false)) then
    return 'payouts_required';
  end if;
  return null;
end;
$$;

-- Rolling 24 hour cap on events a member publishes (admins are not capped).
create or replace function public.kil_publish_room(p_adding int)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or (
    select count(*) from public.events e where e.submitted_by = auth.uid() and e.created_at > now() - interval '24 hours'
  ) + greatest(coalesce(p_adding, 1), 1) <= 10;
$$;

create or replace function public.kil_err(p_code text, p_message text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('error', p_code, 'message', p_message);
$$;

-- Inserts one owned, published event with its tiers. Internal (not granted to any client role).
create or replace function public.kil_insert_event(p_uid uuid, p_handle text, p_ev jsonb, p_tiers jsonb, p_starts timestamptz, p_series uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_slug text;
  v_base text;
  t jsonb;
  idx int := 0;
begin
  v_base := left(trim(both '-' from regexp_replace(lower(coalesce(p_ev->>'title', 'event')), '[^a-z0-9]+', '-', 'g')), 60);
  if v_base is null or v_base = '' then v_base := 'event'; end if;
  loop
    v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
    exit when not exists (select 1 from public.events where slug = v_slug);
  end loop;
  insert into public.events (slug, owner_handle, submitted_by, title, tagline, description, venue, city, starts_at, cover_url, genres, reg_questions,
                             show_lineup, show_gallery, show_feed, series_id, status, source)
  values (v_slug, p_handle, p_uid, btrim(p_ev->>'title'), nullif(btrim(coalesce(p_ev->>'tagline', '')), ''), nullif(btrim(coalesce(p_ev->>'description', '')), ''),
          nullif(btrim(coalesce(p_ev->>'venue', '')), ''), coalesce(nullif(btrim(coalesce(p_ev->>'city', '')), ''), 'Los Angeles'), p_starts,
          nullif(btrim(coalesce(p_ev->>'cover_url', '')), ''), nullif(btrim(coalesce(p_ev->>'genres', '')), ''),
          case when jsonb_typeof(p_ev->'reg_questions') = 'array' then p_ev->'reg_questions' else null end,
          coalesce((p_ev->>'show_lineup')::boolean, true), coalesce((p_ev->>'show_gallery')::boolean, true), coalesce((p_ev->>'show_feed')::boolean, true),
          p_series, 'published', 'organizer')
  returning id into v_id;
  -- ends_at, end_time_public, waitlist, spotify / youtube, fonts, features, gallery, password (existing helper, unchanged)
  perform public.events_apply_extras(v_id, case when p_series is null then coalesce(p_ev, '{}'::jsonb) else coalesce(p_ev, '{}'::jsonb) - 'ends_at' end);
  if jsonb_typeof(p_tiers) = 'array' then
    for t in select * from jsonb_array_elements(p_tiers) loop
      insert into public.ticket_tiers (event_id, name, description, price_cents, qty_total, sales_start, sales_end, show_qty, sort)
      values (v_id, left(coalesce(nullif(btrim(t->>'name'), ''), 'General Admission'), 120), nullif(btrim(coalesce(t->>'description', '')), ''),
              coalesce(nullif(t->>'price_cents', '')::int, 0), nullif(t->>'qty_total', '')::int,
              nullif(t->>'sales_start', '')::timestamptz, nullif(t->>'sales_end', '')::timestamptz, coalesce((t->>'show_qty')::boolean, false), idx);
      idx := idx + 1;
    end loop;
  end if;
  return jsonb_build_object('id', v_id, 'event_id', v_id, 'slug', v_slug, 'status', 'published');
end;
$$;

create or replace function public.kil_publish_own_event(ev jsonb, tiers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h text;
  starts timestamptz;
  problem text;
begin
  if uid is null then return public.kil_err('not_authenticated', 'Sign in to create an event.'); end if;
  h := public.kil_caller_handle();
  if h is null or btrim(h) = '' then return public.kil_err('handle_required', 'Choose a profile handle before you create an event.'); end if;
  if ev is null or btrim(coalesce(ev->>'title', '')) = '' or char_length(ev->>'title') > 160 then return public.kil_err('title_required', 'Add an event name (up to 160 characters).'); end if;
  if public.kil_bad_link(ev->>'cover_url') or public.kil_bad_link(ev->>'spotify_url') or public.kil_bad_link(ev->>'youtube_url') then
    return public.kil_err('bad_link', 'Links must start with https://.');
  end if;
  begin
    starts := nullif(btrim(coalesce(ev->>'starts_at', '')), '')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    starts := null;
  end;
  if starts is null then return public.kil_err('starts_at_required', 'Add a valid start date and time.'); end if;
  problem := public.kil_tiers_problem(tiers);
  if problem = 'payouts_required' then return public.kil_err(problem, 'Set up payouts before you sell paid tickets. Free tickets need no setup.'); end if;
  if problem is not null then return public.kil_err(problem, 'Check the ticket tiers and try again.'); end if;
  if not public.kil_publish_room(1) then return public.kil_err('publish_limit', 'You can publish up to 10 events per day. Try again tomorrow or email info@keepitil.com.'); end if;
  return public.kil_insert_event(uid, h, ev, coalesce(tiers, '[]'::jsonb), starts, null);
end;
$$;

create or replace function public.kil_update_own_event(p_slug text, ev jsonb, tiers jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  eid bigint;
  st text;
  problem text;
  sales boolean;
  t jsonb;
  idx int := 0;
  admin boolean := public.is_admin();
begin
  if uid is null then return public.kil_err('not_authenticated', 'Sign in to edit an event.'); end if;
  if p_slug is null or p_slug = '' then return public.kil_err('slug_required', 'Missing event.'); end if;
  select id, status into eid, st from public.events where slug = p_slug;
  if eid is null then return public.kil_err('not_found', 'Event not found.'); end if;
  if not (public.kil_row_owned(eid) or admin) then return public.kil_err('forbidden', 'This is not your event.'); end if;
  if st not in ('draft', 'published', 'sold_out') and not admin then
    return public.kil_err('not_editable', 'This event is not open for editing here. Email info@keepitil.com.');
  end if;
  ev := coalesce(ev, '{}'::jsonb);
  if public.kil_bad_link(ev->>'cover_url') or public.kil_bad_link(ev->>'spotify_url') or public.kil_bad_link(ev->>'youtube_url') then
    return public.kil_err('bad_link', 'Links must start with https://.');
  end if;
  if ev ? 'title' and (btrim(coalesce(ev->>'title', '')) = '' or char_length(ev->>'title') > 160) then return public.kil_err('title_required', 'Add an event name (up to 160 characters).'); end if;
  problem := public.kil_tiers_problem(tiers);
  if problem = 'payouts_required' then return public.kil_err(problem, 'Set up payouts before you sell paid tickets. Free tickets need no setup.'); end if;
  if problem is not null then return public.kil_err(problem, 'Check the ticket tiers and try again.'); end if;
  update public.events set
    title       = coalesce(nullif(btrim(ev->>'title'), ''), title),
    tagline     = case when ev ? 'tagline' then nullif(btrim(coalesce(ev->>'tagline', '')), '') else tagline end,
    description = case when ev ? 'description' then nullif(btrim(coalesce(ev->>'description', '')), '') else description end,
    venue       = case when ev ? 'venue' then nullif(btrim(coalesce(ev->>'venue', '')), '') else venue end,
    city        = coalesce(nullif(btrim(coalesce(ev->>'city', '')), ''), city),
    starts_at   = case when nullif(btrim(coalesce(ev->>'starts_at', '')), '') is not null then (ev->>'starts_at')::timestamptz else starts_at end,
    cover_url   = case when ev ? 'cover_url' then nullif(btrim(coalesce(ev->>'cover_url', '')), '') else cover_url end,
    genres      = case when ev ? 'genres' then nullif(btrim(coalesce(ev->>'genres', '')), '') else genres end,
    show_lineup = case when ev ? 'show_lineup' then coalesce((ev->>'show_lineup')::boolean, show_lineup) else show_lineup end,
    show_gallery= case when ev ? 'show_gallery' then coalesce((ev->>'show_gallery')::boolean, show_gallery) else show_gallery end,
    show_feed   = case when ev ? 'show_feed' then coalesce((ev->>'show_feed')::boolean, show_feed) else show_feed end,
    reg_questions = case when ev ? 'reg_questions' and jsonb_typeof(ev->'reg_questions') = 'array' then ev->'reg_questions' else reg_questions end
  where id = eid;
  perform public.events_apply_extras(eid, ev);
  sales := public.kil_event_has_sales(eid);   -- plain SQL: an error here aborts the write (fails closed)
  if tiers is not null and jsonb_typeof(tiers) = 'array' and not sales then
    delete from public.ticket_tiers where event_id = eid;
    for t in select * from jsonb_array_elements(tiers) loop
      insert into public.ticket_tiers (event_id, name, description, price_cents, qty_total, sales_start, sales_end, show_qty, sort)
      values (eid, left(coalesce(nullif(btrim(t->>'name'), ''), 'General Admission'), 120), nullif(btrim(coalesce(t->>'description', '')), ''),
              coalesce(nullif(t->>'price_cents', '')::int, 0), nullif(t->>'qty_total', '')::int,
              nullif(t->>'sales_start', '')::timestamptz, nullif(t->>'sales_end', '')::timestamptz, coalesce((t->>'show_qty')::boolean, false), idx);
      idx := idx + 1;
    end loop;
  end if;
  return jsonb_build_object('slug', p_slug, 'event_id', eid, 'status', st, 'tiers_updated', (tiers is not null and not sales));
end;
$$;

create or replace function public.kil_publish_own_series(ev jsonb, tiers jsonb, dates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h text;
  n int;
  d text;
  starts timestamptz;
  sid uuid := pg_catalog.gen_random_uuid();
  one jsonb;
  slugs jsonb := '[]'::jsonb;
  first_id bigint;
  problem text;
begin
  if uid is null then return public.kil_err('not_authenticated', 'Sign in to create an event.'); end if;
  h := public.kil_caller_handle();
  if h is null or btrim(h) = '' then return public.kil_err('handle_required', 'Choose a profile handle before you create an event.'); end if;
  if ev is null or btrim(coalesce(ev->>'title', '')) = '' or char_length(ev->>'title') > 160 then return public.kil_err('title_required', 'Add an event name (up to 160 characters).'); end if;
  if public.kil_bad_link(ev->>'cover_url') or public.kil_bad_link(ev->>'spotify_url') or public.kil_bad_link(ev->>'youtube_url') then
    return public.kil_err('bad_link', 'Links must start with https://.');
  end if;
  if dates is null or jsonb_typeof(dates) <> 'array' then return public.kil_err('series_needs_two_dates', 'Add at least two dates.'); end if;
  n := jsonb_array_length(dates);
  if n < 2 then return public.kil_err('series_needs_two_dates', 'Add at least two dates.'); end if;
  if n > 10 then return public.kil_err('too_many_dates', 'A series can have up to 10 dates.'); end if;
  problem := public.kil_tiers_problem(tiers);
  if problem = 'payouts_required' then return public.kil_err(problem, 'Set up payouts before you sell paid tickets. Free tickets need no setup.'); end if;
  if problem is not null then return public.kil_err(problem, 'Check the ticket tiers and try again.'); end if;
  if not public.kil_publish_room(n) then return public.kil_err('publish_limit', 'You can publish up to 10 events per day. Try again tomorrow or email info@keepitil.com.'); end if;
  for d in select jsonb_array_elements_text(dates) loop
    begin
      starts := nullif(btrim(d), '')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      return public.kil_err('bad_date', 'One of the dates is not valid.');
    end;
    if starts is null then return public.kil_err('bad_date', 'One of the dates is not valid.'); end if;
  end loop;
  for d in select jsonb_array_elements_text(dates) loop
    one := public.kil_insert_event(uid, h, ev, coalesce(tiers, '[]'::jsonb), d::timestamptz, sid);
    if first_id is null then first_id := (one->>'id')::bigint; end if;
    slugs := slugs || to_jsonb(one->>'slug');
  end loop;
  return jsonb_build_object('id', first_id, 'event_id', first_id, 'series_id', sid, 'slug', slugs->>0, 'slugs', slugs, 'count', n, 'status', 'published');
end;
$$;

-- Execute rights: only the three owner RPCs and the caller-handle helper reach a signed-in member; everything else is internal.
revoke all on function public.kil_bad_link(text) from public, anon, authenticated;
revoke all on function public.kil_caller_handle() from public, anon, authenticated;
revoke all on function public.kil_row_owned(bigint) from public, anon, authenticated;
revoke all on function public.kil_event_has_sales(bigint) from public, anon, authenticated;
revoke all on function public.kil_tiers_problem(jsonb) from public, anon, authenticated;
revoke all on function public.kil_publish_room(int) from public, anon, authenticated;
revoke all on function public.kil_err(text, text) from public, anon, authenticated;
revoke all on function public.kil_insert_event(uuid, text, jsonb, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.kil_publish_own_event(jsonb, jsonb) from public, anon;
revoke all on function public.kil_update_own_event(text, jsonb, jsonb) from public, anon;
revoke all on function public.kil_publish_own_series(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.kil_publish_own_event(jsonb, jsonb) to authenticated;
grant execute on function public.kil_update_own_event(text, jsonb, jsonb) to authenticated;
grant execute on function public.kil_publish_own_series(jsonb, jsonb, jsonb) to authenticated;

-- NO policy and NO grant is created on public.events or public.ticket_tiers by this migration, except removing the direct tier insert:
drop policy if exists tiers_owner_insert on public.ticket_tiers;
