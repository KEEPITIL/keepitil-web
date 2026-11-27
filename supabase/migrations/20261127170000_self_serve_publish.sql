-- Self-serve publish. NOT APPLIED by deploying the website.
-- Apply on keepitil-prod (ovmqtzjfpzrbzrlkxwgw) with the Supabase SQL editor or
-- `supabase db push` before a non-admin create will succeed. Until then the pages
-- fall back to create_event_with_tiers / update_event / create_event_series, which
-- still refuse non-admins.
--
-- What this does:
--   * Any authenticated user can insert and update their OWN events, written as published.
--   * They cannot change owner columns, and they cannot edit someone else's event.
--   * A taken-down row (rejected / removed / taken_down) stays taken down unless is_admin().
--   * Community-source rows are not forced to published (calendar listings keep their path).
--   * Direct table writes are owner-scoped with RLS. The RPCs are security definer,
--     check auth.uid(), and are not executable by anon.

create or replace function public.kil_bad_link(v text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(btrim(v), '') <> '' and btrim(v) !~* '^https?://\S+$';
$$;

create or replace function public.kil_caller_handle()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h text;
begin
  if auth.uid() is null or to_regclass('public.app_users') is null then
    return null;
  end if;
  begin
    execute 'select handle from public.app_users where id = $1 limit 1'
      into h using auth.uid();
  exception when undefined_column then
    return null;
  end;
  return h;
end;
$$;

create or replace function public.kil_caller_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  begin
    return coalesce(public.is_admin(), false);
  exception when undefined_function then
    return false;
  end;
end;
$$;

-- Writes one owned event. p_slug null = insert. Otherwise update that slug, and only if the caller owns it.
create or replace function public.kil_events_apply(p_slug text, p_values jsonb, p_tiers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  handle text;
  v_id bigint;
  v_slug text;
  v_status text;
  v_owns boolean;
  v_admin boolean;
  v_sets text := '';
  v_cols text := '';
  v_vals text := '';
  v_piece text;
  v_raw text;
  rec record;
  v_tier_table text;
  v_has_event_id boolean;
  v_sales boolean := false;
  v_tier jsonb;
  v_i int := 0;
  v_whitelist text[] := array[
    'title','slug','tagline','description','venue','city','starts_at','ends_at','cover_url','genres',
    'status','tz','source','show_lineup','show_gallery','show_feed','end_time_public','waitlist_enabled',
    'hide_guest_count','show_on_explore','spotify_url','youtube_url','title_font','accent_color',
    'features','gallery','reg_questions'
  ];
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if to_regclass('public.events') is null then
    return jsonb_build_object('error', 'events_table_missing');
  end if;
  if public.kil_bad_link(p_values->>'cover_url')
     or public.kil_bad_link(p_values->>'spotify_url')
     or public.kil_bad_link(p_values->>'youtube_url') then
    return jsonb_build_object('error', 'bad_link');
  end if;
  if p_slug is null and btrim(coalesce(p_values->>'title', '')) = '' then
    return jsonb_build_object('error', 'title_required');
  end if;
  if p_slug is null and nullif(btrim(coalesce(p_values->>'starts_at', '')), '') is null then
    return jsonb_build_object('error', 'starts_at_required');
  end if;

  handle := public.kil_caller_handle();
  v_admin := public.kil_caller_is_admin();
  p_values := coalesce(p_values, '{}'::jsonb)
    - 'owner_id' - 'user_id' - 'created_by' - 'host_id' - 'owner_handle' - 'id';

  if p_slug is null then
    v_slug := lower(coalesce(p_values->>'slug', ''));
    if v_slug !~ '^[a-z0-9][a-z0-9-]{0,80}$' then
      v_slug := left(trim(both '-' from regexp_replace(lower(coalesce(p_values->>'title', 'event')), '[^a-z0-9]+', '-', 'g')), 60);
      if v_slug is null or v_slug = '' then v_slug := 'event'; end if;
      v_slug := v_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    end if;
    p_values := p_values || jsonb_build_object('slug', v_slug, 'status', 'published', 'source', 'organizer', 'tz', coalesce(p_values->>'tz', 'America/Los_Angeles'));
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'owner_id') then
      p_values := p_values || jsonb_build_object('owner_id', uid::text);
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'user_id') then
      p_values := p_values || jsonb_build_object('user_id', uid::text);
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'created_by') then
      p_values := p_values || jsonb_build_object('created_by', uid::text);
    end if;
    if handle is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'owner_handle') then
      p_values := p_values || jsonb_build_object('owner_handle', handle);
    end if;
  else
    execute 'select id, status::text from public.events where slug = $1 limit 1' into v_id, v_status using p_slug;
    if v_id is null then
      return jsonb_build_object('error', 'not_found');
    end if;
    v_owns := public.kil_row_owned(v_id);
    if not v_owns then
      return jsonb_build_object('error', 'forbidden');
    end if;
    if v_status in ('rejected', 'removed', 'taken_down') and not v_admin then
      return jsonb_build_object('error', 'taken_down', 'message', 'This event was taken down and cannot be republished from here.');
    end if;
    p_values := p_values - 'slug' - 'source';
    p_values := p_values || jsonb_build_object('status', 'published');
    v_slug := p_slug;
  end if;

  for rec in
    select c.column_name, c.udt_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'events'
      and c.column_name = any (v_whitelist)
      and p_values ? c.column_name
  loop
    v_raw := p_values ->> rec.column_name;
    if rec.udt_name = 'jsonb' then
      v_piece := case when v_raw is null then 'null' else quote_literal(p_values ->> rec.column_name) || '::jsonb' end;
    elsif rec.udt_name = 'bool' then
      v_piece := case when v_raw in ('true', 't', '1') then 'true' when v_raw is null then 'null' else 'false' end;
    elsif rec.udt_name in ('int2', 'int4', 'int8', 'numeric', 'float4', 'float8') then
      v_piece := case when v_raw ~ '^-?[0-9]+(\.[0-9]+)?$' then v_raw else 'null' end;
    elsif rec.udt_name = 'uuid' then
      v_piece := case when v_raw ~* '^[0-9a-f-]{36}$' then quote_literal(v_raw) || '::uuid' else 'null' end;
    elsif rec.udt_name in ('timestamptz', 'timestamp', 'date') then
      v_piece := case when coalesce(v_raw, '') = '' then 'null' else quote_literal(v_raw) || '::timestamptz' end;
    else
      v_piece := case when v_raw is null then 'null' else quote_literal(v_raw) end;
    end if;
    if p_slug is null then
      v_cols := v_cols || quote_ident(rec.column_name) || ',';
      v_vals := v_vals || v_piece || ',';
    else
      v_sets := v_sets || quote_ident(rec.column_name) || ' = ' || v_piece || ',';
    end if;
  end loop;

  if p_slug is null then
    if v_cols = '' then
      return jsonb_build_object('error', 'no_writable_columns');
    end if;
    v_cols := left(v_cols, length(v_cols) - 1);
    v_vals := left(v_vals, length(v_vals) - 1);
    execute 'insert into public.events (' || v_cols || ') values (' || v_vals || ') returning id, slug'
      into v_id, v_slug;
  else
    if v_sets <> '' then
      v_sets := left(v_sets, length(v_sets) - 1);
      execute 'update public.events set ' || v_sets || ' where id = $1' using v_id;
    end if;
  end if;

  if to_regclass('public.ticket_tiers') is not null then
    v_tier_table := 'ticket_tiers';
  elsif to_regclass('public.event_tiers') is not null then
    v_tier_table := 'event_tiers';
  end if;
  if v_tier_table is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_tier_table and column_name = 'event_id'
    ) into v_has_event_id;
  end if;
  if v_has_event_id and p_slug is not null then
    begin
      if to_regclass('public.orders') is not null then
        execute 'select exists(select 1 from public.orders where event_id = $1)' into v_sales using v_id;
      end if;
    exception when undefined_column then
      v_sales := false;
    end;
    if not v_sales and to_regclass('public.tickets') is not null then
      begin
        execute 'select exists(select 1 from public.tickets where event_id = $1)' into v_sales using v_id;
      exception when undefined_column then
        v_sales := false;
      end;
    end if;
  end if;
  if v_has_event_id and not v_sales and p_tiers is not null then
    if p_slug is not null then
      execute format('delete from public.%I where event_id = $1', v_tier_table) using v_id;
    end if;
    for v_tier in select * from jsonb_array_elements(p_tiers)
    loop
      v_i := v_i + 1;
      begin
        execute format(
          'insert into public.%I (event_id, name, description, price_cents, qty_total) values ($1, $2, $3, $4, $5)',
          v_tier_table
        ) using
          v_id,
          left(coalesce(nullif(btrim(v_tier->>'name'), ''), 'General Admission'), 120),
          nullif(btrim(v_tier->>'description'), ''),
          greatest(0, coalesce((v_tier->>'price_cents')::int, 0)),
          case when coalesce(v_tier->>'qty_total', '') ~ '^[0-9]+$' then (v_tier->>'qty_total')::int else null end;
      exception when undefined_column or not_null_violation then
        null;
      end;
    end loop;
  end if;

  return jsonb_build_object('id', v_id, 'event_id', v_id, 'slug', v_slug, 'status', 'published');
