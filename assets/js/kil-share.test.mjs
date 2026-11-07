import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const s = require('./kil-share.js');

function utmValues(url) {
  const u = new URL(url);
  const out = {};
  u.searchParams.forEach((v, k) => { if (k.startsWith('utm_')) out[k] = v; });
  return out;
}

test('a profile share has source and medium, and no campaign, handle, id, or email', () => {
  const url = s.profileShareUrl('Ada-Host', '/member');
  const utm = utmValues(url);
  assert.deepEqual(utm, { utm_source: 'share', utm_medium: 'profile' });
  assert.equal(new URL(url).searchParams.get('slug'), 'ada-host');
  assert.equal(JSON.stringify(utm).includes('ada-host'), false);
  assert.equal(s.profileShareUrl('fan@example.com', '/profile').includes('utm_campaign'), false);
  assert.equal(s.profileShareUrl('fan@example.com', '/profile').includes('@'), false);
  const uuid = '0e54bcb7-4f06-4e1b-aaf9-48a540e2d483';
  assert.equal(s.profileShareUrl(uuid, '/member').includes(uuid), false);
});

test('an event share campaigns the event slug only', () => {
  const url = s.eventShareUrl('Neon-Nights-LA', '/event');
  assert.deepEqual(utmValues(url), {
    utm_source: 'share',
    utm_medium: 'event',
    utm_campaign: 'neon-nights-la'
  });
  assert.equal(new URL(url).searchParams.get('e'), 'neon-nights-la');
  const bad = s.eventShareUrl('buyer@example.com', '/show');
  assert.equal(bad.includes('@'), false);
  assert.equal(new URL(bad).searchParams.get('utm_campaign'), null);
});

const ADULT = {
  account_type: 'artist', profile_public: true, age_verified: true,
  is_minor: false, under_18: false, status: 'published', admin_approved: true
};

test('authenticated cannot set admin_approved after step 1', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const revoke = readFileSync(new URL('../../supabase/migrations/20261107014100_profile_public_read_revoke.sql', import.meta.url), 'utf8');
  assert.match(add, /REVOKE INSERT, UPDATE ON TABLE public\.profile_meta FROM authenticated/);
  assert.equal(/REVOKE ALL ON TABLE public\.profile_meta FROM authenticated/.test(add), false);
  for (const kind of ['INSERT', 'UPDATE']) {
    const grants = add.match(new RegExp('GRANT ' + kind + ' \\(([^)]+)\\) ON TABLE public\\.profile_meta', 'i'));
    assert.ok(grants, kind);
    const cols = grants[1].split(',').map((s) => s.trim());
    for (const kept of ['account_type', 'status', 'slug', 'profile_public', 'public_fields']) {
      assert.equal(cols.includes(kept), true, kind + ' keeps ' + kept);
    }
    for (const forbidden of ['admin_approved', 'age_verified', 'is_minor', 'under_18']) {
      assert.equal(cols.includes(forbidden), false, kind + ' ' + forbidden);
    }
  }
  assert.match(revoke, /REVOKE UPDATE \(account_type, status, slug\) ON TABLE public\.profile_meta FROM authenticated/);
  assert.match(revoke, /REVOKE INSERT \(account_type, status\) ON TABLE public\.profile_meta FROM authenticated/);
});

test('anon truncate and anon insert are refused', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  assert.match(add, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.profile_meta FROM anon, PUBLIC/);
  const revoke = readFileSync(new URL('../../supabase/migrations/20261107014100_profile_public_read_revoke.sql', import.meta.url), 'utf8');
  assert.match(revoke, /REVOKE DELETE, TRUNCATE ON TABLE public\.profile_meta FROM authenticated/);
  assert.equal(/REVOKE SELECT ON TABLE public\.profile_meta FROM anon/.test(add), false);
});

