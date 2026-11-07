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

const ADULT = { profile_public: true, age_verified: true, is_minor: false, status: 'published' };

test('an owner self-update of age_verified is not granted', () => {
  const add = readFileSync(new URL('../../supabase/migrations/20261107014000_profile_public_read_add.sql', import.meta.url), 'utf8');
  const grants = add.match(/GRANT UPDATE \([^)]+\) ON TABLE public\.profile_meta/gi) || [];
  assert.equal(grants.length, 1);
  assert.equal(/age_verified/.test(grants[0]), false);
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
  const grant = add.match(/GRANT UPDATE \(([^)]+)\) ON TABLE public\.profile_meta/i);
  assert.ok(grant, 'owner column grant');
  const cols = grant[1].split(',').map((s) => s.trim());
  for (const forbidden of ['age_verified', 'is_minor', 'under_18', 'status', 'account_type']) {
    assert.equal(cols.includes(forbidden), false, forbidden);
  }
  assert.match(add, /REVOKE UPDATE ON TABLE public\.profile_meta FROM authenticated/);
  assert.equal(/REVOKE SELECT ON TABLE public\.profile_meta FROM anon/.test(add), false);
  assert.equal(/ENABLE ROW LEVEL SECURITY/.test(add), false);
  assert.match(add, /account_type IN \('brand', 'organizer', 'artist'\)/);
  assert.match(add, /SET profile_public = TRUE/);
  assert.match(revoke, /REVOKE SELECT ON TABLE public\.profile_meta FROM anon/);
  assert.match(revoke, /select book_email from public\.profile_meta/);
  assert.match(revoke, /ENABLE ROW LEVEL SECURITY/);
  assert.match(revoke, /FORCE ROW LEVEL SECURITY/);
  assert.equal(add.includes('m.book_email'), false);
});

test('a business profile does not need 18+, and a member still does', () => {
  assert.equal(s.profileIsShareable({
    account_type: 'artist', profile_public: true, status: 'published', age_verified: null, is_minor: null
  }), true);
  assert.equal(s.profileIsShareable({
    account_type: 'subscriber_profile', profile_public: true, status: 'published'
  }), false);
  assert.equal(s.profileIsShareable({
    account_type: 'subscriber_profile', profile_public: true, status: 'published',
    age_verified: true, is_minor: false, public_fields: ['display_name']
  }), true);
});

test('profile.html raw HTML is noindex', () => {
  const html = readFileSync(new URL('../../profile.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex">/);
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
