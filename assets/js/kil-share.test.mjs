import assert from 'node:assert/strict';
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

const ADULT = { profile_public: true, age_verified: true, is_minor: false, status: 'published', admin_approved: true };

test('an owner self-update of age_verified or status is refused', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const revoke = readFileSync(new URL('../../supabase/migrations/20261107014100_profile_public_read_revoke.sql', import.meta.url), 'utf8');
  assert.equal(/REVOKE ALL ON TABLE public\.profile_meta FROM authenticated/.test(add), false);
  assert.match(revoke, /REVOKE ALL ON TABLE public\.profile_meta FROM authenticated/);
  for (const kind of ['INSERT', 'UPDATE']) {
    const grants = revoke.match(new RegExp('GRANT ' + kind + ' \\(([^)]+)\\) ON TABLE public\\.profile_meta', 'i'));
    assert.ok(grants, kind);
    const cols = grants[1].split(',').map((s) => s.trim());
    for (const forbidden of ['age_verified', 'is_minor', 'under_18', 'status', 'account_type', 'admin_approved']) {
      assert.equal(cols.includes(forbidden), false, kind + ' ' + forbidden);
    }
    if (kind === 'UPDATE') assert.equal(cols.includes('slug'), false);
  }
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
  assert.match(add, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.profile_owners FROM anon, PUBLIC/);
  assert.equal(/REVOKE ALL ON TABLE public\.profile_owners FROM anon/.test(add), false);
  assert.equal(/REVOKE INSERT, DELETE, TRUNCATE ON TABLE public\.profile_owners FROM authenticated/.test(add), false);
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
  const one = add.slice(add.indexOf('FUNCTION private.profile_public_one'), add.indexOf('FUNCTION public.get_public_profile'));
  const list = add.slice(add.indexOf('FUNCTION public.public_profile_list'));
  assert.match(one, /m\.under_18 IS NOT TRUE/);
  assert.match(list, /m\.under_18 IS NOT TRUE/);
  assert.match(add, /under_18 IS NOT TRUE/);
  assert.equal(s.profileIsShareable({
    account_type: 'artist', status: 'published', admin_approved: true, is_minor: false, under_18: true
  }), false);
});

test('an is_minor artist is excluded from the list view', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const list = add.slice(add.indexOf('FUNCTION public.public_profile_list'));
  assert.match(list, /m\.is_minor IS NOT TRUE/);
  assert.match(list, /m\.admin_approved IS TRUE/);
  assert.match(list, /editorial_artist/);
  assert.equal(/m\.book_email/.test(list), false);
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

test('a business profile does not need 18+, and a member still does', () => {
  const openBiz = {
    account_type: 'editorial_artist', status: 'published', admin_approved: true,
    profile_public: true, public_fields: ['display_name', 'bio'], is_minor: null
  };
  assert.equal(s.profileIsShareable(openBiz), true);
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
    age_verified: true, is_minor: false, public_fields: ['display_name']
  }), true);
});

test('the owner save does not write account_type', () => {
  const html = readFileSync(new URL('../../profile.html', import.meta.url), 'utf8');
  const start = html.indexOf('var meta={');
  const meta = html.slice(start, html.indexOf('};', start));
  assert.equal(/account_type/.test(meta), false);
  assert.equal(/\bslug:/.test(meta), false);
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

test('step 1 rollback grants authenticated and not anon', () => {
  const down = readFileSync(new URL('../../supabase/rollbacks/20261107014000_profile_public_read_down.sql', import.meta.url), 'utf8');
  assert.match(down, /GRANT ALL ON TABLE public\.profile_meta TO authenticated/);
  assert.match(down, /GRANT ALL ON TABLE public\.profile_owners TO authenticated/);
  assert.match(down, /DROP FUNCTION IF EXISTS public\.i_own_profile\(text\)/);
  assert.match(down, /DROP FUNCTION IF EXISTS public\.request_profile_claim\(text\)/);
  assert.match(down, /DROP FUNCTION IF EXISTS public\.approve_profile_claim\(uuid\)/);
  assert.match(down, /"profile_owners claim"/);
  assert.equal(/TO anon/i.test(down), false);
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
  assert.match(html, /This profile is private/);
  assert.equal(/KIL_NOT_FOUND/.test(load), false);
  assert.match(load, /showPrivateStub\(\)/);
});

test('the public sql honors profile_public and the field mask', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const one = add.slice(add.indexOf('FUNCTION private.profile_public_one'), add.indexOf('FUNCTION public.get_public_profile'));
  const list = add.slice(add.indexOf('FUNCTION public.public_profile_list'), add.indexOf('REVOKE ALL ON FUNCTION public.public_profile_list'));
  assert.match(one, /m\.profile_public IS TRUE/);
  assert.match(one, /m\.under_18 IS NOT TRUE/);
  assert.match(one, /cardinality\(m\.public_fields\) > 0/);
  assert.equal(/account_type IN \('brand'[\s\S]{0,80}THEN m\.display_name/.test(one), false);
  assert.match(list, /m\.profile_public IS TRUE/);
  assert.match(list, /m\.under_18 IS NOT TRUE/);
  assert.equal(/public_fields IS NULL OR/.test(list), false);
  assert.match(add, /SET public_fields = ARRAY\[\]::text\[\]/);
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
