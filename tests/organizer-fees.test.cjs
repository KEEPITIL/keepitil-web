'use strict';
// organizer-fees.html: every number is recomputed here from the SAME formula create-checkout v58 uses
// (application fee = round(price * 250/10000) + (price < $10 ? 49 : 99) cents, platform_config 250/49/99) and from Stripe's published card price
// (2.9% + 30c); a mutated formula must fail the table check. Also: links from the 4 places, no old "5% + $0.99", cannabis wording, sitemap.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const raw = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const rendered = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&cent;/g, '¢').replace(/&amp;/g, '&').replace(/&[lr]dquo;/g, '"').replace(/\s+/g, ' ');
const rnd = (x) => Math.floor(x + 0.5);                       // JS Math.round for positives
const keepitil = (bps, low, high) => (c) => rnd(c * bps / 10000) + (c < 1000 ? low : high);
const stripe = (c) => rnd(c * 0.029) + 30;
const usd = (c) => '$' + Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0');
const page = raw('organizer-fees.html');
const tableRows = () => [...page.matchAll(/<tr><td>(\$[\d.]+)<\/td><td>(\$[\d.]+)<\/td><td>(\$[\d.]+)<\/td><td><strong>(\$[\d.]+)<\/strong><\/td><\/tr>/g)].map((m) => m.slice(1));
const expected = (kf) => [500, 1000, 2500, 5000].map((c) => [usd(c), usd(kf(c)), usd(stripe(c)), usd(c - kf(c))]);

test('worked-example table equals the checkout formula (250 bps + $0.49 under $10, $0.99 from $10) and Stripe 2.9% + 30c, for $5, $10, $25, $50', () => {
  assert.deepEqual(tableRows(), expected(keepitil(250, 49, 99)));
  assert.deepEqual(tableRows().map((r) => r[0]), ['$5.00', '$10.00', '$25.00', '$50.00']);
});
test('NEGATIVE CONTROLS: the old 5% model, a wrong flat fee and a shifted threshold all disagree with the table', () => {
  for (const kf of [keepitil(500, 99, 99), keepitil(250, 99, 99), keepitil(250, 49, 49)]) assert.notDeepEqual(tableRows(), expected(kf));
});
test('page states the live fee, exactly when $0.49 and $0.99 apply, and that the organizer pays it', () => {
  const t = rendered(page);
  for (const m of [/2\.5% of the ticket price plus a flat amount per ticket/, /\$0\.49 when the ticket price is under \$10\.00/, /\$0\.99 when the ticket price is \$10\.00 or more/, /You pay it/, /2\.9% \+ 30¢ per successful domestic card payment/, /1\.5% for international cards/, /7 to 14 days/, /daily rolling basis/, /not taken from your payout/]) assert.match(t, m);
  assert.doesNotMatch(t, /5% \+ \$0\.99/);
});
test('Stripe sources are cited with their URLs', () => {
  for (const u of ['stripe.com/pricing', 'docs.stripe.com/connect/destination-charges', 'docs.stripe.com/connect/identity-verification', 'docs.stripe.com/connect/payouts-connected-accounts', 'docs.stripe.com/payouts', 'docs.stripe.com/refunds', 'docs.stripe.com/disputes', 'stripe.com/legal/restricted-businesses']) assert.ok(page.includes('https://' + u), u);
});
test('restrictions: cannabis (prohibited, related businesses) with the contact-first rule, CBD, gambling, adult, and the KEEPITIL rules from the code', () => {
  const t = rendered(page);
  for (const m of [/Cannabis products/, /Cannabis dispensaries and related businesses/, /contact info@keepitil\.com before you publish paid tickets/, /We cannot promise Stripe will allow it/, /CBD/, /raffles, lotteries or prize draws/, /at least \$1\.00/, /up to 20 tickets/, /cannot be bought once the event has started/, /cannot be deleted/, /pause ticket sales/, /at least 18/]) assert.match(t, m);
});
test('the old "5% + $0.99" is gone from create-event, Ticket Terms and the new page, and each now links here', () => {
  for (const f of ['create-event.html', 'ticket-terms.html', 'organizer-fees.html']) assert.doesNotMatch(raw(f), /5% \+ \$0\.99/, f);
  assert.match(raw('create-event.html'), /2\.5% \+ \$0\.49 per ticket under \$10 or \$0\.99 at \$10 and up/);
  for (const f of ['create-event.html', 'ticket-terms.html', 'refund.html']) assert.match(raw(f), /href="\/organizer-fees"/, f);
  assert.match(raw('assets/js/kil-organizer.js'), /'\/organizer-fees'/, 'dashboard organizer view links the page');
  assert.match(raw('sitemap.xml'), /<loc>https:\/\/keepitil\.com\/organizer-fees<\/loc>/);
});
test('NEGATIVE CONTROL: text with the old fee fails the same check', () => {
  assert.match('KEEPITIL keeps 5% + $0.99', /5% \+ \$0\.99/);
});