end;
$$;

-- True only when the caller owns public.events.id. Unknown owner columns fail closed.
create or replace function public.kil_row_owned(p_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  handle text;
  uuid_expr text := '';
  null_expr text := '';
  expr text := '';
  col text;
  ok boolean;
begin
  if uid is null or p_id is null or to_regclass('public.events') is null then
    return false;
  end if;
  handle := public.kil_caller_handle();
  foreach col in array array['owner_id', 'user_id', 'created_by', 'host_id']
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'events' and column_name = col and udt_name = 'uuid'
    ) then
      uuid_expr := uuid_expr || case when uuid_expr = '' then '' else ' or ' end || format('%I = %L::uuid', col, uid::text);
      null_expr := null_expr || case when null_expr = '' then '' else ' and ' end || format('%I is null', col);
    end if;
  end loop;
  if uuid_expr <> '' then
    expr := '(' || uuid_expr || ')';
  end if;
  -- A handle match counts only when the row has no uuid owner set. It cannot override someone else's id.
  if handle is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'owner_handle'
  ) then
    expr := expr || case when expr = '' then '' else ' or ' end
      || '(' || format('%I = %L', 'owner_handle', handle)
      || case when null_expr = '' then '' else ' and ' || null_expr end || ')';
  end if;
  if expr = '' then
    return false;
  end if;
  execute 'select (' || expr || ') from public.events where id = $1' into ok using p_id;
  return coalesce(ok, false);
