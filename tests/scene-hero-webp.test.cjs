const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const IS = /image-set\(url\('\/assets\/images\/scene-hero\.webp'\) type\('image\/webp'\),url\('\/assets\/images\/scene-hero\.jpg'\) type\('image\/jpeg'\)\)/;
test('scene-hero.webp exists, is smaller than the jpg, and the jpg stays as the fallback file', () => {
  const w = fs.statSync(path.join(__dirname, '..', 'assets/images/scene-hero.webp')).size, j = fs.statSync(path.join(__dirname, '..', 'assets/images/scene-hero.jpg')).size;
  assert.ok(w < j * 0.6, 'webp is at least 40% smaller');
});
test('connect backdrop: jpg shorthand first (fallback), then image-set webp with jpg', () => {
  const c = R('connect/index.html'); const i = c.indexOf("scene-hero.jpg') center/cover no-repeat;background-image:image-set");
  assert.ok(i > 0); assert.match(c, IS);
});
test('profile: default backdrop + flyer placeholder keep the jpg rule and add webp only under @supports / as a later declaration', () => {
  const p = R('profile.html');
  assert.match(p, /@supports \(background-image:image-set\(url\('\/assets\/images\/scene-hero\.webp'\) type\('image\/webp'\)\)\)\{body::before\{background:linear-gradient/);
  assert.match(p, /var\(--pf-bg,url\('\/assets\/images\/scene-hero\.jpg'\)\)/, 'original jpg rule kept for browsers without image-set type()');
  assert.match(p, /\.ev-flyer\{[^}]*scene-hero\.jpg'\) center\/cover no-repeat;background-image:image-set/);
});
