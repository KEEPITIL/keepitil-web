// Hardening of event_orders client writes and direct events inserts, run in PGlite on a stand-in of the REAL prod tables, grants and policies (read 2026-11-27).
//   KIL_PGLITE=<pglite package dir> node --test tests/harden-event-orders.pglite.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const UPF = '20261127180000_harden_event_orders_and_events_insert.sql', DNF = UPF.replace('.sql', '.rollback.sql');
const rd = (f) => fs.readFileSync(path.join(MIG, f), 'utf8');
const dir = process.env.KIL_PGLITE; let PGlite = null;
if (dir) PGlite = (await import(pathToFileURL(path.join(dir, 'dist', 'index.js')).href)).PGlite;
const skip = PGlite ? false : 'set KIL_PGLITE to the @electric-sql/pglite package directory';
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';

const STANDIN = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.app_users (id uuid primary key, handle text);
  create function public.my_handle() returns text language sql stable security definer as $$ select handle from public.app_users where id = auth.uid() $$;
  create function public.my_email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
  create table public.events (id bigint generated always as identity primary key, slug text not null unique, owner_handle text, title text not null, tagline text, description text, venue text,
    city text, starts_at timestamptz, ends_at timestamptz, cover_url text, genres text, status text not null default 'draft', featured boolean not null default false,
    created_at timestamptz not null default now(), reg_questions jsonb, show_lineup boolean not null default true, show_gallery boolean not null default true, show_feed boolean not null default true,
    series_id uuid, tz text not null default 'America/Los_Angeles', source text not null default 'organizer', source_url text, imported_at timestamptz, dedupe_key text, review_reason text,
    end_time_public boolean not null default true, waitlist_enabled boolean not null default false, hide_guest_count boolean not null default false, show_on_explore boolean not null default true,
    event_password_hash text, spotify_url text, youtube_url text, title_font text, accent_color text, features jsonb, gallery jsonb, submitted_by uuid, extra_links jsonb, state text, county text,
    link_status text, link_checked_at timestamptz, password_protected boolean);
  create table public.event_orders (id bigint generated always as identity primary key, event_id bigint, tier_id bigint, buyer_email text, buyer_handle text, qty int, status text,
    amount_cents int, created_at timestamptz default now(), checked_in_at timestamptz, qr_token text);
  create function public.check_in_ticket(p_qr text) returns void language sql security definer as $$ update public.event_orders set checked_in_at = now() where qr_token = p_qr $$;
  alter table public.events enable row level security; alter table public.event_orders enable row level security;
  create policy events_auth_insert on public.events for insert with check ((auth.uid() is not null) and (status = any (array['draft', 'review'])));
  create policy events_owner_read on public.events for select using (submitted_by = auth.uid() or owner_handle = my_handle());
  create policy events_public_read on public.events for select to anon, authenticated using (status = 'published');
  create policy event_orders_organizer_read on public.event_orders for select to authenticated using (event_id in (select events.id from public.events where events.owner_handle = my_handle()));
  create policy event_orders_organizer_update on public.event_orders for update to authenticated using (event_id in (select events.id from public.events where events.owner_handle = my_handle())) with check (event_id in (select events.id from public.events where events.owner_handle = my_handle()));
  create policy event_orders_owner_read on public.event_orders for select to authenticated using (buyer_email = my_email());
  grant usage on schema public to anon, authenticated; grant select, update, delete on public.event_orders to anon, authenticated; grant select on public.events to anon, authenticated;
  grant insert, update, delete on public.events to anon, authenticated; grant select on public.app_users to anon, authenticated;
  insert into public.app_users values ('${A}', 'alice'), ('${B}', 'bob');
  insert into public.events (slug, title, status, owner_handle, submitted_by) values ('alice-show', 'Alice show', 'published', 'alice', '${A}');
  insert into public.event_orders (event_id, buyer_email, buyer_handle, qty, status, amount_cents, qr_token) values (1, 'fan@example.com', 'fan', 2, 'paid', 5000, 'qr1');
`;
async function fresh(applied = true) { const d = new PGlite(); await d.exec(STANDIN); if (applied) await d.exec(rd(UPF)); return d; }
const as = async (d, uid, fn) => { await d.exec('reset role'); await d.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false)`); await d.exec(uid ? 'set role authenticated' : 'set role anon'); try { return await fn(); } finally { await d.exec('reset role'); } };
const ins = (cols, vals) => `insert into public.events (${cols}) values (${vals}) returning id`;

