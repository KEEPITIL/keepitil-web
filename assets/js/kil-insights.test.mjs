import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const insights = require('./kil-insights.js');

const NOW = new Date('2026-11-07T12:00:00Z');

function rows() {
  return [
    { slug: 'older', title: 'Older night', status: 'published', starts_at: '2026-01-15T04:00:00Z', city: 'LA', sold: 1, checked_in: 1, revenue_cents: 500 },
    { slug: 'newer', title: 'Newer night', status: 'published', starts_at: '2026-10-01T04:00:00Z', city: 'LA', sold: 10, checked_in: 4, revenue_cents: 4000 },
    { slug: 'soon', title: 'Soon <b>', status: 'published', starts_at: '2026-12-01T04:00:00Z', venue: 'Room', city: 'LA', sold: 4, checked_in: 1, revenue_cents: 2500, buyer_email: 'buyer@example.com', event_password_hash: 'hash-value', qr_token: 'qr-secret', secret_note: 'LEAK-TOKEN' },
    { slug: 'later', title: 'Later', status: 'draft', starts_at: '2026-12-20T04:00:00Z', city: 'LA', sold: 2, checked_in: 0, revenue_cents: 0 },
    { slug: 'undated', title: 'No date', status: 'draft', sold: 0, checked_in: 0, revenue_cents: 0 }
  ];
}

test('owner model splits upcoming and past and rates check-in from stored counts', () => {
  const m = insights.model(rows(), NOW);
  assert.deepEqual(m.past.map((e) => e.slug), ['newer', 'older']);
  assert.deepEqual(m.upcoming.map((e) => e.slug), ['soon', 'later', 'undated']);
  assert.deepEqual(m.chart.map((e) => e.slug), ['older', 'newer', 'soon', 'later']);
  assert.equal(m.totals.sold, 17);
  assert.equal(m.totals.checked_in, 6);
  assert.equal(m.totals.revenue_cents, 7000);
  assert.equal(m.totals.rate, 35);
  assert.equal(m.upcomingTotals.sold, 6);
  assert.equal(m.upcomingTotals.rate, 17);
  assert.equal(m.pastTotals.sold, 11);
  assert.equal(m.max, 10);
  assert.equal(JSON.stringify(m).includes('LEAK-TOKEN'), false);
  assert.equal(JSON.stringify(m).includes('buyer@example.com'), false);
  assert.equal(JSON.stringify(m).includes('hash-value'), false);
  assert.equal(JSON.stringify(m).includes('qr-secret'), false);
});

test('owner html charts by event date, keeps a table, and drops private fields', () => {
  const html = insights.renderOwner(rows(), { now: NOW, focus: 'soon' });
  assert.match(html, /data-kil="owner"/);
  assert.match(html, /data-kil="totals"/);
  assert.match(html, /data-kil="compare"/);
  assert.match(html, /data-kil="event-chart"/);
  assert.match(html, /data-kil="focus"/);
  assert.match(html, /Soon &lt;b&gt;/);
  assert.match(html, /href="\/event\?e=soon"/);
  assert.match(html, /href="\/create-event\?e=later"/);
  assert.match(html, /style="height:100%"/);
  assert.match(html, /style="height:40%"/);
  const older = html.indexOf('title="Older night:');
  const newer = html.indexOf('title="Newer night:');
  const soon = html.indexOf('title="Soon &lt;b&gt;:');
  assert.ok(older !== -1 && newer !== -1 && soon !== -1);
  assert.ok(older < newer && newer < soon);
  assert.match(html, /No date/);
  assert.doesNotMatch(html, /buyer@example.com|hash-value|qr-secret|LEAK-TOKEN|utm_/);
  assert.doesNotMatch(html, /tables list every event/);
});

test('the chart note appears only when dated events are left off the chart', () => {
  var many = [];
  for (var i = 0; i < 12; i++) {
    many.push({
      slug: 'p' + i, title: 'Past ' + i, status: 'published',
      starts_at: '2026-01-' + String(i + 1).padStart(2, '0') + 'T04:00:00Z',
      sold: i, checked_in: 0, revenue_cents: 0
    });
  }
  assert.match(insights.renderOwner(many, { now: NOW }), /tables list every event/);
  assert.doesNotMatch(insights.renderOwner(many, { now: NOW, table: false }), /tables list every event/);
});

