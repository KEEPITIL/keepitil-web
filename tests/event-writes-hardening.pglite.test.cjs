'use strict';
// DRAFT migrations 20261128010000 (event_orders) and 20261128010100 (events), run in PGlite against a stand-in of keepitil-prod:
// Supabase's default grants (ALL to anon + authenticated) and the exact policies found on prod 2026-11-27. Each hole is shown OPEN
// before the migration (so the test would notice if the stand-in stopped reproducing prod), CLOSED after, the read policies and the
// SECURITY DEFINER write paths still working, and the rollback restoring the original state.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const mig = (f) => fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', f), 'utf8');
const ORDERS = '20261128010000_event_orders_no_client_writes', EVENTS = '20261128010100_events_insert_via_rpc_only';
const ORG = '11111111-1111-4111-8111-111111111111', BUYER = '22222222-2222-4222-8222-222222222222', OTHER = '33333333-3333-4333-8333-333333333333';
const STANDIN = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, handle text, email text, is_admin boolean default false);
create function public.my_handle() returns text language sql stable security definer set search_path = public as $$ select handle from public.profiles where id = auth.uid() $$;
create function public.my_profile_slug() returns text language sql stable security definer set search_path = public as $$ select handle from public.profiles where id = auth.uid() $$;
create function public.my_email() returns text language sql stable security definer set search_path = public as $$ select email from public.profiles where id = auth.uid() $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
create table public.events (id uuid primary key default gen_random_uuid(), slug text unique, title text, status text default 'draft', owner_handle text, submitted_by uuid, featured boolean default false, show_on_explore boolean default false);
create table public.event_orders (id uuid primary key default gen_random_uuid(), event_id uuid references public.events(id), buyer_email text, amount_cents int, application_fee_cents int, status text, qr_token text, checked_in_at timestamptz);
alter table public.events enable row level security; alter table public.event_orders enable row level security;
-- the policies exactly as on keepitil-prod 2026-11-27
create policy events_public_read on public.events for select to anon, authenticated using (status = 'published');
create policy events_owner_read on public.events for select to public using ((submitted_by = auth.uid()) or (owner_handle = my_profile_slug()) or is_admin());
create policy events_auth_insert on public.events for insert to public with check ((auth.uid() is not null) and (status = any (array['draft'::text, 'review'::text])));
create policy event_orders_organizer_read on public.event_orders for select to authenticated using (event_id in (select events.id from events where events.owner_handle = my_handle()));
create policy event_orders_owner_read on public.event_orders for select to authenticated using (buyer_email = my_email());
create policy event_orders_organizer_update on public.event_orders for update to authenticated using (event_id in (select events.id from events where events.owner_handle = my_handle())) with check (event_id in (select events.id from events where events.owner_handle = my_handle()));
-- stand-ins of the SECURITY DEFINER write paths the app uses (check_in_ticket / event_checkin_scan, create_event_with_tiers)
create function public.check_in_ticket(p_qr text) returns boolean language plpgsql security definer set search_path = public as $$
begin update public.event_orders o set checked_in_at = now() from public.events e where o.qr_token = p_qr and e.id = o.event_id and e.owner_handle = my_handle(); return found; end $$;
create function public.create_event_with_tiers(p_slug text, p_title text) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; begin insert into public.events (slug, title, status, owner_handle, submitted_by) values (p_slug, p_title, 'review', my_handle(), auth.uid()) returning id into v; return v; end $$;
grant execute on function public.check_in_ticket(text), public.create_event_with_tiers(text, text) to authenticated;
insert into public.profiles values ('${ORG}', 'org', 'org@example.test', false), ('${BUYER}', 'buyer', 'buyer@example.test', false), ('${OTHER}', 'other', 'other@example.test', false);
insert into public.events (id, slug, title, status, owner_handle) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'org-show', 'Org Show', 'published', 'org');
insert into public.event_orders (event_id, buyer_email, amount_cents, application_fee_cents, status, qr_token) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'buyer@example.test', 1100, 100, 'paid', 'qr-1');`;
async function db() { const { PGlite } = await import('@electric-sql/pglite'); const d = new PGlite(); await d.exec(STANDIN); return d; }
async function as(d, role, uid, sql, params) {
  await d.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await d.query(sql, params || []); } finally { await d.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
}
const refused = (p) => assert.rejects(p, /permission denied|row-level security/);
const orderRow = async (d) => (await d.query(`select amount_cents, status, checked_in_at from public.event_orders`)).rows[0];
const anonWrite = (t) => ({ grants: `select privilege_type from information_schema.role_table_grants where table_name = '${t}' and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE') order by 1` });