test('a non-owner cannot insert into profile_owners and anon cannot read it', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  assert.match(add, /DROP POLICY IF EXISTS "profile_owners claim"/);
  assert.match(add, /DROP POLICY IF EXISTS "profile_owners read all"/);
  assert.match(add, /DROP POLICY IF EXISTS profile_owners_read/);
  assert.match(add, /DROP POLICY IF EXISTS "profile_owners manage own"/);
  assert.match(add, /DROP POLICY IF EXISTS "profile_owners delete own"/);
  assert.equal(/FOR UPDATE[\s\S]{0,80}profile_owners|profile_owners[\s\S]{0,80}FOR UPDATE/.test(add), false);
  assert.match(add, /REVOKE ALL ON TABLE public\.profile_owners FROM anon, PUBLIC/);
  assert.match(add, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.profile_owners FROM authenticated/);
  assert.match(add, /REVOKE DELETE, TRUNCATE ON TABLE public\.profile_meta FROM authenticated/);
  const revokeOwners = readFileSync(new URL('../../supabase/migrations/20261107014100_profile_public_read_revoke.sql', import.meta.url), 'utf8');
  assert.match(revokeOwners, /REVOKE ALL ON TABLE public\.profile_owners FROM anon/);
  assert.match(revokeOwners, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.profile_owners FROM authenticated/);
  assert.match(add, /USING \(owner_id = \(SELECT auth\.uid\(\)\)\)/);
  assert.equal(/GRANT INSERT[^;]*profile_owners/i.test(add), false);
  assert.match(add, /FUNCTION public\.i_own_profile\(slug text\)/);
  assert.match(add, /FUNCTION public\.approve_profile_claim/);
  for (const file of ['profile.html', 'index.html', 'signup.html', 'keepitil-shell.js']) {
    const src = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
    assert.equal(src.includes("rpc('claim_profile'"), false, file);
    assert.equal(src.includes("from('profile_owners')"), false, file);
  }
});

test('under_18 stays private and out of the list', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const helper = add.slice(add.indexOf('FUNCTION private.profile_is_public'), add.indexOf('FUNCTION private.profile_public_one'));
  const one = add.slice(add.indexOf('FUNCTION private.profile_public_one'), add.indexOf('FUNCTION public.get_public_profile'));
  const list = add.slice(add.indexOf('FUNCTION public.public_profile_list'), add.indexOf('REVOKE ALL ON FUNCTION public.public_profile_list'));
  assert.match(helper, /m\.under_18 IS FALSE/);
  assert.match(helper, /m\.is_minor IS FALSE/);
  assert.match(one, /private\.profile_is_public\(m\.slug\)/);
  assert.match(list, /private\.profile_is_public\(m\.slug\)/);
  assert.equal(/IS NOT TRUE/.test(one + list), false);
  assert.equal(s.profileIsShareable({
    account_type: 'artist', status: 'published', admin_approved: true, profile_public: true,
    public_fields: ['display_name'], is_minor: false, under_18: true, age_verified: true
  }), false);
});

test('an is_minor artist is excluded from the list view', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const list = add.slice(add.indexOf('FUNCTION public.public_profile_list'), add.indexOf('REVOKE ALL ON FUNCTION public.public_profile_list'));
  assert.match(list, /private\.profile_is_public\(m\.slug\)/);
  assert.match(list, /'artist', 'creator', 'dj'/);
  assert.match(list, /editorial_artist/);
  assert.match(list, /private\.profile_is_public\(m\.slug\)/);
  assert.equal(/m\.book_email/.test(list), false);
});

