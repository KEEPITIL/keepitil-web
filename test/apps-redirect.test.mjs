import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url);

function text(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

const DESTINATION = '/games/#keepitil-apps';
const REDIRECT_NEEDLE = 'location.replace("/games/#keepitil-apps")';

/* Subpaths Atlas named. These files must keep working and must not become the stub. */
const PROTECTED = [
  'apps/tuitea/index.html',
  'apps/tuitea/confirmed/index.html',
  'apps/tuitea/legal/index.html',
  'apps/tuitea/legal/health-privacy/index.html',
  'apps/tuitea/legal/privacy/index.html',
  'apps/tuitea/legal/terms/index.html',
  'apps/tuitea/support/index.html',
  'app/tuitea/index.html',
  'app/tuitea/app.html',
  'app/tuitea/app/index.html',
  'app/tuitea/family/index.html',
  'app/tuitea/more/index.html',
  'app/tuitea/tupu/index.html',
  'app/kaitarako/index.html'
];

function assertExactStub(path) {
  const html = text(path);
  assert.match(html, /<meta http-equiv="refresh" content="0; url=\/games\/#keepitil-apps">/);
  assert.match(html, /location\.replace\("\/games\/#keepitil-apps"\)/);
  assert.doesNotMatch(html, /rel="manifest"/i);
  assert.doesNotMatch(html, /serviceWorker/i);
  assert.doesNotMatch(html, /\/apps\/\*|\/app\/\*/);
  assert.equal(html.includes(DESTINATION), true);
}

test('bare /apps and /app are directory-index stubs, not a splat', () => {
  assertExactStub('apps/index.html');
  assertExactStub('app/index.html');
  assert.equal(existsSync(new URL('_redirects', root)), false);
  assert.equal(existsSync(new URL('apps/_redirects', root)), false);
  assert.equal(existsSync(new URL('app/_redirects', root)), false);
  for (const name of ['sw.js', 'manifest.webmanifest', 'manifest.json', 'service-worker.js']) {
    assert.equal(existsSync(new URL('apps/' + name, root)), false, 'apps/' + name);
    assert.equal(existsSync(new URL('app/' + name, root)), false, 'app/' + name);
  }
  assert.ok(readdirSync(new URL('apps/', root)).includes('tuitea'));
  assert.ok(readdirSync(new URL('app/', root)).includes('tuitea'));
  assert.ok(readdirSync(new URL('app/', root)).includes('kaitarako'));
});

test('the 404 router does not catch /apps, /app, or their subpaths', () => {
  const html = text('404.html');
  const script = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
  assert.doesNotMatch(script, /seg\[0\]\s*===?\s*['"]apps['"]/);
  assert.doesNotMatch(script, /seg\[0\]\s*===?\s*['"]app['"]/);
  assert.doesNotMatch(script, /\/apps\/\*/);
  assert.doesNotMatch(script, /\/app\/\*/);
  const section = script.match(/var SECTION=\{([^}]+)\}/);
  assert.ok(section, 'SECTION map');
  assert.doesNotMatch(section[1], /apps/);
  assert.doesNotMatch(section[1], /\bapp\b/);
  const clean = script.match(/var CLEAN_URL_PAGES=\[([^\]]+)\]/);
  assert.ok(clean, 'CLEAN_URL_PAGES');
  assert.equal(clean[1].includes("'apps'"), false);
  assert.equal(clean[1].includes("'app'"), false);
  assert.equal(script.includes(REDIRECT_NEEDLE), false);
});

test('protected subpaths still exist and do not use the games redirect', () => {
  for (const path of PROTECTED) {
    const html = text(path);
    assert.equal(html.includes(REDIRECT_NEEDLE), false, path);
    assert.equal(html.includes('url=/games/#keepitil-apps'), false, path);
  }
  assert.match(text('apps/tuitea/index.html'), /keepitil\.com\/support\/\?product=tuitea/);
  assert.match(text('app/tuitea/index.html'), /A REAL PAGE, NOT A REDIRECT/);
  assert.match(text('app/kaitarako/index.html'), /manifest\.webmanifest/);
  assert.match(text('join/index.html'), /https:\/\/keepitil\.com\/app\/tuitea\/app\//);
  assert.match(text('join/auth/index.html'), /https:\/\/keepitil\.com\/app\/tuitea\/app\//);
  for (const path of [
    'app/tuitea/release.json',
    'app/tuitea/sw.js',
    'app/tuitea/pwa.js',
    'app/kaitarako/sw.js',
    'app/kaitarako/manifest.webmanifest'
  ]) {
    assert.equal(existsSync(new URL(path, root)), true, path);
  }
});

test('the games page already exposes the keepitil-apps anchor', () => {
  assert.match(text('games/index.html'), /id="keepitil-apps"/);
});

test('the Cloudflare beacon token lives in one partial', () => {
  const partial = text('includes/cf-web-analytics.html');
  assert.match(partial, /src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"/);
  assert.match(partial, /data-cf-beacon='\{"token": "TODO_CF_TOKEN"\}'/);
  const shell = text('keepitil-shell.js');
  assert.match(shell, /\/includes\/cf-web-analytics\.html/);
  assert.match(shell, /__kilCfTokenSkip/);
  assert.equal(shell.includes('beacon.min.js"'), false);
  const token = partial.match(/data-cf-beacon\s*=\s*(['"])([\s\S]*?)\1/);
  const src = partial.match(/src\s*=\s*(['"])(https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js)\1/);
  assert.ok(token && token[2].includes('TODO_CF_TOKEN'));
  assert.ok(src);
  assert.match(shell, /\/assets\/js\/kil-utm\.js\?v=20261107c/);
  const utm = require('../assets/js/kil-utm.js');
  assert.equal(typeof utm.capture, 'function');
});
