const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const __A = require("./helpers/event-assembled.cjs").assemble;
const h = __A(fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8'));
test('profile: every event cover that becomes an <img> goes through KH() (kil-img-host deny-list), so images.ra.co is never requested', () => {
  assert.match(h, /var img=KH\(e\.cover\)\|\|'\/assets\/images\/blog-default-744\.webp';/);
  assert.match(h, /type:'event',title:e\.title,sub:'',media:KH\(e\.cover\)\|\|''/);
  assert.match(h, /var img=KH\(e\.cover_url\)\|\|'';\n\s+var media = img/);
  assert.match(h, /var _bg=KH\(\(_isM&&PROFILE\.cover_mobile\)\?PROFILE\.cover_mobile:PROFILE\.cover\);/, 'the page backdrop (--pf-bg) is cleaned too');
  assert.doesNotMatch(h, /var img=e\.cover\|\|/, 'NEGATIVE CONTROL: the raw cover form is gone');
  assert.match(h, /function KH\(u\)\{ return \(window\.KilImgHost&&window\.KilImgHost\.clean\)/);
  assert.ok(h.indexOf('kil-img-host.js') > 0 && h.indexOf('kil-img-host.js') < h.indexOf('function KH(u)'), 'the deny-list script loads before KH is used');
});
