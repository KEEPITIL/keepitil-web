// duplicate_event full copy, run for real in PGlite against a stand-in of the prod events/ticket_tiers tables (read 2026-11-28).
//   KIL_PGLITE=/path/node_modules/@electric-sql/pglite node --test tests/duplicate-event.pglite.test.mjs
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
  create table public.events (
    id bigint generated always as identity primary key, slug text not null unique, owner_handle text, title text not null, tagline text, description text, venue text,
    city text, state text, county text, starts_at timestamptz, ends_at timestamptz, cover_url text, genres text, status text not null default 'draft',
    reg_questions jsonb, show_lineup boolean not null default true, show_gallery boolean not null default true, show_feed boolean not null default true,
    tz text not null default 'America/Los_Angeles', source text not null default 'organizer', end_time_public boolean not null default true,
    waitlist_enabled boolean not null default false, hide_guest_count boolean not null default false, show_on_explore boolean not null default true,
    event_password_hash text, password_protected boolean, spotify_url text, youtube_url text, title_font text, accent_color text, features jsonb, gallery jsonb, extra_links jsonb,
    constraint events_title_chk check (char_length(title) between 1 and 160));
  create table public.ticket_tiers (id bigint generated always as identity primary key, event_id bigint references public.events(id), name text, price_cents int, currency text default 'usd',
    qty_total int, qty_sold int default 0, sales_start timestamptz, sales_end timestamptz, stripe_payment_link text, sort int, description text, show_qty boolean default false);
  insert into public.app_users values ('${A}', 'alice'), ('${B}', 'bob');
  insert into public.events (slug, owner_handle, title, tagline, description, venue, city, state, county, tz, starts_at, ends_at, status, reg_questions, show_lineup, show_gallery, show_feed,
    end_time_public, waitlist_enabled, hide_guest_count, show_on_explore, event_password_hash, password_protected, spotify_url, youtube_url, title_font, accent_color, features, gallery, extra_links)
  values ('src-ny', 'alice', 'NY Night', 'tag', 'desc', 'Terminal 5', 'New York', 'NY', 'New York', 'America/New_York', '2027-03-05T03:00:00Z', '2027-03-05T09:00:00Z', 'published',
    '[{"q":"Diet"}]', false, false, false, false, true, true, false, 'hash', true, 'https://open.spotify.com/x', 'https://youtu.be/x', 'Bebas', '#ff00aa', '{"vip":true}', '[{"u":"i"}]', '[{"l":"a"}]');
  insert into public.ticket_tiers (event_id, name, price_cents, qty_total, qty_sold, sales_start, sales_end, stripe_payment_link, sort, description, show_qty)
  values (1, 'GA', 2500, 100, 40, '2026-01-01', '2026-02-01', 'https://buy.stripe.com/old', 0, 'Door at 9', true), (1, 'VIP', 9000, 10, 3, null, null, null, 1, null, false);
  create role authenticated nologin; grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated;
`;
const as = async (db, uid) => { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false)`); if (uid) await db.exec('set role authenticated'); };
const dup = async (db, uid, id) => { await as(db, uid); const r = await db.query('select public.duplicate_event($1) as r', [id]); await db.exec('reset role'); return r.rows[0].r; };
async function fresh(file) {
  const db = new PGlite(); await db.exec(STANDIN);
  // the prod function before this change, so the BEFORE test reproduces the defect
  await db.exec(rd('20261128120000_duplicate_event_full_copy.rollback.sql'));
  if (file) await db.exec(rd(file));
  return db;
}
test('BEFORE: the thin copy loses the time zone, end time, county and page settings (the defect)', { skip }, async () => {
  const db = await fresh(); const r = await dup(db, A, 1);
  const e = (await db.query('select * from public.events where slug = $1', [r.slug])).rows[0];
  assert.equal(e.tz, 'America/Los_Angeles', 'a New York show is copied onto Los Angeles time');
  assert.equal(e.ends_at, null); assert.equal(e.county, null); assert.equal(e.show_lineup, true);
});
test('AFTER: the copy keeps zone, times, place, page settings and tier text; a private review row owned by the caller; no sales window, no payment link, no sold count', { skip }, async () => {
  const db = await fresh('20261128120000_duplicate_event_full_copy.sql'); const r = await dup(db, A, 1);
  assert.ok(r.slug && r.event_id);
  const e = (await db.query('select * from public.events where id = $1', [r.event_id])).rows[0], s = (await db.query('select * from public.events where id = 1')).rows[0];
  assert.equal(e.status, 'review'); assert.equal(e.owner_handle, 'alice'); assert.equal(e.title, 'NY Night (copy)'); assert.notEqual(e.slug, s.slug);
  for (const k of ['tz', 'state', 'county', 'city', 'venue', 'ends_at', 'starts_at', 'show_lineup', 'show_gallery', 'show_feed', 'end_time_public', 'waitlist_enabled', 'hide_guest_count', 'show_on_explore',
    'event_password_hash', 'password_protected', 'spotify_url', 'youtube_url', 'title_font', 'accent_color', 'tagline', 'description']) assert.deepEqual(e[k], s[k], k);
  for (const k of ['reg_questions', 'features', 'gallery', 'extra_links']) assert.deepEqual(e[k], s[k], k);
  const t = (await db.query('select * from public.ticket_tiers where event_id = $1 order by sort', [r.event_id])).rows;
  assert.equal(t.length, 2); assert.equal(t[0].description, 'Door at 9'); assert.equal(t[0].show_qty, true); assert.equal(t[0].price_cents, 2500); assert.equal(t[0].qty_total, 100);
  assert.equal(t[0].qty_sold, 0, 'sold count starts at zero'); assert.equal(t[0].sales_start, null); assert.equal(t[0].sales_end, null); assert.equal(t[0].stripe_payment_link, null);
  assert.equal((await db.query('select count(*)::int n from public.ticket_tiers where event_id = 1')).rows[0].n, 2, 'the original keeps its tiers');
});
test('AFTER: other people and signed-out callers cannot copy someone else\'s event; a 160-character title still fits', { skip }, async () => {
  const db = await fresh('20261128120000_duplicate_event_full_copy.sql');
  assert.deepEqual(await dup(db, B, 1), { error: 'notyours' }); assert.deepEqual(await dup(db, '', 1), { error: 'unauth' }); assert.deepEqual(await dup(db, A, 999), { error: 'notyours' });
  await db.exec(`update public.events set title = repeat('x', 160) where id = 1`);
  const r = await dup(db, A, 1); assert.equal((await db.query('select char_length(title) n from public.events where id = $1', [r.event_id])).rows[0].n, 160);
});
test('ROLLBACK restores the thin copy exactly', { skip }, async () => {
  const db = await fresh('20261128120000_duplicate_event_full_copy.sql'); await db.exec(rd('20261128120000_duplicate_event_full_copy.rollback.sql'));
  const r = await dup(db, A, 1); assert.equal((await db.query('select tz from public.events where id = $1', [r.event_id])).rows[0].tz, 'America/Los_Angeles');
});
