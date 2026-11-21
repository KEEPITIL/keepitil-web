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

export const PATTERNS = {
  commission: /\bcommissions?\b/i,
  revenueShare: /\brevenue[- ]share\b/i,
  takeRate: /\btake[- ]rate\b/i,
  perOrder: /\bper[- ]order\b/i,
  cutOf: /\bcut of\b/i,
  percentOf: /\b\d+(?:\.\d+)?\s?% of\b/i,
  percentThenOrder: /\b\d+(?:\.\d+)?\s?%[^.<\n]{0,80}\b(?:orders?|sales?)\b/i,
  orderThenPercent: /\b(?:orders?|sales?)\b[^.<\n]{0,80}\b\d+(?:\.\d+)?\s?%/i,
};
export function commissionHits(text) {
  const copy = String(text).replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/\sstyle="[^"]*"/gi, ' ');
  return Object.values(PATTERNS).map((re) => (copy.match(re) || [])[0]).filter(Boolean);
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

// A205-8 (Sentinel): a negative control for EACH pattern on its own. Each sample must be caught by the pattern it is named
// for, so removing or weakening any single pattern fails here, even if another pattern would still catch the sample.
const PER_PATTERN = {
  commission: ['10% commission only on orders that come through us', 'No orders, no commission'],
  revenueShare: ['A small revenue share on every booking.', 'We take a revenue-share.'],
  takeRate: ['Our take rate is low.', 'A take-rate applies.'],
  perOrder: ['A $2 per-order fee.', 'Pay per order.'],
  cutOf: ['We never take a cut of your orders.', 'A cut of the deal goes to us.'],
  percentOf: ['We keep 5% of the total.', 'Pay 2.5 % of each invoice.'],
  percentThenOrder: ['the 10% applies to orders through the network', '3% on every sale'],
  orderThenPercent: ['Orders placed here pay 7.5%.', 'Sales through us cost 4 %.'],
};
test('A205-8: every pattern has its own negative controls, and each control is caught by THAT pattern', () => {
  assert.deepEqual(Object.keys(PER_PATTERN).sort(), Object.keys(PATTERNS).sort(), 'one control set per pattern');
  for (const [name, samples] of Object.entries(PER_PATTERN)) {
    for (const s of samples) {
      assert.ok(PATTERNS[name].test(s), name + ' catches: ' + s);
      assert.notEqual(commissionHits('<p>' + s + '</p>').length, 0, 'the full scan catches: ' + s);
    }
  }
  // and each pattern stays quiet on clean copy (a pattern that matched everything would pass the loop above)
  const clean = '<p>Listing $10–$50/mo. 1st in your county — $500/mo. Order of results: by distance. 100% licensed.</p>';
  for (const [name, re] of Object.entries(PATTERNS)) assert.equal(re.test(clean.replace(/<[^>]+>/g, ' ')), false, name + ' on clean copy');
});
