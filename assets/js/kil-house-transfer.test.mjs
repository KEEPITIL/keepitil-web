import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const HOUSE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRIOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// This test runs the migration's function against a real PostgreSQL, because
// plpgsql name resolution cannot be checked any other way. It finds a server
// in this order:
//   1. an explicit one: set PGHOST (plus PGPORT/PGUSER/PGPASSWORD as usual);
//   2. a local install reachable as `sudo -n -u postgres psql`.
// With neither it SKIPS with a reason rather than failing, so `npm test` is
// not red on a machine that has no PostgreSQL. Under CI (CI=true) a missing
// server is a hard FAILURE, so the skip can never hide the check where it is
// supposed to run.
function pgRunner() {
  const direct = process.env.PGHOST
    ? (args, input) => spawnSync('psql', args, { encoding: 'utf8', input })
    : null;
  const viaSudo = (args, input) => spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', ...args], { encoding: 'utf8', input });
  for (const run of [direct, viaSudo]) {
    if (!run) continue;
    const probe = run(['-d', 'postgres', '-Atc', 'SELECT 1']);
    if (probe.status === 0) return { run };
  }
  const why = process.env.PGHOST
    ? 'PGHOST is set but psql could not connect'
    : 'no PostgreSQL available (set PGHOST, or run a local server reachable as `sudo -u postgres psql`)';
  return { why };
}

const pg = pgRunner();
const skipWhy = !pg.run && !process.env.CI ? `SKIPPED, not passed: ${pg.why}` : false;

test('admin_move_house_page moves only the named page', { skip: skipWhy }, () => {
  assert.ok(pg.run, `CI requires PostgreSQL for this test: ${pg.why}`);

  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const start = add.indexOf('CREATE OR REPLACE FUNCTION public.admin_move_house_page');
  const end = add.indexOf('ALTER FUNCTION public.admin_move_house_page');
  const fn = add.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(fn, /v_slug text/);
  assert.equal(/\bslug text\b/.test(fn), false);

  const sql = `
    SET plpgsql.variable_conflict = error;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql AS $$ SELECT '${ADMIN}'::uuid $$;
    CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.app_admins (user_id uuid PRIMARY KEY);
    CREATE TABLE public.profile_meta (
      slug text PRIMARY KEY,
      account_type text,
      is_minor boolean,
      under_18 boolean
    );
    CREATE TABLE public.profile_owners (
      profile_slug text PRIMARY KEY,
      owner_id uuid
    );
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE TABLE private.account_age (
      user_id uuid PRIMARY KEY,
      verified boolean NOT NULL,
      method text NOT NULL
    );
    INSERT INTO public.app_admins (user_id) VALUES ('${HOUSE}');
    INSERT INTO private.account_age (user_id, verified, method)
    VALUES ('${HOUSE}', true, 'house');
    INSERT INTO public.profile_meta (slug, account_type, is_minor, under_18) VALUES
      ('groove-trooper', 'editorial_artist', NULL, NULL),
      ('other-editorial', 'editorial_venue', NULL, NULL),
      ('minor-editorial', 'editorial_brand', true, true),
      ('tuitea', 'subscriber_profile', false, false);
    INSERT INTO public.profile_owners (profile_slug, owner_id)
    VALUES ('minor-editorial', '${PRIOR}');
    ${fn}
    SELECT public.admin_move_house_page('Groove-Trooper', '${HOUSE}');
    DO $$
    DECLARE moved uuid; minor_owner uuid; still_minor boolean;
    BEGIN
      SELECT po.owner_id INTO moved
      FROM public.profile_owners AS po
      WHERE po.profile_slug = 'groove-trooper';
      IF moved IS DISTINCT FROM '${HOUSE}'::uuid THEN
        RAISE EXCEPTION 'groove-trooper was not moved';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.profile_owners AS po
        WHERE po.profile_slug = 'other-editorial'
      ) THEN
        RAISE EXCEPTION 'another editorial page was moved';
      END IF;
      SELECT po.owner_id INTO minor_owner
      FROM public.profile_owners AS po
      WHERE po.profile_slug = 'minor-editorial';
      IF minor_owner IS DISTINCT FROM '${PRIOR}'::uuid THEN
        RAISE EXCEPTION 'the minor page owner changed';
      END IF;
    END $$;
    SELECT public.admin_move_house_page('minor-editorial', '${HOUSE}');
    DO $$
    DECLARE still_minor boolean; minor_owner uuid;
    BEGIN
      SELECT m.is_minor IS TRUE AND m.under_18 IS TRUE INTO still_minor
      FROM public.profile_meta AS m
      WHERE m.slug = 'minor-editorial';
      IF still_minor IS NOT TRUE THEN
        RAISE EXCEPTION 'known minor flags were cleared';
      END IF;
      SELECT po.owner_id INTO minor_owner
      FROM public.profile_owners AS po
      WHERE po.profile_slug = 'minor-editorial';
      IF minor_owner IS DISTINCT FROM '${HOUSE}'::uuid THEN
        RAISE EXCEPTION 'the named minor page was not moved';
      END IF;
    END $$;
    DO $$
    BEGIN
      PERFORM public.admin_move_house_page('tuitea', '${HOUSE}');
      RAISE EXCEPTION 'a non-editorial page was accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'a non-editorial page was accepted' THEN
        RAISE;
      END IF;
    END $$;
  `;

  const admin = (sqlText) => pg.run(['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sqlText]);
  admin('DROP DATABASE IF EXISTS kil_house_move');
  const created = admin('CREATE DATABASE kil_house_move');
  assert.equal(created.status, 0, created.stderr || created.stdout);
  const ran = pg.run(['-d', 'kil_house_move', '-v', 'ON_ERROR_STOP=1'], sql);
  admin('DROP DATABASE IF EXISTS kil_house_move');
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
});
