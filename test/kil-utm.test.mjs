import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const utm = require('../assets/js/kil-utm.js');

function memory() {
  const data = new Map();
  return {
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(k, String(v)); }
  };
}

const STORE = 'https://www.illestratedlifestyle.com/collections/all-merch?utm_source=keepitil&utm_medium=site&utm_campaign=shop&utm_content=all-merch';
const SESSION = 'https://checkout.stripe.com/c/pay/cs_live_a1b2c3?saved=1#fidkb';
const WIFI = 'https://apps.apple.com/app/id6790006312';
const TICKET = 'https://posh.vip/e/keepitil-night?ref=promo';
const PAYMENT = 'https://buy.stripe.com/dRm8wP3Sd7LI68t3xH14401?prefilled_promo_code=KEEP';

test('keeps only the six campaign keys and drops email-shaped or extra params', () => {
  const parsed = utm.parseSearch('?utm_source=ig&utm_medium=social&utm_campaign=launch&utm_content=bio&utm_term=rave&ref=story&email=fan@example.com&gclid=abc&fbclid=xyz');
  assert.deepEqual(parsed, {
    utm_source: 'ig',
    utm_medium: 'social',
    utm_campaign: 'launch',
    utm_content: 'bio',
    utm_term: 'rave',
    ref: 'story'
  });
  assert.equal(utm.clean('fan@example.com'), '');
  assert.equal(utm.clean('a'.repeat(121)), '');
  assert.equal(utm.clean('hello world'), '');
});

test('first touch sticks and last touch updates', () => {
  const store = memory();
  const first = utm.capture('?utm_source=ig&utm_medium=social&ref=story', store);
  assert.deepEqual(first.first, { utm_source: 'ig', utm_medium: 'social', ref: 'story' });
  assert.deepEqual(first.last, first.first);

  const second = utm.capture('?utm_source=newsletter&utm_campaign=nov', store);
  assert.deepEqual(second.first, { utm_source: 'ig', utm_medium: 'social', ref: 'story' });
  assert.deepEqual(second.last, { utm_source: 'newsletter', utm_campaign: 'nov' });

  const quiet = utm.capture('', store);
  assert.deepEqual(quiet.last, second.last);
  assert.deepEqual(quiet.first, second.first);
});

test('a stored email key is not read back', () => {
  const store = memory();
  store.setItem(utm.LAST_KEY, JSON.stringify({ utm_source: 'ig', email: 'fan@example.com', utm_campaign: 'ok' }));
  assert.deepEqual(utm.read(store).last, { utm_source: 'ig', utm_campaign: 'ok' });
});

test('store links take last-touch keys and keep a product utm_content', () => {
  const next = utm.decorateUrl(STORE, { utm_source: 'ig', utm_medium: 'social', ref: 'story' });
  const u = new URL(next);
  assert.equal(u.searchParams.get('utm_source'), 'ig');
  assert.equal(u.searchParams.get('utm_medium'), 'social');
  assert.equal(u.searchParams.get('ref'), 'story');
  assert.equal(u.searchParams.get('utm_campaign'), 'shop');
  assert.equal(u.searchParams.get('utm_content'), 'all-merch');
  assert.equal(u.hash, '');
});

test('myshopify hosts and a hash are preserved', () => {
  const href = 'https://keepitil.myshopify.com/products/tee?utm_content=tee#reviews';
  const next = utm.decorateUrl(href, { utm_source: 'ig' });
  const u = new URL(next);
  assert.equal(u.hostname, 'keepitil.myshopify.com');
  assert.equal(u.searchParams.get('utm_source'), 'ig');
  assert.equal(u.searchParams.get('utm_content'), 'tee');
  assert.equal(u.hash, '#reviews');
});

test('Stripe Payment Links gain campaign tags and keep their own params', () => {
  const next = utm.decorateUrl(PAYMENT, { utm_source: 'ig', utm_campaign: 'launch' });
  const u = new URL(next);
  assert.equal(u.hostname, 'buy.stripe.com');
  assert.equal(u.searchParams.get('utm_source'), 'ig');
  assert.equal(u.searchParams.get('utm_campaign'), 'launch');
  assert.equal(u.searchParams.get('prefilled_promo_code'), 'KEEP');
  assert.equal(u.pathname, '/dRm8wP3Sd7LI68t3xH14401');
});

test('ticket Checkout Sessions, WiFi Remote, and ticket sellers are unchanged', () => {
  const touch = { utm_source: 'ig', utm_medium: 'social', utm_campaign: 'launch', ref: 'story' };
  assert.equal(utm.decorateUrl(SESSION, touch), SESSION);
  assert.equal(utm.decorateUrl(WIFI, touch), WIFI);
  assert.equal(utm.decorateUrl(TICKET, touch), TICKET);
  assert.equal(utm.decorateUrl('/event?e=night', touch), '/event?e=night');
  assert.equal(utm.decorateUrl('javascript:alert(1)', touch), 'javascript:alert(1)');
  assert.equal(utm.isOutboundCheckout(new URL(SESSION)), false);
  assert.equal(utm.isOutboundCheckout(new URL(WIFI)), false);
  assert.equal(utm.isOutboundCheckout(new URL('https://checkout.stripe.com/c/pay/cs_test_abc')), false);
});

test('an empty touch does not rewrite a store link', () => {
  assert.equal(utm.decorateUrl(STORE, null), STORE);
  assert.equal(utm.decorateUrl(STORE, {}), STORE);
});

test('signup and contact forms get hidden fields; checkout forms do not', () => {
  const stored = {
    first: { utm_source: 'ig', ref: 'story' },
    last: { utm_source: 'newsletter', utm_campaign: 'nov' }
  };
  assert.deepEqual(utm.hiddenFields(stored), [
    { name: 'utm_source', value: 'newsletter' },
    { name: 'first_utm_source', value: 'ig' },
    { name: 'utm_campaign', value: 'nov' },
    { name: 'first_ref', value: 'story' }
  ]);

  function form(fields) {
    return {
      nodeName: 'FORM',
      id: fields.id || '',
      className: fields.className || '',
      getAttribute(name) {
        if (name === 'action') return fields.action || '';
        if (name === 'name') return fields.name || '';
        if (name === 'data-kil-utm') return fields.flag || null;
        return null;
      }
    };
  }
  assert.equal(utm.isAttributionForm(form({ id: 'req' })), true);
  assert.equal(utm.isAttributionForm(form({ id: 'signup' })), true);
  assert.equal(utm.isAttributionForm(form({ className: 'contact-form' })), true);
  assert.equal(utm.isAttributionForm(form({ action: 'https://example.com/contact' })), true);
  assert.equal(utm.isAttributionForm(form({ id: 'ticket-checkout' })), false);
  assert.equal(utm.isAttributionForm(form({ id: 'wifi-buy' })), false);
  assert.equal(utm.isAttributionForm(form({ id: 'login' })), false);
  assert.equal(utm.isAttributionForm(form({ id: 'signup', flag: 'off' })), false);
});

test('the script does not set cookies or assign location', () => {
  const src = readFileSync(new URL('../assets/js/kil-utm.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /document\.cookie/);
  assert.doesNotMatch(src, /location\.href\s*=/);
  assert.doesNotMatch(src, /location\.assign\s*\(/);
  assert.doesNotMatch(src, /location\.replace\s*\(/);
});
