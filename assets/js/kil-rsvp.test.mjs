// One-tap RSVP (assets/js/kil-rsvp.js): behaviour under jsdom with a fake Supabase client and storage. Run: node --test assets/js/kil-rsvp.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const R = require('./kil-rsvp.js');
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const NOW = new Date('2026-11-25T20:00:00Z');
const EV = { slug: '80s-night-1', id: 4242, startsAt: '2026-11-28T05:00:00Z' };
const tick = () => new Promise((r) => setTimeout(r, 0));
function setup(extra) {
  const dom = new JSDOM('<!doctype html><body><div id="ev-rsvp" style="display:none"></div></body>');
  const host = dom.window.document.getElementById('ev-rsvp');
  const calls = []; let mode = 'ok';
  const sb = { from: (t) => ({ insert: (rec) => { calls.push([t, rec]); if (mode === 'pending') return new Promise(() => {}); if (mode === 'reject') return Promise.reject(new Error('net')); if (mode === 'error') return Promise.resolve({ error: { message: 'rate limit' } }); return Promise.resolve({ error: null }); } }) };
  const mem = {}; const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  const api = { dom, host, calls, mem, store, setMode: (m) => { mode = m; }, mount: (o) => R.mount(host, Object.assign({ ev: EV, sb, store, now: NOW }, extra || {}, o || {})) };
  return api;
}
const click = (host, sel) => host.querySelector(sel).dispatchEvent(new host.ownerDocument.defaultView.Event('click', { bubbles: true, cancelable: true }));

test('mount: a button for an upcoming event; nothing for a past event, a missing slug or a missing client (negative controls)', () => {
  const s = setup(); s.mount();
  assert.equal(s.host.querySelector('.rsvp-tap').textContent, R.COPY.tap); assert.equal(s.host.style.display, ''); assert.equal(s.host.querySelector('.rsvp-tap').type, 'button');
  const past = setup(); assert.equal(past.mount({ now: new Date('2026-11-28T09:00:01Z') }), null); assert.equal(past.host.style.display, 'none', 'more than 3 h after the start: hidden');
  const tonight = setup(); assert.ok(tonight.mount({ now: new Date('2026-11-28T07:00:00Z') }), '2 h after the start is still tonight');
  assert.equal(setup().mount({ ev: { id: 1 } }), null); assert.equal(setup().mount({ sb: null }), null);
  assert.equal(R.mount(null, { ev: EV, sb: {} }), null);
});

test('ONE tap confirms at once (before the insert settles) and sends exactly one row with no name and no email', async () => {
  const s = setup(); s.setMode('pending'); s.mount();
  click(s.host, '.rsvp-tap');
  assert.match(s.host.querySelector('.rsvp-done').textContent, /going/i, 'confirmation is immediate, it does not wait for the network');
  assert.equal(s.host.querySelector('.rsvp-tap'), null);
  assert.equal(s.calls.length, 1);
  const [table, rec] = s.calls[0];
  assert.equal(table, 'event_registrations');
  assert.deepEqual(rec, { event_slug: '80s-night-1', event_id: 4242, answers: { rsvp: true, source: 'one_tap' } });
  assert.ok(!('buyer_email' in rec) && !('buyer_name' in rec));
  assert.equal(s.host.querySelector('.rsvp-done').getAttribute('role'), 'status');
});

test('idempotent: a second tap, even a programmatic one, never sends a second row', async () => {
  const s = setup(); const c = s.mount(); click(s.host, '.rsvp-tap'); c.tap(); c.tap(); await tick();
  assert.equal(s.calls.length, 1);
});

test('a device that already tapped sees "going" with no insert; a failed insert is retried ONCE on the next visit, then never again', async () => {
  const s = setup(); s.setMode('reject'); s.mount(); click(s.host, '.rsvp-tap'); await tick();
  assert.equal(s.calls.length, 1); assert.match(s.host.querySelector('.rsvp-done').textContent, /going/i, 'a failed insert never un-confirms');
  assert.deepEqual(JSON.parse(s.mem[R.KEY + EV.slug]), { going: 1, sent: 0, email: 0 });
  s.setMode('ok'); const s2 = Object.assign(setup(), {}); s2.mem[R.KEY + EV.slug] = s.mem[R.KEY + EV.slug];
  s2.mount(); await tick(); assert.equal(s2.calls.length, 1, 'one quiet retry'); assert.match(s2.host.querySelector('.rsvp-done').textContent, /going/i);
  assert.deepEqual(JSON.parse(s2.mem[R.KEY + EV.slug]), { going: 1, sent: 1, email: 0 });
  const s3 = setup(); s3.mem[R.KEY + EV.slug] = s2.mem[R.KEY + EV.slug]; s3.mount(); await tick(); assert.equal(s3.calls.length, 0, 'sent: no insert on later visits');
  assert.ok(s3.host.querySelector('.rsvp-done'));
  const other = setup(); other.mem[R.KEY + 'some-other-event'] = JSON.stringify({ going: 1, sent: 1, email: 0 }); other.mount();
  assert.ok(other.host.querySelector('.rsvp-tap'), 'negative control: going to another event does not mark this one');
});

