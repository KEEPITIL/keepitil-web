-- Rollback for 20261127172000_owner_attendees.sql. Backup + written GO first. Function only; no table is touched.
drop function if exists public.kil_event_customers(text);
