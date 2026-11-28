-- Creator promo codes and link traffic (REVISED against the real keepitil-prod schema, 2026-11-27). NOT APPLIED by deploying the website.
-- Apply after 20261127170000_self_serve_publish.sql (uses kil_row_owned). Rollback: 20261127171000_creator_promo.rollback.sql.
--
-- SCHEMA DRIFT FIXED: public.event_promo_codes ALREADY EXISTS in prod with the columns (id, event_id, code, kind, value, uses_left, active) and its own
-- policy (promo_public_read: active codes readable). The first draft did "create table if not exists" with different columns (owner_id, percent_off),
-- which would have silently done nothing and then failed at the first insert, and it revoked the existing grants. This version creates NO promo table,
-- changes NO grant or policy on it, and uses the existing columns: kind = 'percent', value = the percent, uses_left null = unlimited.
-- Only public.event_link_hits is new (beacon counts; insert only through the RPC).

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
alter table public.event_link_hits force row level security;
revoke all on public.event_link_hits from public, anon, authenticated;

create or replace function public.kil_event_id_for_slug(p_slug text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.events e where e.slug = p_slug limit 1;
$$;

create or replace function public.kil_upsert_promo_code(p_event_id bigint, p_code text, p_percent integer, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9_-]', '', 'g'));
begin
  if auth.uid() is null then return jsonb_build_object('error', 'not_authenticated'); end if;
  if p_event_id is null or not public.kil_row_owned(p_event_id) then return jsonb_build_object('error', 'forbidden'); end if;
  if c !~ '^[A-Z0-9_-]{2,24}$' or p_percent is null or p_percent < 1 or p_percent > 100 then return jsonb_build_object('error', 'invalid_code'); end if;
  update public.event_promo_codes set kind = 'percent', value = p_percent, active = coalesce(p_active, true)
   where event_id = p_event_id and upper(code) = c;
  if not found then
    if (select count(*) from public.event_promo_codes where event_id = p_event_id) >= 20 then return jsonb_build_object('error', 'too_many_codes'); end if;
    insert into public.event_promo_codes (event_id, code, kind, value, active) values (p_event_id, c, 'percent', p_percent, coalesce(p_active, true));
  end if;
  return jsonb_build_object('ok', true, 'code', c, 'percent_off', p_percent, 'active', coalesce(p_active, true));
end;
$$;

create or replace function public.kil_list_promo_codes(p_event_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return jsonb_build_object('error', 'not_authenticated'); end if;
  if p_event_id is null or not public.kil_row_owned(p_event_id) then return jsonb_build_object('error', 'forbidden'); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('code', c.code, 'percent_off', c.value, 'active', coalesce(c.active, false)) order by c.id desc)
    from public.event_promo_codes c where c.event_id = p_event_id and c.kind = 'percent'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.kil_event_traffic(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'not_authenticated'); end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,200}$' then return jsonb_build_object('error', 'bad_slug'); end if;
  v_id := public.kil_event_id_for_slug(p_slug);
  if v_id is null or not public.kil_row_owned(v_id) then return jsonb_build_object('error', 'forbidden'); end if;
  return jsonb_build_object(
    'views', (select count(*) from public.event_link_hits h where h.event_slug = p_slug and h.kind = 'view'),
    'clicks', (select count(*) from public.event_link_hits h where h.event_slug = p_slug and h.kind = 'click'),
    'conversions', (select count(*) from public.event_link_hits h where h.event_slug = p_slug and h.kind = 'conversion')
  );
end;
$$;

-- Public beacon. Records a hit only for a real published slug; at most 2,000 hits per slug per hour so it cannot be used to flood the table.
create or replace function public.kil_record_event_hit(
  p_slug text, p_kind text, p_utm_source text default '', p_utm_medium text default '',
  p_utm_campaign text default '', p_utm_content text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := lower(coalesce(p_kind, ''));
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,200}$' or kind not in ('view', 'click', 'conversion') then return; end if;
  if not exists (select 1 from public.events where slug = p_slug and status = 'published') then return; end if;
  if (select count(*) from public.event_link_hits h where h.event_slug = p_slug and h.created_at > now() - interval '1 hour') >= 2000 then return; end if;
  insert into public.event_link_hits (event_slug, kind, utm_source, utm_medium, utm_campaign, utm_content)
  values (p_slug, kind,
          nullif(left(regexp_replace(coalesce(p_utm_source, ''), '[[:cntrl:]]', '', 'g'), 80), ''),
          nullif(left(regexp_replace(coalesce(p_utm_medium, ''), '[[:cntrl:]]', '', 'g'), 80), ''),
          nullif(left(regexp_replace(coalesce(p_utm_campaign, ''), '[[:cntrl:]]', '', 'g'), 80), ''),
          nullif(left(regexp_replace(coalesce(p_utm_content, ''), '[[:cntrl:]]', '', 'g'), 80), ''));
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
