const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8');
test('profile: tf.js + nsfwjs (~560 KB) are not static <script> tags; they load on demand / after sign-in', () => {
  assert.doesNotMatch(html, /<script[^>]+(tf\.min\.js|nsfwjs\.min\.js)/);
  assert.match(html, /function loadNsfwLibs\(\)/);
  assert.match(html, /tf\.min\.js'\)\.then\(function\(\)\{ return add\('https:\/\/cdn\.jsdelivr\.net\/npm\/nsfwjs@3\.0\.0/);
  assert.match(html, /if\(SESSION\) getNsfwModel\(\)/);
  assert.match(html, /if\(s\) getNsfwModel\(\)/);
  // moderation still runs before every upload
  assert.match(html, /isImageSafe\(file\)/);
});
