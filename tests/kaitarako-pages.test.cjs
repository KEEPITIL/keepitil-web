'use strict';

// Run without dependencies: node --test tests/kaitarako-pages.test.cjs
// The Kai Tarako privacy and support pages are the App Store Connect URLs. They must work whether
// app/kaitarako/ keeps the web app (option B) or only these pages remain (option A).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const pages = ['app/kaitarako/privacy.html', 'app/kaitarako/support/index.html'];

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  test(`${page}: self-contained`, () => {
    assert.doesNotMatch(html, /<(script|img|link|iframe)\b/i);
    assert.match(html, /Content-Security-Policy/);
  });
  test(`${page}: names the contact`, () => assert.match(html, /info@keepitil\.com/));
  test(`${page}: every local link resolves without the web app`, () => {
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (/^(mailto:|https?:)/.test(href)) continue;
      const target = href.startsWith('/') ? path.join(root, href) : path.join(root, path.dirname(page), href);
      const file = href.endsWith('/') ? path.join(target, 'index.html') : target;
      assert.ok(fs.existsSync(file) && !/app\/kaitarako\/index\.html$/.test(file), `${page} -> ${href}`);
    }
  });
}
