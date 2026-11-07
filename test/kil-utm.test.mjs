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
    setItem(k, v) { data.set(k, String(v)); },
    removeItem(k) { data.delete(k); }
  };
}

const STORE = 'https://www.illestratedlifestyle.com/collections/all-merch?utm_source=keepitil&utm_medium=site&utm_campaign=shop&utm_content=all-merch';
const SESSION = 'https://checkout.stripe.com/c/pay/cs_live_a1b2c3?saved=1#fidkb';
const WIFI = 'https://apps.apple.com/app/id6790006312';
const TICKET = 'https://posh.vip/e/keepitil-night?ref=promo';
const PAYMENT = 'https://buy.stripe.com/dRm8wP3Sd7LI68t3xH14401?prefilled_promo_code=KEEP';

test('keeps only the five utm fields and drops click ids, ref, and email', () => {
  const parsed = utm.parseSearch('?utm_source=ig&utm_medium=social&utm_campaign=launch&utm_content=bio&utm_term=rave&ref=story&email=fan@example.com&gclid=abc&fbclid=xyz&ttclid=t&msclkid=m');
  assert.deepEqual(parsed, {
    utm_source: 'ig',
    utm_medium: 'social',
    utm_campaign: 'launch',
    utm_content: 'bio',
    utm_term: 'rave'
  });
  assert.equal(utm.clean('fan@example.com'), '');
  assert.equal(utm.clean('a'.repeat(121)), '');
  assert.equal(utm.clean('hello world'), '');
  assert.deepEqual(utm.KEYS, ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
});

test('first touch sticks and last touch updates', () => {
  const store = memory();
  const first = utm.capture('?utm_source=ig&utm_medium=social&gclid=abc', store);
  assert.deepEqual(first.first, { utm_source: 'ig', utm_medium: 'social' });
  assert.deepEqual(first.last, first.first);

  const second = utm.capture('?utm_source=newsletter&utm_campaign=nov', store);
  assert.deepEqual(second.first, { utm_source: 'ig', utm_medium: 'social' });
  assert.deepEqual(second.last, { utm_source: 'newsletter', utm_campaign: 'nov' });

  const quiet = utm.capture('', store);
  assert.deepEqual(quiet.last, second.last);
  assert.deepEqual(quiet.first, second.first);
});

test('a stored email key is not read back', () => {
  const store = memory();
  const now = Date.UTC(2026, 10, 7);
  store.setItem(utm.LAST_KEY, JSON.stringify({
    t: now, utm_source: 'ig', email: 'fan@example.com', utm_campaign: 'ok', gclid: 'abc'
  }));
  assert.deepEqual(utm.read(store, now).last, { utm_source: 'ig', utm_campaign: 'ok' });
});

test('store links take last-touch keys and keep a product utm_content', () => {
  const next = utm.decorateUrl(STORE, { utm_source: 'ig', utm_medium: 'social', ref: 'story', gclid: 'abc' });
  const u = new URL(next);
  assert.equal(u.searchParams.get('utm_source'), 'ig');
  assert.equal(u.searchParams.get('utm_medium'), 'social');
  assert.equal(u.searchParams.get('ref'), null);
  assert.equal(u.searchParams.get('gclid'), null);
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
  const touch = { utm_source: 'ig', utm_medium: 'social', utm_campaign: 'launch' };
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

test('signup forms get hidden fields; contact, service requests, and checkout do not', () => {
  const stored = {
    first: { utm_source: 'ig', utm_term: 'rave' },
    last: { utm_source: 'newsletter', utm_campaign: 'nov' }
  };
  assert.deepEqual(utm.hiddenFields(stored), [
    { name: 'utm_source', value: 'newsletter' },
    { name: 'first_utm_source', value: 'ig' },
    { name: 'utm_campaign', value: 'nov' },
    { name: 'first_utm_term', value: 'rave' }
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
  assert.equal(utm.isAttributionForm(form({ id: 'req' })), false);
  assert.equal(utm.isSignupForm(form({ id: 'req' })), false);
  assert.equal(utm.isAttributionForm(form({ id: 'signup' })), true);
  assert.equal(utm.isAttributionForm(form({ className: 'contact-form' })), false);
  assert.equal(utm.isAttributionForm(form({ action: 'https://example.com/contact' })), false);
  assert.equal(utm.isAttributionForm(form({ id: 'service-request' })), false);
  assert.equal(utm.isAttributionForm(form({ id: 'ticket-checkout' })), false);
  assert.equal(utm.isAttributionForm(form({ id: 'wifi-buy' })), false);
  assert.equal(utm.isAttributionForm(form({ id: 'login' })), false);
  assert.equal(utm.isAttributionForm(form({ id: 'signup', flag: 'off' })), false);
});

test('the script does not set cookies, assign location, or name click ids as stored keys', () => {
  const src = readFileSync(new URL('../assets/js/kil-utm.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /document\.cookie/);
  assert.doesNotMatch(src, /location\.href\s*=/);
  assert.doesNotMatch(src, /location\.assign\s*\(/);
  assert.doesNotMatch(src, /location\.replace\s*\(/);
  assert.doesNotMatch(src, /"(gclid|fbclid|ttclid|msclkid|ref)"/);
});

test('a record older than 30 days, or one with no timestamp, is deleted on read', () => {
  const store = memory();
  const now = Date.UTC(2026, 10, 7);
  utm.capture('?utm_source=ig&utm_campaign=launch', store, now);
  assert.deepEqual(utm.read(store, now + utm.TTL).last, { utm_source: 'ig', utm_campaign: 'launch' });
  assert.equal(utm.read(store, now + utm.TTL + 1).last, null);
  assert.equal(store.getItem(utm.LAST_KEY), null);

  store.setItem(utm.FIRST_KEY, JSON.stringify({ utm_source: 'ig', gclid: 'abc' }));
  assert.equal(utm.read(store, now).first, null);
  assert.equal(store.getItem(utm.FIRST_KEY), null);
});

test('clear drops both touches', () => {
  const store = memory();
  utm.capture('?utm_source=ig', store, 1000);
  utm.clear(store);
  assert.equal(store.getItem(utm.FIRST_KEY), null);
  assert.equal(store.getItem(utm.LAST_KEY), null);
});

test('Global Privacy Control, Do Not Track, and an EU signal skip storage', () => {
  assert.equal(utm.trackingOff({ navigator: { globalPrivacyControl: true }, timeZone: 'America/Los_Angeles', locales: ['en-US'] }), true);
  assert.equal(utm.trackingOff({ navigator: { doNotTrack: '1' }, timeZone: 'America/Chicago', locales: ['en-US'] }), true);
  assert.equal(utm.trackingOff({ doNotTrack: '1', navigator: {}, timeZone: 'America/Chicago', locales: ['en-US'] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'Europe/Paris', locales: ['en-US'] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'Europe/London', locales: ['en-US'] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'Europe/Zurich', locales: ['en-US'] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'America/New_York', locales: ['de-DE'] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'America/New_York', locales: ['de'] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: '', locales: ['en-US'] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'UTC', locales: ['en-US'] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'America/Los_Angeles', locales: ['en-US'] }), false);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'America/Mexico_City', locales: ['es-MX'] }), false);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'Asia/Tokyo', locales: ['ja-JP'] }), false);
});

test('Cyprus zones, UTC aliases, unknown zones, and an unreadable locale skip', () => {
  const us = ['en-US'];
  for (const zone of ['Asia/Nicosia', 'Asia/Famagusta']) {
    assert.equal(utm.trackingOff({ navigator: {}, timeZone: zone, locales: us }), true, zone);
  }
  for (const zone of ['GMT', 'Etc/UCT', 'Etc/Universal', 'Etc/Zulu', 'UCT', 'Universal', 'Zulu', 'Greenwich', 'GMT0', 'GMT+0', 'GMT-0', 'Etc/GMT', 'Etc/GMT0', 'Etc/GMT+0', 'Etc/GMT-0', 'Etc/Greenwich']) {
    assert.equal(utm.trackingOff({ navigator: {}, timeZone: zone, locales: us }), true, zone);
  }
  assert.equal(utm.isKnownZone('Not/AZone'), false);
  assert.equal(utm.isKnownZone('Foo'), false);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'Not/AZone', locales: us }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'Foo', locales: us }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'America/Los_Angeles', locales: null }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'America/Los_Angeles', locales: undefined }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'America/Los_Angeles', locales: [] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'America/Los_Angeles', locales: [''] }), true);
  assert.equal(utm.trackingOff({ navigator: {}, timeZone: 'Etc/GMT+1', locales: us }), false);
});

