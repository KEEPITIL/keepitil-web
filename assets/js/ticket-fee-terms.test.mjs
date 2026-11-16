// Ticket buyer fee (Joe, 2026-11-15): ticket-terms must state 5% + $0.50 per order, +1% typed-in card, +2% international,
// mark refund/chargeback fees as to be confirmed, and carry no old fee. Mirrors keepitil-app config/ticket-fees.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = (f) => readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

export function parseFeeText(t) {
  const base = t.match(/buyer fee of (\d+(?:\.\d+)?)% \+ \$(\d+)\.(\d{2}) to each ticket (order|ticket)/);
  const manual = t.match(/typed in by hand adds (\d+(?:\.\d+)?)%/);
  const intl = t.match(/international card adds (\d+(?:\.\d+)?)%/);
  if (!base || !manual || !intl) return null;
  return { percent: +base[1], fixed_cents: +base[2] * 100 + +base[3], per: base[4], manual: +manual[1], international: +intl[1] };
}

const TERMS = text('ticket-terms.html');

test('ticket terms state the buyer fee exactly: 5% + $0.50 per order, +1% typed-in card, +2% international card', () => {
  assert.deepEqual(parseFeeText(TERMS), { percent: 5, fixed_cents: 50, per: 'order', manual: 1, international: 2 });
});

test('refund and chargeback fees are marked to be confirmed, with no invented number', () => {
  assert.match(TERMS, /TODO: refund and chargeback fees: to be confirmed\./);
  assert.doesNotMatch(TERMS, /(refund|chargeback) fee (is|of) \$?\d/i);
});

test('no old fee survives (5% + $0.99 per ticket, 20% platform terms)', () => {
  assert.doesNotMatch(TERMS, /\$0\.99|platform fee of/);
  assert.doesNotMatch(readFileSync('organizers/dashboard.html', 'utf8'), /20% platform terms|href="\.\/#pricing"/);
  assert.match(readFileSync('organizers/dashboard.html', 'utf8'), /I agree to the <a href="\/ticket-terms"[^>]*>ticket terms<\/a>/);
});

test('NEGATIVE CONTROL: the old wording does not parse as the decided fee', () => {
  assert.equal(parseFeeText('KEEPITIL charges a platform fee of 5% + $0.99 per ticket, deducted from the sale.'), null);
});
