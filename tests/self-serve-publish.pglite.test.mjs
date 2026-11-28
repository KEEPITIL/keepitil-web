// Self-serve events migrations, run for real in PGlite (in-memory Postgres; nothing real is touched) against a stand-in of the REAL keepitil-prod tables
// (columns, defaults, checks and the pre-existing policies as read on 2026-11-27). Needs @electric-sql/pglite: KIL_PGLITE=<path to the package dir>.
//   KIL_PGLITE=/path/node_modules/@electric-sql/pglite node --test tests/self-serve-publish.pglite.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.join(here, '..', 'supabase', 'migrations');
const rd = (f) => fs.readFileSync(path.join(MIG, f), 'utf8');
const dir = process.env.KIL_PGLITE;
let PGlite = null;
if (dir) { PGlite = (await import(pathToFileURL(path.join(dir, 'dist', 'index.js')).href)).PGlite; }
const skip = PGlite ? false : 'set KIL_PGLITE to the @electric-sql/pglite package directory';

const M = ['20261127170000_self_serve_publish.sql', '20261127171000_creator_promo.sql', '20261127172000_owner_attendees.sql', '20261127173000_connect_account.sql'];
const R = M.map((f) => f.replace('.sql', '.rollback.sql')).reverse();
const U = { a: '11111111-1111-1111-1111-111111111111', b: '22222222-2222-2222-2222-222222222222', c: '33333333-3333-3333-3333-333333333333', adm: '99999999-9999-9999-9999-999999999999' };

