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

test('the shell keeps <main> at least a screen tall so its late-built footer lands below the fold (a shift outside the viewport is not CLS); the rule is in the shell stylesheet', () => {
  assert.match(shell, /main\{min-height:calc\(100vh - 66px\)\}@media\(max-width:860px\)\{main\{min-height:100vh\}\}/);
  const css = shell.match(/main\{min-height:calc\(100vh - 66px\)\}@media\(max-width:860px\)\{main\{min-height:100vh\}\}/)[0];
  assert.ok(!/display:\s*none|visibility:\s*hidden|height:\s*0\b/.test(css));
});
test('cache-bust: every page that loads keepitil-shell.js uses the SAME ?v= stamp, and it is the new one (returning visitors must not keep the cached old shell)', () => {
  const { execSync } = require('child_process');
  const files = execSync('git grep -l "keepitil-shell.js?v=" -- "*.html"', { cwd: path.join(__dirname, '..') }).toString().trim().split('\n');
  const stamps = new Set(); let n = 0;
  for (const f of files) { const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); for (const m of s.matchAll(/keepitil-shell\.js\?v=([0-9a-z]+)/g)) { stamps.add(m[1]); n++; } }
  assert.ok(n > 700, 'stamp seen on ' + n + ' pages');
  assert.deepEqual([...stamps], ['20261128a']);
  assert.ok(!stamps.has('20261124e'), 'the old stamp is gone');
});
test('NEGATIVE CONTROL: a tree where the shell changed but one page kept the old stamp is flagged (two distinct stamps)', () => {
  const stamps = new Set(['20261125a', '20261124e']); assert.notDeepEqual([...stamps], ['20261125a']);
});