test('a database refusal (rate limit) is also treated as unsent but never un-confirms', async () => {
  const s = setup(); s.setMode('error'); s.mount(); click(s.host, '.rsvp-tap'); await tick();
  assert.match(s.host.querySelector('.rsvp-done').textContent, /going/i); assert.equal(JSON.parse(s.mem[R.KEY + EV.slug]).sent, 0);
});

test('optional email: invalid is refused with no insert; valid sends one more row with the email; a failure keeps the form usable', async () => {
  const s = setup(); s.mount(); click(s.host, '.rsvp-tap'); await tick(); s.calls.length = 0;
  const form = s.host.querySelector('form.rsvp-mail'); const inp = s.host.querySelector('#rsvp-email');
  inp.value = 'not-an-email'; form.dispatchEvent(new s.dom.window.Event('submit', { cancelable: true })); await tick();
  assert.equal(s.calls.length, 0); assert.equal(s.host.querySelector('.rsvp-err').textContent, R.COPY.emailBad);
  s.setMode('reject'); inp.value = ' fan@example.com '; form.dispatchEvent(new s.dom.window.Event('submit', { cancelable: true })); await tick();
  assert.equal(s.calls.length, 1); assert.equal(s.host.querySelector('.rsvp-err').textContent, R.COPY.emailFail); assert.equal(s.host.querySelector('.rsvp-go').disabled, false, 'can try again');
  s.setMode('ok'); form.dispatchEvent(new s.dom.window.Event('submit', { cancelable: true })); await tick();
  assert.equal(s.calls.length, 2);
  assert.deepEqual(s.calls[1][1], { event_slug: '80s-night-1', event_id: 4242, buyer_email: 'fan@example.com', answers: { rsvp: true, source: 'one_tap_followup' } });
  assert.equal(s.host.querySelector('.rsvp-ok').textContent, R.COPY.emailOk); assert.equal(s.host.querySelector('form'), null);
  assert.ok(s.host.querySelector('.rsvp-save'), 'account link stays available'); assert.equal(s.host.querySelector('.rsvp-save').getAttribute('href'), R.COPY.saveHref);
});

test('privacy and safety: the email is never written to storage; copy is rendered as text, not HTML; the account link is optional (no gate before "going")', async () => {
  const s = setup({ copy: { tap: '<img src=x onerror=alert(1)>', save: '<b>x</b>' } }); s.mount();
  assert.equal(s.host.querySelector('img'), null); assert.equal(s.host.querySelector('.rsvp-tap').textContent, '<img src=x onerror=alert(1)>');
  click(s.host, '.rsvp-tap'); await tick();
  const inp = s.host.querySelector('#rsvp-email'); inp.value = 'secret@example.com'; s.host.querySelector('form').dispatchEvent(new s.dom.window.Event('submit', { cancelable: true })); await tick();
  assert.ok(!JSON.stringify(s.mem).includes('secret@example.com'), 'only flags are stored on the device');
  assert.equal(s.host.querySelector('.rsvp-save').textContent, '<b>x</b>'); assert.equal(s.host.querySelector('b'), null);
  const src = readFileSync(join(root, 'assets/js/kil-rsvp.js'), 'utf8'); assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('no usable storage (private mode): the tap still confirms and still sends', async () => {
  const s = setup({ store: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } });
  const g = globalThis; const had = g.localStorage; s.mount(); click(s.host, '.rsvp-tap'); await tick();
  assert.match(s.host.querySelector('.rsvp-done').textContent, /going/i); assert.equal(s.calls.length, 1); void had;
});

test('the tap reports to analytics only when a tracker is given, and a throwing tracker never blocks it', async () => {
  const seen = []; const s = setup({ track: (k, slug) => { seen.push([k, slug]); throw new Error('x'); } }); s.mount(); click(s.host, '.rsvp-tap'); await tick();
  assert.deepEqual(seen, [['rsvp_tap', '80s-night-1']]); assert.equal(s.calls.length, 1);
  const q = setup(); q.mount(); click(q.host, '.rsvp-tap'); await tick(); assert.equal(q.calls.length, 1);
});

test('event.html wires it: the mount point under the going badge, the script loaded before the page script, the mount after the first paint, and every event page template still has its prerender anchors', () => {
  const h = readFileSync(join(root, 'event.html'), 'utf8');
  assert.ok(h.indexOf('id="ev-going"') < h.indexOf('id="ev-rsvp"') && h.indexOf('id="ev-rsvp"') < h.indexOf('id="ev-desc"'));
  assert.ok(h.indexOf('/assets/js/kil-rsvp.js') > 0 && h.indexOf('/assets/js/kil-rsvp.js') < h.indexOf('<script>\n(function(){'), 'loaded before the inline page script');
  assert.ok(h.indexOf("KilRsvp.mount(document.getElementById('ev-rsvp')") > h.indexOf('paint(); loadExtras(sb);'));
  assert.equal((h.match(/id="ev-rsvp"/g) || []).length, 1);
  assert.match(h, /\.rsvp-tap\{[^}]*min-height:48px/);
});