end;
$$;

create or replace function public.kil_force_published(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_status text;
  v_source text;
begin
  if auth.uid() is null or p_slug is null or to_regclass('public.events') is null then
    return;
  end if;
  begin
    execute 'select id, status::text, source::text from public.events where slug = $1 limit 1'
      into v_id, v_status, v_source using p_slug;
  exception when undefined_column then
    execute 'select id, status::text, null::text from public.events where slug = $1 limit 1'
      into v_id, v_status, v_source using p_slug;
  end;
  if v_id is null or not public.kil_row_owned(v_id) then
    return;
  end if;
  if v_source = 'community' then
    return;
  end if;
  if v_status in ('rejected', 'removed', 'taken_down') and not public.kil_caller_is_admin() then
    return;
  end if;
  execute 'update public.events set status = ''published'' where id = $1 and status is distinct from ''published''' using v_id;
end;
$$;

create or replace function public.kil_publish_own_event(ev jsonb, tiers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if ev is null or btrim(coalesce(ev->>'title', '')) = '' then
    return jsonb_build_object('error', 'title_required');
  end if;
  if public.kil_bad_link(ev->>'cover_url') or public.kil_bad_link(ev->>'spotify_url') or public.kil_bad_link(ev->>'youtube_url') then
    return jsonb_build_object('error', 'bad_link');
  end if;
  ev := ev || jsonb_build_object('status', 'published');
  begin
    execute 'select to_jsonb(public.create_event_with_tiers($1, $2))' into result using ev, coalesce(tiers, '[]'::jsonb);
  exception when others then
    result := null;
  end;
  if result is not null and result ? 'error' and coalesce(result->>'error', '') <> ''
     and result->>'error' not ilike '%keepitil%'
     and result->>'error' not ilike '%admin%'
     and result->>'error' not ilike '%permission%' then
    return result;
  end if;
  if result is null or (result ? 'error') then
    return public.kil_events_apply(null, ev, coalesce(tiers, '[]'::jsonb));
  end if;
  perform public.kil_force_published(coalesce(result->>'slug', ev->>'slug'));
  return result || jsonb_build_object('status', 'published', 'requested_status', 'published');
end;
$$;

create or replace function public.kil_update_own_event(p_slug text, ev jsonb, tiers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_slug is null or p_slug = '' then
    return jsonb_build_object('error', 'slug_required');
  end if;
  ev := coalesce(ev, '{}'::jsonb) || jsonb_build_object('status', 'published');
  begin
    execute 'select to_jsonb(public.update_event($1, $2, $3))' into result using p_slug, ev, coalesce(tiers, '[]'::jsonb);
  exception when others then
    result := null;
  end;
  if result is not null and coalesce(result->>'error', '') <> ''
     and result->>'error' not ilike '%keepitil%'
     and result->>'error' not ilike '%admin%'
     and result->>'error' not ilike '%permission%' then
    return result;
  end if;
  if result is null or (result ? 'error') then
    return public.kil_events_apply(p_slug, ev, coalesce(tiers, '[]'::jsonb));
  end if;
  perform public.kil_force_published(p_slug);
  return result || jsonb_build_object('status', 'published', 'slug', p_slug);
end;
$$;

create or replace function public.kil_publish_own_series(ev jsonb, tiers jsonb, dates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  d text;
  one jsonb;
  slugs jsonb := '[]'::jsonb;
  first_id bigint;
  result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  n := coalesce(jsonb_array_length(dates), 0);
  if n < 2 then
    return jsonb_build_object('error', 'series_needs_two_dates');
  end if;
  begin
    execute 'select to_jsonb(public.create_event_series($1, $2, $3))'
      into result using ev || jsonb_build_object('status', 'published'), coalesce(tiers, '[]'::jsonb),
        (select array_agg(x::timestamptz) from jsonb_array_elements_text(dates) as t(x));
  exception when others then
    result := null;
  end;
  if result is not null and not (result ? 'error') then
    return result || jsonb_build_object('status', 'published');
  end if;
  for d in select jsonb_array_elements_text(dates)
  loop
    one := public.kil_events_apply(null, coalesce(ev, '{}'::jsonb) || jsonb_build_object('starts_at', d, 'status', 'published'), coalesce(tiers, '[]'::jsonb));
    if one ? 'error' then
      return one;
    end if;
    if first_id is null then first_id := (one->>'id')::bigint; end if;
    slugs := slugs || to_jsonb(one->>'slug');
  end loop;
  return jsonb_build_object('id', first_id, 'event_id', first_id, 'slug', slugs->>0, 'slugs', slugs, 'status', 'published');
end;
$$;

revoke all on function public.kil_bad_link(text) from public, anon, authenticated;
revoke all on function public.kil_caller_handle() from public, anon;
revoke all on function public.kil_caller_is_admin() from public, anon;
grant execute on function public.kil_caller_handle() to authenticated;
grant execute on function public.kil_caller_is_admin() to authenticated;
revoke all on function public.kil_events_apply(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.kil_row_owned(bigint) from public, anon, authenticated;
revoke all on function public.kil_force_published(text) from public, anon, authenticated;

revoke all on function public.kil_publish_own_event(jsonb, jsonb) from public, anon;
revoke all on function public.kil_update_own_event(text, jsonb, jsonb) from public, anon;
revoke all on function public.kil_publish_own_series(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.kil_publish_own_event(jsonb, jsonb) to authenticated;
grant execute on function public.kil_update_own_event(text, jsonb, jsonb) to authenticated;
grant execute on function public.kil_publish_own_series(jsonb, jsonb, jsonb) to authenticated;

-- Owner-scoped RLS. Skipped entirely when public.events is not in this database yet.
do $$
declare
  rls_on boolean;
  id_expr text := '';
  null_expr text := '';
  expr text := '';
  live_expr text;
  col text;
  has_status boolean;
begin
  if to_regclass('public.events') is null then
    raise notice 'public.events is missing; RLS policies skipped';
    return;
  end if;
  select c.relrowsecurity into rls_on
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'events';

  foreach col in array array['owner_id', 'user_id', 'created_by', 'host_id']
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'events' and column_name = col and udt_name = 'uuid'
    ) then
      id_expr := id_expr || case when id_expr = '' then '' else ' or ' end
        || format('%I = (select auth.uid())', col);
      null_expr := null_expr || case when null_expr = '' then '' else ' and ' end
        || format('%I is null', col);
    end if;
  end loop;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'owner_handle'
  ) then
    id_expr := id_expr || case when id_expr = '' then '' else ' or ' end
      || '(owner_handle = (select public.kil_caller_handle()) and (select public.kil_caller_handle()) is not null'
      || case when null_expr = '' then '' else ' and ' || null_expr end || ')';
  end if;
  if id_expr = '' then
    raise notice 'public.events has no owner column; write policies skipped';
    return;
  end if;
  expr := '(' || id_expr || ')';
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'status'
  ) into has_status;
  -- Owners can edit a live row. A taken-down row stays taken down unless is_admin().
  if has_status then
    live_expr := expr || ' and (status not in (''rejected'', ''removed'', ''taken_down'') or (select public.kil_caller_is_admin()))';
  else
    live_expr := expr;
  end if;

  if not coalesce(rls_on, false) then
    execute 'alter table public.events enable row level security';
    execute 'drop policy if exists kil_events_public_read on public.events';
    execute $p$create policy kil_events_public_read on public.events
      for select to anon, authenticated
      using (status = 'published')$p$;
  end if;

  execute 'drop policy if exists kil_events_owner_read on public.events';
  execute 'drop policy if exists kil_events_owner_insert on public.events';
  execute 'drop policy if exists kil_events_owner_update on public.events';
  execute format(
    'create policy kil_events_owner_read on public.events for select to authenticated using (%s)',
    expr);
  execute format(
    'create policy kil_events_owner_insert on public.events for insert to authenticated with check (%s and status = ''published'')',
    expr);
  execute format(
    'create policy kil_events_owner_update on public.events for update to authenticated using (%s) with check (%s)',
    live_expr, live_expr);
  execute 'grant select, insert, update on public.events to authenticated';
end $$;
