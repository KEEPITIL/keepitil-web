/* 17A PR-C tests: pending vs approved vs-entries media in vs-app.js. The block between the VS-SIGNED-MEDIA markers is evaluated against a mock Supabase client. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../vs-app.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('/* VS-SIGNED-MEDIA:BEGIN'), src.indexOf('/* VS-SIGNED-MEDIA:END */'));
const load = (SB) => new Function('SB', block + '\nreturn { vsPathFromPublicUrl, vsSignPendingMedia };')(SB);
const PUB = 'https://p.supabase.co/storage/v1/object/public/vs-entries/';
const mkSB = (log, fail) => ({ storage: { from: (b) => ({ createSignedUrl: async (p, t) => { log.push([b, p, t]); return fail ? { data: null, error: { message: 'denied' } } : { data: { signedUrl: 'SIGNED:' + p } }; } }) } });

test('pending entry: thumb and cover are signed (1 h), nothing else is touched', async () => {
  const log = []; const { vsSignPendingMedia } = load(mkSB(log));
  const en = { thumb_url: PUB + 'u1/7/a%20b.jpg', cover_url: PUB + 'u1/7/c.png?x=1', title: 't' };
  await vsSignPendingMedia(en, true);
  assert.deepEqual(log, [['vs-entries', 'u1/7/a b.jpg', 3600], ['vs-entries', 'u1/7/c.png', 3600]]);
  assert.equal(en.thumb_url, 'SIGNED:u1/7/a b.jpg'); assert.equal(en.cover_url, 'SIGNED:u1/7/c.png'); assert.equal(en.title, 't');
});
test('approved entry: public URLs are kept and no signing request is made', async () => {
  const log = []; const { vsSignPendingMedia } = load(mkSB(log)); const en = { thumb_url: PUB + 'u1/7/a.jpg', cover_url: null };
  await vsSignPendingMedia(en, false); assert.equal(log.length, 0); assert.equal(en.thumb_url, PUB + 'u1/7/a.jpg');
});
test('signing refused (viewer fails the SELECT policy) or throwing: the stored public URL is kept (safe before the bucket flip)', async () => {
  const { vsSignPendingMedia } = load(mkSB([], true)); const en = { thumb_url: PUB + 'u1/7/a.jpg' }; await vsSignPendingMedia(en, true); assert.equal(en.thumb_url, PUB + 'u1/7/a.jpg');
  const thrower = { storage: { from: () => ({ createSignedUrl: () => Promise.reject(new Error('net')) }) } }; const e2 = { cover_url: PUB + 'a/b/c.jpg' }; await load(thrower).vsSignPendingMedia(e2, true); assert.equal(e2.cover_url, PUB + 'a/b/c.jpg');
});
test('non vs-entries URLs (external, link media) and a missing storage client are left alone', async () => {
  const log = []; const { vsSignPendingMedia, vsPathFromPublicUrl } = load(mkSB(log)); const en = { thumb_url: 'https://cdn.example/x.jpg', cover_url: 'https://p.supabase.co/storage/v1/object/public/chat-images/a.jpg' };
  await vsSignPendingMedia(en, true); assert.equal(log.length, 0); assert.equal(vsPathFromPublicUrl('nonsense'), null);
  const en2 = { thumb_url: PUB + 'a/b/c.jpg' }; await load(null).vsSignPendingMedia(en2, true); assert.equal(en2.thumb_url, PUB + 'a/b/c.jpg');
});
test('wiring: renderEntry signs only when the entry is pending, the upload paths still use getPublicUrl for storage (DB keeps public URLs)', () => {
  assert.ok(/vsSignPendingMedia\(e, pending\)/.test(src)); assert.ok(/var pending = e\.status !== 'approved'/.test(src));
  assert.equal((src.match(/getPublicUrl\(path\)/g) || []).length, 2);
});