test('attachment rechecks expiry and the privacy gate instead of an old snapshot', () => {
  const store = memory();
  const now = Date.UTC(2026, 10, 7);
  const allow = { navigator: {}, timeZone: 'America/Los_Angeles', locales: ['en-US'] };
  utm.capture('?utm_source=ig&utm_campaign=launch', store, now);
  assert.deepEqual(utm.currentTouch(store, allow, now + utm.TTL), { utm_source: 'ig', utm_campaign: 'launch' });
  assert.equal(utm.currentTouch(store, allow, now + utm.TTL + 1), null);
  assert.equal(store.getItem(utm.LAST_KEY), null);

  utm.capture('?utm_source=ig', store, now);
  const blocked = { navigator: { globalPrivacyControl: true }, timeZone: 'America/Los_Angeles', locales: ['en-US'] };
  assert.equal(utm.fieldsForServer(store, blocked, now), null);
  assert.equal(store.getItem(utm.LAST_KEY), null);
  const fields = utm.fieldsForServer(store, allow, now);
  assert.equal(fields, null);
});

test('the homepage does not build an email and campaign insert', () => {
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /function utmp/);
  assert.doesNotMatch(home, /marketing_contacts/);
  assert.doesNotMatch(home, /URLSearchParams\(location\.search\)/);
  assert.match(home, /fieldsForServer/);
  assert.match(home, /attach_signup_attribution/);
});

test('a decorated purchase link counts as attached, a ticket checkout does not', () => {
  const touch = { utm_source: 'ig', utm_campaign: 'launch' };
  const shop = utm.decorateUrl(STORE, touch);
  assert.equal(utm.purchaseAttached(shop, touch), true);
  assert.equal(utm.purchaseAttached(SESSION, touch), false);
  assert.equal(utm.purchaseAttached(WIFI, touch), false);
});
