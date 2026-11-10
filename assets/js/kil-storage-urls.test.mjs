/* 17A PR-B tests: signed-URL helper (expiry arithmetic, fallback) + the upload sites target public-assets, not chat-images. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const K = require('./kil-storage-urls.js');
const mk = (impl) => ({ storage: { from: (b) => ({ createSignedUrl: (p, t) => impl(b, p, t) }) } });

test('ttl: default 1h, clamped to 60s..24h, junk falls back to default', () => {
  assert.equal(K.clampTtl(), 3600); assert.equal(K.clampTtl('x'), 3600); assert.equal(K.clampTtl(5), 60); assert.equal(K.clampTtl(999999), 86400); assert.equal(K.clampTtl(120.9), 120);
});
test('expiry arithmetic: signed now with ttl expires exactly ttl seconds later', () => {
  assert.equal(K.expiresAt(3600, 1000), 1000 + 3600000); assert.equal(K.expiresAt(undefined, 0), 3600000); assert.equal(K.expiresAt(30, 0), 60000);
});
test('signedUrl passes the clamped expiry to createSignedUrl and returns the signed URL', async () => {
  let seen; const sb = mk(async (b, p, t) => { seen = [b, p, t]; return { data: { signedUrl: 'https://x/sign/' + p + '?token=t' } }; });
  assert.equal(await K.signedUrl(sb, 'chat-images', 'profiles/a/b.jpg', 7200), 'https://x/sign/profiles/a/b.jpg?token=t');
  assert.deepEqual(seen, ['chat-images', 'profiles/a/b.jpg', 7200]);
  await K.signedUrl(sb, 'chat-images', 'p.jpg'); assert.equal(seen[2], 3600);
});
test('signing failure or error response gives null (viewer without SELECT access), resolve() then returns the input unchanged', async () => {
  const denied = mk(async () => ({ data: null, error: { message: 'not found' } })), boom = mk(async () => { throw new Error('net'); });
  assert.equal(await K.signedUrl(denied, 'chat-images', 'a/b.jpg'), null); assert.equal(await K.signedUrl(boom, 'chat-images', 'a/b.jpg'), null);
  const u = 'https://p.supabase.co/storage/v1/object/public/chat-images/a/b.jpg';
  assert.equal(await K.resolve(denied, 'chat-images', u), u); assert.equal(await K.signedUrl(null, 'chat-images', 'a'), null);
});
test('resolve: public URL of the bucket is signed (path decoded), other buckets / plain URLs untouched', async () => {
  const sb = mk(async (b, p) => ({ data: { signedUrl: 'S:' + b + ':' + p } }));
  assert.equal(await K.resolve(sb, 'chat-images', 'https://p.supabase.co/storage/v1/object/public/chat-images/profiles/a%20b/x.jpg?t=1'), 'S:chat-images:profiles/a b/x.jpg');
  const other = 'https://p.supabase.co/storage/v1/object/public/public-assets/profiles/a/x.jpg'; assert.equal(await K.resolve(sb, 'chat-images', other), other);
  assert.equal(await K.resolve(sb, 'chat-images', 'https://cdn.example/x.jpg'), 'https://cdn.example/x.jpg');
});
test('upload sites target public-assets with owner-scoped paths and no longer upload to chat-images', () => {
  const p = readFileSync(new URL('../../profile.html', import.meta.url), 'utf8'), c = readFileSync(new URL('../../create-event.html', import.meta.url), 'utf8');
  for (const [n, s] of [['profile.html', p], ['create-event.html', c]]) { assert.ok(!/from\('chat-images'\)/.test(s), n + ' still uses chat-images'); assert.ok(/from\('public-assets'\)\.upload\(/.test(s), n + ' must upload to public-assets'); assert.ok(/from\('public-assets'\)\.getPublicUrl\(/.test(s)); }
  assert.ok(/path='profiles\/'\+PROFILE_SLUG\+'\//.test(p)); assert.ok(/path='event-flyers\/'\+uid\+'\//.test(c), 'event flyer path must carry the uploader uid');
});
