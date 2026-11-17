// Runs proposed/supabase/sql/payouts_flag_lock.PROPOSED.sql in PGlite (in-memory Postgres 17). Nothing real is
// touched. Run on its own (PGlite is not a dependency of the site):
//   npm i --no-save @electric-sql/pglite && node --test proposed/supabase/tests/payouts-flag-lock.pglite.test.mjs
//
// The "live" database is built from the byte-exact keepitil-prod baseline in proposed/supabase/baseline/:
// mark_payouts_enabled.live.sql loaded VERBATIM, app_users' 8 real columns, its 5 RLS policies (two PUBLIC-role;
// app_users_update without WITH CHECK), anon's table write grants, authenticated's table UPDATE/INSERT + column
// grants with no table SELECT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const lf = (s) => s.replace(/\r\n/g, '\n');           // git may check files out with CRLF; the baseline is LF
const SQL = lf(readFileSync(join(DIR, 'sql', 'payouts_flag_lock.PROPOSED.sql'), 'utf8'));
const LIVE_FN = lf(readFileSync(join(DIR, 'baseline', 'mark_payouts_enabled.live.sql'), 'utf8'));
const LIVE_MD5 = '975786ee803b22f894ef01af63f20d5c';
// Synthetic test identities only.
const A = '00000000-0000-0000-0000-0000000000a1', B = '00000000-0000-0000-0000-0000000000b2';

const SUPABASE = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`;
const LIVE_TABLE = `
  create table public.app_users (
    id uuid not null primary key, handle text not null, display_name text, created_at timestamptz default now(),
    stripe_account_id text, payouts_enabled boolean not null default false,
    notifications_enabled boolean not null default true, avatar_url text);
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
  await pg.exec(SUPABASE); await pg.exec(LIVE_TABLE); await pg.exec(fn); await pg.exec(LIVE_FN_GRANTS);
  return pg;
}
async function locked() { const pg = await live(); await pg.exec(SQL); return pg; }
async function as(pg, role, uid, fn) {
  await pg.exec(`set role ${role}`);
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  try { return await fn(); } finally { await pg.exec('reset role'); }
}
const row = async (pg, id = A) => (await pg.query('select payouts_enabled, stripe_account_id from public.app_users where id = $1', [id])).rows[0];
const DIRECT_CLAIM = `update public.app_users set payouts_enabled = true, stripe_account_id = 'acct_x'`;   // no WHERE: RLS = own row
// Explicit per-column grants (pg_attribute.attacl). information_schema.column_privileges would also list the
// privileges every column inherits from the table-level UPDATE/INSERT grant, so it cannot show this.
const explicitColGrants = async (pg) => (await pg.query(`select r.rolname || ':' || a.privilege_type || ':' || att.attname g
  from pg_attribute att, aclexplode(att.attacl) a, pg_roles r
  where att.attrelid = 'public.app_users'::regclass and att.attname in ('stripe_account_id', 'payouts_enabled')
    and a.grantee = r.oid and r.rolname in ('anon', 'authenticated') and a.privilege_type in ('UPDATE', 'INSERT')
  order by 1`)).rows.map((r) => r.g);

test('stand-in matches the live baseline (function byte-exact, 8 columns, 5 policies, grants)', async () => {
  assert.equal(createHash('md5').update(LIVE_FN).digest('hex'), LIVE_MD5);
  const pg = await live();
  assert.equal((await pg.query(`select md5(pg_get_functiondef('public.mark_payouts_enabled()'::regprocedure)) m`)).rows[0].m, LIVE_MD5);
  assert.equal((await pg.query(`select string_agg(column_name, ',' order by ordinal_position) c from information_schema.columns where table_schema='public' and table_name='app_users'`)).rows[0].c,
    'id,handle,display_name,created_at,stripe_account_id,payouts_enabled,notifications_enabled,avatar_url');
  assert.equal((await pg.query(`select count(*)::int n from pg_policies where tablename = 'app_users'`)).rows[0].n, 5);
  assert.equal((await pg.query(`select has_table_privilege('authenticated', 'public.app_users', 'SELECT') v`)).rows[0].v, false);
});

