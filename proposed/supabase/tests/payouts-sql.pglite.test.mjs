// Runs proposed/supabase/sql/payouts_verified_by_stripe.PROPOSED.sql in PGlite (in-memory Postgres 17). Nothing
// real is touched. Run on its own (PGlite is not a dependency of the site):
//   npm i --no-save @electric-sql/pglite && node --test proposed/supabase/tests/payouts-sql.pglite.test.mjs
//
// The "live" database here is built from the byte-exact keepitil-prod baseline in proposed/supabase/baseline/
// (Kode's read-only reads, 2026-11-17): mark_payouts_enabled.live.sql loaded VERBATIM, app_users' 8 real columns,
// its 5 RLS policies (two are PUBLIC-role; app_users_update has no WITH CHECK), anon's table-level write grants,
// and authenticated's table UPDATE/INSERT plus column grants with no table SELECT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const lf = (s) => s.replace(/\r\n/g, '\n');          // git may check files out with CRLF; the baseline is LF
const SQL = lf(readFileSync(join(DIR, 'sql', 'payouts_verified_by_stripe.PROPOSED.sql'), 'utf8'));
const LIVE_FN = lf(readFileSync(join(DIR, 'baseline', 'mark_payouts_enabled.live.sql'), 'utf8'));
const LIVE_MD5 = '975786ee803b22f894ef01af63f20d5c';
const A = '00000000-0000-0000-0000-0000000000a1', B = '00000000-0000-0000-0000-0000000000b2';

const SUPABASE = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`;
// public.app_users exactly as baseline/app_users.live.md lists it.
const LIVE_TABLE = `
  create table public.app_users (
    id uuid not null primary key,
    handle text not null,
    display_name text,
    created_at timestamptz default now(),
    stripe_account_id text,
    payouts_enabled boolean not null default false,
    notifications_enabled boolean not null default true,
    avatar_url text);
  alter table public.app_users enable row level security;
  create policy app_users_insert      on public.app_users for insert to public        with check (auth.uid() = id);
  create policy app_users_self_insert on public.app_users for insert to authenticated with check (id = auth.uid());
  create policy app_users_self_select on public.app_users for select to authenticated using (id = auth.uid());
  create policy app_users_self_update on public.app_users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
  create policy app_users_update      on public.app_users for update to public        using (auth.uid() = id);
  revoke all on public.app_users from public, anon, authenticated;
  grant delete, insert, references, trigger, truncate, update on public.app_users to anon, authenticated;
  grant all on public.app_users to service_role;
  grant update (stripe_account_id, payouts_enabled), insert (stripe_account_id, payouts_enabled) on public.app_users to authenticated, anon;
  grant select (payouts_enabled) on public.app_users to authenticated;
  insert into public.app_users (id, handle) values ('${A}', 'host_a'), ('${B}', 'host_b');
