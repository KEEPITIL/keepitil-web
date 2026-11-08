// node --test tests/services-slots.test.mjs   (no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../services/index.html', import.meta.url), 'utf8');
const cards = [...html.matchAll(/<article class="offer"([^>]*)>([\s\S]*?)<\/article>/g)].map(m => ({ attrs: m[1], body: m[2] }));
const id = c => /data-offer="([^"]+)"/.exec(c.attrs)[1];
const hidden = c => /\shidden(\s|>|$)/.test(c.attrs + ' ');
test('page has 3 live Shopify cards plus 2 pending existing and 5 new Stripe slots', () => {
  assert.equal(cards.length, 10);
  assert.deepEqual(cards.filter(c => !hidden(c)).map(id), ['release-strategy-session', 'release-graphics-pack', 'release-rollout-kit']);
  assert.equal(cards.filter(c => /data-slot="stripe"/.test(c.attrs)).length, 5);
  assert.equal(cards.filter(c => /existing-pending-link/.test(c.attrs)).length, 2);
});
test('existing Shopify buy links are byte-identical', () => {
  for (const slug of ['release-strategy-session', 'release-graphics-pack', 'release-rollout-kit'])
    assert.ok(html.includes(`https://www.illestratedlifestyle.com/products/${slug}?utm_source=keepitil&amp;utm_medium=site&amp;utm_campaign=shop&amp;utm_content=`), slug);
});
test('placeholders can never be visible: every card with a placeholder is hidden', () => {
  for (const c of cards) if (/PLACEHOLDER|\[Muse:|\[New offer|href="#"/.test(c.body)) assert.ok(hidden(c), id(c));
});
test('Stripe slots point only at buy.stripe.com placeholders, noopener noreferrer', () => {
  for (const c of cards.filter(c => /data-slot="stripe"/.test(c.attrs))) {
    assert.match(c.body, /href="https:\/\/buy\.stripe\.com\/PLACEHOLDER_NEW_OFFER_[1-5]"/);
    assert.match(c.body, /rel="noopener noreferrer"/);
  }
});
test('no Shopify URL was invented for the pending existing products', () => {
  for (const c of cards.filter(c => /existing-pending-link/.test(c.attrs))) assert.ok(!/illestratedlifestyle/.test(c.body));
});
test('Stripe trust note exists and is hidden with the slots', () => {
  assert.match(html, /<p class="trust-stripe" hidden>/);
});
test('negative control: a visible placeholder would be caught', () => {
  const bad = { attrs: ' data-offer="x"', body: 'href="https://buy.stripe.com/PLACEHOLDER_NEW_OFFER_1"' };
  assert.ok(/PLACEHOLDER/.test(bad.body) && !hidden(bad));
});