test('profile_is_public is the only visibility rule and it is not an RLS policy', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const revoke = readFileSync(new URL('../../supabase/migrations/20261107014100_profile_public_read_revoke.sql', import.meta.url), 'utf8');
  const helper = add.slice(add.indexOf('FUNCTION private.profile_is_public'), add.indexOf('FUNCTION private.profile_public_one'));
  assert.match(helper, /SECURITY DEFINER/);
  assert.match(helper, /SET search_path = ''/);
  assert.match(add, /ALTER FUNCTION private\.profile_is_public\(text\) OWNER TO postgres/);
  assert.match(helper, /m\.profile_public IS TRUE/);
  assert.match(helper, /m\.admin_approved IS TRUE/);
  assert.match(helper, /private\.account_age/);
  assert.match(helper, /a\.verified IS TRUE/);
  assert.match(helper, /a\.method = 'house'/);
  assert.match(helper, /public\.app_admins/);
  assert.match(helper, /po\.owner_id IS NOT NULL/);
  assert.equal(/m\.age_verified/.test(helper), false);
  assert.equal(/auth\.users|raw_user_meta_data|user_metadata/.test(helper), false);
  assert.match(helper, /'brand', 'venue', 'organizer', 'promoter', 'company'/);
  assert.match(helper, /'editorial_artist', 'editorial_venue', 'editorial_organizer', 'editorial_brand'/);
  assert.match(add, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.profile_owners FROM authenticated/);
  assert.match(add, /CREATE TABLE IF NOT EXISTS private\.account_age/);
  assert.match(add, /user_id uuid PRIMARY KEY/);
  assert.match(add, /verified boolean NOT NULL/);
  assert.match(add, /method IN \('founder_self', 'admin_attested', 'house'\)/);
  assert.match(add, /REVOKE ALL ON TABLE private\.account_age FROM PUBLIC, anon, authenticated/);
  assert.equal(/GRANT [^;]*ON TABLE private\.account_age/i.test(add), false);
  assert.match(add, /p_founder_quote text/);
  assert.match(add, /p_founder_stated_on text/);
  assert.match(add, /p_user_id <> '4f1ff687-e287-496e-8eb4-c444f8e556d1'::uuid/);
  assert.match(add, /p_user_id <> 'd1ef5687-7410-4027-b94d-e4de393c27d9'::uuid/);
  assert.match(add, /FUNCTION public\.admin_move_house_page/);
  assert.match(add, /v_slug text/);
  assert.match(add, /WHERE m\.slug = v_slug/);
  assert.match(add, /WHERE po\.owner_id IS DISTINCT FROM EXCLUDED\.owner_id/);
  const ageFn = add.slice(add.indexOf('FUNCTION public.admin_set_account_age'), add.indexOf('INSERT INTO private.account_age'));
  assert.match(ageFn, /m\.is_minor IS TRUE OR m\.under_18 IS TRUE/);
  assert.match(add, /REVOKE SELECT ON TABLE public\.profiles FROM anon, authenticated, PUBLIC/);
  assert.match(add, /^BEGIN;/m);
  assert.match(add, /^COMMIT;/m);
  assert.match(add, /FUNCTION public\.get_approved_profile\(p_id uuid, p_slug text\)/);
  assert.match(add, /private\.profile_is_public\(m\.slug\)/);
  assert.equal(/p\.handle/.test(add), false);
  assert.match(add, /JOIN public\.profile_meta AS m ON m\.slug = p\.slug/);
  assert.equal(/FROM public\.profile_meta m\s+WHERE lower\(btrim\(m\.account_type\)\) IN/.test(add), false);
  assert.match(add, /COALESCE\(public\.is_admin\(\), FALSE\)/);
  assert.match(add, /m\.is_minor IS TRUE OR m\.under_18 IS TRUE/);
  assert.match(add, /how = 'admin_attested' AND \(SELECT auth\.uid\(\)\) IS NOT DISTINCT FROM p_user_id/);
  assert.equal(/admin_record_age_verification|admin_assign_house_page/.test(add), false);
  assert.equal(/FROM auth\.users/i.test(add), false);
  assert.match(add, /WHEN is_minor IS TRUE OR under_18 IS TRUE THEN TRUE/);
  assert.equal(/SET is_minor = NULL,\s*under_18 = NULL/.test(add), false);
  assert.match(add, /is_minor IS NOT DISTINCT FROM under_18/);
  assert.match(add, /is_minor = FALSE/);
  assert.match(add, /NOT \(m\.is_minor IS TRUE OR m\.under_18 IS TRUE\)/);
  assert.match(add, /private\.profile_is_public\(one\.slug\)/);
  for (const sql of [add, revoke]) {
    sql.split('CREATE POLICY').slice(1).forEach((chunk) => {
      assert.equal(chunk.split(';')[0].includes('profile_is_public'), false);
    });
  }
  assert.match(revoke, /profile_meta's public read policies are swapped/);
  assert.equal(s.profileIsShareable({
    account_type: 'artist', profile_public: true, status: 'published', admin_approved: true,
    public_fields: ['display_name'], is_minor: false, under_18: false
  }), false);
  assert.equal(s.profileIsShareable({
    account_type: 'brand', profile_public: true, status: 'published', admin_approved: true,
    public_fields: ['display_name'], is_minor: null, under_18: null
  }), false);
  assert.equal(s.profileIsShareable({
    account_type: 'brand', profile_public: true, status: 'published', admin_approved: true,
    public_fields: ['display_name'], is_minor: false, under_18: false
  }), true);
  assert.equal(s.profileIsShareable({
    account_type: 'venue', profile_public: true, status: 'published', admin_approved: true,
    public_fields: ['display_name']
  }), false);
});

