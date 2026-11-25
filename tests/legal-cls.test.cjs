// Legal pages (/privacy /terms /ticket-terms /refund) desktop CLS (0.17-0.42 at 1280) + axe landmark on ticket-terms and refund.
// The static #main-nav (for crawlers / no-JS readers) used to paint as an unstyled list until keepitil-shell.js removed it; the shell then added body padding-top:66px and its own .wrap box (1360px, 40px gutters),
// so main jumped 250 -> 66 px and 820 -> 1280 px wide. The final values are stated up front (and the nav is not painted when scripting is on).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PAGES = ['privacy', 'terms', 'ticket-terms', 'refund'];
const BLOCK = /\.wrap\{max-width:820px;[^}]*\}\n\/\* CLS \(desktop \+ any JS\)[\s\S]*?\*\/\n@media \(scripting:enabled\)\{#main-nav\{display:none\}\}\n@media \(min-width:861px\)\{\.wrap\{max-width:1360px;padding-left:40px;padding-right:40px\}\}\n@media \(min-width:861px\) and \(scripting:enabled\)\{body\{padding-top:66px\}\}/;
const shell = R('keepitil-shell.js');
const ok = (s) => BLOCK.test(s);
const mains = (s) => (s.match(/<main\b/g) || []).length;

test('the shell really does what the pages now state up front: body padding-top 66px on desktop, a 1360px / 40px .wrap box from 861px, and it removes #main-nav', () => {
  assert.match(shell, /document\.body\.style\.paddingTop='66px'/); assert.match(shell, /--kil-page-max:1360px;--kil-page-pad:40px/); assert.match(shell, /@media\(min-width:861px\)/);
  assert.match(shell, /querySelectorAll\('#main-nav, nav#main-nav/);
});
test('each legal page carries the CLS block after its own .wrap rule, and the static nav stays in the DOM for crawlers / no-JS readers', () => {
  for (const p of PAGES) { const s = R(p + '.html'); assert.ok(ok(s), p + ': block present after .wrap'); assert.match(s, /<nav id="main-nav"/, p + ': the crawler nav is still in the HTML'); }
});
test('ticket-terms and refund have ONE <main> that holds the page (axe landmark-one-main / region); privacy and terms still have exactly one', () => {
  for (const p of PAGES) { const s = R(p + '.html'); assert.equal(mains(s), 1, p); assert.match(s, /<main class="wrap">[\s\S]*<h1>[\s\S]*<\/main>/, p + ': h1 inside main'); assert.equal((s.match(/<\/main>/g) || []).length, 1, p); }
});
test('NEGATIVE CONTROL: the old pages (no block, and a <div class="wrap"> instead of <main>) fail the same checks', () => {
  for (const p of PAGES) { const old = R(p + '.html').replace(/\n\/\* CLS \(desktop \+ any JS\)[\s\S]*?body\{padding-top:66px\}\}\n/, '\n'); assert.equal(ok(old), false, p + ' without the block'); }
  const dv = R('refund.html').replace('<main class="wrap">', '<div class="wrap">').replace(/<\/main>/, '</div>'); assert.equal(mains(dv), 0);
  const wrongOrder = R('privacy.html').replace(/(\.wrap\{max-width:820px;[^}]*\}\n)(\/\* CLS[\s\S]*?body\{padding-top:66px\}\}\n)/, '$2$1'); assert.notEqual(wrongOrder, R('privacy.html')); assert.equal(ok(wrongOrder), false, 'the box override BEFORE the page .wrap loses on source order');
});
