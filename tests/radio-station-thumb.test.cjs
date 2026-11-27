const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const R = (p) => path.join(__dirname, '..', p);
const src = fs.readFileSync(R('assets/js/keepitil-radio.js'), 'utf8');
const a = src.indexOf('function krThumb(u){'), b = src.indexOf('function krSetThumb(img,u){');
assert.ok(a > 0 && b > a);
const krThumb = new Function(src.slice(a, b) + '; return krThumb;')();
test('krThumb maps our station-*.jpg art (relative or keepitil.com, any ?v=) to the 80px webp twin and leaves everything else alone', () => {
  assert.equal(krThumb('/assets/images/station-hiphop.jpg?v=20260822'), '/assets/images/station-hiphop-80.webp');
  assert.equal(krThumb('https://keepitil.com/assets/images/station-edm.jpg'), 'https://keepitil.com/assets/images/station-edm-80.webp');
  for (const u of ['https://i1.sndcdn.com/artworks-x.jpg', '/assets/images/logo-bg.jpg', 'https://evil.example/assets/images/station-x.jpg', '', null]) assert.equal(krThumb(u), u);
});
test('every station-*.jpg has a small webp twin that is a real WebP under 10 KB', () => {
  const dir = R('assets/images'); const jpgs = fs.readdirSync(dir).filter((f) => /^station-[a-z0-9-]+\.jpg$/.test(f)); assert.ok(jpgs.length >= 3);
  for (const j of jpgs) { const t = path.join(dir, j.replace(/\.jpg$/, '-80.webp')); assert.ok(fs.existsSync(t), j + ' has a twin'); const b = fs.readFileSync(t); assert.ok(b.length < 10240); assert.equal(b.slice(8, 12).toString(), 'WEBP'); }
});
test('the two small-art setters use krSetThumb (lazy + onerror fallback to the original); the full image stays for the drawer/station list', () => {
  assert.match(src, /if\(pl\.art\)\{ krSetThumb\(art,pl\.art\); art\.hidden=false; \}/);
  assert.match(src, /if\(art\)\{ krSetThumb\(a,art\); a\.style\.visibility=''; \}/);
  assert.match(src, /img\.loading='lazy'; img\.decoding='async'; img\.onerror = \(t!==u\) \? function\(\)\{ img\.onerror=null; img\.src=u; \} : null; img\.src=t;/);
  assert.match(src, /\+\(pl\.art\?'<img src="'\+String\(pl\.art\)\.replace\(\/&\/g,'&amp;'\)\.replace\(\/"\/g,'&quot;'\)\.replace\(\/<\/g,'&lt;'\)\+'" alt=""\/>'/, 'station list keeps the full art (escaped for the attribute)');
});
