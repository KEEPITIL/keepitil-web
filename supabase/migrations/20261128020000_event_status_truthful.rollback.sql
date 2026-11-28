-- Restores the previous publish/edit return shape. Does not drop tables or columns.
-- kil_insert_event and kil_publish_own_series again return the word published.
-- kil_update_own_event again returns the status it read before the write, with no review_reason and no in_review.

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
