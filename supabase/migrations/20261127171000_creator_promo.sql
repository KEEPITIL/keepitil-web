-- Creator promo codes and link traffic. NOT APPLIED by deploying the website.
-- Apply on keepitil-prod after 20261127170000_self_serve_publish.sql (uses kil_row_owned).
-- A creator can read and write codes only for events they own. Hit rows are insert-only
-- from the public beacon and readable only by the event owner. anon cannot select either table.

create table if not exists public.event_promo_codes (
  id bigint generated always as identity primary key,
  event_id bigint not null,
  owner_id uuid not null,
  code text not null,
  percent_off integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint event_promo_codes_code_chk check (code ~ '^[A-Z0-9_-]{2,24}$'),
  constraint event_promo_codes_pct_chk check (percent_off between 1 and 100),
  constraint event_promo_codes_event_code_key unique (event_id, code)
);
create index if not exists event_promo_codes_owner_idx on public.event_promo_codes (owner_id, event_id);
alter table public.event_promo_codes enable row level security;
revoke all on public.event_promo_codes from public, anon, authenticated;

create table if not exists public.event_link_hits (
  id bigint generated always as identity primary key,
  event_slug text not null,
  kind text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  created_at timestamptz not null default now(),
  constraint event_link_hits_kind_chk check (kind in ('view', 'click', 'conversion')),
  constraint event_link_hits_slug_chk check (event_slug ~ '^[a-z0-9][a-z0-9-]{0,200}$')
);
create index if not exists event_link_hits_slug_idx on public.event_link_hits (event_slug, kind, created_at desc);
alter table public.event_link_hits enable row level security;
revoke all on public.event_link_hits from public, anon, authenticated;

create or replace function public.kil_upsert_promo_code(p_event_id bigint, p_code text, p_percent integer, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9_-]', '', 'g'));
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_event_id is null or not public.kil_row_owned(p_event_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if c !~ '^[A-Z0-9_-]{2,24}$' or p_percent is null or p_percent < 1 or p_percent > 100 then
    return jsonb_build_object('error', 'invalid_code');
  end if;
  insert into public.event_promo_codes (event_id, owner_id, code, percent_off, active)
  values (p_event_id, uid, c, p_percent, coalesce(p_active, true))
  on conflict (event_id, code) do update
    set percent_off = excluded.percent_off,
        active = excluded.active,
        owner_id = uid;
  return jsonb_build_object('ok', true, 'code', c, 'percent_off', p_percent, 'active', coalesce(p_active, true));
end;
$$;

create or replace function public.kil_list_promo_codes(p_event_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_event_id is null or not public.kil_row_owned(p_event_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', c.code, 'percent_off', c.percent_off, 'active', c.active, 'created_at', c.created_at
    ) order by c.created_at desc)
    from public.event_promo_codes c
    where c.event_id = p_event_id and c.owner_id = uid
  ), '[]'::jsonb);
end;
$$;

create or replace function public.kil_event_id_for_slug(p_slug text)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if to_regclass('public.events') is null or p_slug is null then
    return null;
  end if;
  execute 'select id from public.events where slug = $1 limit 1' into v_id using p_slug;
  return v_id;
exception when undefined_column then
  return null;
end;
$$;

create or replace function public.kil_event_traffic(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id bigint;
begin
  if uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,200}$' then
    return jsonb_build_object('error', 'bad_slug');
  end if;
  v_id := public.kil_event_id_for_slug(p_slug);
  if v_id is null or not public.kil_row_owned(v_id) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return jsonb_build_object(
    'views', (select count(*) from public.event_link_hits h where h.event_slug = p_slug and h.kind = 'view'),
    'clicks', (select count(*) from public.event_link_hits h where h.event_slug = p_slug and h.kind = 'click'),
    'conversions', (select count(*) from public.event_link_hits h where h.event_slug = p_slug and h.kind = 'conversion')
  );
end;
$$;

-- Public beacon. Records a hit only for a real published slug. Returns nothing about other events.
create or replace function public.kil_record_event_hit(
  p_slug text, p_kind text, p_utm_source text default '', p_utm_medium text default '',
  p_utm_campaign text default '', p_utm_content text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean := false;
  kind text := lower(coalesce(p_kind, ''));
  src text := left(regexp_replace(coalesce(p_utm_source, ''), '[[:cntrl:]]', '', 'g'), 80);
  med text := left(regexp_replace(coalesce(p_utm_medium, ''), '[[:cntrl:]]', '', 'g'), 80);
  camp text := left(regexp_replace(coalesce(p_utm_campaign, ''), '[[:cntrl:]]', '', 'g'), 80);
  promo text := left(regexp_replace(coalesce(p_utm_content, ''), '[[:cntrl:]]', '', 'g'), 80);
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,200}$' then
    return;
  end if;
  if kind not in ('view', 'click', 'conversion') then
    return;
  end if;
  if to_regclass('public.events') is not null then
    begin
      execute 'select exists(select 1 from public.events where slug = $1 and status::text = ''published'')' into ok using p_slug;
    exception when undefined_column then
      ok := false;
    end;
  end if;
  if not ok then
    return;
  end if;
  insert into public.event_link_hits (event_slug, kind, utm_source, utm_medium, utm_campaign, utm_content)
  values (p_slug, kind, nullif(src, ''), nullif(med, ''), nullif(camp, ''), nullif(promo, ''));
end;
$$;

revoke all on function public.kil_upsert_promo_code(bigint, text, integer, boolean) from public, anon;
revoke all on function public.kil_list_promo_codes(bigint) from public, anon;
revoke all on function public.kil_event_id_for_slug(text) from public, anon, authenticated;
revoke all on function public.kil_event_traffic(text) from public, anon;
revoke all on function public.kil_record_event_hit(text, text, text, text, text, text) from public;
grant execute on function public.kil_upsert_promo_code(bigint, text, integer, boolean) to authenticated;
grant execute on function public.kil_list_promo_codes(bigint) to authenticated;
grant execute on function public.kil_event_traffic(text) to authenticated;
grant execute on function public.kil_record_event_hit(text, text, text, text, text, text) to anon, authenticated;