test('founder_self refuses a different uuid that shares a prefix', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const start = add.indexOf("IF how = 'founder_self'");
  const end = add.indexOf("IF how = 'admin_attested'");
  const block = add.slice(start, end);
  assert.equal(/like/i.test(block), false);
  const ids = [...block.matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((m) => m[1]);
  assert.deepEqual(ids, [
    '4f1ff687-e287-496e-8eb4-c444f8e556d1',
    'd1ef5687-7410-4027-b94d-e4de393c27d9'
  ]);
  function founderSelfAllowed(userId) {
    return ids.some((id) => id === userId);
  }
  assert.equal(founderSelfAllowed('4f1ff687-e287-496e-8eb4-c444f8e556d1'), true);
  assert.equal(founderSelfAllowed('d1ef5687-7410-4027-b94d-e4de393c27d9'), true);
  assert.equal(founderSelfAllowed('4f1ff687-e287-496e-8eb4-c444f8e556d2'), false);
  assert.equal(founderSelfAllowed('4f1ff687-0000-0000-0000-000000000000'), false);
  assert.equal(founderSelfAllowed('d1ef5687-7410-4027-b94d-e4de393c27d8'), false);
});

test('a private or under-18 profile gets no preview card', () => {
  assert.equal(s.profileIsShareable({ display_name: 'Ada', bio: 'secret' }), false);
  assert.equal(s.profileIsShareable({ profile_public: null, age_verified: null, is_minor: null, status: 'published', public_fields: ['bio'] }), false);
  assert.equal(s.profileIsShareable(Object.assign({}, ADULT, { status: 'review', public_fields: ['display_name'] })), false);
  assert.equal(s.profileIsShareable({ is_minor: true, status: 'published', display_name: 'Nico', age_verified: true, profile_public: true, public_fields: ['display_name'] }), false);
  assert.equal(s.profileIsShareable({ under_18: true, is_minor: false, age_verified: true, profile_public: true, status: 'published', public_fields: ['display_name'] }), false);
  assert.equal(s.publicFace({ is_minor: true, display_name: 'Nico', avatar_url: 'https://cdn.example/nico.png' }), null);
  const hidden = s.previewTags(null);
  assert.equal(hidden.robots, 'noindex, nofollow');
  assert.equal(hidden.tags.length, 0);
});

test('the preview image is the public avatar, or the brand card when that photo is not public', () => {
  const open = s.publicFace(Object.assign({
    slug: 'ada', display_name: 'Ada', handle: 'ada',
    bio: 'Plays after midnight.', avatar_url: 'https://cdn.example/ada.png',
    public_fields: ['display_name', 'handle', 'bio', 'avatar_url']
  }, ADULT));
  assert.equal(open.avatar, 'https://cdn.example/ada.png');
  assert.equal(open.image, 'https://cdn.example/ada.png');
  assert.equal(open.imageWidth, '');

  const nameOnly = s.publicFace(Object.assign({
    slug: 'ada', display_name: 'Ada', handle: 'ada', bio: 'Secret bio',
    avatar_url: 'https://cdn.example/private.png',
    public_fields: ['display_name']
  }, ADULT));
  assert.equal(nameOnly.avatar, '');
  assert.equal(nameOnly.bio, '');
  assert.equal(nameOnly.handle, '');
  assert.equal(nameOnly.image, s.BRAND_CARD);
  assert.equal(nameOnly.imageWidth, '1200');
  assert.equal(nameOnly.imageHeight, '630');
  const tags = s.previewTags(nameOnly);
  assert.equal(tags.robots, 'index, follow');
  assert.equal(tags.tags.find((t) => t[1] === 'og:image')[2], s.BRAND_CARD);
  assert.equal(JSON.stringify(tags).includes('private.png'), false);
  assert.equal(JSON.stringify(tags).includes('Secret'), false);
});

test('event previews use the brand card and do not preview a draft', () => {
  const card = s.eventPreview({ slug: 'neon-nights', title: 'Neon Nights', status: 'published', venue: 'Hall', city: 'LA' }, { path: '/show' });
  assert.equal(card.image, s.BRAND_CARD);
  assert.equal(card.share.includes('utm_campaign=neon-nights'), true);
  assert.equal(card.share.includes('utm_medium=event'), true);
  assert.equal(s.eventPreview({ slug: 'draft-night', title: 'Secret', status: 'draft' }), null);
});

