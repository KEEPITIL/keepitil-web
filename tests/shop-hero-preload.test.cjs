const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const h = fs.readFileSync(path.join(__dirname, '..', 'shop/index.html'), 'utf8');
test('shop: the hero image (the LCP element) is preloaded at high priority, from the exact URL the <img> uses (no second download)', () => {
  const src = /<img class="art" src="([^"]+)"/.exec(h)[1];
  assert.equal(src, '/assets/sponsors/affiliate-keepitil-store-2x3-600.webp');
  assert.ok(h.includes('<link rel="preload" as="image" fetchpriority="high" href="' + src + '"/>'), 'preload href equals the <img src>');
  assert.ok(h.indexOf('rel="preload"') < h.indexOf('rel="stylesheet"'), 'discovered before the stylesheets');
  assert.doesNotMatch(h, /<img class="art"[^>]*loading="lazy"/, 'the LCP image is not lazy');
});
