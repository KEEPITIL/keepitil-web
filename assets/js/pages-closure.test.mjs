// Tests for scripts/pages-build.mjs and scripts/pages-closure-check.mjs (GitHub Pages artifact staging).
// Includes NEGATIVE CONTROLS: excluding a file that a deployed file references must fail the check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseExcludes, isExcluded, buildSite } from '../../scripts/pages-build.mjs';
import { checkClosure } from '../../scripts/pages-closure-check.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-fx-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}
const BASE = {
  'CNAME': 'keepitil.com\n', '.nojekyll': '', '404.html': '<p>404</p>',
  '.well-known/apple-app-site-association': '{}',
  'index.html': '<link rel="stylesheet" href="/css/site.css"><img src="/img/logo.png" srcset="/img/logo-2x.png 2x"><a href="/about">about</a><a href="https://example.com/x.png">ext</a><a href="missing-already.html">old</a>',
  'about.html': '<script src="js/app.js"></script>',
  'css/site.css': 'body{background:url(../img/bg.png)}',
  'js/app.js': 'fetch("/data/list.json");const x="/img/logo.png";',
  'data/list.json': '[]',
  'img/logo.png': 'p', 'img/logo-2x.png': 'p', 'img/bg.png': 'p',
  'manifest.webmanifest': '{"icons":[{"src":"/img/logo.png"}]}',
  'tests/a.test.mjs': 'x', 'docs/readme.md': 'x', 'package.json': '{}',
};
function build(files, excludeText) {
  const src = fixture(files);
  const out = path.join(src, '_site');
  const { dropped, missing } = buildSite({ src, out, rules: parseExcludes(excludeText) });
  return { src, out, dropped, missing };
}

test('glob rules: dirs, exact files, ** and *', () => {
  const r = parseExcludes('# c\ntests/\npackage.json\napp/x/**/*.symbols\n');
  assert.ok(isExcluded('tests/a/b.mjs', r));
  assert.ok(isExcluded('package.json', r));
  assert.ok(!isExcluded('sub/package.json', r));
  assert.ok(isExcluded('app/x/y.js.symbols', r));
  assert.ok(isExcluded('app/x/a/b/y.js.symbols', r));
  assert.ok(!isExcluded('app/x/y.js', r));
  assert.ok(!isExcluded('tests2/a', r));
});

test('positive control: safe exclusions keep the closure intact', () => {
  const { src, out, dropped, missing } = build(BASE, 'tests/\ndocs/\npackage.json\n');
  assert.deepEqual(missing, []);
  assert.ok(dropped.includes('tests/a.test.mjs'));
  const res = checkClosure({ site: out, source: src });
  assert.deepEqual(res.required, []);
  assert.deepEqual(res.violations, []);
  // missing-already.html is dangling in the source too: reported, never blamed on an exclusion
  assert.equal(res.preexisting.length, 1);
  assert.match(res.preexisting[0].ref, /missing-already/);
});

test('NEGATIVE CONTROL: excluding a file an html page references fails', () => {
  const { src, out } = build(BASE, 'img/logo.png\n');
  const res = checkClosure({ site: out, source: src });
  assert.ok(res.violations.some((v) => v.target === 'img/logo.png' && v.file === 'index.html'));
  assert.ok(res.violations.some((v) => v.file === 'manifest.webmanifest'));
});

test('NEGATIVE CONTROL: excluding a css-referenced file or a js-fetched file fails', () => {
  const css = build(BASE, 'img/bg.png\n');
  assert.ok(checkClosure({ site: css.out, source: css.src }).violations.some((v) => v.kind === 'css'));
  const js = build(BASE, 'data/\n');
  assert.ok(checkClosure({ site: js.out, source: js.src }).violations.some((v) => v.kind === 'js-string' && v.target === 'data/list.json'));
});

test('NEGATIVE CONTROL: extensionless links resolve to .html and a dropped page fails', () => {
  const { src, out } = build(BASE, 'about.html\n');
  assert.ok(checkClosure({ site: out, source: src }).violations.some((v) => v.ref === '/about' && v.target === 'about.html'));
});

test('required files: CNAME, .nojekyll, index.html, 404.html, .well-known must survive', () => {
  const { missing } = build(BASE, 'CNAME\n');
  assert.deepEqual(missing, ['CNAME']);
  const b = build(BASE, '.well-known/\nindex.html\n');
  const res = checkClosure({ site: b.out, source: b.src });
  assert.ok(res.required.includes('index.html'));
  assert.ok(res.required.includes('.well-known/apple-app-site-association'));
});

test('without --source every dangling reference counts', () => {
  const { out } = build(BASE, 'tests/\n');
  const res = checkClosure({ site: out, source: null });
  assert.equal(res.preexisting.length, 1);
});
