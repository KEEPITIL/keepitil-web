// kil_set_my_event_tz + get_event_for_edit(tz), run for real in PGlite on a stand-in of the prod tables.
//   KIL_PGLITE=/path/node_modules/@electric-sql/pglite node --test tests/event-tz.pglite.test.mjs
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
  create table public.app_users (id uuid primary key, handle text);
  create table public.events (id bigint generated always as identity primary key, slug text unique, owner_handle text, submitted_by uuid, title text, tagline text, description text, venue text, city text,
    starts_at timestamptz, ends_at timestamptz, cover_url text, genres text, status text, reg_questions jsonb, series_id uuid, show_lineup boolean default true, show_gallery boolean default true, show_feed boolean default true,
    end_time_public boolean default true, waitlist_enabled boolean default false, hide_guest_count boolean default false, show_on_explore boolean default true, spotify_url text, youtube_url text, title_font text,
    accent_color text, features jsonb, gallery jsonb, event_password_hash text, tz text not null default 'America/Los_Angeles');
  create table public.ticket_tiers (id bigint generated always as identity primary key, event_id bigint, name text, description text, price_cents int, qty_total int, sales_start timestamptz, sales_end timestamptz, show_qty boolean, sort int);
  create table public.event_orders (id bigint generated always as identity primary key, event_id bigint, status text);
  create function public.kil_caller_handle() returns text language sql stable security definer set search_path = '' as $$ select handle from public.app_users where id = auth.uid() $$;
  create function public.kil_event_id_for_slug(p_slug text) returns bigint language sql stable security definer set search_path = '' as $$ select e.id from public.events e where e.slug = p_slug limit 1 $$;
  create function public.kil_row_owned(p_id bigint) returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce((select e.submitted_by = auth.uid() or (e.submitted_by is null and e.owner_handle is not null and e.owner_handle = public.kil_caller_handle()) from public.events e where e.id = p_id), false) and auth.uid() is not null; $$;
  insert into public.app_users values ('${A}', 'alice'), ('${B}', 'bob');
  insert into public.events (slug, owner_handle, submitted_by, title, status, starts_at, city) values ('ny-night', 'alice', '${A}', 'NY Night', 'published', '2027-03-06T01:00:00Z', 'New York');
  create role authenticated nologin; create role anon nologin; grant usage on schema public, auth to authenticated, anon; grant select on all tables in schema public to authenticated;
`;
const call = async (db, uid, fn, args) => { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false)`); await db.exec('set role authenticated');
  try { const r = await db.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args); return r.rows[0].r; } finally { await db.exec('reset role'); } };
async function fresh(up) { const db = new PGlite(); await db.exec(STANDIN); await db.exec(rd('20261128130000_event_tz.rollback.sql').replace('drop function if exists public.kil_set_my_event_tz(text, text);', '')); if (up) await db.exec(rd('20261128130000_event_tz.sql')); return db; }
test('BEFORE: the edit form is not told the event zone', { skip }, async () => {
  assert.equal((await call(await fresh(false), A, 'get_event_for_edit', ['ny-night'])).ev.tz, undefined);
});
test('AFTER: owner sets a US zone, edit reads it back; others, signed-out, bad zone and bad slug are refused and change nothing', { skip }, async () => {
  const db = await fresh(true);
  assert.deepEqual(await call(db, A, 'kil_set_my_event_tz', ['ny-night', 'America/New_York']), { ok: true, tz: 'America/New_York' });
  assert.equal((await call(db, A, 'get_event_for_edit', ['ny-night'])).ev.tz, 'America/New_York');
  assert.equal((await call(db, B, 'kil_set_my_event_tz', ['ny-night', 'America/Denver'])).error, 'forbidden');
  assert.equal((await call(db, '', 'kil_set_my_event_tz', ['ny-night', 'America/Denver'])).error, 'not_authenticated');
  for (const z of ['Europe/Paris', 'US/Eastern', '', null, 'America/New_York; drop table events']) assert.equal((await call(db, A, 'kil_set_my_event_tz', ['ny-night', z])).error, 'bad_tz');
  assert.equal((await call(db, A, 'kil_set_my_event_tz', ['Bad Slug!', 'America/Denver'])).error, 'bad_slug');
  assert.equal((await call(db, A, 'kil_set_my_event_tz', ['nope', 'America/Denver'])).error, 'forbidden');
  assert.equal((await db.query(`select tz from public.events where slug='ny-night'`)).rows[0].tz, 'America/New_York');
});
test('AFTER: anon cannot execute the setter; ROLLBACK removes it and the tz key', { skip }, async () => {
  const db = await fresh(true);
  assert.equal((await db.query(`select has_function_privilege('anon', 'public.kil_set_my_event_tz(text,text)', 'execute') a, has_function_privilege('authenticated', 'public.kil_set_my_event_tz(text,text)', 'execute') b`)).rows[0].a, false);
  await db.exec(rd('20261128130000_event_tz.rollback.sql'));
  assert.equal((await db.query(`select count(*)::int n from pg_proc where proname = 'kil_set_my_event_tz'`)).rows[0].n, 0);
  assert.equal((await call(db, A, 'get_event_for_edit', ['ny-night'])).ev.tz, undefined);
});
