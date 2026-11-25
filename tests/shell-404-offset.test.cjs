// KIL_NOT_FOUND's card used margin:12vh auto. A vertical margin on the first child of <main> COLLAPSES through it, so when the card replaced the page content the whole <main> (and body) jumped down ~96 px: a layout shift on every not-found page (profile, event, venue). The card now uses the same space as padding, which stays inside the card.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');
const shell = fs.readFileSync(path.join(__dirname, '..', 'keepitil-shell.js'), 'utf8');
const cardStyle = (src) => { const m = src.match(/class="kil-404" role="status" style="([^"]*)"/); return m && m[1]; };
const verticalMargin = (style) => { const d = Object.fromEntries(style.split(';').filter(Boolean).map((x) => x.split(':').map((s) => s.trim()))); const mg = (d.margin || '0').split(/\s+/); return mg[0] !== '0' && mg[0] !== '0px' || !!d['margin-top'] || !!d['margin-bottom']; };

test('the 404 card has no vertical margin (it would collapse through <main> and move it), and keeps the 12vh space as padding', () => {
  const s = cardStyle(shell); assert.ok(s, 'card style found');
  assert.equal(verticalMargin(s), false);
  assert.match(s, /padding:\s*12vh 20px/);
  assert.match(s, /margin:\s*0 auto/);
});
test('behaviour: in a real layout the card does not move <main> (jsdom cannot lay out, so assert the CSS property that causes the collapse instead)', () => {
  const doc = new JSDOM('<main id="m"></main>').window.document;
  doc.getElementById('m').innerHTML = '<div class="kil-404" style="' + cardStyle(shell) + '"></div>';
  const st = doc.querySelector('.kil-404').getAttribute('style');
  assert.ok(!/margin:\s*12vh/.test(st) && !/margin-top/.test(st));
});
test('NEGATIVE CONTROL: the old card style (margin:12vh auto) is flagged as a vertical margin', () => {
  const old = 'max-width:560px;margin:12vh auto;padding:0 20px;text-align:center';
  assert.equal(verticalMargin(old), true);
  assert.equal(verticalMargin('max-width:560px;margin:0 auto;padding:12vh 20px;text-align:center'), false);
});
