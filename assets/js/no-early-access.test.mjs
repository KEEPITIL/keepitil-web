// Black Friday is cancelled everywhere (owner order 2026-11-25): the /early-access.html page, the /earn/ "Early access" section and chip, and every link to them are gone, and the
// guest-list script is loaded by no page (assets/js/no-bf-popup.test.mjs). This guard fails if any of them comes back.   node --test assets/js/no-early-access.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire as __cr } from 'node:module';
const __assemble = __cr(import.meta.url)('../../tests/helpers/event-assembled.cjs').assemble;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKIP = new Set(['.git', 'node_modules']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}
const PAGES = walk(ROOT).map((f) => [relative(ROOT, f), readFileSync(f, 'utf8')]);
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

// every page that links the removed page, as an href or a src, with or without ".html"
const linksEarlyAccess = (pages) => pages.filter(([, s]) => /(?:href|src)\s*=\s*["'][^"']*\/early-access(?:\.html)?(?:[?#"'])/i.test(s)).map(([rel]) => rel);
// the removed /earn/ pieces: the section, its card, its chip, and Black Friday wording on the page
const earnProblems = (html) => {
  const p = [];
  if (/<section id="early"|id="earlyGrid"|id="earnEarlyAccess"/.test(html)) p.push('the early-access section is back');
  if (/<button[^>]*data-k="early"/.test(html))   // the chip button itself (a leftover script selector is not a chip)
    p.push('the Early access chip is back');
  if (/black friday/i.test(html)) p.push('Black Friday wording is back');
  return p;
};

test('early-access.html does not exist and no served list names it', () => {
  assert.equal(existsSync(join(ROOT, 'early-access.html')), false);
  for (const f of ['sitemap.xml', 'sitemap-events.xml', 'robots.txt', '_headers', 'sw.js'])
    if (existsSync(join(ROOT, f))) assert.doesNotMatch(read(f), /early-access/, f);
});
test('no page links the removed /early-access page', () => {
  assert.ok(PAGES.length > 60);
  assert.deepEqual(linksEarlyAccess(PAGES), []);
});
test('/earn/ has no early-access section, chip or Black Friday wording', () => {
  assert.deepEqual(earnProblems(__assemble(read('earn/index.html'))), []);
});
test('NEGATIVE CONTROLS: a returning page link, section, chip or Black Friday string is caught', () => {
  assert.deepEqual(linksEarlyAccess(PAGES.concat([['x.html', '<a href="/early-access.html">x</a>'], ['y.html', '<a href="/early-access">y</a>'], ['z.html', '<a href="https://keepitil.com/early-access.html#join">z</a>']])), ['x.html', 'y.html', 'z.html']);
  assert.deepEqual(linksEarlyAccess([['ok.html', '<a href="/earn/">earn</a> early-access']]), [], 'a bare word is not a link');
  const earn = __assemble(read('earn/index.html'));
  assert.deepEqual(earnProblems(earn + '<section id="early"></section>'), ['the early-access section is back']);
  assert.deepEqual(earnProblems(earn + '<button data-k="early">Early access</button>'), ['the Early access chip is back']);
  assert.deepEqual(earnProblems(earn + 'Black Friday early access'), ['Black Friday wording is back']);
});