test('NEGATIVE CONTROL (live today): rpc(mark_payouts_enabled) AND a direct self-update both make a user payout-ready', async () => {
  let pg = await live();
  await as(pg, 'authenticated', A, () => pg.query('select public.mark_payouts_enabled()'));
  assert.equal((await row(pg)).payouts_enabled, true, 'rpc');
  pg = await live();
  assert.equal((await as(pg, 'authenticated', A, () => pg.query(DIRECT_CLAIM))).affectedRows, 1);
  assert.deepEqual(await row(pg), { payouts_enabled: true, stripe_account_id: 'acct_x' }, 'direct update with a made-up account');
  assert.deepEqual(await row(pg, B), { payouts_enabled: false, stripe_account_id: null });
});

test('lock: the rpc is refused (anon, authenticated, PUBLIC) and the direct self-update is refused by the trigger', async () => {
  const pg = await locked();
  for (const role of ['authenticated', 'anon']) {
    await assert.rejects(as(pg, role, A, () => pg.query('select public.mark_payouts_enabled()')), /permission denied for function mark_payouts_enabled/, role);
  }
  await assert.rejects(as(pg, 'authenticated', A, () => pg.query(DIRECT_CLAIM)), /payout fields can only be set by the server from Stripe/);
  for (const set of [`payouts_enabled = true`, `stripe_account_id = 'acct_x'`]) {
    await assert.rejects(as(pg, 'authenticated', A, () => pg.query(`update public.app_users set ${set}`)), /only be set by the server/, set);
  }
  assert.deepEqual(await row(pg), { payouts_enabled: false, stripe_account_id: null });
  assert.deepEqual(await explicitColGrants(pg), [], 'explicit column UPDATE/INSERT grants revoked');
});

test('lock: display_name and other profile fields still update; normal sign-up works, pre-enabled sign-up refused', async () => {
  const pg = await locked();
  await as(pg, 'authenticated', A, () => pg.query(`update public.app_users set display_name = 'Host A', avatar_url = 'a.png', notifications_enabled = false`));
  assert.deepEqual((await pg.query('select display_name, avatar_url, notifications_enabled from public.app_users where id = $1', [A])).rows[0],
    { display_name: 'Host A', avatar_url: 'a.png', notifications_enabled: false });
  const C = '00000000-0000-0000-0000-0000000000c3';
  await assert.rejects(as(pg, 'authenticated', C, () => pg.query(`insert into public.app_users (id, handle, payouts_enabled) values ($1, 'c', true)`, [C])), /only be set by the server/);
  await assert.rejects(as(pg, 'authenticated', C, () => pg.query(`insert into public.app_users (id, handle, stripe_account_id) values ($1, 'c', 'acct_x')`, [C])), /only be set by the server/);
  await as(pg, 'authenticated', C, () => pg.query(`insert into public.app_users (id, handle) values ($1, 'c')`, [C]));
  assert.equal((await row(pg, C)).payouts_enabled, false);
});