`;
const LIVE_FN_GRANTS = `grant execute on function public.mark_payouts_enabled() to public, anon, authenticated, service_role;`;

async function live({ fn = LIVE_FN } = {}) {
  const pg = new PGlite();
  await pg.exec(SUPABASE);
  await pg.exec(LIVE_TABLE);
  await pg.exec(fn);
  await pg.exec(LIVE_FN_GRANTS);
  return pg;
}
async function proposed() { const pg = await live(); await pg.exec(SQL); return pg; }
async function as(pg, role, uid, fn) {
  await pg.exec(`set role ${role}`);
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  try { return await fn(); } finally { await pg.exec('reset role'); }
}
const row = async (pg, id = A) => (await pg.query('select payouts_enabled, stripe_account_id from public.app_users where id = $1', [id])).rows[0];
// Exactly KODE's statement: no WHERE (authenticated has no SELECT on id); RLS limits it to the caller's own row.
const DIRECT_CLAIM = `update public.app_users set payouts_enabled = true, stripe_account_id = 'acct_x'`;

// ---------------------------------------------------------------------------------------------- the stand-in is live
test('stand-in matches the live baseline (function byte-exact, 8 columns, 5 policies, grants)', async () => {
  assert.equal(createHash('md5').update(LIVE_FN).digest('hex'), LIVE_MD5, 'baseline file is the byte-exact functiondef');
  const pg = await live();
  const md5 = (await pg.query(`select md5(pg_get_functiondef('public.mark_payouts_enabled()'::regprocedure)) m`)).rows[0].m;
  assert.equal(md5, LIVE_MD5, 'PGlite reproduces the live pg_get_functiondef byte for byte');
  const cols = (await pg.query(`select string_agg(column_name, ',' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name='app_users'`)).rows[0].c;
  assert.equal(cols, 'id,handle,display_name,created_at,stripe_account_id,payouts_enabled,notifications_enabled,avatar_url');
  const pols = (await pg.query(`select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, '+') || ':' || (with_check is not null), ',' order by policyname) p from pg_policies where tablename = 'app_users'`)).rows[0].p;
  assert.equal(pols, 'app_users_insert:INSERT:public:true,app_users_self_insert:INSERT:authenticated:true,app_users_self_select:SELECT:authenticated:false,app_users_self_update:UPDATE:authenticated:true,app_users_update:UPDATE:public:false');
  const priv = async (r, p) => (await pg.query(`select has_table_privilege($1, 'public.app_users', $2) v`, [r, p])).rows[0].v;
  assert.deepEqual([await priv('anon', 'SELECT'), await priv('anon', 'UPDATE'), await priv('anon', 'INSERT'), await priv('anon', 'DELETE')], [false, true, true, true]);
  assert.deepEqual([await priv('authenticated', 'SELECT'), await priv('authenticated', 'UPDATE')], [false, true]);
  assert.equal((await pg.query(`select has_column_privilege('authenticated', 'public.app_users', 'payouts_enabled', 'SELECT') v`)).rows[0].v, true);
});

// ---------------------------------------------------------------------------------------------- negative controls (today)
test('NEGATIVE CONTROL (live today): rpc(mark_payouts_enabled) makes a signed-in user payout-ready', async () => {
  const pg = await live();
  await as(pg, 'authenticated', A, () => pg.query('select public.mark_payouts_enabled()'));
  assert.equal((await row(pg)).payouts_enabled, true);
  assert.equal((await row(pg, B)).payouts_enabled, false, 'only their own row');
});

test('NEGATIVE CONTROL (live today): a direct update by the signed-in owner SUCCEEDS', async () => {
  const pg = await live();
  const r = await as(pg, 'authenticated', A, () => pg.query(DIRECT_CLAIM));
  assert.equal(r.affectedRows, 1);
  assert.deepEqual(await row(pg), { payouts_enabled: true, stripe_account_id: 'acct_x' }, 'payout-ready with a made-up account');
  assert.deepEqual(await row(pg, B), { payouts_enabled: false, stripe_account_id: null }, 'RLS keeps it to their own row');
  // anon's table grants are stopped only by RLS (auth.uid() is null): no rows
  const pg2 = await live();
  assert.equal((await as(pg2, 'anon', null, () => pg2.query(DIRECT_CLAIM))).affectedRows, 0);
});

// ---------------------------------------------------------------------------------------------- proposed
test('proposed: the rpc is refused for anon / authenticated (and PUBLIC), flag unchanged', async () => {
  const pg = await proposed();
  for (const role of ['authenticated', 'anon']) {
    await assert.rejects(as(pg, role, A, () => pg.query('select public.mark_payouts_enabled()')), /permission denied for function mark_payouts_enabled/, role);
  }
  assert.equal((await row(pg)).payouts_enabled, false);
});

test('proposed: the SAME direct update is refused by the trigger; other profile fields still update', async () => {
  const pg = await proposed();
  await assert.rejects(as(pg, 'authenticated', A, () => pg.query(DIRECT_CLAIM)), /payout fields can only be set by the server from Stripe/);
  assert.deepEqual(await row(pg), { payouts_enabled: false, stripe_account_id: null });
  for (const set of [`payouts_enabled = true`, `stripe_account_id = 'acct_x'`, `stripe_charges_enabled = true`]) {
    await assert.rejects(as(pg, 'authenticated', A, () => pg.query(`update public.app_users set ${set}`)), /only be set by the server/, set);
  }
  await as(pg, 'authenticated', A, () => pg.query(`update public.app_users set display_name = 'Host A'`));
  assert.equal((await pg.query('select display_name from public.app_users where id = $1', [A])).rows[0].display_name, 'Host A');
  // inserts: a normal sign-up works, a pre-enabled one does not
  const C = '00000000-0000-0000-0000-0000000000c3';
  await assert.rejects(as(pg, 'authenticated', C, () => pg.query(`insert into public.app_users (id, handle, payouts_enabled) values ($1, 'c', true)`, [C])), /only be set by the server/);
  await as(pg, 'authenticated', C, () => pg.query(`insert into public.app_users (id, handle) values ($1, 'c')`, [C]));
  assert.equal((await row(pg, C)).payouts_enabled, false);
});

test('proposed: only the service role can run the server writers; payouts only from what Stripe reported', async () => {
  const pg = await proposed();
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(as(pg, role, A, () => pg.query(`select public.set_payouts_from_stripe('acct_t1', true, true, '{}', null)`)), /permission denied/, role);
    await assert.rejects(as(pg, role, A, () => pg.query(`select public.set_stripe_account_id($1, 'acct_t1')`, [A])), /permission denied/, role);
  }
  const svc = (sql, p) => as(pg, 'service_role', null, () => pg.query(sql, p));
  assert.equal((await svc(`select public.set_stripe_account_id($1, 'acct_t1') ok`, [A])).rows[0].ok, true);
  assert.equal((await svc(`select public.set_stripe_account_id($1, 'acct_t2') ok`, [A])).rows[0].ok, false, 'never replaces');
  await svc(`select public.set_payouts_from_stripe('acct_t1', true, false, '{external_account}', null)`);
  assert.equal((await row(pg)).payouts_enabled, false);
  await svc(`select public.set_payouts_from_stripe('acct_t1', true, true, '{}', 'requirements.past_due')`);
  assert.equal((await row(pg)).payouts_enabled, false);
  assert.equal((await svc(`select public.set_payouts_from_stripe('acct_t1', true, true, '{}', null) n`)).rows[0].n, 1);
  assert.deepEqual(await row(pg), { payouts_enabled: true, stripe_account_id: 'acct_t1' });
});

// ---------------------------------------------------------------------------------------------- PRECHECK / VERIFY
test('PRECHECK: a drifted mark_payouts_enabled() stops the migration and nothing is applied', async () => {
  const drifted = LIVE_FN.replace('set payouts_enabled = true where', 'set payouts_enabled = true  where');
  const pg = await live({ fn: drifted });
  await assert.rejects(pg.exec(SQL), /PRECHECK/);
  await pg.exec('rollback').catch(() => {});
  const trig = (await pg.query(`select count(*)::int n from pg_trigger where tgname = 'guard_stripe_columns'`)).rows[0].n;
  const col = (await pg.query(`select count(*)::int n from information_schema.columns where table_name = 'app_users' and column_name = 'stripe_charges_enabled'`)).rows[0].n;
  assert.deepEqual([trig, col], [0, 0], 'rolled back: no trigger, no new columns');
  // the client claim still works there (nothing changed), proving the rollback is real
  await as(pg, 'authenticated', A, () => pg.query('select public.mark_payouts_enabled()'));
  assert.equal((await row(pg)).payouts_enabled, true);
});

test('VERIFY passes on the real SQL: no EXECUTE for anon / authenticated / PUBLIC, trigger present', async () => {
  const pg = await proposed();
  const r = (await pg.query(`
    select has_function_privilege('anon', 'public.mark_payouts_enabled()', 'EXECUTE') anon,
           has_function_privilege('authenticated', 'public.mark_payouts_enabled()', 'EXECUTE') auth,
           exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where p.oid = 'public.mark_payouts_enabled()'::regprocedure and a.grantee = 0) pub,
           exists (select 1 from pg_trigger where tgname = 'guard_stripe_columns' and not tgisinternal) trig`)).rows[0];
  assert.deepEqual(r, { anon: false, auth: false, pub: false, trig: true });
});

test('VERIFY NEGATIVE CONTROL: without the REVOKE, or without the trigger, the migration fails and rolls back', async () => {
  const noRevoke = SQL.replace(/^revoke execute on function public\.mark_payouts_enabled\(\) from public, anon, authenticated;$/m, '');
  assert.notEqual(noRevoke, SQL);
  let pg = await live();
  await assert.rejects(pg.exec(noRevoke), /VERIFY: anon or authenticated can still execute/);
  await pg.exec('rollback').catch(() => {});
  assert.equal((await pg.query(`select count(*)::int n from pg_trigger where tgname = 'guard_stripe_columns'`)).rows[0].n, 0, 'rolled back');
  const noTrigger = SQL.replace(/^create trigger guard_stripe_columns[\s\S]*?;$/m, '');
  assert.notEqual(noTrigger, SQL);
  pg = await live();
  await assert.rejects(pg.exec(noTrigger), /VERIFY: trigger guard_stripe_columns is missing/);
});
