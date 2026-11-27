// One-tap RSVP (assets/js/kil-rsvp.js): behaviour under jsdom with a fake Supabase client and storage. Run: node --test assets/js/kil-rsvp.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createRequire as __cr } from 'node:module';
const __assemble = __cr(import.meta.url)('../../tests/helpers/event-assembled.cjs').assemble;

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
  assert.match(s.host.querySelector('.rsvp-done').textContent, /you're in/i, 'confirmation is immediate, it does not wait for the network');
  assert.equal(s.host.querySelector('.rsvp-tap'), null);
  assert.equal(s.calls.length, 1);
  const [table, rec] = s.calls[0];
  assert.equal(table, 'event_registrations');
  assert.match(rec.answers.device, /^[a-z0-9-]{8,64}$/); assert.deepEqual(rec, { event_slug: '80s-night-1', event_id: 4242, answers: { rsvp: true, source: 'one_tap', device: rec.answers.device } });
  assert.ok(!('buyer_email' in rec) && !('buyer_name' in rec));
  assert.equal(s.host.querySelector('.rsvp-done').getAttribute('role'), 'status');
});

test('idempotent: a second tap, even a programmatic one, never sends a second row', async () => {
  const s = setup(); const c = s.mount(); click(s.host, '.rsvp-tap'); c.tap(); c.tap(); await tick();
  assert.equal(s.calls.length, 1);
});

