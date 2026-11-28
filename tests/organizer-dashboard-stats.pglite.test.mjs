// organizer_dashboard stats, run for real in PGlite against a stand-in of the prod tables (read 2026-11-28).
//   KIL_PGLITE=/path/node_modules/@electric-sql/pglite node --test tests/organizer-dashboard-stats.pglite.test.mjs
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
  create table public.events (id bigint generated always as identity primary key, slug text, owner_handle text, title text, cover_url text, status text, starts_at timestamptz,
    tz text not null default 'America/Los_Angeles', city text, venue text);
  create table public.ticket_tiers (id bigint generated always as identity primary key, event_id bigint, price_cents int);
  create table public.event_orders (id bigint generated always as identity primary key, event_id bigint, tier_id bigint, qty int, status text, checked_in_at timestamptz);
  create table public.event_registrations (id bigint generated always as identity primary key, event_id bigint, buyer_email text);
  insert into public.app_users values ('${A}', 'alice'), ('${B}', 'bob');
  insert into public.events (slug, owner_handle, title, status, starts_at, tz) values ('paid-ny', 'alice', 'NY paid', 'published', '2027-03-05T03:00:00Z', 'America/New_York'),
    ('free-rsvp', 'alice', 'Free RSVP', 'published', '2027-04-01T20:00:00Z', 'America/Los_Angeles'), ('bobs', 'bob', 'Bobs', 'published', '2027-04-02T20:00:00Z', 'America/Los_Angeles');
  insert into public.ticket_tiers (event_id, price_cents) values (1, 2500), (3, 1000);
  insert into public.event_orders (event_id, tier_id, qty, status, checked_in_at) values (1, 1, 4, 'paid', now()), (1, 1, 1, 'paid', null), (1, 1, 2, 'pending', null), (1, 1, 1, 'refunded', null), (3, 2, 1, 'paid', null);
  insert into public.event_registrations (event_id, buyer_email) values (2, 'a@x.test'), (2, 'b@x.test'), (2, 'c@x.test'), (1, 'd@x.test');
  create role authenticated nologin; grant usage on schema public, auth to authenticated; grant all on all tables in schema public to authenticated;
`;
const run = async (db, uid) => { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false)`); await db.exec('set role authenticated');
  const r = await db.query('select public.organizer_dashboard() as r'); await db.exec('reset role'); return r.rows[0].r; };
async function fresh(up) { const db = new PGlite(); await db.exec(STANDIN); await db.exec(rd('20261128121000_organizer_dashboard_stats.rollback.sql')); if (up) await db.exec(rd('20261128121000_organizer_dashboard_stats.sql')); return db; }
const by = (rows, slug) => rows.find((x) => x.slug === slug);
test('BEFORE: orders are counted as tickets, free RSVPs read 0, and no time zone is returned (the defect)', { skip }, async () => {
  const rows = await run(await fresh(false), A);
  assert.equal(by(rows, 'paid-ny').sold, 2, '5 tickets were sold in 2 paid orders; the dashboard says 2');
  assert.equal(by(rows, 'paid-ny').tz, undefined); assert.equal(by(rows, 'free-rsvp').rsvps, undefined);
});
test('AFTER: tickets (not orders), checked-in tickets, free RSVPs, the zone; revenue unchanged; only the caller\'s own events', { skip }, async () => {
  const rows = await run(await fresh(true), A);
  assert.equal(rows.length, 2); assert.equal(by(rows, 'bobs'), undefined);
  const p = by(rows, 'paid-ny'); assert.equal(p.sold, 5); assert.equal(p.checked_in, 4); assert.equal(p.revenue_cents, 12500); assert.equal(p.tz, 'America/New_York'); assert.equal(p.rsvps, 1);
  const f = by(rows, 'free-rsvp'); assert.equal(f.sold, 0); assert.equal(f.rsvps, 3); assert.equal(f.revenue_cents, 0);
  assert.deepEqual(await run(await fresh(true), ''), [], 'signed out: no rows');
});
test('ROLLBACK restores the old shape exactly', { skip }, async () => {
  const db = await fresh(true); await db.exec(rd('20261128121000_organizer_dashboard_stats.rollback.sql'));
  const p = by(await run(db, A), 'paid-ny'); assert.equal(p.sold, 2); assert.equal(p.tz, undefined);
});
