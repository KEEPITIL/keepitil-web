// Admin "Events to review" lane (dashboard.html, EVENT REVIEW LANE block). It lists host events in status 'review' and calls
// public.review_event, which is PROPOSED in keepitil.github.io #72 (NOT APPLIED). The block runs here in a vm against a fake
// Supabase client and a fake DOM: no network, no keys. Each rule has a NEGATIVE CONTROL.
//   node --test assets/js/events-review-lane.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const HTML = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const BLOCK = (() => { const a = HTML.indexOf('/* EVENT REVIEW LANE (start)'), b = HTML.indexOf('/* EVENT REVIEW LANE (end) */'); assert.ok(a > 0 && b > a); return HTML.slice(a, b); })();
const ESC = /function esc\(s\)\{[^\n]*\}/.exec(HTML)[0];

// a fake page + Supabase: events / ticket_tiers rows in, every rpc call recorded
function lane({ events = [], tiers = [], rpcError = null } = {}) {
  const els = new Map(), calls = { rpc: [], from: [] };
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', removed: false, remove() { this.removed = true; } }); return els.get(id); };
  const query = (table) => { const q = { table, filters: [] }; calls.from.push(q);
    const rows = () => (table === 'events' ? events : tiers);
    const b = { select(c) { q.select = c; return b; }, eq(k, v) { q.filters.push(['eq', k, v]); return b; }, in(k, v) { q.filters.push(['in', k, v]); return b; },
      order() { return b; }, limit() { return b; }, then(res, rej) { return Promise.resolve({ data: rows(), error: null }).then(res, rej); } };
    return b; };
  const supa = { from: query, rpc: async (fn, args) => { calls.rpc.push([fn, JSON.parse(JSON.stringify(args))]);   /* plain copy: the vm's objects have another prototype */ return rpcError ? { data: null, error: { message: rpcError } } : { data: { status: 'ok' }, error: null }; } };
  // like a real DOM: the rows are whatever the lane rendered, minus the ones removed since
  const document = { getElementById: el, querySelectorAll: (sel) => (sel === '#evReview .rv'
    ? [...el('evReview').innerHTML.matchAll(/<div class="rv" id="(evr-\d+)"/g)].map((m) => m[1]).filter((id) => !(els.has(id) && els.get(id).removed)) : []) };
  const ctx = vm.createContext({ supa, document, Number, String, Date, encodeURIComponent });
  vm.runInContext('function $(id){return document.getElementById(id);}\n' + ESC + '\n' + BLOCK + '\nthis.loadEventReview = loadEventReview; this.reviewEvent = reviewEvent;', ctx);
  return { ctx, el, calls };
}
const EV = (id, extra) => Object.assign({ id, slug: 'host-night-' + id, title: 'Host night ' + id, owner_handle: 'djhost', city: 'Los Angeles', venue: 'The Room', starts_at: '2026-12-31T21:00:00-08:00', created_at: '2026-11-18T10:00:00Z' }, extra);

test('the lane is an ADMIN tab only, with its own panel and loader', () => {
  assert.match(HTML, /var ADMIN_TABS=\[[^\n]*\['eventreview','Events to review'\]/);
  assert.match(HTML, /<div class="panel" id="tab-eventreview"><div class="head2">Events to review <span class="ct" id="evReviewCt"><\/span><\/div><div id="evReview"><\/div><\/div>/);
  assert.match(HTML, /else if\(g==='eventreview'\) loadEventReview\(\);/);
  // NEGATIVE CONTROL: it is not in the five tabs every customer sees
  const base = /var tabs=\[\['insights','Insight'\],\['plugins','API Plugins'\],\s*\['events','Events'\],\['postiz','Postiz'\],\['settings','Settings'\]\];/.exec(HTML);
  assert.ok(base, 'the customer tab row is unchanged'); assert.doesNotMatch(base[0], /eventreview/);
});

test('it lists ONLY events in review, oldest first, marks paid ones, and escapes what hosts typed', async () => {
  const { ctx, el, calls } = lane({ events: [EV(7, { title: '<img src=x onerror=alert(1)>' }), EV(9)], tiers: [{ event_id: 7, price_cents: 2000 }, { event_id: 9, price_cents: 0 }] });
  await ctx.loadEventReview();
  assert.deepEqual(calls.from[0].filters, [['eq', 'status', 'review']]);
  assert.deepEqual(calls.from[1].filters, [['in', 'event_id', [7, 9]]]);
  const h = el('evReview').innerHTML;
  assert.equal(el('evReviewCt').textContent, '2 waiting');
  assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;') && !h.includes('<img src=x'), 'a hostile title is text, not markup');
  assert.match(h, /id="evr-7"[\s\S]*PAID tickets: needs a payout-ready host[\s\S]*id="evr-9"[\s\S]*>free</);
  assert.match(h, /href="\/event\?e=host-night-9">preview</);
  // empty: a plain note, no rows
  const e = lane({ events: [] }); await e.ctx.loadEventReview();
  assert.equal(e.el('evReviewCt').textContent, '0 waiting'); assert.match(e.el('evReview').innerHTML, /No events waiting for review/);
});

test('Publish calls review_event(id, publish, no note) and the row leaves the lane', async () => {
  const { ctx, el, calls } = lane({ events: [EV(7), EV(9)] });
  await ctx.loadEventReview();
  await ctx.reviewEvent(7, 'publish');
  assert.deepEqual(calls.rpc, [['review_event', { p_event_id: 7, p_action: 'publish', p_note: null }]]);
  assert.equal(el('evr-7').removed, true); assert.equal(el('evReviewCt').textContent, '1 waiting');
});

test('Send back needs a reason: none → no call; with one → review_event(id, reject, trimmed reason)', async () => {
  const { ctx, el, calls } = lane({ events: [EV(9)] });
  await ctx.loadEventReview();
  el('evr-note-9').value = '   ';
  await ctx.reviewEvent(9, 'reject');
  assert.deepEqual(calls.rpc, [], 'NEGATIVE CONTROL: no reason, nothing sent');
  assert.match(el('evr-msg-9').textContent, /Write why it is not published/);
  el('evr-note-9').value = '  Add the venue address  ';
  await ctx.reviewEvent(9, 'reject');
  assert.deepEqual(calls.rpc, [['review_event', { p_event_id: 9, p_action: 'reject', p_note: 'Add the venue address' }]]);
});

test('a server refusal (not staff, payouts off, function not applied yet) is shown and the row stays; bad input sends nothing', async () => {
  const { ctx, el, calls } = lane({ events: [EV(7)], rpcError: 'The host has not finished payouts (Stripe), so paid tickets cannot go on sale yet' });
  await ctx.loadEventReview();
  await ctx.reviewEvent(7, 'publish');
  assert.equal(el('evr-7').removed, false);
  assert.equal(el('evr-msg-7').textContent, 'Not changed: The host has not finished payouts (Stripe), so paid tickets cannot go on sale yet');
  for (const [id, action] of [[7, 'approve'], [7, 'PUBLISH'], [0, 'publish'], ['x', 'publish'], [-3, 'reject']]) await ctx.reviewEvent(id, action);
  assert.equal(calls.rpc.length, 1, 'only the one valid call reached the server');
});

test('the lane never writes events directly: its only write is the review_event RPC', () => {
  assert.doesNotMatch(BLOCK, /\.(update|insert|upsert|delete)\(/);
  assert.equal((BLOCK.match(/supa\.rpc\(/g) || []).length, 1);
  assert.match(BLOCK, /supa\.rpc\('review_event',\{p_event_id:id,p_action:action,p_note:action==='reject'\?note:null\}\)/);
});