test('a device that already tapped sees "going" with no insert; a failed insert is retried ONCE on the next visit, then never again', async () => {
  const s = setup(); s.setMode('reject'); s.mount(); click(s.host, '.rsvp-tap'); await tick();
  assert.equal(s.calls.length, 1); assert.match(s.host.querySelector('.rsvp-done').textContent, /you're in/i, 'a failed insert never un-confirms');
  assert.deepEqual(JSON.parse(s.mem[R.KEY + EV.slug]), { going: 1, sent: 0, email: 0 });
  s.setMode('ok'); const s2 = Object.assign(setup(), {}); s2.mem[R.KEY + EV.slug] = s.mem[R.KEY + EV.slug];
  s2.mount(); await tick(); assert.equal(s2.calls.length, 1, 'one quiet retry'); assert.match(s2.host.querySelector('.rsvp-done').textContent, /you're in/i);
  assert.deepEqual(JSON.parse(s2.mem[R.KEY + EV.slug]), { going: 1, sent: 1, email: 0 });
  const s3 = setup(); s3.mem[R.KEY + EV.slug] = s2.mem[R.KEY + EV.slug]; s3.mount(); await tick(); assert.equal(s3.calls.length, 0, 'sent: no insert on later visits');
  assert.ok(s3.host.querySelector('.rsvp-done'));
  const other = setup(); other.mem[R.KEY + 'some-other-event'] = JSON.stringify({ going: 1, sent: 1, email: 0 }); other.mount();
  assert.ok(other.host.querySelector('.rsvp-tap'), 'negative control: going to another event does not mark this one');
});

test('a database refusal (rate limit) is also treated as unsent but never un-confirms', async () => {
  const s = setup(); s.setMode('error'); s.mount(); click(s.host, '.rsvp-tap'); await tick();
  assert.match(s.host.querySelector('.rsvp-done').textContent, /you're in/i); assert.equal(JSON.parse(s.mem[R.KEY + EV.slug]).sent, 0);
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
  assert.equal(s.calls[1][1].answers.device, s.calls[0][1].answers.device, 'tap and follow-up carry the SAME device id (so the count is one person)'); assert.deepEqual(s.calls[1][1], { event_slug: '80s-night-1', event_id: 4242, buyer_email: 'fan@example.com', answers: { rsvp: true, source: 'one_tap_followup', device: s.calls[1][1].answers.device } });
  assert.equal(s.host.querySelector('.rsvp-ok').textContent, R.COPY.emailOk); assert.equal(s.host.querySelector('form'), null);
  assert.equal(s.host.querySelector('.rsvp-save'), null, 'no account link in the approved copy'); assert.equal(s.host.querySelector('.rsvp-sub'), null, 'no extra line under the confirmation');
});

test('privacy and safety: the email is never written to storage; copy is rendered as text, not HTML; the account link is optional (no gate before "going")', async () => {
  const s = setup({ copy: { tap: '<img src=x onerror=alert(1)>', save: '<b>x</b>', doneSub: '<i>y</i>' } }); s.mount();
  assert.equal(s.host.querySelector('img'), null); assert.equal(s.host.querySelector('.rsvp-tap').textContent, '<img src=x onerror=alert(1)>');
  click(s.host, '.rsvp-tap'); await tick();
  const inp = s.host.querySelector('#rsvp-email'); inp.value = 'secret@example.com'; s.host.querySelector('form').dispatchEvent(new s.dom.window.Event('submit', { cancelable: true })); await tick();
  assert.ok(!JSON.stringify(s.mem).includes('secret@example.com'), 'only flags and a random device id are stored on the device');
  assert.equal(s.host.querySelector('.rsvp-save').textContent, '<b>x</b>'); assert.equal(s.host.querySelector('b'), null); assert.equal(s.host.querySelector('.rsvp-sub').textContent, '<i>y</i>'); assert.equal(s.host.querySelector('i'), null);
  const src = readFileSync(join(root, 'assets/js/kil-rsvp.js'), 'utf8'); assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('no usable storage (private mode): the tap still confirms and still sends', async () => {
  const s = setup({ store: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } });
  const g = globalThis; const had = g.localStorage; s.mount(); click(s.host, '.rsvp-tap'); await tick();
  assert.match(s.host.querySelector('.rsvp-done').textContent, /you're in/i); assert.equal(s.calls.length, 1); void had;
});

test('the tap reports to analytics only when a tracker is given, and a throwing tracker never blocks it', async () => {
  const seen = []; const s = setup({ track: (k, slug) => { seen.push([k, slug]); throw new Error('x'); } }); s.mount(); click(s.host, '.rsvp-tap'); await tick();
  assert.deepEqual(seen, [['rsvp_tap', '80s-night-1']]); assert.equal(s.calls.length, 1);
  const q = setup(); q.mount(); click(q.host, '.rsvp-tap'); await tick(); assert.equal(q.calls.length, 1);
});

test('event.html wires it: the mount point under the going badge, the script loaded before the page script, the mount after the first paint, and every event page template still has its prerender anchors', () => {
  const h = __assemble(readFileSync(join(root, 'event.html'), 'utf8'));
  assert.ok(h.indexOf('id="ev-going"') < h.indexOf('id="ev-rsvp"') && h.indexOf('id="ev-rsvp"') < h.indexOf('id="ev-desc"'));
  assert.ok(h.indexOf('/assets/js/kil-rsvp.js') > 0 && h.indexOf('/assets/js/kil-rsvp.js') < h.indexOf('KilRsvp.mount('), 'loaded before the page script (external event-page.js since the CSP migration)');
  assert.ok(h.indexOf("KilRsvp.mount(document.getElementById('ev-rsvp')") > h.indexOf('paint(); loadExtras(sb);'));
  assert.equal((h.match(/id="ev-rsvp"/g) || []).length, 1);
  assert.match(h, /\.rsvp-tap\{[^}]*min-height:48px/);
});

test('device id: random, kept on the device, reused for the retry and across events, never derived from the person; no storage still works', async () => {
  const s = setup(); s.setMode('reject'); s.mount(); click(s.host, '.rsvp-tap'); await tick();
  const d1 = s.calls[0][1].answers.device; assert.equal(s.mem[R.DEVKEY], d1); assert.doesNotMatch(d1, /80s|night|example|@/);
  s.setMode('ok'); const s2 = setup(); s2.mem[R.KEY + EV.slug] = s.mem[R.KEY + EV.slug]; s2.mem[R.DEVKEY] = s.mem[R.DEVKEY]; s2.mount(); await tick();
  assert.equal(s2.calls[0][1].answers.device, d1, 'the retry sends the same device id');
  const other = setup(); other.mem[R.DEVKEY] = d1; other.mount({ ev: { slug: 'another-show', id: 7, startsAt: '2026-12-01T05:00:00Z' } }); click(other.host, '.rsvp-tap'); await tick();
  assert.equal(other.calls[0][1].answers.device, d1, 'the same browser keeps one id across events');
  const fresh = setup(); fresh.mount(); click(fresh.host, '.rsvp-tap'); await tick(); assert.notEqual(fresh.calls[0][1].answers.device, d1, 'a different browser gets a different id');
  const bad = setup(); bad.mem[R.DEVKEY] = '<script>x'; bad.mount(); click(bad.host, '.rsvp-tap'); await tick(); assert.match(bad.calls[0][1].answers.device, /^[a-z0-9-]{8,64}$/, 'a tampered stored id is replaced');
});
test('event.html passes a tracker that calls kil_track with the rsvp type (a no-op until the SQL lands: kil_track ignores unknown types)', () => {
  const h = __assemble(readFileSync(join(root, 'event.html'), 'utf8'));
  assert.match(h, /sb\.rpc\('kil_track',\{p_kind:'event',p_target_slug:slug,p_event_type:'rsvp'\}\)/);
});

test("Muse's approved copy is exactly what ships (2026-11-25 5:08), with no upsell and no account link", () => {
  assert.deepEqual({ tap: R.COPY.tap, done: R.COPY.done, emailLabel: R.COPY.emailLabel, emailPlaceholder: R.COPY.emailPlaceholder, emailBtn: R.COPY.emailBtn, emailOk: R.COPY.emailOk },
    { tap: "I'm going", done: "You're in - see you there.", emailLabel: 'Email me a reminder', emailPlaceholder: 'you@email.com', emailBtn: 'Remind me', emailOk: 'Reminder set.' });
  assert.equal(R.COPY.doneSub, ''); assert.equal(R.COPY.save, '');
  const h = __assemble(readFileSync(join(root, 'event.html'), 'utf8'));
  assert.match(h, /g\.textContent=n\+' going'/, 'the count reads "{N} going"'); assert.doesNotMatch(h, /textContent='.{0,3}'\+n\+' going'/);
});

/* ---- NEXUS2 notes on #380 (Grok 5:42): phone placement, multi-day cutoff, local "N going" bump, header comment ---- */
test('cutoff = max(starts_at + 3 h, ends_at): a multi-day event keeps the button until it ends; a short one still hides 3 h after the start; no usable date never hides', () => {
  const at = (iso) => new Date(iso);
  const one = { startsAt: '2026-12-01T20:00:00Z' };
  assert.equal(R.isPast(one, at('2026-12-01T22:59:00Z')), false); assert.equal(R.isPast(one, at('2026-12-01T23:01:00Z')), true);
  const multi = { startsAt: '2026-12-01T20:00:00Z', endsAt: '2026-12-03T06:00:00Z' };
  assert.equal(R.isPast(multi, at('2026-12-02T12:00:00Z')), false, 'day 2 of a festival: still shown'); assert.equal(R.isPast(multi, at('2026-12-03T06:01:00Z')), true);
  const early = { startsAt: '2026-12-01T20:00:00Z', endsAt: '2026-12-01T21:00:00Z' };
  assert.equal(R.isPast(early, at('2026-12-01T22:30:00Z')), false, 'a 1 h event: start + 3 h still wins'); assert.equal(R.isPast(early, at('2026-12-01T23:01:00Z')), true);
  assert.equal(R.isPast({}, at('2030-01-01T00:00:00Z')), false); assert.equal(R.isPast({ startsAt: 'garbage', endsAt: 'x' }, at('2030-01-01T00:00:00Z')), false);
  assert.equal(R.isPast({ endsAt: '2026-12-01T00:00:00Z' }, at('2026-12-01T01:00:00Z')), true, 'only an end date: used');
});
function withGoing(initial) {
  const s = setup(); const g = s.dom.window.document.createElement('div'); g.id = 'ev-going'; g.style.display = initial == null ? 'none' : 'inline-flex'; if (initial != null) { g.setAttribute('data-n', String(initial)); g.textContent = initial + ' going'; }
  s.dom.window.document.body.appendChild(g); return { s, g };
}
test('your own tap bumps "N going" by one (a hidden 0 badge is revealed as "1 going"); only a real tap bumps; a second tap and a remount never bump again', async () => {
  const a = withGoing(null); a.s.mount({ going: a.g }); assert.equal(a.g.style.display, 'none'); click(a.s.host, '.rsvp-tap'); await tick();
  assert.equal(a.g.textContent, '1 going'); assert.equal(a.g.style.display, 'inline-flex'); assert.equal(a.g.getAttribute('data-bumped'), '1');
  const b = withGoing(5); const c = b.s.mount({ going: b.g }); click(b.s.host, '.rsvp-tap'); c.tap(); c.tap(); await tick(); assert.equal(b.g.textContent, '6 going', 'exactly +1 however many taps');
  const d = withGoing(5); d.s.mem[R.KEY + EV.slug] = JSON.stringify({ going: 1, sent: 1, email: 0 }); d.s.mount({ going: d.g }); await tick(); assert.equal(d.g.textContent, '5 going', 'NEGATIVE CONTROL: already going on this device = the server number, no bump'); assert.equal(d.g.getAttribute('data-bumped'), null);
  const e = setup(); e.mount({ going: null }); click(e.host, '.rsvp-tap'); await tick(); assert.equal(e.calls.length, 1, 'a page without a badge still works');
  const f = withGoing(7); f.s.setMode('reject'); f.s.mount({ going: f.g }); click(f.s.host, '.rsvp-tap'); await tick(); assert.equal(f.g.textContent, '8 going', 'a failed insert keeps the optimistic number, like the confirmation');
});
test('event.html: a server count that arrives after your tap shows as server + 1, and it records data-n for the bump', () => {
  const h = __assemble(readFileSync(join(root, 'event.html'), 'utf8'));
  assert.match(h, /if\(g && g\.getAttribute\('data-bumped'\)==='1'\) n\+=1; if\(g && n>0\)\{ g\.setAttribute\('data-n',String\(n\)\); g\.textContent=n\+' going';/);
  assert.match(h, /KilRsvp\.mount\(document\.getElementById\('ev-rsvp'\),\{ev:ev,sb:sb,going:document\.getElementById\('ev-going'\),/);
});
function phoneDom(matches) {
  const dom = new JSDOM('<!doctype html><body><div class="tp-head"><a>Back</a></div><div class="tp-body"><div class="tp-col"><div id="ev-flyer"></div></div><div class="tp-col"><div class="infocard"><h1>Show</h1><div id="ev-going" style="display:inline-flex" data-n="3">3 going</div><div id="ev-rsvp" style="display:none"></div><p class="desc">d</p></div></div></div></body>');
  const win = dom.window; let listener = null; const mq = { matches, addEventListener: (_, f) => { listener = f; } };
  globalThis.matchMedia = () => mq; return { dom, doc: win.document, mq, fire: (m) => { mq.matches = m; listener && listener(); } };
}
test('PHONE placement: at <= 700 px the button and the badge move into one row between the back button and the flyer (first screen, above the bottom nav); wide screens keep them in the info card; crossing the breakpoint moves them back and forth', () => {
  const sbOf = (doc) => ({ from: () => ({ insert: () => Promise.resolve({ error: null }) }) });
  try {
    const p = phoneDom(true); const host = p.doc.getElementById('ev-rsvp'), going = p.doc.getElementById('ev-going');
    R.mount(host, { ev: { ...EV, title: 'Show' }, sb: sbOf(p.doc), going, store: setup().store, now: NOW });
    const row = p.doc.querySelector('.rsvp-row'); assert.ok(row, 'row created'); assert.equal(row.previousElementSibling.className, 'tp-head'); assert.equal(row.nextElementSibling.className, 'tp-body');
    assert.deepEqual([...row.children].map((c) => c.id), ['ev-rsvp', 'ev-going'].reverse().reverse(), 'button first, badge beside it');
    p.fire(false); assert.equal(p.doc.querySelector('.rsvp-row'), null, 'back to the info card'); const card = p.doc.querySelector('.infocard');
    assert.deepEqual([...card.children].map((c) => c.id || c.tagName.toLowerCase()), ['h1', 'ev-going', 'ev-rsvp', 'p'], 'original order restored: badge, button, description'); p.fire(true); assert.ok(p.doc.querySelector('.rsvp-row'));
    const w = phoneDom(false); R.mount(w.doc.getElementById('ev-rsvp'), { ev: EV, sb: sbOf(w.doc), going: w.doc.getElementById('ev-going'), store: setup().store, now: NOW });
    assert.equal(w.doc.querySelector('.rsvp-row'), null, 'NEGATIVE CONTROL: wide screen is unchanged'); assert.equal(w.doc.getElementById('ev-rsvp').parentNode.className, 'infocard');
    const x = new JSDOM('<!doctype html><body><div id="ev-rsvp" style="display:none"></div></body>'); globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
    assert.ok(R.mount(x.window.document.getElementById('ev-rsvp'), { ev: EV, sb: sbOf(x.window.document), store: setup().store, now: NOW }), 'no .tp-body: nothing to move, no crash');
  } finally { delete globalThis.matchMedia; }
});
test('the button names its event (starts with the visible words) now that it can sit above the title; the header comment no longer says emails-only', () => {
  const s = setup(); s.mount({ ev: { ...EV, title: '80s Night' } }); const b = s.host.querySelector('.rsvp-tap'); assert.equal(b.getAttribute('aria-label'), 'I\'m going to 80s Night'); assert.ok(b.getAttribute('aria-label').startsWith(b.textContent));
  const s2 = setup(); s2.mount({ ev: { slug: 'x', id: 1, startsAt: EV.startsAt } }); assert.equal(s2.host.querySelector('.rsvp-tap').getAttribute('aria-label'), null, 'no title: no label');
  const src = readFileSync(join(root, 'assets/js/kil-rsvp.js'), 'utf8'); assert.doesNotMatch(src, /counts distinct EMAILS only|not in that number/i); assert.match(src, /after the SQL in keepitil\.github\.io #129/); assert.match(src, /max\(starts_at \+ 3 h, ends_at\)/);
});