test('event_orders BEFORE: the organizer can rewrite the amount of an order (the hole, reproduced)', async () => {
  const d = await db();
  await as(d, 'authenticated', ORG, `update public.event_orders set amount_cents = 1, status = 'refunded'`);
  assert.deepEqual([(await orderRow(d)).amount_cents, (await orderRow(d)).status], [1, 'refunded']);
});
test('event_orders AFTER: no client role can update, delete or insert orders; check-in still works through the definer RPC; reads unchanged', async () => {
  const d = await db(); await d.exec(mig(ORDERS + '.sql'));
  await refused(as(d, 'authenticated', ORG, `update public.event_orders set amount_cents = 1`));
  await refused(as(d, 'authenticated', ORG, `delete from public.event_orders`));
  await refused(as(d, 'anon', null, `update public.event_orders set status = 'void'`));
  await refused(as(d, 'authenticated', BUYER, `insert into public.event_orders (event_id, buyer_email, amount_cents) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'buyer@example.test', 1)`));
  assert.equal((await orderRow(d)).amount_cents, 1100, 'untouched');
  const ok = (await as(d, 'authenticated', ORG, `select public.check_in_ticket('qr-1') as ok`)).rows[0].ok; assert.equal(ok, true);
  assert.ok((await orderRow(d)).checked_in_at, 'check-in wrote through the SECURITY DEFINER function');
  assert.equal((await as(d, 'authenticated', ORG, `select 1 from public.event_orders`)).rows.length, 1, 'organizer still reads their orders');
  assert.equal((await as(d, 'authenticated', BUYER, `select 1 from public.event_orders`)).rows.length, 1, 'buyer still reads their own order');
  assert.equal((await as(d, 'authenticated', OTHER, `select 1 from public.event_orders`)).rows.length, 0, 'NEGATIVE CONTROL: a stranger reads nothing');
  assert.deepEqual((await d.query(anonWrite('event_orders').grants)).rows, [], 'no write grant left, column grants included');
  assert.equal((await d.query(`select 1 from pg_policies where policyname = 'event_orders_organizer_update'`)).rows.length, 0);
});
test('events BEFORE: any signed-in user can insert a featured draft owned by someone else (the hole, reproduced)', async () => {
  const d = await db();
  await as(d, 'authenticated', OTHER, `insert into public.events (slug, title, status, owner_handle, featured, show_on_explore) values ('fake', 'Fake', 'draft', 'org', true, true)`);
  assert.deepEqual((await d.query(`select featured, owner_handle from public.events where slug = 'fake'`)).rows, [{ featured: true, owner_handle: 'org' }]);
});
test('events AFTER: no direct insert/update/delete from any client role; the create RPC still works and picks the columns itself; reads unchanged', async () => {
  const d = await db(); await d.exec(mig(EVENTS + '.sql'));
  await refused(as(d, 'authenticated', OTHER, `insert into public.events (slug, title, status, featured) values ('fake', 'Fake', 'draft', true)`));
  await refused(as(d, 'anon', null, `insert into public.events (slug, title, status) values ('anon', 'Anon', 'draft')`));
  await refused(as(d, 'authenticated', ORG, `update public.events set featured = true`));
  await refused(as(d, 'authenticated', ORG, `delete from public.events`));
  const id = (await as(d, 'authenticated', ORG, `select public.create_event_with_tiers('new-show', 'New Show') as id`)).rows[0].id; assert.ok(id);
  assert.deepEqual((await d.query(`select status, owner_handle, featured from public.events where id = $1`, [id])).rows, [{ status: 'review', owner_handle: 'org', featured: false }]);
  assert.equal((await as(d, 'anon', null, `select 1 from public.events`)).rows.length, 1, 'anon still reads published events only');
  assert.equal((await as(d, 'authenticated', ORG, `select 1 from public.events`)).rows.length, 2, 'the owner reads their own draft too');
  assert.deepEqual((await d.query(anonWrite('events').grants)).rows, []);
});
test('rollbacks restore exactly what prod had (policies and write grants back; both holes reopen)', async () => {
  const d = await db();
  for (const m of [ORDERS, EVENTS]) { await d.exec(mig(m + '.sql')); await d.exec(mig(m + '.rollback.sql')); }
  const pol = (await d.query(`select policyname from pg_policies where policyname in ('event_orders_organizer_update', 'events_auth_insert') order by 1`)).rows.map((r) => r.policyname);
  assert.deepEqual(pol, ['event_orders_organizer_update', 'events_auth_insert']);
  await as(d, 'authenticated', ORG, `update public.event_orders set amount_cents = 2`); assert.equal((await orderRow(d)).amount_cents, 2);
  await as(d, 'authenticated', OTHER, `insert into public.events (slug, title, status, featured) values ('back', 'Back', 'draft', true)`);
  assert.ok((await d.query(anonWrite('events').grants)).rows.length >= 4);
});
test('the drafts say DRAFT / NOT APPLIED and touch nothing but these two tables', () => {
  for (const m of [ORDERS, EVENTS]) {
    const s = mig(m + '.sql'); assert.match(s, /^-- DRAFT: NOT APPLIED/);
    const code = s.replace(/--.*$/gm, ''); assert.doesNotMatch(code, /\b(drop table|truncate\s+(table\s+)?public|delete from|alter table|create or replace function)\b/i);
  }
});