const STANDIN = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function extensions.gen_salt(text) returns text language sql as $$ select 'salt' $$;
  create function extensions.crypt(text, text) returns text language sql as $$ select md5($1) $$;
  create table public.app_users (id uuid primary key, handle text, stripe_account_id text, payouts_enabled boolean not null default false);
  create function public.is_admin() returns boolean language sql stable security definer as $$ select coalesce(current_setting('request.jwt.claim.sub', true), '') = '${U.adm}' $$;
  create function public.my_handle() returns text language sql stable security definer as $$ select handle from public.app_users where id = auth.uid() $$;
  create table public.events (
    id bigint generated always as identity primary key, slug text not null unique, owner_handle text, title text not null, tagline text, description text, venue text,
    city text, starts_at timestamptz, ends_at timestamptz, cover_url text, genres text, status text not null default 'draft', featured boolean not null default false,
    created_at timestamptz not null default now(), reg_questions jsonb, show_lineup boolean not null default true, show_gallery boolean not null default true,
    show_feed boolean not null default true, series_id uuid, tz text not null default 'America/Los_Angeles', source text not null default 'organizer', source_url text,
    dedupe_key text, review_reason text, end_time_public boolean not null default true, waitlist_enabled boolean not null default false, hide_guest_count boolean not null default false,
    show_on_explore boolean not null default true, event_password_hash text, spotify_url text, youtube_url text, title_font text, accent_color text, features jsonb, gallery jsonb,
    submitted_by uuid, extra_links jsonb, link_status text, password_protected boolean,
    constraint events_status_chk check (status = any (array['draft','review','published','sold_out','cancelled','past','archived'])),
    constraint events_title_chk check (char_length(title) between 1 and 160));
  create table public.ticket_tiers (id bigint generated always as identity primary key, event_id bigint references public.events(id), name text, price_cents int, currency text default 'usd',
    qty_total int, qty_sold int default 0, sales_start timestamptz, sales_end timestamptz, stripe_payment_link text, sort int, description text, show_qty boolean default false);
  create table public.event_orders (id bigint generated always as identity primary key, event_id bigint, tier_id bigint, buyer_email text, buyer_handle text, qty int, referral_code text,
    qr_token text, status text, amount_cents int, created_at timestamptz default now(), stripe_session_id text, stripe_payment_intent text, application_fee_cents int, organizer_acct text, checked_in_at timestamptz);
  create table public.event_registrations (id bigint generated always as identity primary key, event_id bigint, event_slug text, buyer_email text, buyer_name text, answers jsonb, created_at timestamptz default now());
  create table public.event_promo_codes (id bigint generated always as identity primary key, event_id bigint, code text, kind text, value int, uses_left int, active boolean default true);
  create function public.events_apply_extras(p_event_id bigint, ev jsonb) returns void language plpgsql security definer set search_path to 'public' as $$
  begin
    update public.events set
      ends_at = case when ev ? 'ends_at' then nullif(ev->>'ends_at','')::timestamptz else ends_at end,
      spotify_url = case when ev ? 'spotify_url' then nullif(ev->>'spotify_url','') else spotify_url end,
      youtube_url = case when ev ? 'youtube_url' then nullif(ev->>'youtube_url','') else youtube_url end,
      event_password_hash = case when ev ? 'password_clear' and nullif(ev->>'password_clear','') is not null then extensions.crypt(ev->>'password_clear', extensions.gen_salt('bf'))
                                 when ev ? 'password_clear' then null else event_password_hash end
    where id = p_event_id;
  end $$;
  alter table public.events enable row level security; alter table public.ticket_tiers enable row level security; alter table public.event_promo_codes enable row level security; alter table public.event_orders enable row level security;
  create policy events_auth_insert on public.events for insert with check (auth.uid() is not null and status = any (array['draft','review']));
  create policy events_owner_read on public.events for select using (submitted_by = auth.uid() or owner_handle = my_handle() or is_admin());
  create policy events_public_read on public.events for select to anon, authenticated using (status = 'published');
  create policy tiers_owner_insert on public.ticket_tiers for insert with check (is_admin() or (event_id in (select e.id from public.events e where e.owner_handle = my_handle())));
  create policy tiers_public_read on public.ticket_tiers for select using (exists (select 1 from public.events e where e.id = ticket_tiers.event_id and e.status = 'published'));
  create policy promo_public_read on public.event_promo_codes for select using (active = true);
  grant usage on schema public to anon, authenticated; grant select on all tables in schema public to anon, authenticated;
  grant insert, update, delete on public.events to authenticated; grant insert, update, delete on public.ticket_tiers to authenticated;
  insert into public.app_users (id, handle, payouts_enabled) values ('${U.a}', 'alice', false), ('${U.b}', 'bob', false), ('${U.c}', null, false), ('${U.adm}', 'staff', true);
  create function public.mark_payouts_enabled() returns void language plpgsql security definer set search_path = '' as $$
  begin
    update public.app_users set payouts_enabled = true where id = auth.uid();
  end $$;
  grant execute on function public.mark_payouts_enabled() to public, anon, authenticated;
`;
async function fresh(withMigrations = true) {
  const db = new PGlite();
  await db.exec(STANDIN);
  if (withMigrations) for (const f of M) await db.exec(rd(f));
  return db;
}
const as = async (db, uid) => { await db.exec('reset role'); if (uid) { await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`); await db.exec('set role authenticated'); } else { await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); await db.exec('set role anon'); } };
const call = async (db, uid, fn, args) => { await as(db, uid); try { const r = await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args.map((a) => (a !== null && typeof a === 'object' ? JSON.stringify(a) : a))); return r.rows[0].r; } finally { await db.exec('reset role'); } };
const ev = (o) => ({ title: 'Warehouse night', starts_at: '2027-03-01T20:00:00-08:00', ...o });
const free = [{ name: 'Free', price_cents: 0, qty_total: 50 }];
const paid = [{ name: 'GA', price_cents: 2500, qty_total: 100, sales_start: '2027-01-01T00:00:00Z', sales_end: '2027-02-28T00:00:00Z', show_qty: true }];
const rows = async (db, sql, p) => { await db.exec('reset role'); return (await db.query(sql, p)).rows; };

