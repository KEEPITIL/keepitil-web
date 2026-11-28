// kil_cancel_my_event + get_event_view(cancelled), run for real in PGlite on a stand-in of the prod tables.
//   KIL_PGLITE=/path/node_modules/@electric-sql/pglite node --test tests/cancel-event.pglite.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const rd = (f) => fs.readFileSync(path.join(here, '..', 'supabase', 'migrations', f), 'utf8');
const dir = process.env.KIL_PGLITE;
let PGlite = null;
if (dir) { PGlite = (await import(pathToFileURL(path.join(dir, 'dist', 'index.js')).href)).PGlite; }
const skip = PGlite ? false : 'set KIL_PGLITE to the @electric-sql/pglite package directory';
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const STANDIN = `
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.app_users (id uuid primary key, handle text, display_name text);
  create table public.profile_meta (slug text, display_name text);
  create function public.is_admin() returns boolean language sql stable as $$ select false $$;
  create table public.events (id bigint generated always as identity primary key, slug text unique, owner_handle text, submitted_by uuid, title text, tagline text, description text, venue text, city text,
    starts_at timestamptz, ends_at timestamptz, genres text, cover_url text, status text not null, reg_questions jsonb, show_lineup boolean default true, show_gallery boolean default true, show_feed boolean default true,
    series_id uuid, source_url text, state text, county text, tz text default 'America/Los_Angeles',
    constraint events_status_chk check (status = any (array['draft','review','published','sold_out','cancelled','past','archived'])));
  create table public.event_orders (id bigint generated always as identity primary key, event_id bigint, status text, buyer_email text);
  create table public.event_registrations (id bigint generated always as identity primary key, event_id bigint, buyer_email text);
  create function public.kil_caller_handle() returns text language sql stable security definer set search_path = '' as $$ select handle from public.app_users where id = auth.uid() $$;
  create function public.kil_event_id_for_slug(p_slug text) returns bigint language sql stable security definer set search_path = '' as $$ select e.id from public.events e where e.slug = p_slug limit 1 $$;
  create function public.kil_row_owned(p_id bigint) returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce((select e.submitted_by = auth.uid() or (e.submitted_by is null and e.owner_handle is not null and e.owner_handle = public.kil_caller_handle()) from public.events e where e.id = p_id), false) and auth.uid() is not null; $$;
  insert into public.app_users values ('${A}', 'alice', 'Alice'), ('${B}', 'bob', 'Bob');
  insert into public.events (slug, owner_handle, submitted_by, title, status, starts_at) values ('live', 'alice', '${A}', 'Live', 'published', now() + interval '10 days'),
    ('hidden', 'alice', '${A}', 'Hidden', 'archived', now()), ('rev', 'alice', '${A}', 'Rev', 'review', now()), ('bobs', 'bob', '${B}', 'Bobs', 'published', now());
  insert into public.event_registrations (event_id, buyer_email) values (1, 'a@x.test'), (1, 'A@x.test'), (1, ''), (1, null);
  insert into public.event_orders (event_id, status, buyer_email) values (1, 'paid', 'b@x.test'), (1, 'paid', 'a@x.test'), (1, 'pending', 'c@x.test');
  create role authenticated nologin; create role anon nologin; grant usage on schema public, auth to authenticated, anon; grant select on all tables in schema public to authenticated, anon;
`;
const call = async (db, uid, fn, args) => { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false)`); await db.exec(uid === 'anon' ? 'set role anon' : 'set role authenticated');
  try { const r = await db.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args); return r.rows[0].r; } finally { await db.exec('reset role'); } };
const view = async (db, slug) => { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); await db.exec('set role anon'); try { return (await db.query('select slug, status from public.get_event_view($1)', [slug])).rows; } finally { await db.exec('reset role'); } };
async function fresh(up) { const db = new PGlite(); await db.exec(STANDIN); await db.exec(rd('20261128140000_cancel_event.rollback.sql').replace('drop function if exists public.kil_cancel_my_event(text);', '')); if (up) await db.exec(rd('20261128140000_cancel_event.sql')); return db; }
const st = async (db, slug) => (await db.query('select status from public.events where slug = $1', [slug])).rows[0].status;
test('BEFORE: a cancelled event is "not found" to the public', { skip }, async () => {
  const db = await fresh(false); await db.exec(`update public.events set status = 'cancelled' where slug = 'live'`); assert.deepEqual(await view(db, 'live'), []);
});
test('AFTER: owner cancels; counts are distinct emails and paid orders; the public view shows it as cancelled; running it twice is harmless', { skip }, async () => {
  const db = await fresh(true);
  assert.deepEqual(await call(db, A, 'kil_cancel_my_event', ['live']), { ok: true, already: false, attendees: 2, paid_orders: 2 });
  assert.equal(await st(db, 'live'), 'cancelled'); assert.deepEqual(await view(db, 'live'), [{ slug: 'live', status: 'cancelled' }]);
  assert.deepEqual(await call(db, A, 'kil_cancel_my_event', ['live']), { ok: true, already: true, attendees: 2, paid_orders: 2 });
  assert.deepEqual(await call(db, A, 'kil_cancel_my_event', ['rev']), { ok: true, already: false, attendees: 0, paid_orders: 0 });
});
test('AFTER: other owners, signed-out, hidden/archived events, bad and unknown slugs are refused and change nothing; the view still hides archived', { skip }, async () => {
  const db = await fresh(true);
  assert.equal((await call(db, B, 'kil_cancel_my_event', ['live'])).error, 'forbidden'); assert.equal((await call(db, '', 'kil_cancel_my_event', ['live'])).error, 'not_authenticated');
  assert.equal((await call(db, A, 'kil_cancel_my_event', ['hidden'])).error, 'not_cancellable'); assert.equal((await call(db, A, 'kil_cancel_my_event', ['Bad Slug'])).error, 'bad_slug');
  assert.equal((await call(db, A, 'kil_cancel_my_event', ['nope'])).error, 'forbidden'); assert.equal(await st(db, 'live'), 'published'); assert.equal(await st(db, 'hidden'), 'archived');
  assert.deepEqual(await view(db, 'hidden'), []);
});
test('AFTER: anon cannot execute the cancel RPC; ROLLBACK removes it and hides cancelled events again', { skip }, async () => {
  const db = await fresh(true);
  assert.equal((await db.query(`select has_function_privilege('anon', 'public.kil_cancel_my_event(text)', 'execute') a`)).rows[0].a, false);
  await call(db, A, 'kil_cancel_my_event', ['live']); await db.exec(rd('20261128140000_cancel_event.rollback.sql'));
  assert.equal((await db.query(`select count(*)::int n from pg_proc where proname = 'kil_cancel_my_event'`)).rows[0].n, 0); assert.deepEqual(await view(db, 'live'), []);
});
