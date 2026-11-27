// UNDO proof for payouts_flag_lock.PROPOSED.sql: live -> apply -> ROLLBACK must end IDENTICAL to live
// (function definitions, ACLs, column grants, triggers, policies). PGlite, in memory; nothing real is touched.
//   npm i --no-save @electric-sql/pglite && node --test proposed/supabase/tests/payouts-flag-lock-rollback.pglite.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..');
const lf = (s) => s.replace(/\r\n/g, '\n');
const LOCK = lf(readFileSync(join(DIR, 'sql', 'payouts_flag_lock.PROPOSED.sql'), 'utf8'));
const ROLLBACK = lf(readFileSync(join(DIR, 'sql', 'payouts_flag_lock.ROLLBACK.sql'), 'utf8'));
const LIVE_FN = lf(readFileSync(join(DIR, 'baseline', 'mark_payouts_enabled.live.sql'), 'utf8'));
// The live stand-in (8 columns, 5 policies, live table/column/function grants) comes from the lock's own test,
// so both tests use one definition of "live".
const SRC = lf(readFileSync(join(HERE, 'payouts-flag-lock.pglite.test.mjs'), 'utf8'));
const A = '00000000-0000-0000-0000-0000000000a1', B = '00000000-0000-0000-0000-0000000000b2';
const tpl = (name) => new RegExp('const ' + name + ' = `([\\s\\S]*?)`;').exec(SRC)[1].replace(/\$\{A\}/g, A).replace(/\$\{B\}/g, B);
const SUPABASE = tpl('SUPABASE'), LIVE_TABLE = tpl('LIVE_TABLE'), LIVE_FN_GRANTS = tpl('LIVE_FN_GRANTS');

async function live() {
  const pg = new PGlite();
  await pg.exec(SUPABASE); await pg.exec(LIVE_TABLE); await pg.exec(LIVE_FN); await pg.exec(LIVE_FN_GRANTS);
  return pg;
}
// What "identical" means: the same set of privileges (order inside an ACL array does not change what anyone may
// do, and re-granting can reorder it), the same function bodies and settings, triggers, policies, columns.
async function snapshot(pg) {
  const q = async (sql) => (await pg.query(sql)).rows;
  return JSON.stringify({
    functions: await q(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f, md5(pg_get_functiondef(p.oid)) d, p.prosecdef s
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`),
    function_acl: await q(`select p.proname f, case when a.grantee = 0 then 'PUBLIC' else r.rolname end g, a.privilege_type t, a.is_grantable gr
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      left join pg_roles r on r.oid = a.grantee where n.nspname = 'public' order by 1, 2, 3`),
    table_acl: await q(`select c.relname t, case when a.grantee = 0 then 'PUBLIC' else r.rolname end g, a.privilege_type p
      from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      left join pg_roles r on r.oid = a.grantee where n.nspname = 'public' and c.relkind = 'r' order by 1, 2, 3`),
    column_acl: await q(`select att.attname c, r.rolname g, a.privilege_type p from pg_attribute att, aclexplode(att.attacl) a, pg_roles r
      where att.attrelid = 'public.app_users'::regclass and a.grantee = r.oid order by 1, 2, 3`),
    columns: await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'app_users' order by ordinal_position`),
    triggers: await q(`select tgrelid::regclass::text || '.' || tgname t, tgenabled e from pg_trigger where not tgisinternal order by 1`),
    policies: await q(`select policyname, cmd, roles::text, qual, with_check from pg_policies where tablename = 'app_users' order by 1`)
  });
}
async function as(pg, role, uid, fn) {
  await pg.exec(`set role ${role}`);
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  try { return await fn(); } finally { await pg.exec('reset role'); }
}

test('stand-in loaded from the lock test (one definition of live)', () => {
  assert.match(LIVE_TABLE, /create policy app_users_update\s+on public\.app_users for update to public\s+using \(auth\.uid\(\) = id\);/);
  assert.match(LIVE_TABLE, /grant update \(stripe_account_id, payouts_enabled\), insert \(stripe_account_id, payouts_enabled\) on public\.app_users to authenticated, anon;/);
  assert.match(LIVE_FN_GRANTS, /to public, anon, authenticated, service_role/);
});