test('raw profile and event HTML ships the brand card', () => {
  for (const file of ['member.html', 'profile.html', 'show.html', 'event.html']) {
    const html = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
    assert.match(html, /property="og:title"/, file);
    assert.match(html, /property="og:description"/, file);
    assert.match(html, /property="og:image"[^>]*content="https:\/\/keepitil.com\/keepitil-og.png"/, file);
    assert.match(html, /og:image:width" content="1200"/, file);
    assert.match(html, /og:image:height" content="630"/, file);
    assert.match(html, /name="twitter:image"[^>]*content="https:\/\/keepitil.com\/keepitil-og.png"/, file);
  }
});

test('migration step 1 grants no age columns and step 2 revokes anon', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const revoke = readFileSync(new URL('../../supabase/migrations/20261107014100_profile_public_read_revoke.sql', import.meta.url), 'utf8');
  assert.match(add, /REVOKE ALL ON FUNCTION private\.profile_public_one\(text\) FROM PUBLIC/);
  assert.match(add, /profile_owners/);
  assert.match(add, /SET admin_approved = TRUE/);
  assert.match(add, /is_minor IS NOT TRUE/);
  assert.equal(/profiles_legacy_v/.test(add + revoke), false);
  assert.equal(/ALTER TABLE public\.profiles ENABLE ROW LEVEL SECURITY/.test(add + revoke), false);
  assert.equal(/CREATE TABLE IF NOT EXISTS public\.profiles/.test(add + revoke), false);
  assert.match(revoke, /DROP POLICY IF EXISTS "profile_meta read all"/);
  assert.match(revoke, /DROP POLICY IF EXISTS profile_meta_read/);
  assert.match(revoke, /REVOKE ALL ON TABLE public\.profile_meta FROM anon/);
  assert.match(revoke, /REVOKE ALL ON TABLE public\.profile_owners FROM anon/);
  assert.match(revoke, /select book_email from public\.profile_meta/);
  assert.match(revoke, /ALTER TABLE public\.profile_meta ENABLE ROW LEVEL SECURITY/);
  assert.equal(add.includes('m.book_email'), false);
});

test('a business profile does not need 18+ on the page, and a member still does', () => {
  const openBiz = {
    account_type: 'brand', status: 'published', admin_approved: true,
    profile_public: true, public_fields: ['display_name', 'bio'],
    is_minor: false, under_18: false
  };
  assert.equal(s.profileIsShareable(openBiz), true);
  assert.equal(s.profileIsShareable(Object.assign({}, openBiz, { account_type: 'editorial_artist' })), true);
  assert.equal(s.profileIsShareable(Object.assign({}, openBiz, { account_type: 'editorial_artist', is_minor: null, under_18: null })), false);
  assert.equal(s.profileIsShareable(Object.assign({}, openBiz, { profile_public: false })), false);
  assert.equal(s.profileIsShareable(Object.assign({}, openBiz, { public_fields: [] })), false);
  assert.equal(s.profileIsShareable(Object.assign({}, openBiz, { public_fields: null })), false);
  const masked = s.publicFace(Object.assign({}, openBiz, { display_name: 'Groove', bio: 'Secret', location: 'LA' }));
  assert.equal(masked.bio, 'Secret');
  assert.equal(masked.location || '', '');
  assert.equal(s.profileIsShareable({
    account_type: 'artist', status: 'published', admin_approved: true, is_minor: true
  }), false);
  assert.equal(s.profileIsShareable({
    account_type: 'subscriber_profile', profile_public: true, status: 'published', admin_approved: true
  }), false);
  assert.equal(s.profileIsShareable({
    account_type: 'subscriber_profile', profile_public: true, status: 'published', admin_approved: true,
    age_verified: true, is_minor: false, under_18: false, public_fields: ['display_name']
  }), true);
});

test('the owner save does not write account_type', () => {
  const html = readFileSync(new URL('../../profile.html', import.meta.url), 'utf8');
  const start = html.indexOf('var meta={');
  const meta = html.slice(start, html.indexOf('};', start));
  assert.equal(/account_type/.test(meta), false);
  assert.equal(/\bslug:/.test(meta), false);
  assert.match(meta, /profile_public:/);
  assert.match(meta, /public_fields:/);
  assert.match(html, /id="epPublic"/);
  assert.match(html, /\.update\(meta\)\.eq\('slug',PROFILE_SLUG\)/);
  assert.match(html, /var created=\{slug:PROFILE_SLUG\}/);
  assert.match(html, /\.insert\(created\)/);
  assert.equal(/id="epAcct"/.test(html), false);
  assert.match(html, /id="epAcctRequest"/);
  assert.match(html, /kind:'account_type_request'/);
  assert.match(html, /id="epAcctShown"/);
});

test('signed-in directory reads use the public functions', () => {
  const pages = [
    ['index.html', 'public_profile_list'],
    ['connect/index.html', 'public_profile_list'],
    ['assets/js/kil-browse.js', 'public_profile_list'],
    ['assets/js/keepitil-ai.js', 'public_profile_list'],
    ['assets/js/kil-member.js', 'get_public_profile']
  ];
  for (const [file, rpc] of pages) {
    const src = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
    assert.equal(src.includes("from('profile_meta')"), false, file);
    assert.equal(src.includes('/rest/v1/profile_meta'), false, file);
    assert.match(src, new RegExp(rpc));
  }
  const profile = readFileSync(new URL('../../profile.html', import.meta.url), 'utf8');
  const load = profile.slice(profile.indexOf('function loadProfileMeta'), profile.indexOf('function loadCategories'));
  assert.match(load, /CAN_EDIT\(\)&&!!SESSION/);
  assert.match(load, /rpc\('get_public_profile'/);
  const about = profile.slice(profile.indexOf('var metaRead'), profile.indexOf('metaRead.then'));
  assert.match(about, /CAN_EDIT\(\)&&SESSION/);
  assert.match(about, /rpc\('get_public_profile'/);
});

test('step 1 rollback restores the real prod policy names', () => {
  const down = readFileSync(new URL('../../supabase/rollbacks/20261107014000_profile_public_read_down.sql', import.meta.url), 'utf8');
  assert.match(down, /GRANT ALL ON TABLE public\.profile_meta\s+TO authenticated/);
  assert.match(down, /GRANT ALL ON TABLE public\.profile_owners TO authenticated/);
  assert.match(down, /GRANT SELECT ON TABLE public\.profile_meta\s+TO anon/);
  assert.match(down, /GRANT SELECT ON TABLE public\.profile_owners TO anon/);
  assert.match(down, /DROP FUNCTION IF EXISTS public\.i_own_profile\(text\)/);
  assert.match(down, /DROP FUNCTION IF EXISTS public\.request_profile_claim\(text\)/);
  assert.match(down, /DROP FUNCTION IF EXISTS public\.approve_profile_claim\(uuid\)/);
  assert.match(down, /DROP FUNCTION IF EXISTS private\.profile_is_public\(text\)/);
  assert.match(down, /DROP FUNCTION IF EXISTS public\.admin_set_account_age\(uuid, boolean, text, text, text\)/);
  assert.match(down, /If #92 shipped, run supabase\/rollbacks\/20261107020000_profile_event_summary_down\.sql first/);
  assert.equal(/^\s*DROP FUNCTION IF EXISTS public\.get_profile_events/m.test(down), false);
  const rpcAt = down.indexOf('DROP FUNCTION IF EXISTS public.admin_set_account_age(uuid, boolean, text, text, text)');
  const tableAt = down.indexOf('DROP TABLE    IF EXISTS private.account_age');
  const schemaAt = down.indexOf('DROP SCHEMA   IF EXISTS private');
  assert.ok(rpcAt !== -1 && tableAt > rpcAt && schemaAt > tableAt);
  assert.match(down, /"profile_owners claim"/);
  assert.match(down, /CREATE POLICY "profile_owners read all"/);
  assert.match(down, /CREATE POLICY profile_owners_read/);
  assert.match(down, /CREATE POLICY "profile_owners manage own"/);
  assert.match(down, /CREATE POLICY "profile_owners delete own"/);
  assert.equal(/CREATE POLICY "read all"/.test(down), false);
});

test('profile.html raw HTML is noindex', () => {
  const html = readFileSync(new URL('../../profile.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test('show and event raw HTML default to noindex', () => {
  for (const file of ['show.html', 'event.html']) {
    const html = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex"/, file);
  }
});

test('a missing public profile renders the private stub', () => {
  const html = readFileSync(new URL('../../profile.html', import.meta.url), 'utf8');
  const load = html.slice(html.indexOf('function loadProfileMeta'), html.indexOf('function loadCategories'));
  assert.match(html, /function showPrivateStub/);
  assert.match(html, /data-m1','private-stub'/);
  assert.match(html, /THIS PROFILE IS PRIVATE/);
  assert.match(html, /background:#0c2744/);
  assert.match(html, /KilShare.applyPreview\(document, null\)/);
  assert.equal(/KIL_NOT_FOUND/.test(load), false);
  assert.match(load, /showPrivateStub\(\)/);
});

test('the public sql honors profile_public and the field mask', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const one = add.slice(add.indexOf('FUNCTION private.profile_public_one'), add.indexOf('FUNCTION public.get_public_profile'));
  const list = add.slice(add.indexOf('FUNCTION public.public_profile_list'), add.indexOf('REVOKE ALL ON FUNCTION public.public_profile_list'));
  assert.match(one, /private\.profile_is_public\(m\.slug\)/);
  assert.match(one, /cardinality\(m\.public_fields\) > 0/);
  assert.equal(/account_type IN \('brand'[\s\S]{0,80}THEN m\.display_name/.test(one), false);
  assert.match(list, /private\.profile_is_public\(m\.slug\)/);
  const helper = add.slice(add.indexOf('FUNCTION private.profile_is_public'), add.indexOf('FUNCTION private.profile_public_one'));
  assert.match(helper, /m\.profile_public IS TRUE/);
  assert.match(helper, /m\.under_18 IS FALSE/);
  assert.equal(/public_fields IS NULL OR/.test(list), false);
  assert.match(add, /SET public_fields = ARRAY\[\]::text\[\]/);
});

test('the qa owner seed refuses production', () => {
  const sql = readFileSync(new URL('../../supabase/seed/qa_owner_profiles.sql', import.meta.url), 'utf8');
  assert.match(sql, /qa-brand@example\.test|qa-brand/);
  assert.match(sql, /kil\.qa_seed/);
  assert.match(sql, /INSERT INTO private\.account_age/);
  assert.equal(/age_verified/.test(sql), false);
  assert.equal(/password|service_role|eyJ/i.test(sql), false);
  const script = readFileSync(new URL('../../scripts/seed-qa-owners.mjs', import.meta.url), 'utf8');
  const migrations = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8')
    + readFileSync(new URL('../../supabase/migrations/20261107014100_profile_public_read_revoke.sql', import.meta.url), 'utf8');
  assert.equal(migrations.includes('qa-brand'), false);
  assert.match(script, /qa-brand@example\.test/);
  assert.match(script, /qa-member@example\.test/);
  assert.match(script, /INSERT INTO private\.account_age/);
  assert.match(script, /127\.0\.0\.1/);
  assert.equal(/age_verified/.test(script), false);
  assert.equal(/eyJ/.test(script), false);
  const run = spawnSync(process.execPath, ['scripts/seed-qa-owners.mjs'], {
    cwd: new URL('../..', import.meta.url),
    env: {
      ...process.env,
      SUPABASE_URL: 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'local-test-key-not-a-real-secret-value',
      QA_OWNER_PASSWORD: 'local-only-pass'
    }
  });
  assert.notEqual(run.status, 0);
  assert.match(String(run.stderr), /Refusing to seed/);
  const other = spawnSync(process.execPath, ['scripts/seed-qa-owners.mjs'], {
    cwd: new URL('../..', import.meta.url),
    env: {
      ...process.env,
      SUPABASE_URL: 'https://example.supabase.co',
      DATABASE_URL: 'postgresql://postgres@127.0.0.1:54322/postgres',
      SUPABASE_SERVICE_ROLE_KEY: 'local-test-key-not-a-real-secret-value',
      QA_OWNER_PASSWORD: 'local-only-pass'
    }
  });
  assert.notEqual(other.status, 0);
  assert.match(String(other.stderr), /Refusing to seed/);
});

test('the pages do not add a Discover/Events/Vote/Echo/Profile tab bar', () => {
  const member = readFileSync(new URL('../../member.html', import.meta.url), 'utf8');
  const show = readFileSync(new URL('../../show.html', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../../keepitil-shell.js', import.meta.url), 'utf8');
  assert.match(shell, /pill:'DISCOVER'/);
  assert.match(shell, /pill:'CONNECT'/);
  assert.match(shell, /pill:'CREATE'/);
  assert.match(shell, /pill:'CULTURE'/);
  assert.match(shell, /pill:'EARN'/);
  assert.match(member, /keepitil-shell\.js/);
  assert.match(show, /keepitil-shell\.js/);
  assert.equal(/Vote|Echo/.test(member), false);
  assert.equal(/Vote|Echo/.test(show), false);
});
