'use strict';
// Guards that used to live only in the keepitil.github.io mirror tests; the mirror's legal pages are now pointers
// to these live pages, so the facts are asserted here, on the pages people actually read.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rendered = (f) => raw(f).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');

test('no legal page advertises a paid membership that does not exist; Terms keeps the negative statement', () => {
  for (const f of ['refund.html', 'privacy.html', 'ticket-terms.html']) {
    const t = rendered(f);
    assert.ok(!/KEEPITIL PRO\b/.test(t), f + ' must not name a PRO membership');
    assert.ok(!/annual renewal|future annual/i.test(t), f + ' must not promise renewals');
    assert.ok(!/paid-only benefit/i.test(t), f + ' must not describe paid-only benefits');
  }
  assert.match(rendered('terms.html'), /There is no paid membership and no subscription/);
  assert.deepEqual(rendered('terms.html').match(/\bPRO\b/g), null, "'PRO' advertised a tier KEEPITIL does not sell");
});

test('refund policy does not claim to refund what KEEPITIL does not process', () => {
  const t = rendered('refund.html').replace(/\s+/g, ' ');
  assert.match(t, /Third-party events follow the organizer's own refund rules/);
  assert.match(t, /KEEPITIL does not process those payments and cannot refund them/);
});

test('no internal drafting note on a customer-facing legal page', () => {
  for (const f of ['refund.html', 'ticket-terms.html', 'terms.html', 'privacy.html']) {
    const t = rendered(f);
    assert.ok(!/with counsel/i.test(t), f + ' leaks an internal drafting note');
    assert.ok(!/before (public )?launch/i.test(t), f + ' leaks a pre-launch note');
  }
});

// ONE "last updated" date per legal page, each the real date of the last change to the page's wording (from git history:
// terms = 2026-09-17 PT, ticket-terms = 2026-09-14 PT, refund = 2026-09-14 PT). Two dates on one page was the defect (checklist gap 7a).
const lastUpdated = (html) => [...html.matchAll(/Last updated:?\s*([^<]+)</g)].map((m) => m[1].trim());
const EXPECT = { 'terms.html': 'September 17, 2026', 'ticket-terms.html': 'September 14, 2026', 'privacy.html': null };

test('terms and ticket-terms show exactly ONE last-updated date, the real one', () => {
  for (const f of ['terms.html', 'ticket-terms.html']) assert.deepEqual(lastUpdated(raw(f)), [EXPECT[f]], f);
  assert.deepEqual(lastUpdated(raw('privacy.html')).length, 1, 'privacy.html: one date');
});

test('refund.html: its two mentions are the same day (ISO header, long-form footer)', () => {
  const d = lastUpdated(raw('refund.html')); assert.equal(d.length, 2);
  assert.equal(new Date(d[0] + 'T12:00:00Z').toISOString().slice(0, 10), new Date(d[1] + ' 12:00:00 UTC').toISOString().slice(0, 10));
});

test('NEGATIVE CONTROL: the old two-date terms page (2026-07-10 header, July 21, 2026 footer) is caught by the same check', () => {
  const old = '<div class="upd">KEEPITIL · Last updated 2026-07-10</div><p>info<br>Last updated: July 21, 2026</p>';
  assert.equal(lastUpdated(old).length, 2, 'the checker sees both dates');
  assert.notDeepEqual(lastUpdated(old), [EXPECT['terms.html']], 'and would fail the one-date assertion');
});