test('live -> apply lock -> ROLLBACK ends identical to live (defs, ACLs, column grants, triggers, policies)', async () => {
  const pg = await live();
  const before = await snapshot(pg);
  await pg.exec(LOCK);
  const applied = await snapshot(pg);
  assert.notEqual(applied, before, 'NEGATIVE CONTROL: the lock changes the snapshot, so the comparison can see a difference');
  await pg.exec(ROLLBACK);
  assert.equal(await snapshot(pg), before, 'identical to live');
  assert.equal((await pg.query(`select md5(pg_get_functiondef('public.mark_payouts_enabled()'::regprocedure)) m`)).rows[0].m, '975786ee803b22f894ef01af63f20d5c');
});

test('after rollback the live behaviour is back (rpc and direct self-update work again)', async () => {
  const pg = await live();
  await pg.exec(LOCK); await pg.exec(ROLLBACK);
  await as(pg, 'authenticated', A, () => pg.query('select public.mark_payouts_enabled()'));
  assert.equal((await pg.query('select payouts_enabled from public.app_users where id = $1', [A])).rows[0].payouts_enabled, true);
  await as(pg, 'authenticated', B, () => pg.query(`update public.app_users set stripe_account_id = 'acct_x'`));
  assert.equal((await pg.query('select stripe_account_id from public.app_users where id = $1', [B])).rows[0].stripe_account_id, 'acct_x');
});

test('rollback keeps values written while the lock was on', async () => {
  const pg = await live();
  await pg.exec(LOCK);
  await as(pg, 'service_role', null, () => pg.query(`update public.app_users set stripe_account_id = 'acct_k1' where id = $1`, [A]));
  await as(pg, 'service_role', null, () => pg.query(`select public.set_payouts_from_stripe('acct_k1', true, true, null)`));
  await pg.exec(ROLLBACK);
  assert.deepEqual((await pg.query('select payouts_enabled, stripe_account_id from public.app_users where id = $1', [A])).rows[0],
    { payouts_enabled: true, stripe_account_id: 'acct_k1' });
});

test('NEGATIVE CONTROL: a rollback missing ONE grant is caught by VERIFY and changes nothing', async () => {
  const missing = ROLLBACK.replace(
    'grant update (stripe_account_id, payouts_enabled), insert (stripe_account_id, payouts_enabled) on public.app_users to anon, authenticated;',
    'grant update (stripe_account_id, payouts_enabled), insert (payouts_enabled) on public.app_users to anon, authenticated;');
  assert.notEqual(missing, ROLLBACK);
  const pg = await live();
  await pg.exec(LOCK);
  const applied = await snapshot(pg);
  await assert.rejects(pg.exec(missing), /VERIFY: column grants differ from the baseline/);
  await pg.exec('rollback').catch(() => {});
  assert.equal(await snapshot(pg), applied, 'rolled back: the lock is still fully in place');
  // and without VERIFY, the snapshot comparison would still catch it
  const noVerify = missing.replace(/-- VERIFY:[\s\S]*?end \$\$;\n/, '');
  const pg2 = await live(); const before = await snapshot(pg2);
  await pg2.exec(LOCK); await pg2.exec(noVerify);
  assert.notEqual(await snapshot(pg2), before, 'the missing anon/authenticated INSERT on stripe_account_id shows in the snapshot');
});

test('NEGATIVE CONTROL: a rollback missing the function re-grant is caught too', async () => {
  const missing = ROLLBACK.replace('grant execute on function public.mark_payouts_enabled() to public, anon, authenticated;',
                                   'grant execute on function public.mark_payouts_enabled() to anon, authenticated;');
  assert.notEqual(missing, ROLLBACK);
  const pg = await live();
  await pg.exec(LOCK);
  await assert.rejects(pg.exec(missing), /VERIFY: EXECUTE on mark_payouts_enabled\(\) is not back/);
});

test('NEGATIVE CONTROL: PRECHECK refuses if mark_payouts_enabled() is not the baseline', async () => {
  const pg = await live();
  await pg.exec(LOCK);
  await pg.exec(LIVE_FN.replace('set payouts_enabled = true where', 'set payouts_enabled = true  where'));
  await assert.rejects(pg.exec(ROLLBACK), /PRECHECK/);
});
