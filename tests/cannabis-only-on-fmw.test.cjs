'use strict';
// Joe's standing rule: cannabis-related business lives ONLY on Find My Weed. keepitil.com may point to Find My Weed in one plain line, with no
// cannabis offer and no price. The admin dashboard must not mention paid membership (there is none).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const raw = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const text = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const NO_OFFER = /cannabis (brands|services)|menu across our network|from \$\d+\s*\/\s*mo|see cannabis/i;
test('/about: no cannabis service card, offer or price; one plain pointer to Find My Weed', () => {
  const h = raw('about.html'), t = text(h);
  assert.doesNotMatch(t, NO_OFFER); assert.doesNotMatch(h, /<meta[^>]+cannabis brands/i, 'not in the description either');
  assert.ok(!/class="ind"[^>]*findmyweed/i.test(h), 'no industry card links to Find My Weed for-business');
  assert.match(t, /Cannabis businesses: see Find My Weed \(\s*findmyweedapp\.com\s*\)\./);
  // NEGATIVE CONTROL: the removed card would be caught
  assert.match('🌿 Cannabis Brands FindMyWeed — your menu across our network, from $10/mo. See cannabis services →', NO_OFFER);
});
test('/dashboard: no "paid members" (KEEPITIL has no paid membership)', () => {
  assert.doesNotMatch(raw('dashboard.html'), /paid members?/i);
});
