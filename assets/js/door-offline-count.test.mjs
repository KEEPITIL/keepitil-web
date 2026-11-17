// Door scanner additions (draft): the in-memory OFFLINE queue and the host dashboard's LIVE checked-in count.
// The scanner core, adapter and QR decoder are covered by door-scanner*.test.mjs (#141/#142). Each rule here has a
// negative control. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import * as adapter from './kil-door-scan-adapter.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const Scanner = require('./kil-door-scanner.js');
const Q = require('./kil-door-queue.js');
const DC = require('./kil-door-count.js');
const TOKEN = 'a3f9c2e1b7d84f60a1c2e3f4a5b6c7d8';
const T2 = 'b3f9c2e1b7d84f60a1c2e3f4a5b6c7d9', T3 = 'c3f9c2e1b7d84f60a1c2e3f4a5b6c7d0', T4 = 'd3f9c2e1b7d84f60a1c2e3f4a5b6c7d1';

function queueWith(replies) {
  const calls = [], log = [];
  const rpc = async (args) => { calls.push(args); const r = replies.shift(); if (r === 'NETWORK') throw new Error('offline'); return { data: r, error: null }; };
  const q = Q.createOfflineQueue({ rpc, adapter, localParse: Scanner.localParse, onChange: (l) => log.push(l) });
  return { q, calls, log };
}

test('offline: a code is queued (never admitted), duplicates and bad codes are not queued', () => {
  const { q, calls, log } = queueWith([]);
  assert.deepEqual(q.add('KIL-' + TOKEN), { queued: true });
  assert.deepEqual(q.add(' kil-' + TOKEN + ' '), { queued: false, reason: 'already-queued' });
  assert.equal(q.add('https://evil.example/' + TOKEN).queued, false, 'a URL is refused locally, as when online');
  assert.equal(calls.length, 0, 'nothing is sent while offline');
  assert.deepEqual(log.at(-1), [{ state: 'queued', code: null, title: null }], 'the page sees "queued", never admitted');
  assert.equal(q.pending(), 1);
});

test('back online: queued codes are checked in order and each gets its REAL server result (negative controls included)', async () => {
  const { q, calls, log } = queueWith([{ result: 'admitted' }, { result: 'forbidden' }, { result: 'unpaid' }, { result: 'invalid' }]);
  for (const t of [TOKEN, T2, T3, T4]) assert.equal(q.add(t).queued, true);
  await q.flush();
  assert.equal(calls.length, 4);
  assert.deepEqual(log.at(-1).map((x) => x.code), ['admitted', 'forbidden', 'unpaid', 'invalid'],
    'own paid ticket admitted; ANOTHER HOST\'S ticket forbidden; a REFUNDED ticket unpaid; a FORGED/unknown code invalid');
  assert.deepEqual([0, 2, 3].map((i) => log.at(-1)[i].title), ['Admitted', 'Not paid', 'Not a KEEPITIL ticket']);
  assert.notEqual(log.at(-1)[1].title, 'Admitted');
  assert.equal(q.pending(), 0);
  assert.ok(!JSON.stringify(log).includes(TOKEN), 'the page never sees a ticket code');
});

test('a second scan of an admitted ticket comes back as already admitted (single use is server-side)', async () => {
  const { q, log } = queueWith([{ result: 'admitted' }, { result: 'already_used' }]);
  q.add(TOKEN); await q.flush();
  q.add(TOKEN); await q.flush();
  assert.deepEqual(log.at(-1).map((x) => x.code), ['admitted', 'already_used']);
});

test('still offline during a flush: the code goes back to the queue and the flush stops (nothing lost, nothing admitted)', async () => {
  const { q, log } = queueWith(['NETWORK', { result: 'admitted' }]);
  q.add(TOKEN); q.add(T2);
  const r = await q.flush();
  assert.equal(r.stopped, 'network');
  assert.deepEqual(log.at(-1).map((x) => x.state), ['queued', 'queued']);
  await q.flush();
  assert.equal(log.at(-1)[0].code, 'admitted');
});

test('the queue is bounded and lives in memory only (no browser storage: ticket codes are admission secrets)', () => {
  const { q } = queueWith([]);
  for (let i = 0; i < Q.MAX; i++) assert.equal(q.add(i.toString(16).padStart(32, '0')).queued, true);
  assert.deepEqual(q.add(TOKEN), { queued: false, reason: 'full' });
  for (const f of ['assets/js/kil-door-queue.js', 'assets/js/kil-door-count.js']) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|innerHTML/, f);
  }
});

test('page wiring: queue script before the scanner; form AND camera go through the offline path; the offline note says do not admit', () => {
  const html = read('door.html'), js = read('assets/js/kil-door-scanner.js');
  assert.ok(html.indexOf('kil-door-queue.js') > 0 && html.indexOf('kil-door-queue.js') < html.indexOf('kil-door-scanner.js'));
  assert.match(html, /Do NOT let anyone in until their code has been checked/);
  assert.match(js, /onCode: function \(c\) \{ submitOrQueue\(c\); \}/);
  assert.match(js, /els\.input\.value = ''; submitOrQueue\(v\);/);
  assert.match(js, /win\.addEventListener\('online', function \(\) \{ queue\.flush\(\); \}\)/);
  assert.match(js, /code saved, NOT checked\. Do not admit yet\./);
});

test('live count: tickets (qty) per event, only valid statuses; partial refunds count the remaining tickets', () => {
  const rows = [
    { event_id: 7, qty: 3, status: 'paid', checked_in_at: '2026-11-17T20:00:00Z' },
    { event_id: 7, qty: 2, status: 'paid', checked_in_at: null },
    { event_id: 7, qty: 4, status: 'refunded', checked_in_at: null },                 // NEGATIVE: refunded never counts
    { event_id: 7, qty: 3, status: 'partially_refunded', refunded_qty: 1, checked_in_at: null },
    { event_id: 8, qty: 1, status: 'pending', checked_in_at: null },                   // NEGATIVE: unpaid never counts
  ];
  assert.deepEqual(DC.summarize(rows), { 7: { checked: 3, total: 7 } });
  assert.equal(DC.line('The Show', { checked: 3, total: 7 }), 'The Show: 3 of 7 tickets checked in');
});

test('live count reads no contact fields, renders text only, and ships behind KIL_FLAGS.doorCount', async () => {
  assert.equal(DC.COLUMNS, 'event_id,qty,status,checked_in_at');
  assert.doesNotMatch(DC.COLUMNS, /email|handle|name|phone/);
  let asked = null;
  const sb = { from: () => ({ select: (c) => ({ in: (k, ids) => { asked = { c, k, ids }; return Promise.resolve({ data: [{ event_id: 1, qty: 2, status: 'paid', checked_in_at: 'x' }], error: null }); } }) }) };
  const counts = await DC.load(sb, [{ id: 1, title: '<img src=x onerror=alert(1)>' }]);
  assert.deepEqual(asked, { c: DC.COLUMNS, k: 'event_id', ids: [1] });
  const dom = new JSDOM('<div id="d"></div>'); const el = dom.window.document.getElementById('d');
  DC.render(dom.window.document, el, [{ id: 1, title: '<img src=x onerror=alert(1)>' }], counts);
  assert.equal(el.querySelector('img'), null, 'NEGATIVE CONTROL: an event title with markup is shown as text');
  const html = read('organizers/dashboard.html');
  assert.match(html, /<div class="card" id="door-count-card" hidden>/);
  assert.match(html, /window\.KIL_FLAGS && window\.KIL_FLAGS\.doorCount/);
});
