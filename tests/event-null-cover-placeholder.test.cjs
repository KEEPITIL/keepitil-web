// An event whose cover_url is null shows our own event-placeholder.svg: on the home cards AND as the event-page flyer (not a gradient, not hidden).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), rd = (f) => require('./helpers/event-assembled.cjs').assemble(fs.readFileSync(path.join(root, f), 'utf8'));
const PH = '/assets/images/event-placeholder.svg';
const pages = ['event.html', ...fs.readdirSync(path.join(root, 'event')).map((d) => 'event/' + d + '/index.html')];

test('the placeholder file exists and is an svg', () => { assert.match(rd('assets/images/event-placeholder.svg'), /<svg/); });
test('home flyer(): no e.img renders the placeholder <img>, a real cover still renders its own two images', () => {
  const s = rd('index.html'), i = s.indexOf('function flyer(e,showPick)'); assert.ok(i > 0);
  const f = s.slice(i, i + 2600);
  assert.ok(f.includes(PH), 'placeholder referenced'); assert.match(f, /evx-flyer-ph/);
  assert.match(f, /var im=e\.img\?\(/); assert.match(f, /class="evx-flyer-bg"/);
  assert.ok(!/var im=e\.img\?\([^]*?\):''/.test(f.slice(0, f.indexOf('var ribbon'))), 'the empty-string branch is gone');
});
test('every event page (template + prerendered) falls back to the placeholder instead of skipping the flyer', () => {
  assert.ok(pages.length >= 11);
  for (const p of pages) {
    const s = rd(p);
    assert.ok(!s.includes("if(ev.img){ var _fl"), p + ': old "only when there is a cover" guard is gone');
    assert.ok(s.includes("(ev.img||'" + PH + "')"), p + ': falls back to the placeholder');
  }
});
test('behaviour: the src expression picks cover or placeholder; OG/JSON-LD still only use a real cover', () => {
  const s = rd('event.html'), m = s.match(/var _u=(\(ev\.img\|\|'[^']+'\))\.replace/); assert.ok(m, 'src expression found');
  const run = (img) => new Function('ev', 'return ' + m[1])({ img });
  assert.equal(run(null), PH); assert.equal(run(''), PH); assert.equal(run('https://x/y.jpg'), 'https://x/y.jpg');
  assert.ok(ogJsonLdSafe(s), 'no placeholder in OG / JSON-LD: a real cover or the raster default only');
});
// OG / JSON-LD may use a real cover (never the SVG placeholder) or the site's raster default. The page passes the SVG test: og:image is only set for a non-SVG cover, and the JSON-LD image swaps an SVG for the raster default.
function ogJsonLdSafe(s) {
  return /if\(ev\.img && !isSvgUrl\(ev\.img\)\) \$\('og-img'\)\.setAttribute\('content', ev\.img\)/.test(s)
    && /if\(ev\.img\) ld\.image=isSvgUrl\(ev\.img\)\?'https:\/\/keepitil\.com\/keepitil-og\.png':ev\.img;/.test(s)
    && !/\$\('og-img'\)\.setAttribute\('content', *(ev\.img\|\||[^)]*placeholder)/.test(s) && !/ld\.image *= *\(?ev\.img *\|\|/.test(s) && !s.includes("if(ev.img) $('og-img')") && !s.includes('if(ev.img) ld.image=ev.img');
}
test('negative control: a version that puts the SVG into OG / JSON-LD fails the check (the pre-#377 unguarded lines, and a placeholder fallback)', () => {
  const good = rd('event.html');
  assert.ok(ogJsonLdSafe(good));
  assert.ok(!ogJsonLdSafe(good.replace("if(ev.img && !isSvgUrl(ev.img)) $('og-img')", "if(ev.img) $('og-img')")), 'unguarded og:image fails');
  assert.ok(!ogJsonLdSafe(good.replace("ld.image=isSvgUrl(ev.img)?'https://keepitil.com/keepitil-og.png':ev.img;", 'ld.image=ev.img;')), 'unguarded JSON-LD fails');
  assert.ok(!ogJsonLdSafe(good.replace('ld.image=isSvgUrl(ev.img)', "ld.image=(ev.img||'" + PH + "');var _x=isSvgUrl(ev.img)")), 'placeholder fallback in JSON-LD fails');
});
test('negative control: the pre-change guard would fail the page check', () => {
  assert.ok("if(ev.img){ var _fl=$('ev-flyer')".includes("if(ev.img){ var _fl"));
});
