-- Rollback: restore duplicate_event exactly as read from keepitil-prod on 2026-11-28 (thin copy).
create or replace function public.duplicate_event(p_event_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  h text; src public.events%rowtype; new_id bigint; new_slug text;
begin
  if auth.uid() is null then return jsonb_build_object('error','unauth'); end if;
  select handle into h from public.app_users where id = auth.uid();
  select * into src from public.events where id = p_event_id;
  if not found or src.owner_handle is distinct from h then return jsonb_build_object('error','notyours'); end if;
  new_slug := 'event-'||substr(md5(random()::text),1,8);
  insert into public.events(slug,owner_handle,title,tagline,description,venue,city,starts_at,cover_url,genres,status)
    values(new_slug, h, src.title||' (copy)', src.tagline, src.description, src.venue, src.city, src.starts_at, src.cover_url, src.genres, 'review')
    returning id into new_id;
  insert into public.ticket_tiers(event_id,name,price_cents,qty_total,sort)
    select new_id, name, price_cents, qty_total, sort from public.ticket_tiers where event_id = p_event_id;
  return jsonb_build_object('event_id', new_id, 'slug', new_slug);
end;
$function$;