test('a missing focus slug is said plainly and a failed read is not zero', () => {
  const html = insights.renderOwner(rows(), { now: NOW, focus: 'missing-show' });
  assert.match(html, /This event is not on your dashboard/);
  const failed = insights.renderOwner(null);
  assert.match(failed, /data-kil="failed"/);
  assert.match(failed, /couldn\u2019t load/);
  assert.doesNotMatch(failed, /data-kil="totals"/);
  const empty = insights.renderOwner([], { now: NOW });
  assert.match(empty, />0<\/b><span>Events<\/span>/);
  assert.match(empty, />\$0\.00<\/b><span>Revenue<\/span>/);
});

test('events with no stored counts show a dash instead of zero', () => {
  const html = insights.renderOwner([
    { slug: 'soon', title: 'Soon', status: 'published', starts_at: '2026-12-01T04:00:00Z' }
  ], { now: NOW });
  assert.match(html, /<b>\u2014<\/b><span>Sold<\/span>/);
  assert.doesNotMatch(html, />0<\/b><span>Sold<\/span>/);
});

test('the member page asks for the chart and the host dashboard asks for the table', () => {
  const member = readFileSync(new URL('./kil-member.js', import.meta.url), 'utf8');
  const memberHtml = readFileSync(new URL('../../member.html', import.meta.url), 'utf8');
  const dash = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
  assert.match(member, /renderOwner\(insights\.merge/);
  assert.match(member, /table:\s*false/);
  assert.match(member, /renderPublic\(rollup/);
  assert.match(member, /get_profile_event_summary/);
  assert.match(dash, /function statusClass/);
  assert.match(dash, /statusClass\(raw\)/);
  assert.match(dash, /s==='published'\|\|s==='review'\|\|s==='draft'/);
  assert.match(memberHtml, /kil-insights\.js/);
  assert.match(memberHtml, /kil-insights\.css/);
  assert.match(dash, /kil-insights\.js/);
  assert.match(dash, /kil-insights\.css/);
  assert.match(dash, /KilInsights\.renderOwner/);
  assert.match(dash, /if\s*\(\s*!r\s*\|\|\s*r\.error\s*\)\s*throw/);
  assert.match(dash, /id="eventInsights"/);
  assert.equal(dash.includes('utm_campaign'), false);
  assert.equal(member.includes("from('event_orders')"), false);
});

test('public rollup counts published upcoming events and hides ticket figures', () => {
  const html = insights.renderPublic([
    { slug: 'soon', title: 'Soon', status: 'published', starts_at: '2026-12-01T04:00:00Z', city: 'Los Angeles', is_protected: false, sold: 123456, revenue_cents: 987654, buyer_email: 'buyer@example.com' },
    { slug: 'also', title: 'Also', status: 'published', starts_at: '2026-12-11T04:00:00Z', city: 'Long Beach', is_protected: false, sold: 3 },
    { slug: 'old', title: 'Old', status: 'published', starts_at: '2026-01-01T04:00:00Z', city: 'Hidden', is_protected: false, sold: 9 },
    { slug: 'draft', title: 'Draft', status: 'draft', starts_at: '2026-12-02T04:00:00Z', city: 'Draftville', is_protected: false, sold: 8 },
    { slug: 'lock', title: 'Lock', status: 'published', starts_at: '2026-12-03T04:00:00Z', city: 'Secret City', password_protected: true, sold: 7 },
    { slug: 'unflagged', title: 'Unflagged', status: 'published', starts_at: '2026-12-04T04:00:00Z', city: 'Mystery' }
  ], NOW);
  assert.match(html, /data-kil="public-rollup"/);
  assert.match(html, /&lt;5 upcoming · Long Beach · Los Angeles/);
  assert.doesNotMatch(html, /2 upcoming|123456|987654|buyer@example.com|Hidden|Draftville|Secret City|Mystery|Sold|Revenue|\$/);
  assert.equal(insights.renderPublic([], NOW), '');
  assert.equal(insights.renderPublic(null, NOW), '');
  assert.match(insights.renderPublic({ upcoming_count: null, cities: ['LA'] }, NOW), /&lt;5 upcoming · LA/);
  assert.match(insights.renderPublic({ upcoming_count: 1, cities: ['LA'], title: 'Secret' }, NOW), /&lt;5 upcoming · LA/);
  assert.match(insights.renderPublic({ upcoming_count: 9, cities: ['LA'] }, NOW), /9 upcoming · LA/);
  assert.equal(insights.renderPublic({ upcoming_count: 0, cities: ['LA'] }, NOW), '');
  assert.doesNotMatch(insights.renderPublic({ upcoming_count: 1, cities: ['LA'], title: 'Secret' }, NOW), /Secret|1 upcoming/);
});
