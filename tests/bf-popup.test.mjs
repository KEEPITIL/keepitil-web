// node --test tests/bf-popup.test.mjs   (no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const K = require('../assets/js/kil-bf-popup.js');
const T = (s) => Date.parse(s);

test('phase windows are Pacific and exact', () => {
  assert.equal(K.phase(T('2026-11-22T23:59:59-08:00')), 'pre');
  assert.equal(K.phase(T('2026-11-23T00:00:00-08:00')), 'early');
  assert.equal(K.phase(T('2026-11-26T23:59:59-08:00')), 'early');
  assert.equal(K.phase(T('2026-11-27T00:00:00-08:00')), 'public');
  assert.equal(K.phase(T('2026-11-30T23:59:59-08:00')), 'public');
  assert.equal(K.phase(T('2026-12-01T00:00:00-08:00')), 'over');
});
test('email and phone validation', () => {
  assert.ok(K.validEmail('a@b.co')); assert.ok(!K.validEmail('a@b')); assert.ok(!K.validEmail('a b@c.com')); assert.ok(!K.validEmail(''));
  assert.equal(K.cleanPhone('(619) 555-0100'), '6195550100'); assert.equal(K.cleanPhone('+1 619 555 0100'), '+16195550100');
  assert.equal(K.cleanPhone('12345'), null); assert.equal(K.cleanPhone(''), null);
});
test('payload only has existing subscribers columns', () => {
  const p = K.buildPayload('  Joe@Example.COM ', '');
  assert.deepEqual(Object.keys(p).sort(), ['email', 'phone', 'source']);
  assert.equal(p.email, 'joe@example.com'); assert.equal(p.phone, null); assert.equal(p.source, 'bf2026-early-access');
});
test('marketing_contacts row uses existing columns only', () => {
  const c = K.buildContact('a@b.co', { pathname: '/x', search: '?utm_source=ig&utm_campaign=bf' }, 'https://t.co/');
  assert.deepEqual(Object.keys(c).sort(), ['email', 'landing_path', 'referrer', 'source', 'utm_campaign', 'utm_medium', 'utm_source']);
  assert.equal(c.utm_source, 'ig'); assert.equal(c.utm_medium, null);
});
function fakeFetch(statusFor) {
  const calls = [];
  const f = (url, opt) => { calls.push({ url, opt }); const s = statusFor(url); return Promise.resolve({ ok: s >= 200 && s < 300, status: s }); };
  f.calls = calls; return f;
}
const LOC = { pathname: '/', search: '' };
test('submit: 201 is ok, uses return=minimal, writes both tables', async () => {
  const f = fakeFetch(() => 201);
  const r = await K.submit(f, 'a@b.co', '', LOC, '');
  assert.deepEqual(r, { ok: true, dup: false });
  assert.match(f.calls[0].url, /\/rest\/v1\/subscribers$/);
  assert.equal(f.calls[0].opt.headers.Prefer, 'return=minimal');
  assert.match(f.calls[1].url, /\/rest\/v1\/marketing_contacts$/);
});
test('submit: 409 duplicate is a success, still tags attribution', async () => {
  const f = fakeFetch((u) => /subscribers/.test(u) ? 409 : 201);
  assert.deepEqual(await K.submit(f, 'a@b.co', '', LOC, ''), { ok: true, dup: true });
  assert.equal(f.calls.length, 2);
});
test('submit: server error or network failure is not ok and writes nothing else', async () => {
  const f = fakeFetch(() => 500);
  assert.deepEqual(await K.submit(f, 'a@b.co', '', LOC, ''), { ok: false });
  assert.equal(f.calls.length, 1);
  const g = () => Promise.reject(new Error('net'));
  assert.deepEqual(await K.submit(g, 'a@b.co', '', LOC, ''), { ok: false });
});
test('attribution failure never fails the signup', async () => {
  const f = fakeFetch((u) => /marketing_contacts/.test(u) ? 500 : 201);
  assert.deepEqual(await K.submit(f, 'a@b.co', '', LOC, ''), { ok: true, dup: false });
});
test('auto-open gating by path, phase and ?nopopup', () => {
  const inEarly = T('2026-11-24T12:00:00-08:00'), after = T('2026-11-28T12:00:00-08:00');
  // no localStorage in node: store() swallows the error, so the gate is path/phase/query only
  assert.equal(K.shouldAutoOpen({ pathname: '/culture/', search: '' }, inEarly), true);
  assert.equal(K.shouldAutoOpen({ pathname: '/culture/', search: '?nopopup' }, inEarly), false);
  assert.equal(K.shouldAutoOpen({ pathname: '/checkout', search: '' }, inEarly), false);
  assert.equal(K.shouldAutoOpen({ pathname: '/early-access.html', search: '' }, inEarly), false);
  assert.equal(K.shouldAutoOpen({ pathname: '/culture/', search: '' }, after), false);
});
test('negative control: the guards fail when broken', () => {
  const src = readFileSync(new URL('../assets/js/kil-bf-popup.js', import.meta.url), 'utf8');
  assert.ok(!/return=representation/.test(src), 'anon cannot SELECT, RETURNING would 401');
  assert.ok(/Prefer: 'return=minimal'/.test(src));
  assert.ok(!/\.from\(|supabase\.createClient/.test(src), 'no supabase-js dependency');
});
