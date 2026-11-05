// node --test tests/kaitarako-sw-kill.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const src = require('fs').readFileSync('app/kaitarako/sw.js', 'utf8');
test('kill switch clears only Kai Tarako caches and unregisters', () => {
  assert.match(src, /k\.startsWith\('kai-tarako-'\)/);
  assert.match(src, /registration\.unregister\(\)/);
  assert.doesNotMatch(src, /addEventListener\('fetch'/);
  assert.doesNotMatch(src, /mascot\//);
});
