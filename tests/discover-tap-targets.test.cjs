const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'assets/css/discover.css'), 'utf8');
test('discover.css: breadcrumb and city/scene links are at least 24px tall (live sweep measured 19-20px)', () => {
  assert.match(/\.disc-crumbs a\{([^}]*)\}/.exec(css)[1], /min-height:24px/);
  const l = /\.disc-links a,\.disc-scene a\{([^}]*)\}/.exec(css)[1];
  assert.match(l, /min-height:24px/); assert.match(l, /display:inline-block/);
  assert.match(css, /\.disc-links ul,\.disc-scene ul\{[^}]*gap:4px\}/, 'list gap reduced so the rhythm is unchanged');
});
