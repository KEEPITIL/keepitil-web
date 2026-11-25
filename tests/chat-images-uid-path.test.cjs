const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), READ = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// chat-images uploads go into the signed-in user's own folder: H-3 of the security sweep (#132) lets an authenticated user INSERT into bucket 'chat-images' only when (storage.foldername(name))[1] = auth.uid()::text.
// MERGE + DEPLOY THIS BEFORE #132 IS APPLIED: after it, the old paths (event-flyers/..., profiles/<slug>/...) are refused by storage RLS.
// The policy mirror below is the same rule as the migration, in JS.
const policyAllows = (name, uid) => { const parts = String(name).split('/'); return parts.length > 1 && parts[0] === uid; };   // (storage.foldername(name))[1] = auth.uid()::text (foldername drops the file name, so a bare file name has no folder)
const UID = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const line = (src, re, label) => { const m = src.match(re); assert.ok(m, label + ' found'); return m[0]; };
const run = (expr, scope) => new Function(...Object.keys(scope), 'return ' + expr)(...Object.values(scope));

test('profile.html: every image upload path starts with the signed-in user id (avatar, covers, highlights, post media all go through uploadImage)', () => {
  const src = READ('profile.html');
  const decl = line(src, /var path=SESSION\.user\.id\+'\/profiles\/'\+PROFILE_SLUG\+'\/'\+Date\.now\(\)\+'-'\+file\.name\.replace\(\/\[\^a-z0-9\.\\-\]\+\/gi,'_'\);/, 'path declaration');
  const expr = decl.replace(/^var path=/, '').replace(/;$/, '');
  const path = run(expr, { SESSION: { user: { id: UID } }, PROFILE_SLUG: 'groove-trooper', Date, file: { name: 'My Photo.JPG' } });
  assert.match(path, new RegExp('^' + UID + '/profiles/groove-trooper/\\d+-My_Photo\\.JPG$'));
  assert.equal(policyAllows(path, UID), true); assert.equal(policyAllows(path, OTHER), false, 'someone else folder is refused');
  assert.equal((src.match(/storage\.from\('chat-images'\)\.upload\(/g) || []).length, 1, 'one upload call, so every profile image shares the prefixed path');
});
test('create-event.html: the flyer path is <uid>/event-flyers/..., the uid comes from the session, and a signed-out user is told to sign in instead of uploading', () => {
  const src = READ('create-event.html');
  assert.match(src, /supa\.auth\.getSession\(\)\.then\(function\(sr\)\{/); assert.match(src, /Sign in to upload a flyer/);
  const decl = line(src, /var path=uid\+'\/event-flyers\/'\+Date\.now\(\)\+'-'\+file\.name\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\._-\]\+\/g,'-'\);/, 'path declaration');
  const path = run(decl.replace(/^var path=/, '').replace(/;$/, ''), { uid: UID, Date, file: { name: 'Flyer 1.PNG' } });
  assert.match(path, new RegExp('^' + UID + '/event-flyers/\\d+-flyer-1\\.png$')); assert.equal(policyAllows(path, UID), true); assert.equal(policyAllows(path, OTHER), false);
  assert.ok(src.indexOf("alert('Sign in to upload a flyer.')") < src.indexOf("storage.from('chat-images').upload("), 'the signed-out guard comes before the upload');
});
test('NEGATIVE CONTROL: the previous paths (event-flyers/..., profiles/<slug>/...) are refused by the policy mirror, and so is a path with a different first segment', () => {
  assert.equal(policyAllows('event-flyers/1700000000000-flyer.jpg', UID), false);
  assert.equal(policyAllows('profiles/groove-trooper/1700000000000-a.jpg', UID), false);
  assert.equal(policyAllows(UID + '-x/event-flyers/a.jpg', UID), false); assert.equal(policyAllows(UID, UID), false, 'a bare name has no folder');
  assert.equal(policyAllows(UID + '/a.jpg', UID), true);
});
test('only these two pages upload to chat-images (the list KODE asked for): nothing else writes to the bucket, so no other feature needs a new path', () => {
  const { execSync } = require('child_process');
  const hits = execSync("git grep -l \"chat-images\" -- . ':!*.test.*' ':!*.md' ':!.github' ':!app' || true", { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(hits, ['create-event.html', 'profile.html']);
});
