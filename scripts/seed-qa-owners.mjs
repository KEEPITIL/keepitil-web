#!/usr/bin/env node
// Local and test Supabase only. The host must be on the allowlist below.
// Creates two auth users, their profile rows, and private.account_age.
// No passwords are stored here. The legacy age flag is not written.
//
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//   SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE_ROLE" \
//   QA_OWNER_PASSWORD='choose-a-local-password' \
//   node scripts/seed-qa-owners.mjs

import { spawnSync } from 'node:child_process';

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);

const OWNERS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'qa-brand@example.test',
    slug: 'qa-brand',
    profile: {
      slug: 'qa-brand',
      display_name: 'QA Brand',
      handle: 'qa-brand',
      account_type: 'brand',
      status: 'published',
      profile_public: true,
      admin_approved: true,
      is_minor: false,
      under_18: false,
      public_fields: ['display_name', 'handle', 'bio', 'tagline'],
      bio: 'Local QA brand. Not a real profile.',
      tagline: 'QA only'
    }
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'qa-member@example.test',
    slug: 'qa-member',
    profile: {
      slug: 'qa-member',
      display_name: 'QA Member',
      handle: 'qa-member',
      account_type: 'subscriber_profile',
      status: 'published',
      profile_public: false,
      admin_approved: true,
      is_minor: false,
      under_18: false,
      public_fields: ['display_name'],
      bio: 'Local QA member. Not a real profile.',
      tagline: 'QA only'
    }
  }
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const databaseUrl = String(process.env.DATABASE_URL || '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const password = process.env.QA_OWNER_PASSWORD || '';

function allowedHttp(raw) {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:'
      && ALLOWED_HOSTS.has(parsed.hostname)
      && (parsed.port === '54321' || parsed.port === '54322');
  } catch (e) {
    return false;
  }
}

function allowedDatabase(raw) {
  try {
    const parsed = new URL(raw);
    return (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:')
      && ALLOWED_HOSTS.has(parsed.hostname);
  } catch (e) {
    return false;
  }
}

if (!allowedHttp(url) || !allowedDatabase(databaseUrl)) {
  fail('Refusing to seed. SUPABASE_URL must be a local or test project, not production.');
}
if (!key || key.length < 20) fail('Set SUPABASE_SERVICE_ROLE_KEY from the local Supabase status. Do not commit it.');
if (password.length < 8) fail('Set QA_OWNER_PASSWORD to a local password of at least 8 characters. Do not commit it.');

async function api(path, options) {
  const res = await fetch(url + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch (e) { body = { message: text }; }
  }
  return { ok: res.ok, status: res.status, body };
}

async function ensureUser(owner) {
  const created = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      id: owner.id,
      email: owner.email,
      password: password,
      email_confirm: true
    })
  });
  if (created.ok) return;
  const updated = await api('/auth/v1/admin/users/' + owner.id, {
    method: 'PUT',
    body: JSON.stringify({ email: owner.email, password: password, email_confirm: true })
  });
  if (!updated.ok) {
    fail('Could not create ' + owner.email + ': ' + (created.body && created.body.msg || created.body && created.body.message || created.status));
  }
}

async function ensureProfile(owner) {
  const row = await api('/rest/v1/profile_meta?on_conflict=slug', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(owner.profile)
  });
  if (!row.ok) fail('Could not write profile ' + owner.slug + ': ' + (row.body && row.body.message || row.status));
  const link = await api('/rest/v1/profile_owners?on_conflict=profile_slug', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ profile_slug: owner.slug, owner_id: owner.id })
  });
  if (!link.ok) fail('Could not write profile_owners for ' + owner.slug + ': ' + (link.body && link.body.message || link.status));
}

function writeLedger() {
  const sql = `
    INSERT INTO private.account_age (user_id, verified, method, verified_at, verified_by)
    VALUES
      ('11111111-1111-4111-8111-111111111111', true, 'admin_attested', now(), '11111111-1111-4111-8111-111111111111'),
      ('22222222-2222-4222-8222-222222222222', true, 'admin_attested', now(), '22222222-2222-4222-8222-222222222222')
    ON CONFLICT (user_id) DO UPDATE
      SET verified = EXCLUDED.verified,
          method = EXCLUDED.method,
          verified_at = EXCLUDED.verified_at,
          verified_by = EXCLUDED.verified_by;
  `;
  const run = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  if (run.status !== 0) {
    fail('Could not write private.account_age: ' + (run.stderr || run.stdout || run.status));
  }
}

for (const owner of OWNERS) {
  await ensureUser(owner);
  await ensureProfile(owner);
  console.log(owner.email + ' owns /profile?slug=' + owner.slug);
}
writeLedger();
console.log('Signed-in edit checks use the password from QA_OWNER_PASSWORD. It was not printed.');
