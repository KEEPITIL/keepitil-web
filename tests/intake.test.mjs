// node --test tests/intake.test.mjs   (no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const K = createRequire(import.meta.url)('../assets/js/kil-intake.js');
const good = { name: 'Ricardo', email: 'A@B.co', brand: 'RAB3L', links: 'https://soundcloud.com/x', need: 'graphics', message: 'Need a cover pack', website: '' };

test('thank-you text is exactly the approved copy', () => assert.equal(K.THANKS, 'Got it — we’ll reply within 48 hours.'));
test('validation: each required field is enforced', () => {
  assert.equal(K.validate(good), '');
  assert.match(K.validate({ ...good, name: '' }), /name/i);
  assert.match(K.validate({ ...good, email: 'nope' }), /email/i);
  assert.match(K.validate({ ...good, need: '' }), /need/i);
  assert.match(K.validate({ ...good, need: 'bogus' }), /need/i);
  assert.match(K.validate({ ...good, message: 'hi' }), /little/i);
});
test('row uses only existing feedback columns and a CHECK-safe category', () => {
  const r = K.buildRow(good, '/connect/');
  assert.deepEqual(Object.keys(r).sort(), ['category', 'contact', 'message', 'page_url', 'user_handle']);
  assert.equal(r.category, 'other'); assert.equal(r.contact, 'a@b.co');
  assert.match(r.message, /^\[SERVICE INTAKE\]\nName: Ricardo\nArtist\/brand: RAB3L\nNeed: Graphics\nLinks: https:\/\/soundcloud\.com\/x\nMessage: Need a cover pack$/);
});
test('message always fits the 4000-char CHECK and is never empty', () => {
  const r = K.buildRow({ ...good, message: 'x'.repeat(9000), links: 'y'.repeat(9000), brand: 'z'.repeat(9000), name: 'n'.repeat(9000) }, '/connect/');
  assert.ok(r.message.length >= 1 && r.message.length <= 4000);
});
test('submit: ok on 201, uses return=minimal, posts to feedback', async () => {
  const calls = []; const f = (u, o) => { calls.push({ u, o }); return Promise.resolve({ ok: true }); };
  assert.deepEqual(await K.submit(f, good, '/connect/'), { ok: true });
  assert.match(calls[0].u, /\/rest\/v1\/feedback$/); assert.equal(calls[0].o.headers.Prefer, 'return=minimal');
});
test('submit: server error and network failure are not ok', async () => {
  assert.deepEqual(await K.submit(() => Promise.resolve({ ok: false }), good, '/'), { ok: false });
  assert.deepEqual(await K.submit(() => Promise.reject(new Error('x')), good, '/'), { ok: false });
});
test('bot gate: honeypot or too fast is a bot, a patient human is not', () => {
  assert.equal(K.isBot({ website: 'http://spam' }, 10000), true);
  assert.equal(K.isBot({ website: '' }, 500), true);
  assert.equal(K.isBot({ website: '' }, 8000), false);
});
test('/connect loads the form exactly once and has the mount point', () => {
  const s = readFileSync(new URL('../connect/index.html', import.meta.url), 'utf8');
  assert.equal((s.match(/kil-intake\.js/g) || []).length, 1);
  assert.equal((s.match(/id="kil-intake"/g) || []).length, 1);
});
test('negative control: no RETURNING, no supabase-js, no secrets other than the public anon key', () => {
  const src = readFileSync(new URL('../assets/js/kil-intake.js', import.meta.url), 'utf8');
  assert.ok(!/return=representation/.test(src));
  assert.ok(!/service_role|sk_live|sk_test/.test(src));
  assert.ok(!/innerHTML\s*=\s*[^;]*\b(f\.|value)/.test(src.replace(/host\.innerHTML = '<div class="ki-card">[\s\S]*?<\/form><\/div>';/, '')), 'user input never reaches innerHTML');
});
test('anon key and URL are identical to the ones the live popup and home page use', () => {
  const grab = (p) => { const s = readFileSync(new URL(p, import.meta.url), 'utf8'); return [/SUPA_KEY = '([^']+)'/.exec(s)[1], /SUPA_URL = '([^']+)'/.exec(s)[1]]; };
  assert.deepEqual(grab('../assets/js/kil-intake.js'), grab('../assets/js/kil-bf-popup.js'));
  assert.deepEqual(grab('../assets/js/kil-intake.js'), grab('../index.html'));
});
