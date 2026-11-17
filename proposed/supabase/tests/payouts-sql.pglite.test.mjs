// Runs proposed/supabase/sql/payouts_verified_by_stripe.PROPOSED.sql in PGlite (in-memory Postgres 17). Nothing
// real is touched. Run on its own (PGlite is not a dependency of the site):
//   npm i --no-save @electric-sql/pglite && node --test proposed/supabase/tests/payouts-sql.pglite.test.mjs
//
// STAND-IN, NOT THE LIVE SCHEMA: app_users and mark_payouts_enabled() are reconstructed from how create-event.html
// uses them (select handle,payouts_enabled; rpc('mark_payouts_enabled') with no arguments, no Stripe check) with
// the usual "users update their own row" policy. Read the live definitions before any review for apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const SQL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'payouts_verified_by_stripe.PROPOSED.sql'), 'utf8');
const A = '00000000-0000-0000-0000-0000000000a1', B = '00000000-0000-0000-0000-0000000000b2';

const STANDIN = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  create table public.app_users (id uuid primary key, handle text, bio text,
    stripe_account_id text, payouts_enabled boolean not null default false);
  alter table public.app_users enable row level security;
  create policy own_select on public.app_users for select to authenticated using (true);
  create policy own_update on public.app_users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
  create policy own_insert on public.app_users for insert to authenticated with check (id = auth.uid());
  grant select, insert, update on public.app_users to authenticated;
  grant select, insert, update, delete on public.app_users to service_role;

  -- the hole, as described: callable by any signed-in user, no Stripe check
  create function public.mark_payouts_enabled() returns void language sql security definer set search_path = ''
    as $$ update public.app_users set payouts_enabled = true where id = auth.uid() $$;
  grant execute on function public.mark_payouts_enabled() to authenticated;

  insert into public.app_users (id, handle) values ('${A}', 'host_a'), ('${B}', 'host_b');
`;

async function db({ proposed }) {
  const pg = new PGlite();
  await pg.exec(STANDIN);
  if (proposed) await pg.exec(SQL);
  return pg;
}
async function as(pg, role, uid, fn) {
  await pg.exec(`set role ${role}`);
  await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  try { return await fn(); } finally { await pg.exec('reset role'); }
}
const flag = async (pg, id = A) => (await pg.query('select payouts_enabled, stripe_account_id from public.app_users where id = $1', [id])).rows[0];

test('NEGATIVE CONTROL (stand-in of today): a signed-in user marks themselves payout-ready with no Stripe at all', async () => {
  const pg = await db({ proposed: false });
  await as(pg, 'authenticated', A, () => pg.query('select public.mark_payouts_enabled()'));
  assert.equal((await flag(pg)).payouts_enabled, true, 'the bug: one client call');
  const pg2 = await db({ proposed: false });
  await as(pg2, 'authenticated', A, () => pg2.query(`update public.app_users set payouts_enabled = true, stripe_account_id = 'acct_fake1' where id = $1`, [A]));
  assert.deepEqual(await flag(pg2), { payouts_enabled: true, stripe_account_id: 'acct_fake1' }, 'or a direct update');
});

test('proposed: the client claim does nothing (rpc refused, flag unchanged)', async () => {
  const pg = await db({ proposed: true });
  await assert.rejects(as(pg, 'authenticated', A, () => pg.query('select public.mark_payouts_enabled()')), /permission denied for function mark_payouts_enabled/);
  assert.equal((await flag(pg)).payouts_enabled, false);
});

test('proposed: a user cannot write any Stripe column, but can still edit the rest of their profile', async () => {
  const pg = await db({ proposed: true });
  for (const set of [`payouts_enabled = true`, `stripe_account_id = 'acct_fake1'`, `stripe_charges_enabled = true`,
                     `stripe_requirements_due = '{x}'`, `stripe_disabled_reason = 'x'`, `stripe_status_checked_at = now()`]) {
    await assert.rejects(as(pg, 'authenticated', A, () => pg.query(`update public.app_users set ${set} where id = $1`, [A])),
      /payout fields can only be set by the server from Stripe/, set);
  }
  await as(pg, 'authenticated', A, () => pg.query(`update public.app_users set bio = 'hi' where id = $1`, [A]));
  assert.equal((await pg.query('select bio from public.app_users where id = $1', [A])).rows[0].bio, 'hi', 'other fields still update');
  const C = '00000000-0000-0000-0000-0000000000c3';
  await assert.rejects(as(pg, 'authenticated', C, () => pg.query(`insert into public.app_users (id, handle, payouts_enabled) values ($1, 'c', true)`, [C])),
    /payout fields can only be set by the server/);
  await as(pg, 'authenticated', C, () => pg.query(`insert into public.app_users (id, handle) values ($1, 'c')`, [C]));   // a normal sign-up still works
  assert.equal((await flag(pg, C)).payouts_enabled, false);
});

test('proposed: only the service role can run the server writers', async () => {
  const pg = await db({ proposed: true });
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(as(pg, role, A, () => pg.query(`select public.set_stripe_account_id($1, 'acct_x1')`, [A])), /permission denied/, role);
    await assert.rejects(as(pg, role, A, () => pg.query(`select public.set_payouts_from_stripe('acct_x1', true, true, '{}', null)`)), /permission denied/, role);
  }
  assert.deepEqual(await flag(pg), { payouts_enabled: false, stripe_account_id: null });
});

test('proposed: service role stores the account once and sets payouts ONLY from what Stripe reported', async () => {
  const pg = await db({ proposed: true });
  const svc = (sql, p) => as(pg, 'service_role', null, () => pg.query(sql, p));
  assert.equal((await svc(`select public.set_stripe_account_id($1, 'acct_t1') ok`, [A])).rows[0].ok, true);
  assert.equal((await svc(`select public.set_stripe_account_id($1, 'acct_t2') ok`, [A])).rows[0].ok, false, 'never replaces an existing account');
  await assert.rejects(svc(`select public.set_stripe_account_id($1, 'not-an-acct')`, [B]), /not a Stripe account id/);
  assert.equal((await flag(pg)).stripe_account_id, 'acct_t1');
  // Stripe: charges on, payouts off -> not ready
  await svc(`select public.set_payouts_from_stripe('acct_t1', true, false, '{external_account}', null)`);
  let r = (await pg.query('select payouts_enabled, stripe_charges_enabled, stripe_requirements_due, stripe_status_checked_at is not null checked from public.app_users where id = $1', [A])).rows[0];
  assert.deepEqual(r, { payouts_enabled: false, stripe_charges_enabled: true, stripe_requirements_due: ['external_account'], checked: true });
  // both on but disabled_reason -> not ready
  await svc(`select public.set_payouts_from_stripe('acct_t1', true, true, '{}', 'requirements.past_due')`);
  assert.equal((await flag(pg)).payouts_enabled, false);
  // both on, nothing disabled -> ready
  const n = (await svc(`select public.set_payouts_from_stripe('acct_t1', true, true, '{}', null) n`)).rows[0].n;
  assert.equal(n, 1);
  assert.equal((await flag(pg)).payouts_enabled, true);
  // an unknown account changes nobody
  assert.equal((await svc(`select public.set_payouts_from_stripe('acct_nobody', true, true, '{}', null) n`)).rows[0].n, 0);
  assert.equal((await flag(pg, B)).payouts_enabled, false);
});
