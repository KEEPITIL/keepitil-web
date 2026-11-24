// Find My Weed drop-in (find-my-weed "Report an unlicensed seller", SB 378 / Bus. & Prof. Code 22943): every app page under
// /app/findmyweed/ carries ONE footer link that opens an email to info@keepitil.com (a plain mailto: no form, no network call,
// no database). The href is the one in the drop-in's js/copy.js (reportSellerHref), and the link text is in the HTML so it
// works without JavaScript. NEGATIVE CONTROLS run the same checker on planted bad pages (the first one is main before this change).
// Run: node --test assets/js/fmw-report-seller.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'app', 'findmyweed');
const PAGES = ['index.html', 'results.html', 'listing.html', 'about.html', 'privacy.html', '404.html', 'signup.html'];
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8').replace(/\r\n/g, '\n');
const C = (() => { const m = { exports: {} }; vm.runInNewContext(read('js/copy.js'), { module: m, exports: m.exports, require: () => ({}), window: {} }); return m.exports; })();

export function reportLinkProblems(html, file) {
  const foot = /<footer class="foot">([\s\S]*?)<\/footer>/.exec(html);
  if (!foot) return [file + ': no footer'];
  const all = [...foot[1].matchAll(/<p class="report-seller">(<a href="([^"]+)" data-copy="footerReport">([^<]*)<\/a>)/g)];
  if (all.length !== 1) return [file + ': expected one report link in the footer, found ' + all.length];
  const [, , href, text] = all[0], p = [];
  if (href.replace(/&amp;/g, '&') !== C.reportSellerHref) p.push(file + ': href is not copy.reportSellerHref');
  if (!href.startsWith('mailto:info@keepitil.com?')) p.push(file + ': not a mailto to info@keepitil.com');
  if (text !== C.footerReport) p.push(file + ': link text "' + text + '"');
  return p;
}

test('copy.js (drop-in) has the words and a mailto to info@keepitil.com', () => {
  assert.equal(C.footerReport, 'Report an unlicensed seller');
  const u = new URL(C.reportSellerHref);
  assert.equal(u.protocol + u.pathname, 'mailto:info@keepitil.com');
  assert.match(u.searchParams.get('subject'), /unlicensed seller/i);
});

test('every Find My Weed app page has exactly one report link in the footer', () => {
  for (const f of PAGES) assert.deepEqual(reportLinkProblems(read(f), f), [], f);
});

test('NEGATIVE CONTROLS: no link (main before this change), another address, empty text, two links', () => {
  const h = read('index.html'), block = /<p class="report-seller">[\s\S]*?<\/p>\n/.exec(h)[0];
  assert.match(reportLinkProblems(h.replace(block, ''), 'x')[0], /found 0/);
  assert.ok(reportLinkProblems(h.replace(/mailto:info@keepitil\.com/, 'mailto:x@example.test'), 'x').length >= 1);
  assert.match(reportLinkProblems(h.replace('>' + C.footerReport + '</a>', '></a>'), 'x').join(), /link text/);
  assert.match(reportLinkProblems(h.replace(block, block + block), 'x')[0], /found 2/);
});
