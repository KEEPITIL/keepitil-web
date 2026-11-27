-- Rollback for 20261127171000_creator_promo.sql. Backup + written GO first.
-- Does NOT touch public.event_promo_codes (it existed before this migration and has live policies). Promo rows written through the RPC stay (they are ordinary rows).
drop function if exists public.kil_upsert_promo_code(bigint, text, integer, boolean);
drop function if exists public.kil_list_promo_codes(bigint);
drop function if exists public.kil_event_traffic(text);
drop function if exists public.kil_record_event_hit(text, text, text, text, text, text);
drop function if exists public.kil_event_id_for_slug(text);
-- created by this migration: the beacon table (its counts are lost)
drop table if exists public.event_link_hits;
