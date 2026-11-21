// No "% commission on orders" wording in any Find My Weed copy (Joe via Muse 2026-11-21 03:56 PT; California 4 CCR 15415.1):
// flat fees only. Scans every FMW page and script keepitil-web serves: app/findmyweed/**, findmyweed*.html, findmyweed/**.
// CSS (style blocks and style="" attributes) is stripped first, so widths like 100% are not copy.
// Run: node --test assets/js/fmw-no-commission.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function commissionHits(text) {
  const copy = String(text).replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/\sstyle="[^"]*"/gi, ' ');
  const pats = [
    /\bcommissions?\b/i, /\brevenue[- ]share\b/i, /\btake[- ]rate\b/i, /\bper[- ]order\b/i, /\bcut of\b/i, /\b\d+(?:\.\d+)?\s?% of\b/i,
    /\b\d+(?:\.\d+)?\s?%[^.<\n]{0,80}\b(?:orders?|sales?)\b/i, /\b(?:orders?|sales?)\b[^.<\n]{0,80}\b\d+(?:\.\d+)?\s?%/i,
    // A209-2: affiliate programs and referral fees are a commission by another name. "affiliated" (as in "not
    // affiliated with") is a different word and is not matched.
    /\baffiliates?\b/i, /\breferral[- ]fees?\b/i,
  ];
  return pats.map((re) => (copy.match(re) || [])[0]).filter(Boolean);
}

function fmwFiles() {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = path.posix.join(rel, e.name);
      if (e.isDirectory()) walk(r); else if (/\.(html|js)$/.test(e.name)) out.push(r);
    }
  };
  walk('app/findmyweed');
  if (fs.existsSync(path.join(ROOT, 'findmyweed'))) walk('findmyweed');
  for (const f of fs.readdirSync(ROOT)) if (/^findmyweed.*\.html$/.test(f)) out.push(f);
  return out.sort();
}

test('no commission / %-of-orders wording in any FMW copy', () => {
  const files = fmwFiles();
  for (const f of ['app/findmyweed/index.html', 'app/findmyweed/js/copy.js', 'app/findmyweed/for-business/index.html', 'findmyweed-sample.html', 'findmyweed.html']) {
    assert.ok(files.includes(f), 'scanned: ' + f);
  }
  for (const f of files) assert.deepEqual(commissionHits(fs.readFileSync(path.join(ROOT, f), 'utf8')), [], f);
});

test('NEGATIVE CONTROLS: the removed wording and its variants are caught; CSS percentages and flat fees are not', () => {
  for (const bad of [
    '<li>10% commission only on orders that come through us</li>',
    '<p>the 10% applies to orders through the network</p>',
    'We take 5% of every sale.', 'A small revenue share on sales.', 'Our take rate is low.', 'A $2 per-order fee.',
    'We never take a cut of your orders.', 'Orders placed here pay 7.5%.',
  ]) assert.notEqual(commissionHits(bad).length, 0, bad);
  for (const ok of [
    '<style>.x{width:100%;border:1px solid}</style><p style="width:100%">Listing $10–$50/mo</p>',
    '<p>1st in your county — $500/mo</p>', '<p>FindMyWeed never takes a cut, and your monthly recap shows every lead.</p>',
    '<p>Order of results: by distance.</p>',
  ]) assert.deepEqual(commissionHits(ok), [], ok);
});

test('A209-2 NEGATIVE CONTROLS: affiliate and referral-fee wording fails the guard', () => {
  for (const bad of [
    '<p>Shops pay a referral fee when a customer finds them here.</p>',
    'A $5 referral-fee per customer.', 'Referral fees apply.',
    '<p>Join our affiliate program.</p>', 'Dispensary affiliates earn on every visit.',
  ]) assert.notEqual(commissionHits(bad).length, 0, bad);
  // the fixture with "referral fee" must make the page scan fail, not just the helper
  assert.throws(() => assert.deepEqual(commissionHits('<p>No referral fee, ever.</p>'), []), /referral fee/);
  for (const ok of [
    '<p>FindMyWeed is not affiliated with any dispensary.</p>', '<p>Referrals from friends are welcome.</p>',
  ]) assert.deepEqual(commissionHits(ok), [], ok);
});
