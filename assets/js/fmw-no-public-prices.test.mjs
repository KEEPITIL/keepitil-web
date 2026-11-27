// Owner 2026-11-22: Find My Weed business pricing is "public to verified business owners only" (business license + verified
// email), and the Stripe payment links show only with it. So NO FMW price and NO Stripe link may sit in any file this site
// serves under /app/findmyweed/. Prices + links live in the database and reach the sign-up page only through the gated server
// call fmw.business_pricing() (find-my-weed migration 20261123030000). This fails on main before the drop-in that removed them
// (app/findmyweed/js/signup-copy.js carried "$50/mo or $500/yr", "$10/mo or $100/yr" and the $500-$100 county ladder).
//   - every file under app/findmyweed/: no buy.stripe.com link;
//   - every file under app/findmyweed/ except for-business/ (its own page, owned by #244, which hid FMW prices and keeps a
//     comparison of OTHER directories' published prices): no dollar amount.
// NEGATIVE CONTROLS run the same scanner on planted text. Run: node --test assets/js/fmw-no-public-prices.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = 'app/findmyweed';
const TEXT = /\.(html?|m?js|css|json|xml|txt|svg|webmanifest)$/i;
const PRICE = /\$\s?\d/;
const PAYLINK = /buy\.stripe\.com/i;

function files(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = dir + '/' + e.name;
    return e.isDirectory() ? files(rel) : [rel];
  });
}
/** Problems in one file's text: an FMW price (outside for-business/) or a Stripe link (anywhere). */
export function problems(rel, text) {
  const p = [];
  const show = (m) => rel + ': "' + text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ') + '"';
  const s = PAYLINK.exec(text); if (s) p.push('stripe ' + show(s));
  if (!rel.startsWith(APP + '/for-business/')) { const d = PRICE.exec(text); if (d) p.push('price ' + show(d)); }
  return p;
}

test('no FMW price and no Stripe link in any served /app/findmyweed/ file', () => {
  const all = files(APP).filter((f) => TEXT.test(f));
  assert.ok(all.includes(APP + '/js/signup-copy.js') && all.includes(APP + '/js/signup.js') && all.includes(APP + '/signup.html'), 'the sign-up files are scanned');
  assert.ok(all.length >= 15, 'scanned ' + all.length + ' files');
  assert.deepEqual(all.flatMap((f) => problems(f, fs.readFileSync(path.join(ROOT, f), 'utf8'))), []);
});

test('NEGATIVE CONTROLS: a planted price or Stripe link is caught; for-business/ is exempt from the price rule only', () => {
  const copy = fs.readFileSync(path.join(ROOT, APP, 'js/signup-copy.js'), 'utf8');
  assert.equal(problems(APP + '/js/signup-copy.js', copy + "\nprice: '$50/mo or $500/yr'").length, 1);
  assert.equal(problems(APP + '/js/signup.js', '<a href="https://buy.stripe.com/abc">').length, 1);
  assert.equal(problems(APP + '/signup.html', 'Listing $ 10 a month').length, 1);
  assert.deepEqual(problems(APP + '/for-business/index.html', '<td>$300–$420/mo</td>'), [], 'competitor prices on for-business are #244\'s');
  assert.equal(problems(APP + '/for-business/index.html', '<a href="https://buy.stripe.com/abc">').length, 1, 'but no Stripe link there either');
  assert.deepEqual(problems(APP + '/js/signup-copy.js', copy), [], 'CONTROL: the shipped copy is clean');
});
