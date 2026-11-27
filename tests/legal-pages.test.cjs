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
  assert.match(rendered('terms.html'), /There is no paid KEEPITIL membership\./);
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
const EXPECT = { 'terms.html': 'November 27, 2026', 'ticket-terms.html': 'November 27, 2026', 'privacy.html': null };

test('terms and ticket-terms show exactly ONE last-updated date, the real one', () => {
  for (const f of ['terms.html', 'ticket-terms.html']) assert.deepEqual(lastUpdated(raw(f)), [EXPECT[f]], f);
  assert.deepEqual(lastUpdated(raw('privacy.html')).length, 1, 'privacy.html: one date');
});

test('refund.html shows exactly ONE last-updated date', () => {
  assert.deepEqual(lastUpdated(raw('refund.html')), ['November 27, 2026']);
});

test('NEGATIVE CONTROL: the old two-date terms page (2026-07-10 header, July 21, 2026 footer) is caught by the same check', () => {
  const old = '<div class="upd">KEEPITIL · Last updated 2026-07-10</div><p>info<br>Last updated: July 21, 2026</p>';
  assert.equal(lastUpdated(old).length, 2, 'the checker sees both dates');
  assert.notDeepEqual(lastUpdated(old), [EXPECT['terms.html']], 'and would fail the one-date assertion');
});

test('privacy page: sign-in wording covers password, one-time link, Google and Apple, and says what they share; Sharing names Google and Apple', () => {
  const t = rendered('privacy.html').replace(/\s+/g, ' ');
  assert.match(t, /you sign in with it, with a password or a one-time link, or through Google or Apple; if you use Google or Apple they share your name and email address with us/);
  assert.match(t, /Google and Apple if you choose to sign in with them/);
  assert.doesNotMatch(t, /email-only|only (with )?(your )?email/i, 'sign-in is not email-only');
});

// Ported from the keepitil.github.io mirror tests (stronger forms of the "PRO" scan and the section-6 label).
const attrs = (html) => [...html.replace(/<!--[\s\S]*?-->/g, ' ').matchAll(/(?:content|aria-label|alt|title|placeholder)="([^"]*)"/g)].map((m) => m[1]).join(' ');
const proScan = (html) => ((rendered_(html) + ' ' + attrs(html)).match(/\bPRO\b/g));
function rendered_(h) { return h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '); }
const SECTION6 = /<h2>6\. Selling (&amp;|&) Partnerships<\/h2>/;

test('terms: "PRO" appears nowhere, ATTRIBUTES included (meta description, alt, title, aria-label, placeholder); section 6 is "Selling & Partnerships"', () => {
  const terms = raw('terms.html');
  assert.equal(proScan(terms), null, "'PRO' advertised a membership tier KEEPITIL does not sell");
  assert.match(terms, SECTION6);
});

test('NEGATIVE CONTROLS: the PRO scan sees a PRO hidden in an attribute, and the section-6 check rejects the old label', () => {
  assert.notEqual(proScan('<meta name="description" content="Terms, memberships and PRO billing"><p>clean text</p>'), null, 'visible-text-only scans miss this; the attribute scan must catch it');
  assert.notEqual(proScan('<img alt="KEEPITIL PRO badge" src="x.png"><p>clean</p>'), null);
  assert.equal(proScan('<p>KEEPITIL provides the listing. PRODUCTS are fine.</p>'), null, 'word-bounded: no false positive on KEEPITIL provides / PRODUCTS');
  assert.doesNotMatch('<h2>6. Selling & partnerships (PRO)</h2>', SECTION6);
  assert.doesNotMatch('<h2>6. Selling and Partnerships</h2>', SECTION6);
});

test('NEGATIVE CONTROL: the old "you sign in with it" wording alone would fail the sign-in guard', () => {
  assert.doesNotMatch('your email address (you sign in with it), a username/handle', /you sign in with it, with a password or a one-time link, or through Google or Apple/);
});

test('artist services paid through Stripe are named in Terms and Privacy (artists.html sells them), and Terms still says there is no paid membership', () => {
  const terms = rendered('terms.html').replace(/\s+/g, ' '), priv = rendered('privacy.html').replace(/\s+/g, ' ');
  assert.match(terms, /Artist services sold at keepitil\.com\/artists .* are also paid through Stripe/);
  assert.match(terms, /social media management is billed monthly/);
  assert.match(priv, /buy an artist service: processed by Stripe/);
  assert.match(terms, /There is no paid KEEPITIL membership\./, 'unchanged: no membership was found on the site');
  assert.ok((raw('artists.html').match(/https:\/\/buy\.stripe\.com\//g) || []).length >= 1, 'the page the Terms line describes still sells through Stripe');
});
test('NEGATIVE CONTROL: Terms without the artist-services sentence fails the guard', () => {
  assert.doesNotMatch('(processed by Stripe). Event details, dates', /Artist services sold at keepitil\.com\/artists/);
});

test('membership: no public KEEPITIL page offers or prices one (Joe 2026-11-27: there is no membership)', () => {
  for (const f of ['artists.html', 'terms.html', 'refund.html', 'privacy.html', 'ticket-terms.html']) {
    const vis = rendered(f) + ' ' + attrs(raw(f));
    assert.doesNotMatch(vis, /\$19\.99/, f + ': no $19.99/yr price');
    assert.ok(!/\bmemberships?\b/i.test(vis.replace(/There is no paid KEEPITIL membership\./g, '')), f + ': the only membership sentence allowed is the negative one in Terms');
  }
});
test('NEGATIVE CONTROL: the old artists line and old terms phrasing are caught by the membership check', () => {
  const old = '<li>Continued monthly features and articles: $19.99/yr membership</li>';
  assert.match(rendered_(old), /\$19\.99/);
  assert.ok(/\bmemberships?\b/i.test(rendered_('<p>to create an account, purchase a membership, buy tickets</p>')));
});

const refund = () => rendered('refund.html').replace(/\s+/g, ' ');
test('refund.html covers ticket refunds the way the ticketing code works (who, how, cancel, postpone, fees, timing, contact)', () => {
  const t = refund();
  for (const must of [/keepitil\.com\/support/, /info@keepitil\.com/, /There is no refund button/, /KEEPITIL issues the refund in Stripe/, /full ticket price you paid/, /2\.5% plus \$0\.49 per ticket under \$10, or \$0\.99 per ticket at \$10 or more/, /marked refunded on KEEPITIL/, /about 5 to 10 business days later, depending on your bank/, /can only go back to the card or payment method you paid with/, /full amount or for part of it/, /does not give its own card-processing fee back to us/, /dispute the charge instead of asking us/, /Canceled:/, /Postponed or rescheduled:/, /cannot delete an event that has sold tickets/]) assert.match(t, must);
  assert.doesNotMatch(t, /membership|PRO\b/i);
});
test('NEGATIVE CONTROL: the old refund page (no refund steps, no fee statement) fails the same checks', () => {
  const old = 'Approved refunds are issued to your original payment method via Stripe and typically post within 5-10 business days. To request a refund, use the contact/support link';
  assert.doesNotMatch(old, /KEEPITIL issues the refund in Stripe/);
  assert.doesNotMatch(old, /full ticket price you paid/);
});
