const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const __A = require("./helpers/event-assembled.cjs").assemble;
const h = __A(fs.readFileSync(path.join(__dirname, '..', 'earn/index.html'), 'utf8'));
test('earn: competition cover art is a lazy <img>, not a CSS background (the 7 flyers, ~1.2 MB, were fetched eagerly while off screen)', () => {
  assert.match(h, /aspect-ratio:2\/3;margin:-16px -16px 12px;background:#15131f"><img src="'\+esc\(cover\)\+'" alt="" loading="lazy" decoding="async" style="display:block;width:100%;height:100%;object-fit:cover"><\/div>/);
  assert.doesNotMatch(h, /background:#15131f url\(\\''\+esc\(cover\)/, 'the eager background-image form is gone');
  assert.match(h, /KilSafeHtml\?KilSafeHtml\.safeMediaUrl\(c\.cover_url\)/, 'cover URLs still go through safeMediaUrl');
});
