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
