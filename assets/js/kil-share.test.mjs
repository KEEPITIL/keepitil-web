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

test('a private or under-18 profile gets no preview card', () => {
  assert.equal(s.profileIsShareable({ is_minor: true, status: 'published', display_name: 'Nico' }), false);
  assert.equal(s.profileIsShareable({ under_18: true, display_name: 'Nico' }), false);
  assert.equal(s.profileIsShareable({ age_verified: false, display_name: 'Nico', status: 'published' }), false);
  assert.equal(s.profileIsShareable({ public_fields: [], age_verified: true, display_name: 'Ada' }), false);
  assert.equal(s.publicFace({ is_minor: true, display_name: 'Nico', avatar_url: 'https://cdn.example/nico.png' }), null);
  const hidden = s.previewTags(null);
  assert.equal(hidden.robots, 'noindex, nofollow');
  assert.equal(hidden.tags.length, 0);
});

test('the preview image is the public avatar, or the brand card when that photo is not public', () => {
  const open = s.publicFace({
    slug: 'ada', display_name: 'Ada', handle: 'ada', status: 'published',
    bio: 'Plays after midnight.', avatar_url: 'https://cdn.example/ada.png'
  });
  assert.equal(open.avatar, 'https://cdn.example/ada.png');
  assert.equal(open.image, 'https://cdn.example/ada.png');
  assert.equal(open.imageWidth, '');

  const nameOnly = s.publicFace({
    slug: 'ada', display_name: 'Ada', handle: 'ada', bio: 'Secret bio',
    avatar_url: 'https://cdn.example/private.png', age_verified: true,
    public_fields: ['display_name']
  });
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
