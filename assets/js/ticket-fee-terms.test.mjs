// Ticket buyer fee (Joe's decisions, relayed by Grok 2026-11-17 13:06): ticket-terms must state exactly 5% + $0.50 per
// ORDER, paid by the buyer, with NO hand-typed / international extras (create-checkout fee.ts charges none), say the
// service fee is not refundable (a refund returns the ticket price), publish no TODO, and carry no old fee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = (f) => readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

export function parseFeeText(t) {
  const base = t.match(/buyer service fee of (\d+(?:\.\d+)?)% \+ \$(\d+)\.(\d{2}) per (order|ticket)/);
  if (!base) return null;
  return { percent: +base[1], fixed_cents: +base[2] * 100 + +base[3], per: base[4] };
}

const TERMS = text('ticket-terms.html');

test('ticket terms state the buyer fee exactly: 5% + $0.50 per order, nothing else', () => {
  assert.deepEqual(parseFeeText(TERMS), { percent: 5, fixed_cents: 50, per: 'order' });
  assert.match(TERMS, /charged once on top of the tickets/);
  assert.doesNotMatch(TERMS, /per ticket/);
  assert.match(TERMS, /There are no other card fees\./);
});

test('no card-type extras the code does not charge (Joe: no +1% hand-typed, no +2% international)', () => {
  assert.doesNotMatch(TERMS, /typed in by hand|hand-typed|international card|adds \d+(\.\d+)?%/i);
});

test('the service fee is not refundable; a refund returns the ticket price', () => {
  assert.match(TERMS, /The service fee is not refundable: a refund returns the ticket price\./);
});

test('no TODO or invented refund / chargeback fee is published', () => {
  assert.doesNotMatch(TERMS, /TODO|to be confirmed/i);
  assert.doesNotMatch(TERMS, /(refund|chargeback) fee (is|of) \$?\d/i);
});

test('no old fee survives (5% + $0.99 per ticket, 20% platform terms)', () => {
  assert.doesNotMatch(TERMS, /\$0\.99|platform fee of/);
  assert.doesNotMatch(readFileSync('organizers/dashboard.html', 'utf8'), /20% platform terms|href="\.\/#pricing"/);
  assert.match(readFileSync('organizers/dashboard.html', 'utf8'), /I agree to the <a href="\/ticket-terms"[^>]*>ticket terms<\/a>/);
});

test('NEGATIVE CONTROL: the old wordings do not pass', () => {
  assert.equal(parseFeeText('KEEPITIL charges a platform fee of 5% + $0.99 per ticket, deducted from the sale.'), null);
  const withExtras = 'KEEPITIL adds a buyer service fee of 5% + $0.50 per order. A card number typed in by hand adds 1%.';
  assert.match(withExtras, /typed in by hand|adds \d+(\.\d+)?%/i, 'the extras check really catches the #174 draft wording');
});
