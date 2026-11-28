const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('create-event: Cancel button calls the owner-only RPC and offers the attendee CSV and a message; no refund code', () => {
  const s = read('create-event.html');
  assert.match(s, /id="cancelEventBtn"/); assert.match(s, /kil_cancel_my_event/); assert.match(s, /kil_event_customers/); assert.match(s, /Download attendee emails \(CSV\)/);
  assert.doesNotMatch(s, /stripe\.refunds|\/v1\/refunds|rpc\('refund/i, 'refunds stay manual');
  assert.match(s, /\(\/\^\[=\+\\-@/, 'CSV cells that start with = + - @ are neutralised (formula injection)');
});
test('event page: a cancelled event gets a banner, no RSVP mount, no ticket UI, and EventCancelled in the JSON-LD', () => {
  const j = read('assets/js/event-page.js'), h = read('event.html');
  assert.match(j, /x\.status==='cancelled'/); assert.match(j, /ev-cancelled-banner/); assert.match(j, /schema\.org\/EventCancelled/); assert.match(j, /KilRsvp && !ev\.cancelled/);
  assert.match(h, /body\.ev-cancelled #ev-tickets/); assert.match(h, /\.ev-cancelled-banner/);
});
test('prerender and sitemap still list published events only (cancelled events are not advertised)', () => {
  const b = read('scripts/build-event-pages.mjs');
  assert.match(b, /status=eq\.published/); assert.match(b, /row\.status !== 'published'/);
});