test('a member with a handle publishes a free event: owner columns set, source organizer, never featured, tier fields kept', { skip }, async () => {
  const db = await fresh(); const r = await call(db, U.a, 'kil_publish_own_event', [ev({ featured: true, source: 'official', status: 'review', event_password_hash: 'x', link_status: 'ok', ends_at: '2027-03-02T02:00:00Z', spotify_url: 'https://open.spotify.com/x' }), paid.map((t) => ({ ...t, price_cents: 0 }))]);
  assert.equal(r.status, 'published'); assert.match(r.slug, /^warehouse-night-[0-9a-f]{5}$/);
  const [e] = await rows(db, 'select * from public.events where id = $1', [r.id]);
  assert.equal(e.status, 'published'); assert.equal(e.submitted_by, U.a); assert.equal(e.owner_handle, 'alice'); assert.equal(e.source, 'organizer'); assert.equal(e.featured, false);
  assert.equal(e.event_password_hash, null, 'a client cannot set the password hash'); assert.equal(e.link_status, null); assert.equal(e.spotify_url, 'https://open.spotify.com/x'); assert.ok(e.ends_at, 'events_apply_extras still runs');
  const [t] = await rows(db, 'select * from public.ticket_tiers where event_id = $1', [r.id]); assert.equal(t.sort, 0); assert.equal(t.show_qty, true); assert.ok(t.sales_start && t.sales_end);
});
test('a handle is required; signed-out is refused; bad link / missing date / long title are refused (nothing is written)', { skip }, async () => {
  const db = await fresh();
  assert.equal((await call(db, U.c, 'kil_publish_own_event', [ev({}), free])).error, 'handle_required');
  await assert.rejects(call(db, null, 'kil_publish_own_event', [ev({}), free]), /permission denied/, 'anon cannot even execute it');
  assert.equal((await call(db, U.a, 'kil_publish_own_event', [ev({ cover_url: 'http://x.example/a.png' }), free])).error, 'bad_link');
  assert.equal((await call(db, U.a, 'kil_publish_own_event', [ev({ starts_at: 'nonsense' }), free])).error, 'starts_at_required');
  assert.equal((await call(db, U.a, 'kil_publish_own_event', [ev({ title: 'x'.repeat(161) }), free])).error, 'title_required');
  assert.equal((await rows(db, 'select count(*)::int n from public.events'))[0].n, 0);
});
test('HIGH: price_cents > 0 is refused unless the caller is an admin or has payouts enabled (create, update and series)', { skip }, async () => {
  const db = await fresh();
  const no = await call(db, U.a, 'kil_publish_own_event', [ev({}), paid]); assert.equal(no.error, 'payouts_required');
  assert.equal((await rows(db, 'select count(*)::int n from public.events'))[0].n, 0);
  const okFree = await call(db, U.a, 'kil_publish_own_event', [ev({}), free]);
  assert.equal((await call(db, U.a, 'kil_update_own_event', [okFree.slug, ev({}), paid])).error, 'payouts_required');
  assert.equal((await call(db, U.a, 'kil_publish_own_series', [ev({}), paid, ['2027-04-01T20:00:00Z', '2027-04-08T20:00:00Z']])).error, 'payouts_required');
  await db.exec('reset role');
  await db.exec(`update public.app_users set payouts_enabled = true where id = '${U.a}'`);
  assert.equal((await call(db, U.a, 'kil_publish_own_event', [ev({}), paid])).status, 'published');
  // Table-level UPDATE is what members have on their profile. Column REVOKE does not remove it, so the trigger must.
  await db.exec('reset role');
  await db.exec('grant select, update on table public.app_users to authenticated, service_role');
  await as(db, U.a);
  for (const sql of [
    `update public.app_users set payouts_enabled = false where id = '${U.a}'`,
    `update public.app_users set stripe_account_id = 'acct_member' where id = '${U.a}'`,
  ]) {
    const denied = await db.query(sql).then(() => null, (e) => e);
    assert.ok(denied && /not member-writable/.test(denied.message), denied && denied.message);
  }
  await db.exec('reset role');
  await db.exec('set role service_role');
  await db.query(`update public.app_users set stripe_account_id = 'acct_ok' where id = '${U.a}'`);
  await db.exec('reset role');
  assert.equal((await rows(db, `select stripe_account_id from public.app_users where id = '${U.a}'`))[0].stripe_account_id, 'acct_ok');
  assert.equal((await call(db, U.adm, 'kil_publish_own_event', [ev({ title: 'Staff show' }), paid])).status, 'published');
  assert.equal((await call(db, U.a, 'kil_publish_own_event', [ev({}), [{ name: 'x', price_cents: '12.5' }]])).error, 'bad_price');
});
test('HIGH: mark_payouts_enabled is not callable by a member, and a member insert cannot set payout columns', { skip }, async () => {
  const db = await fresh();
  await as(db, U.a);
  const called = await db.query('select public.mark_payouts_enabled()').then(() => null, (e) => e);
  assert.ok(called && /permission denied/.test(called.message), called && called.message);
  await as(db, null);
  const anonCall = await db.query('select public.mark_payouts_enabled()').then(() => null, (e) => e);
  assert.ok(anonCall && /permission denied/.test(anonCall.message), anonCall && anonCall.message);
  await db.exec('reset role');
  assert.equal((await rows(db, `select payouts_enabled from public.app_users where id = '${U.a}'`))[0].payouts_enabled, false);
  // Table-level INSERT covers every column, so re-grant it (and the two columns). The trigger still rejects a non-default.
  await db.exec('grant insert on table public.app_users to authenticated, service_role');
  await db.exec('grant insert (payouts_enabled, stripe_account_id) on table public.app_users to authenticated');
  await as(db, U.a);
  const newbie = '44444444-4444-4444-4444-444444444444';
  for (const sql of [
    `insert into public.app_users (id, handle, payouts_enabled) values ('${newbie}', 'neo', true)`,
    `insert into public.app_users (id, handle, stripe_account_id) values ('${newbie}', 'neo', 'acct_member')`,
  ]) {
    const denied = await db.query(sql).then(() => null, (e) => e);
    assert.ok(denied && /not member-writable/.test(denied.message), denied && denied.message);
  }
  await db.query(`insert into public.app_users (id, handle) values ('${newbie}', 'neo')`);
  await db.exec('reset role');
  assert.deepEqual(await rows(db, `select payouts_enabled, stripe_account_id from public.app_users where id = '${newbie}'`), [{ payouts_enabled: false, stripe_account_id: null }]);
  await db.exec('set role service_role');
  const platform = '55555555-5555-5555-5555-555555555555';
  await db.query(`insert into public.app_users (id, handle, payouts_enabled, stripe_account_id) values ('${platform}', 'stripe', true, 'acct_ok')`);
  await db.exec('reset role');
  assert.deepEqual(await rows(db, `select payouts_enabled, stripe_account_id from public.app_users where id = '${platform}'`), [{ payouts_enabled: true, stripe_account_id: 'acct_ok' }]);
});
test('HIGH: writes are RPC-only. A signed-in user cannot PATCH featured / source / link_status / password hash / cover_url / status, insert a published or featured row, or insert a priced tier directly', { skip }, async () => {
  const db = await fresh(); const r = await call(db, U.a, 'kil_publish_own_event', [ev({}), free]);
  await as(db, U.a);
  for (const sql of ["update public.events set featured = true where slug = '" + r.slug + "' returning id", "update public.events set cover_url = 'https://x.example/a.png' where slug = '" + r.slug + "' returning id",
    "update public.events set status = 'published', source = 'official', link_status = 'ok', event_password_hash = 'x' where slug = '" + r.slug + "' returning id"]) {
    assert.equal((await db.query(sql)).rows.length, 0, sql + ' must change nothing (no owner update policy)');
  }
  await assert.rejects(db.query("insert into public.events (slug, title, status, featured, submitted_by) values ('direct-1', 'x', 'published', false, '" + U.a + "')"));
  // PRE-EXISTING, not changed by this migration (flagged in the PR): events_auth_insert lets any member insert a draft / review row with ANY column, e.g. featured.
  assert.equal((await db.query("insert into public.events (slug, title, status, featured, submitted_by) values ('direct-2', 'x', 'review', true, '" + U.a + "') returning id")).rows.length, 1);
  await assert.rejects(db.query(`insert into public.ticket_tiers (event_id, name, price_cents) values (${r.id}, 'sneaky', 99999)`), /row-level security/, 'tiers_owner_insert is dropped');
  await db.exec('reset role');
  assert.deepEqual((await rows(db, "select polname from pg_policy where polrelid = 'public.events'::regclass order by 1")).map((x) => x.polname), ['events_auth_insert', 'events_owner_read', 'events_public_read'], 'no owner write policy was added');
});
test('ownership: submitted_by or (legacy null + my handle) can edit; another member cannot; the status is not forced and a taken-down / in-review event is not reopened', { skip }, async () => {
  const db = await fresh(); const r = await call(db, U.a, 'kil_publish_own_event', [ev({}), free]);
  assert.equal((await call(db, U.b, 'kil_update_own_event', [r.slug, { title: 'Hijack' }, null])).error, 'forbidden');
  assert.equal((await call(db, U.a, 'kil_update_own_event', [r.slug, { title: 'Renamed', featured: true, status: 'archived', source: 'official' }, null])).status, 'published');
  const [e] = await rows(db, 'select title, featured, status, source from public.events where id = $1', [r.id]); assert.deepEqual(e, { title: 'Renamed', featured: false, status: 'published', source: 'organizer' });
  await db.exec("insert into public.events (slug, title, status, owner_handle, submitted_by) values ('legacy-1', 'Legacy', 'published', 'alice', null), ('legacy-2', 'Theirs', 'published', 'bob', null), ('rev-1', 'Pending', 'review', 'alice', '" + U.a + "'), ('arch-1', 'Gone', 'archived', 'alice', '" + U.a + "'), ('canc-1', 'Cancelled', 'cancelled', 'alice', '" + U.a + "')");
  assert.equal((await call(db, U.a, 'kil_update_own_event', ['legacy-1', { title: 'Legacy 2' }, null])).status, 'published');
  assert.equal((await call(db, U.a, 'kil_update_own_event', ['legacy-2', { title: 'x' }, null])).error, 'forbidden');
  for (const s of ['rev-1', 'arch-1', 'canc-1']) assert.equal((await call(db, U.a, 'kil_update_own_event', [s, { title: 'x' }, null])).error, 'not_editable', s);
  assert.equal((await call(db, U.adm, 'kil_update_own_event', ['arch-1', { title: 'Staff edit' }, null])).status, 'archived', 'admins can edit those, and the status is still not forced');
});
test('HIGH (fails CLOSED): tiers are locked by any order or sold ticket; if the orders table cannot be read the write errors and changes nothing', { skip }, async () => {
  const db = await fresh(); await db.exec(`update public.app_users set payouts_enabled = true where id = '${U.a}'`);
  const r = await call(db, U.a, 'kil_publish_own_event', [ev({}), paid]);
  assert.equal((await call(db, U.a, 'kil_update_own_event', [r.slug, { title: 'v2' }, [{ name: 'GA2', price_cents: 3000 }]])).tiers_updated, true);
  await db.exec(`insert into public.event_orders (event_id, tier_id, status, qty) values (${r.id}, 1, 'paid', 1)`);
  const locked = await call(db, U.a, 'kil_update_own_event', [r.slug, { title: 'v3' }, [{ name: 'GA3', price_cents: 1 }]]); assert.equal(locked.tiers_updated, false);
  assert.deepEqual((await rows(db, 'select name, price_cents from public.ticket_tiers where event_id = $1', [r.id])).map((t) => t.name + ':' + t.price_cents), ['GA2:3000'], 'with sales, tiers are untouched');
  await db.exec('delete from public.event_orders'); await db.exec(`update public.ticket_tiers set qty_sold = 2 where event_id = ${r.id}`);
  assert.equal((await call(db, U.a, 'kil_update_own_event', [r.slug, { title: 'v4' }, [{ name: 'GA4', price_cents: 1 }]])).tiers_updated, false, 'qty_sold > 0 also locks');
  await db.exec(`update public.ticket_tiers set qty_sold = 0 where event_id = ${r.id}`); await db.exec('alter table public.event_orders rename to event_orders_gone');
  await assert.rejects(call(db, U.a, 'kil_update_own_event', [r.slug, { title: 'v5' }, [{ name: 'GA5', price_cents: 1 }]]), /event_orders/, 'cannot answer "has sales" -> the write fails, it does not go through');
  await db.exec('alter table public.event_orders_gone rename to event_orders');
  assert.deepEqual((await rows(db, 'select name from public.ticket_tiers where event_id = $1', [r.id])).map((t) => t.name), ['GA2'], 'tiers still as before the failed call');
});
test('per-user publish cap: 10 events per rolling 24 h (a series counts each date); admins are not capped', { skip }, async () => {
  const db = await fresh();
  for (let i = 0; i < 8; i++) assert.equal((await call(db, U.a, 'kil_publish_own_event', [ev({ title: 'E' + i }), free])).status, 'published');
  assert.equal((await call(db, U.a, 'kil_publish_own_series', [ev({}), free, ['2027-05-01T20:00:00Z', '2027-05-02T20:00:00Z', '2027-05-03T20:00:00Z']])).error, 'publish_limit');
  assert.equal((await call(db, U.a, 'kil_publish_own_series', [ev({}), free, ['2027-05-01T20:00:00Z', '2027-05-02T20:00:00Z']])).count, 2);
  assert.equal((await call(db, U.a, 'kil_publish_own_event', [ev({}), free])).error, 'publish_limit');
  assert.equal((await call(db, U.b, 'kil_publish_own_series', [ev({}), free, ['2027-05-01T20:00:00Z']])).error, 'series_needs_two_dates');
  assert.equal((await call(db, U.b, 'kil_publish_own_series', [ev({}), free, ['2027-05-01T20:00:00Z', 'not a date']])).error, 'bad_date');
  assert.equal((await call(db, U.adm, 'kil_publish_own_event', [ev({}), free])).status, 'published');
  assert.equal((await rows(db, "select count(*)::int n from public.events where submitted_by = '" + U.a + "'"))[0].n, 10);
});
test('attendee list reads the REAL tables: paid event_orders + event_registrations for the owner only; unpaid and other events excluded; anon / non-owner refused', { skip }, async () => {
  const db = await fresh(); const r = await call(db, U.a, 'kil_publish_own_event', [ev({}), free]); const other = await call(db, U.b, 'kil_publish_own_event', [ev({ title: 'Other' }), free]);
  await db.exec(`insert into public.event_registrations (event_id, event_slug, buyer_email, buyer_name) values (${r.id}, '${r.slug}', 'rsvp@example.com', 'Rae'), (${other.id}, '${other.slug}', 'x@example.com', 'Elsewhere');
    insert into public.event_orders (event_id, tier_id, buyer_email, buyer_handle, qty, status, checked_in_at) values (${r.id}, 1, 'paid@example.com', 'pat', 2, 'paid', now()), (${r.id}, 1, 'pending@example.com', 'pen', 1, 'pending', null), (${other.id}, 1, 'o@example.com', 'oo', 1, 'paid', null);`);
  const list = await call(db, U.a, 'kil_event_customers', [r.slug]); assert.equal(list.length, 2);
  assert.deepEqual(list.map((x) => x.email).sort(), ['paid@example.com', 'rsvp@example.com']);
  const paidRow = list.find((x) => x.email === 'paid@example.com'); assert.equal(paidRow.quantity, 2); assert.equal(paidRow.checked_in, true); assert.equal(paidRow.tier, 'Free'); assert.equal(paidRow.name, 'pat');
  assert.equal((await call(db, U.b, 'kil_event_customers', [r.slug])).error, 'forbidden');
  assert.equal((await call(db, U.a, 'kil_event_customers', [other.slug])).error, 'forbidden');
  await as(db, null); await assert.rejects(db.query('select public.kil_event_customers($1)', [r.slug]), /permission denied/); await db.exec('reset role');
  await db.exec('alter table public.event_registrations rename to er_gone');
  await assert.rejects(call(db, U.a, 'kil_event_customers', [r.slug]), /event_registrations/, 'a missing table errors; it never returns a silently empty list');
});
test('promo codes use the EXISTING event_promo_codes columns (kind, value, uses_left, active), owner only, capped; the existing public-read policy is left alone', { skip }, async () => {
  const db = await fresh(); const r = await call(db, U.a, 'kil_publish_own_event', [ev({}), free]);
  assert.equal((await call(db, U.a, 'kil_upsert_promo_code', [r.id, 'spring 10', 10, true])).code, 'SPRING10');
  assert.equal((await call(db, U.a, 'kil_upsert_promo_code', [r.id, 'SPRING10', 15, false])).percent_off, 15);
  assert.deepEqual(await rows(db, 'select code, kind, value, active, uses_left from public.event_promo_codes'), [{ code: 'SPRING10', kind: 'percent', value: 15, active: false, uses_left: null }]);
  assert.deepEqual(await call(db, U.a, 'kil_list_promo_codes', [r.id]), [{ code: 'SPRING10', percent_off: 15, active: false }]);
  assert.equal((await call(db, U.b, 'kil_upsert_promo_code', [r.id, 'NOPE', 5, true])).error, 'forbidden'); assert.equal((await call(db, U.b, 'kil_list_promo_codes', [r.id])).error, 'forbidden');
  assert.equal((await call(db, U.a, 'kil_upsert_promo_code', [r.id, 'X', 5, true])).error, 'invalid_code'); assert.equal((await call(db, U.a, 'kil_upsert_promo_code', [r.id, 'BIG', 101, true])).error, 'invalid_code');
  for (let i = 0; i < 19; i++) await call(db, U.a, 'kil_upsert_promo_code', [r.id, 'C' + i + 'X', 5, true]);
  assert.equal((await call(db, U.a, 'kil_upsert_promo_code', [r.id, 'ONEMORE', 5, true])).error, 'too_many_codes');
  assert.deepEqual((await rows(db, "select polname from pg_policy where polrelid = 'public.event_promo_codes'::regclass")).map((x) => x.polname), ['promo_public_read']);
  assert.equal((await rows(db, "select has_table_privilege('anon', 'public.event_promo_codes', 'select') s"))[0].s, true, 'the existing grants are not revoked');
});
test('traffic: owner-only counts; the public beacon records only published slugs and caps a slug at 2,000 hits per hour', { skip }, async () => {
  const db = await fresh(); const r = await call(db, U.a, 'kil_publish_own_event', [ev({}), free]);
  await as(db, null); await db.query("select public.kil_record_event_hit($1, 'view', 'ig', 'bio', 'spring', 'SPRING10')", [r.slug]); await db.query("select public.kil_record_event_hit('no-such-event', 'view')"); await db.query("select public.kil_record_event_hit($1, 'hack')", [r.slug]); await db.exec('reset role');
  assert.equal((await rows(db, 'select count(*)::int n from public.event_link_hits'))[0].n, 1);
  assert.deepEqual(await call(db, U.a, 'kil_event_traffic', [r.slug]), { views: 1, clicks: 0, conversions: 0 }); assert.equal((await call(db, U.b, 'kil_event_traffic', [r.slug])).error, 'forbidden');
  await db.exec(`insert into public.event_link_hits (event_slug, kind) select '${r.slug}', 'view' from generate_series(1, 2000)`);
  await as(db, null); await db.query("select public.kil_record_event_hit($1, 'click')", [r.slug]); await db.exec('reset role');
  assert.equal((await rows(db, "select count(*)::int n from public.event_link_hits where kind = 'click'"))[0].n, 0, 'capped');
  await as(db, null); await assert.rejects(db.query('select * from public.event_link_hits'), /permission denied/); await db.exec('reset role');
});
test('stripe_account_id: the column already exists, so the migration is a no-op there; its rollback drops the INDEX and never the column', { skip }, async () => {
  const db = await fresh(false); await db.exec("alter table public.app_users add column if not exists stripe_account_id text").catch(() => {});
  await db.exec(rd(M[3])); await db.exec(rd(M[3])); await db.exec("update public.app_users set stripe_account_id = 'acct_1' where id = '" + U.a + "'");
  await assert.rejects(db.exec("update public.app_users set stripe_account_id = 'acct_1' where id = '" + U.b + "'"), /unique/);
  await db.exec(rd(R[0]));
  assert.equal((await rows(db, "select count(*)::int n from information_schema.columns where table_name = 'app_users' and column_name = 'stripe_account_id'"))[0].n, 1);
  assert.equal((await rows(db, "select count(*)::int n from pg_indexes where indexname = 'app_users_stripe_account_id_idx'"))[0].n, 0);
  assert.doesNotMatch(rd('20261127173000_connect_account.rollback.sql').replace(/^--.*$/gm, ''), /drop column/i);
});
test('rollbacks: every migration rolls back cleanly in reverse order; the dropped tier policy comes back; pre-existing tables stay; apply -> rollback -> apply works', { skip }, async () => {
  const db = await fresh();
  for (const f of R) await db.exec(rd(f));
  assert.equal((await rows(db, "select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'kil\\_%'"))[0].n, 0);
  assert.deepEqual((await rows(db, "select polname from pg_policy where polrelid = 'public.ticket_tiers'::regclass order by 1")).map((x) => x.polname), ['tiers_owner_insert', 'tiers_public_read']);
  for (const t of ['event_promo_codes', 'events', 'app_users']) assert.equal((await rows(db, `select to_regclass('public.${t}') is not null ok`))[0].ok, true, t + ' (pre-existing) survives');
  assert.equal((await rows(db, "select to_regclass('public.event_link_hits') is null ok"))[0].ok, true);
  for (const f of M) await db.exec(rd(f));
  assert.equal((await call(db, U.a, 'kil_publish_own_event', [ev({}), free])).status, 'published');
});
test('hygiene: no information_schema column guessing, no "when others", nothing granted to anon but the beacon, no drops of pre-existing tables or columns', () => {
  const all = M.map(rd).join('\n').replace(/^\s*--.*$/gm, '');
  assert.doesNotMatch(all, /information_schema|when others|to_regclass|public\.orders|public\.tickets|event_tiers/i);
  assert.doesNotMatch(all, /grant (select|insert|update|delete|all)[^;]* on public\.(events|ticket_tiers|event_promo_codes|app_users)/i);
  assert.doesNotMatch(all, /create policy/i, 'RPC-only: no new RLS policy at all');
  assert.doesNotMatch(all, /drop (table|column)/i);
  assert.match(all, /grant execute on function public\.kil_record_event_hit\(text, text, text, text, text, text\) to anon, authenticated/);
  assert.doesNotMatch(all.replace(/kil_record_event_hit[^;]*;/g, ''), /to anon/);
  const rb = R.map(rd).join('\n').replace(/^\s*--.*$/gm, ''); assert.doesNotMatch(rb, /drop column|drop table if exists public\.(events|ticket_tiers|event_promo_codes|app_users|event_orders)\b/i);
});
