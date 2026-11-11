-- testbed-additions.sql: replica additions the 13A replica does not carry but create-checkout reads. SYNTHETIC. Run AFTER replica-13a.sql, BEFORE the packs.
-- ASSUMPTIONS (A:): ticket_tiers.currency/sales_start/sales_end, app_users.stripe_account_id/payouts_enabled and platform_config exist in prod with these names (the deployed create-checkout v58 selects them); column types are guessed.
alter table public.ticket_tiers add column currency text default 'usd', add column sales_start timestamptz, add column sales_end timestamptz;
alter table public.app_users add column stripe_account_id text, add column payouts_enabled boolean default false;
create table public.platform_config (key text primary key, value text not null);
-- FEE = PLACEHOLDER until Joe decides (Wednesday). Mirrors the live config rule: application_fee_bps 250 + per-ticket 49c under $10 / 99c at $10+. The function READS these rows; nothing is hardcoded in the testbed.
insert into public.platform_config (key, value) values ('application_fee_bps', '250'), ('per_ticket_fee_under10_cents', '49'), ('per_ticket_fee_over10_cents', '99');
revoke all on public.platform_config from public, anon, authenticated;
grant select on public.platform_config to service_role;
