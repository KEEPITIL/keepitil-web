'use strict';
// organizer-fees.html + the buyer-side fee line. Fee model (Joe 2026-11-17 / 11-27): the BUYER pays 5% + $0.50 per order on top of the ticket price;
// the organizer receives the full ticket price. Split: Stripe 2.9% + 30c, KEEPITIL operational fee 2.1% + 20c. Every number below is recomputed
// from those rates; create-checkout v59 (keepitil.github.io) uses the same formula. A mutated formula must disagree with the page.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const raw = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const rendered = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&cent;/g, '¢').replace(/&amp;/g, '&').replace(/&[lr]dquo;/g, '"').replace(/\s+/g, ' ');
const rnd = (x) => Math.floor(x + 0.5);
const svc = (bps, flat) => (c) => rnd(c * bps / 10000) + flat;
const usd = (c) => '$' + Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0');
const page = raw('organizer-fees.html');
const rows = (section) => { const s = page.split(section)[1] || ''; const tb = s.slice(s.indexOf('<tbody>'), s.indexOf('</tbody>')); return [...tb.matchAll(/<tr><td>(\$[\d.]+)<\/td><td>(\$[\d.]+)<\/td><td>(\$[\d.]+)<\/td><td>(\$[\d.]+)<\/td><td>(\$[\d.]+)<\/td><\/tr>/g)].map((m) => m.slice(1)); };
const expected = (fee, stripeBps) => [1000, 2500, 5000].map((c) => { const f = fee(c), st = rnd(c * stripeBps / 10000) + 30; return [usd(c), usd(f), usd(st), usd(f - st), usd(c + f)]; });

test('worked examples (domestic and international) are recomputed from 5% + $0.50 and Stripe 2.9% (+1.5% international) + 30c, for $10, $25, $50', () => {
  assert.deepEqual(rows('Worked examples: one ticket, domestic card'), expected(svc(500, 50), 290));
  assert.deepEqual(rows('Worked examples: one ticket, international card'), expected(svc(500, 50), 440));
  assert.deepEqual(rows('Worked examples: one ticket, domestic card').map((r) => r[0]), ['$10.00', '$25.00', '$50.00']);
});
test('NEGATIVE CONTROLS: the old organizer-paid 2.5% + $0.49/$0.99 model, a 2.5% buyer fee and a $0.99 flat all disagree with the tables', () => {
  for (const f of [(c) => rnd(c * 250 / 10000) + (c < 1000 ? 49 : 99), svc(250, 50), svc(500, 99)]) assert.notDeepEqual(rows('Worked examples: one ticket, domestic card'), expected(f, 290));
});
test('page states the buyer-paid model, the two lines (Stripe processing fee / KEEPITIL operational fee), the totals and surcharges, and per-order', () => {
  const t = rendered(page);
  for (const m of [/the buyer pays your ticket price plus a service fee of 5% \+ \$0\.50 per order/i, /You receive the full ticket price you set/, /Stripe processing fee/, /KEEPITIL operational fee/, /2\.9% \+ 30¢/, /2\.1% \+ 20¢/, /5% \+ 50¢/, /\+1\.5%/, /\+0\.5%/, /\+1%/, /once per order ?, not per ticket/, /does not add|extra international fee is not added/, /you pay no processing fee on ticket sales/, /7 to 14 days/, /daily rolling basis/]) assert.match(t, m);
  assert.doesNotMatch(t, /5% \+ \$0\.99/); assert.doesNotMatch(t, /You pay it/);
  assert.doesNotMatch(t, /(KEEPITIL|our) (platform|service|processing) fee/i, 'our share is only ever called the operational fee');
});
test('Stripe sources are cited with their URLs', () => {
  for (const u of ['stripe.com/pricing', 'docs.stripe.com/connect/destination-charges', 'docs.stripe.com/connect/identity-verification', 'docs.stripe.com/connect/payouts-connected-accounts', 'docs.stripe.com/payouts', 'docs.stripe.com/refunds', 'docs.stripe.com/disputes', 'stripe.com/legal/restricted-businesses']) assert.ok(page.includes('https://' + u), u);
});
test('restrictions: cannabis (prohibited, related businesses) with the contact-first rule, CBD, gambling, adult, and the KEEPITIL rules from the code', () => {
  const t = rendered(page);
  for (const m of [/Cannabis products/, /Cannabis dispensaries and related businesses/, /contact info@keepitil\.com before you publish paid tickets/, /We cannot promise Stripe will allow it/, /CBD/, /raffles, lotteries or prize draws/, /at least \$1\.00/, /up to 20 tickets/, /cannot be bought once the event has started/, /cannot be deleted/, /pause ticket sales/, /at least 18/]) assert.match(t, m);
});
test('the old fee text is gone everywhere and the buyer-paid text is on create-event, Ticket Terms and the page; links to the page exist', () => {
  for (const f of ['create-event.html', 'ticket-terms.html', 'organizer-fees.html']) { assert.doesNotMatch(raw(f), /5% \+ \$0\.99|2\.5% \+ \$0\.49/, f); }
  assert.match(rendered(raw('create-event.html')), /buyers add a service fee of 5% \+ \$0\.50 per order, shown before they pay, and you receive the full ticket price/);
  assert.match(rendered(raw('ticket-terms.html')), /Buyers pay the ticket price plus a service fee of 5% \+ \$0\.50 per order \(Stripe processing 2\.9% \+ \$0\.30 and the KEEPITIL operational fee 2\.1% \+ \$0\.20/);
  for (const f of ['create-event.html', 'ticket-terms.html', 'refund.html']) assert.match(raw(f), /href="\/organizer-fees"/, f);
  assert.match(raw('assets/js/kil-organizer.js'), /'\/organizer-fees'/);
  assert.match(raw('sitemap.xml'), /<loc>https:\/\/keepitil\.com\/organizer-fees<\/loc>/);
});
// ---- buyer side: the event page shows the same fee line before payment, computed with the same formula ----
const js = raw('assets/js/event-page.js');
const kilServiceFee = new Function(js.match(/function kilServiceFee\(sub\)\{[^\n]*\}/)[0] + '; return kilServiceFee;')();
test('event page fee line: 5% + $0.50 per ORDER (checkout formula), shown before payment', () => {
  assert.equal(kilServiceFee(1000), 100); assert.equal(kilServiceFee(2500), 175); assert.equal(kilServiceFee(5000), 300);
  assert.equal(kilServiceFee(2 * 2500), 300, 'flat $0.50 once per order'); assert.equal(kilServiceFee(0), 0); assert.equal(kilServiceFee(NaN), 0);
  assert.match(js, /Service fee: 5% \+ \$0\.50 per order \(Stripe processing \+ KEEPITIL operational fee\) is added to paid tickets before payment/);
  assert.match(js, /\$\('tf-tax'\)\.textContent=sub>0\?\('Service fee '\+money\(fee\)\+' · Total '\+money\(sub\+fee\)\)/);
  assert.doesNotMatch(js, /fees included/, 'the old "fees included" claim is gone');
});
test('NEGATIVE CONTROL: the old per-ticket / 2.5% variants would not match the checkout formula examples', () => {
  const perTicket = (sub, n) => n * (rnd(sub / n * 500 / 10000) + 50);
  assert.notEqual(perTicket(5000, 2), kilServiceFee(5000));
  assert.notEqual(svc(250, 50)(1000), kilServiceFee(1000));
});
