// /event desktop CLS (~0.10): at DOMContentLoaded the shell swaps event.html's 59px header for its fixed 66px nav + 66px body padding AND injects its own page box
// (.wrap{max-width:1360px;padding:0 40px !important}). The page used to start at 1000px wide / 59px high and jump to 1280 wide / 66px, reflowing everything. The final values are now stated up front.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const pages = ['event.html', ...fs.readdirSync(path.join(root, 'event')).filter((d) => fs.existsSync(path.join(root, 'event', d, 'index.html'))).map((d) => 'event/' + d + '/index.html')];
const HD = /@media\(min-width:861px\)\{\.hd\{height:65px\}\}/;
const WRAP = /\.wrap\{max-width:1000px;margin:0 auto;padding:26px 20px 80px;\}\n  @media\(min-width:861px\)\{\.wrap\{max-width:1360px;padding-left:40px;padding-right:40px;box-sizing:border-box\}\}/;
const shell = fs.readFileSync(path.join(root, 'keepitil-shell.js'), 'utf8');
const ok = (src) => HD.test(src) && WRAP.test(src);

test('the shell really injects the box the page now states (1360 max, 40px gutters, from 861px) and a 66px nav + body padding', () => {
  assert.match(shell, /--kil-page-max:1360px;--kil-page-pad:40px/);
  assert.match(shell, /@media\(min-width:861px\)/);
  assert.match(shell, /document\.body\.style\.paddingTop='66px'/);
});
test('event.html and every prerendered event page state the desktop header height (65 + 1px border = 66) and the .wrap box up front, after the page .wrap rule (source order)', () => {
  assert.ok(pages.length > 100, 'checked ' + pages.length + ' pages');
  const bad = pages.filter((p) => !ok(fs.readFileSync(path.join(root, p), 'utf8')));
  assert.deepEqual(bad, []);
});
test('phones are untouched: the rules are inside the 861px query only', () => {
  const s = fs.readFileSync(path.join(root, 'event.html'), 'utf8');
  const outside = s.replace(/@media\(min-width:861px\)\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  assert.ok(!/\.hd\{height:65px\}/.test(outside)); assert.ok(!/max-width:1360px/.test(outside.split('<script')[0]));
});
test('NEGATIVE CONTROL: the old stylesheet (header 58px + .wrap 1000px with no desktop override) fails the check', () => {
  const cur = fs.readFileSync(path.join(root, 'event.html'), 'utf8');
  const old = cur.replace(/\n  @media\(min-width:861px\)\{\.hd\{height:65px\}\}/, '').replace(/\n  @media\(min-width:861px\)\{\.wrap\{max-width:1360px[^\n]*/, '');
  assert.ok(old.length < cur.length); assert.equal(ok(old), false);
  const wrongOrder = cur.replace(/(\n  @media\(min-width:861px\)\{\.wrap\{max-width:1360px[^\n]*)/, '').replace('  .wrap{max-width:1000px;margin:0 auto;padding:26px 20px 80px;}', '  @media(min-width:861px){.wrap{max-width:1360px;padding-left:40px;padding-right:40px;box-sizing:border-box}}\n  .wrap{max-width:1000px;margin:0 auto;padding:26px 20px 80px;}');
  assert.equal(ok(wrongOrder), false, 'the override BEFORE the page .wrap loses on source order');
});

test('the generator keeps it: renderEventPage(event.html, row) emits both rules in order (the template is event.html; scripts/build-event-pages.mjs only replaces head parts), so the next prerender/run-* PR does not revert it', async () => {
  const { renderEventPage } = await import(path.join(root, 'scripts/build-event-pages.mjs'));
  const tpl = fs.readFileSync(path.join(root, 'event.html'), 'utf8');
  const out = renderEventPage(tpl, { slug: 'sample-show-20270101', title: 'Sample Show', venue: 'The Venue', city: 'Long Beach', starts_at: '2027-01-02T04:00:00+00:00', tz: 'America/Los_Angeles', cover_url: 'https://seatgeekimages.com/a/b.jpg' });
  assert.ok(ok(out), 'generated page carries the desktop header height and the .wrap box in source order');
  // NEGATIVE CONTROL: a template without them yields a page without them
  const stripped = tpl.replace(/\n  @media\(min-width:861px\)\{\.hd\{height:65px\}\}/, '');
  assert.notEqual(stripped, tpl);
  assert.equal(ok(renderEventPage(stripped, { slug: 'sample-show-20270101', title: 'Sample Show', venue: 'The Venue', city: 'Long Beach', starts_at: '2027-01-02T04:00:00+00:00', tz: 'America/Los_Angeles' })), false);
});