test('BEFORE (the stand-in = prod today): an organizer can rewrite any column of any order on their events; a member can insert a review row with featured / source / password hash / someone else owner_handle', { skip }, async () => {
  const d = await fresh(false);
  const r = await as(d, A, () => d.query("update public.event_orders set status = 'refunded', amount_cents = 1, buyer_email = 'x@y.z' where id = 1 returning id")); assert.equal(r.rows.length, 1);
  const i = await as(d, B, () => d.query(ins('slug, title, status, featured, source, event_password_hash, owner_handle, submitted_by', `'bad-1', 'x', 'review', true, 'official', 'h', 'alice', '${B}'`))); assert.equal(i.rows.length, 1);
});
test('event_orders: nobody changes or deletes an order from the client; check-in still works through the security-definer RPC; organizers and buyers still read', { skip }, async () => {
  const d = await fresh();
  for (const uid of [A, B, null]) {
    await assert.rejects(as(d, uid, () => d.query("update public.event_orders set status = 'refunded' where id = 1")), /permission denied/, 'update ' + uid);
    await assert.rejects(as(d, uid, () => d.query('delete from public.event_orders where id = 1')), /permission denied/, 'delete ' + uid);
  }
  assert.equal((await d.query('select status, amount_cents, buyer_email, checked_in_at from public.event_orders')).rows[0].status, 'paid');
  await as(d, A, () => d.query("select public.check_in_ticket('qr1')")); assert.ok((await d.query('select checked_in_at from public.event_orders')).rows[0].checked_in_at, 'check-in RPC still works');
  assert.equal((await as(d, A, () => d.query('select id from public.event_orders'))).rows.length, 1, 'the organizer still reads its attendees');
  assert.equal((await as(d, B, () => d.query('select id from public.event_orders'))).rows.length, 0, 'another member reads none');
  await d.exec("select set_config('request.jwt.claim.email', 'fan@example.com', false)"); assert.equal((await as(d, B, () => d.query('select id from public.event_orders'))).rows.length, 1, 'the buyer still reads their own order');
  assert.deepEqual((await d.query("select polname from pg_policy where polrelid = 'public.event_orders'::regclass order by 1")).rows.map((x) => x.polname), ['event_orders_organizer_read', 'event_orders_owner_read']);
});
test('events insert: a content-only draft / review row owned by the caller is accepted', { skip }, async () => {
  const d = await fresh();
  const ok = await as(d, B, () => d.query(ins('slug, title, status, submitted_by, owner_handle, city, starts_at', `'bob-1', 'Bob night', 'review', '${B}', 'bob', 'LA', now()`))); assert.equal(ok.rows.length, 1);
  assert.equal((await as(d, B, () => d.query(ins('slug, title, status, submitted_by', `'bob-2', 'No handle', 'draft', '${B}'`)))).rows.length, 1);
  const [e] = (await d.query("select featured, source from public.events where slug = 'bob-1'")).rows; assert.deepEqual(e, { featured: false, source: 'organizer' }, 'defaults apply');
});
test('events insert: featured, source, source_url, dedupe_key, review_reason, password hash, link_* and imported_at cannot be set by a client', { skip }, async () => {
  const d = await fresh();
  for (const [col, val] of [['featured', 'true'], ['source', "'official'"], ['source_url', "'https://x.example'"], ['dedupe_key', "'k'"], ['review_reason', "'r'"], ['event_password_hash', "'h'"], ['link_status', "'ok'"], ['imported_at', 'now()'], ['password_protected', 'true'], ['extra_links', "'[]'::jsonb"]]) {
    await assert.rejects(as(d, B, () => d.query(ins(`slug, title, status, submitted_by, ${col}`, `'x-${col}', 't', 'review', '${B}', ${val}`))), /permission denied/, col);
  }
});
test('events insert: a published row, someone else as submitter, or someone else as owner_handle is refused; anon cannot insert, update or delete events at all', { skip }, async () => {
  const d = await fresh();
  await assert.rejects(as(d, B, () => d.query(ins('slug, title, status, submitted_by', `'p-1', 't', 'published', '${B}'`))), /row-level security/);
  await assert.rejects(as(d, B, () => d.query(ins('slug, title, status, submitted_by', `'p-2', 't', 'review', '${A}'`))), /row-level security/);
  await assert.rejects(as(d, B, () => d.query(ins('slug, title, status, submitted_by, owner_handle', `'p-3', 't', 'review', '${B}', 'alice'`))), /row-level security/);
  await assert.rejects(as(d, B, () => d.query(ins('slug, title, status', `'p-4', 't', 'review'`))), /row-level security/, 'submitted_by is required to be the caller');
  await assert.rejects(as(d, null, () => d.query(ins('slug, title, status', `'p-5', 't', 'review'`))), /permission denied/);
  await assert.rejects(as(d, null, () => d.query("update public.events set title = 'x'")), /permission denied/); await assert.rejects(as(d, null, () => d.query('delete from public.events')), /permission denied/);
  assert.equal((await as(d, null, () => d.query('select id from public.events'))).rows.length, 1, 'anon still reads published events');
});
test('rollback restores exactly the previous grants and policies; apply -> rollback -> apply works', { skip }, async () => {
  const d = await fresh(); await d.exec(rd(DNF));
  assert.equal((await as(d, A, () => d.query("update public.event_orders set status = 'x' where id = 1 returning id"))).rows.length, 1);
  await as(d, B, () => d.query("insert into public.events (slug, title, status, featured) values ('rb-1', 't', 'review', true)"));   // no RETURNING: B cannot read that row back
  assert.equal((await d.query("select featured from public.events where slug = 'rb-1'")).rows[0].featured, true, 'before the hardening a client could set featured');
  assert.deepEqual((await d.query("select polname from pg_policy where polrelid = 'public.event_orders'::regclass order by 1")).rows.map((x) => x.polname), ['event_orders_organizer_read', 'event_orders_organizer_update', 'event_orders_owner_read']);
  await d.exec(rd(UPF)); await assert.rejects(as(d, A, () => d.query("update public.event_orders set status = 'y'")), /permission denied/);
});
test('files: marked DRAFT / NOT APPLIED; no table or column is dropped; nothing is granted to anon', () => {
  const up = rd(UPF), dn = rd(DNF); assert.match(up.slice(0, 200), /DRAFT, NOT APPLIED/); assert.match(dn.slice(0, 200), /Rollback for/);
  const code = up.replace(/^\s*--.*$/gm, ''); assert.doesNotMatch(code, /drop (table|column)|grant [^;]* to [^;]*anon/i);
});