test('lock: the service_role paths still work (connect-onboard v51 stores the account; connect-status sets the flag)', async () => {
  const pg = await locked();
  // connect-onboard v51 writes stripe_account_id with service_role (direct update): allowed
  await as(pg, 'service_role', null, () => pg.query(`update public.app_users set stripe_account_id = 'acct_onb1' where id = $1`, [A]));
  assert.equal((await row(pg)).stripe_account_id, 'acct_onb1');
  // the writer is service_role only
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(as(pg, role, A, () => pg.query(`select public.set_payouts_from_stripe('acct_onb1', true, true, null)`)), /permission denied/, role);
  }
  const svc = (sql) => as(pg, 'service_role', null, () => pg.query(sql));
  await svc(`select public.set_payouts_from_stripe('acct_onb1', true, false, null)`);
  assert.equal((await row(pg)).payouts_enabled, false, 'payouts not enabled by Stripe -> not ready');
  await svc(`select public.set_payouts_from_stripe('acct_onb1', true, true, 'requirements.past_due')`);
  assert.equal((await row(pg)).payouts_enabled, false, 'disabled -> not ready');
  assert.equal((await svc(`select public.set_payouts_from_stripe('acct_onb1', true, true, null) n`)).rows[0].n, 1);
  assert.equal((await row(pg)).payouts_enabled, true, 'Stripe says ready -> ready');
  await svc(`select public.set_payouts_from_stripe('acct_onb1', false, true, null)`);
  assert.equal((await row(pg)).payouts_enabled, false, 'and back to false when Stripe disables charges');
  await assert.rejects(svc(`select public.set_payouts_from_stripe('not-an-acct', true, true, null)`), /not a Stripe account id/);
  assert.equal((await row(pg, B)).payouts_enabled, false);
});

test('lock keeps an existing (possibly client-set) true flag until the first server check corrects it', async () => {
  const pg = await live();
  await as(pg, 'authenticated', A, () => pg.query(`update public.app_users set payouts_enabled = true, stripe_account_id = 'acct_flag1'`));
  await pg.exec(SQL);
  assert.equal((await row(pg)).payouts_enabled, true, 'the lock does not reset existing values');
  await as(pg, 'service_role', null, () => pg.query(`select public.set_payouts_from_stripe('acct_flag1', false, false, 'requirements.past_due')`));
  assert.equal((await row(pg)).payouts_enabled, false, 'Stripe says not ready -> the first connect-status check sets it false');
});

test('PRECHECK: a drifted mark_payouts_enabled() stops the migration and nothing is applied', async () => {
  const pg = await live({ fn: LIVE_FN.replace('set payouts_enabled = true where', 'set payouts_enabled = true  where') });
  await assert.rejects(pg.exec(SQL), /PRECHECK/);
  await pg.exec('rollback').catch(() => {});
  assert.equal((await pg.query(`select count(*)::int n from pg_trigger where tgname = 'guard_stripe_columns'`)).rows[0].n, 0);
  assert.equal((await explicitColGrants(pg)).length, 8, 'column grants untouched (anon + authenticated x UPDATE + INSERT x 2 columns)');
  await as(pg, 'authenticated', A, () => pg.query('select public.mark_payouts_enabled()'));
  assert.equal((await row(pg)).payouts_enabled, true, 'nothing changed: the client claim still works there');
});

test('VERIFY passes on the real SQL; without the REVOKE or the trigger it fails and rolls back', async () => {
  const pg = await locked();
  const r = (await pg.query(`select has_function_privilege('anon','public.mark_payouts_enabled()','EXECUTE') a,
    has_function_privilege('authenticated','public.mark_payouts_enabled()','EXECUTE') b,
    exists (select 1 from pg_trigger where tgname = 'guard_stripe_columns' and not tgisinternal) t`)).rows[0];
  assert.deepEqual(r, { a: false, b: false, t: true });
  const noRevoke = SQL.replace(/^revoke execute on function public\.mark_payouts_enabled\(\) from public, anon, authenticated;$/m, '');
  assert.notEqual(noRevoke, SQL);
  let p2 = await live();
  await assert.rejects(p2.exec(noRevoke), /VERIFY: anon or authenticated can still execute/);
  await p2.exec('rollback').catch(() => {});
  assert.equal((await p2.query(`select count(*)::int n from pg_trigger where tgname = 'guard_stripe_columns'`)).rows[0].n, 0, 'rolled back');
  const noTrigger = SQL.replace(/^create trigger guard_stripe_columns[\s\S]*?;$/m, '');
  assert.notEqual(noTrigger, SQL);
  p2 = await live();
  await assert.rejects(p2.exec(noTrigger), /VERIFY: trigger guard_stripe_columns is missing/);
});
