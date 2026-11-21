// Find My Weed web app drop-in at /app/findmyweed/ (merges together with #201, which put the old marketing page at
// app/findmyweed/for-business/ and turned /findmyweed into redirect stubs to /app/findmyweed/).
//   - app/findmyweed/index.html exists and is the pre-launch build: noindex,nofollow, launched false;
//   - every src/href in the app's pages resolves under /app/findmyweed/ and to a file that is in the drop-in;
//   - for-business/ is untouched (same bytes as #201 @85156b6) and shares no file name with the drop-in;
//   - the root service worker (sw.js, scope /) leaves /app/findmyweed/* alone, like /app/tuitea/ and /app/kaitarako/.
// Each rule has a NEGATIVE CONTROL that runs the same checker on a planted bad input.
// Run: node --test assets/js/fmw-app-dropin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = 'app/findmyweed';
const PREFIX = '/' + APP + '/';
const ORIGIN = 'https://keepitil.com';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PAGES = ['index.html', 'results.html', 'listing.html', 'about.html', 'privacy.html', 'under21.html', '404.html'];
const BUSINESS = APP + '/for-business/index.html';
const BUSINESS_SHA256 = '2b55c121f6ceb8ad97f2ff904043f67b8837e7c70eb6f56f400820282969c237';   // #201 @85156b6

// ---- checkers (pure, so the negative controls exercise the exact same code) ----

/** Every src/href in a page, resolved as the browser would at https://keepitil.com/app/findmyweed/<file>. */
function refs(html, file) {
  const base = ORIGIN + PREFIX + file;
  return [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/gi)].map((m) => ({ raw: m[1], url: new URL(m[1], base) }));
}
/** Problems with a page's links: anything on keepitil.com outside /app/findmyweed/, or another origin. */
export function linkProblems(html, file) {
  const p = [];
  for (const { raw, url } of refs(html, file)) {
    if (/^(#|mailto:|tel:)/i.test(raw)) continue;
    if (url.origin !== ORIGIN) p.push(file + ': off-site ' + raw);
    else if (!url.pathname.startsWith(PREFIX)) p.push(file + ': leaves ' + PREFIX + ' via ' + raw);
  }
  return p;
}
/** Problems with the pre-launch state of a page. */
export function noindexProblems(html, file) {
  const m = html.match(/<meta\s+name="robots"\s+content="([^"]*)"\s*\/?>/i);
  return m && /\bnoindex\b/.test(m[1]) && /\bnofollow\b/.test(m[1]) ? [] : [file + ': no robots noindex,nofollow meta'];
}

function swWorker() {
  const handlers = new Map();
  const self = {
    location: { origin: ORIGIN },
    clients: { claim: async () => {} },
    addEventListener(name, h) { handlers.set(name, h); },
    skipWaiting: async () => {},
  };
  const caches = {
    keys: async () => [], delete: async () => true, match: async () => undefined,
    open: async () => ({ addAll: async () => [], put: async () => {} }),
  };
  vm.runInNewContext(read('sw.js'), { self, caches, URL, Promise, fetch: async () => ({ ok: false }) }, { filename: 'sw.js' });
  return handlers;
}
function intercepted(handlers, route, mode) {
  let hit = false;
  handlers.get('fetch')({
    request: { method: 'GET', url: ORIGIN + route, mode },
    respondWith(p) { hit = true; if (p && typeof p.catch === 'function') p.catch(() => {}); },
    waitUntil() {},
  });
  return hit;
}

// ---- the drop-in ----

test('app/findmyweed/index.html exists, with the rest of the built app beside it', () => {
  for (const f of [...PAGES, 'robots.txt', 'sitemap.xml', 'data/listings.json', 'js/site-config.js', 'css/fmw.css']) {
    assert.ok(fs.statSync(path.join(ROOT, APP, f)).isFile(), APP + '/' + f);
  }
  assert.equal(fs.existsSync(path.join(ROOT, APP, '.fmw-build')), false, 'the build marker is not committed');
});

test('pre-launch: every page is noindex,nofollow, the switch says draft, robots.txt disallows all', () => {
  for (const f of PAGES) assert.deepEqual(noindexProblems(read(APP + '/' + f), f), []);
  assert.match(read(APP + '/js/site-config.js'), /var CONFIG = \{ launched: false, reportForm: false, basePath: "\/app\/findmyweed" \};/);
  assert.match(read(APP + '/robots.txt'), /^Disallow: \/$/m);
  assert.doesNotMatch(read(APP + '/sitemap.xml'), /<loc>/, 'empty sitemap while pre-launch');
  // NEGATIVE CONTROLS
  assert.equal(noindexProblems(read(APP + '/index.html').replace(/<meta name="robots"[^>]*>/, ''), 'index.html').length, 1);
  assert.equal(noindexProblems('<meta name="robots" content="index,follow">', 'x.html').length, 1);
});

test('every asset and link URL in the app resolves under /app/findmyweed/ and to a file in the drop-in', () => {
  let n = 0;
  for (const f of PAGES) {
    const html = read(APP + '/' + f);
    assert.deepEqual(linkProblems(html, f), [], f);
    for (const { raw, url } of refs(html, f)) {
      if (/^(#|mailto:|tel:)/i.test(raw) || url.origin !== ORIGIN) continue;
      let rel = decodeURIComponent(url.pathname.slice(1));
      if (rel.endsWith('/')) rel += 'index.html';
      assert.ok(fs.existsSync(path.join(ROOT, rel)), f + ' -> ' + raw + ' (' + rel + ')');
      n++;
    }
    // asset tags specifically: absolute ones (404.html's) are spelled with the /app/findmyweed/ prefix
    for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="(\/[^"]*)"/g)) assert.ok(m[1].startsWith(PREFIX), f + ': ' + m[1]);
  }
  assert.ok(n > 30, 'checked ' + n + ' references');
  // NEGATIVE CONTROLS: a root-absolute asset, a relative escape and an old-folder link are each caught
  const idx = read(APP + '/index.html');
  assert.equal(linkProblems(idx.replace('src="js/fmw.js"', 'src="/js/fmw.js"'), 'index.html').length, 1, 'root-absolute');
  assert.equal(linkProblems(idx.replace('href="about.html"', 'href="../about.html"'), 'index.html').length, 1, 'relative escape');
  assert.equal(linkProblems('<a href="/findmyweed/about.html">', '404.html').length, 1, 'old /findmyweed/ folder');
  assert.equal(linkProblems('<script src="https://cdn.example/x.js"></script>', 'index.html').length, 1, 'off-site');
  assert.deepEqual(linkProblems('<link href="/app/findmyweed/css/fmw.css">', '404.html'), [], 'CONTROL: the right prefix passes');
});

test('for-business/ is untouched: same bytes as #201, only its index.html, no shared file names', () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, APP, 'for-business')), ['index.html']);
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  assert.equal(sha(fs.readFileSync(path.join(ROOT, BUSINESS))), BUSINESS_SHA256, BUSINESS + ' changed (if #201 changed it on purpose, update the pin)');
  assert.equal(fs.existsSync(path.join(ROOT, APP, 'for-business.html')), false);
  // NEGATIVE CONTROL: one changed byte changes the hash
  assert.notEqual(sha(read(BUSINESS) + ' '), BUSINESS_SHA256);
});

test('the root service worker skips /app/findmyweed/*', () => {
  const h = swWorker();
  for (const r of ['/app/findmyweed/', '/app/findmyweed/index.html', '/app/findmyweed/js/fmw.js', '/app/findmyweed/css/fmw.css',
    '/app/findmyweed/data/listings.json', '/app/findmyweed/img/og-placeholder.png', '/app/findmyweed/for-business/']) {
    assert.equal(intercepted(h, r, r.endsWith('/') || r.endsWith('.html') ? 'navigate' : 'no-cors'), false, 'root intercepted ' + r);
  }
  assert.match(read('sw.js'), /app\\\/\(\?:tuitea\|kaitarako\|findmyweed\)\)\\\//, 'the skip pattern names findmyweed');
});

test('NEGATIVE CONTROL: the root worker still handles its own pages and look-alike paths', () => {
  const h = swWorker();
  for (const [r, mode] of [['/findmyweed-join.html', 'navigate'], ['/app/findmyweedx/index.html', 'navigate'], ['/app/findmyweed', 'navigate'],
    ['/keepitil-shell.js', 'no-cors'], ['/app/other/x.js', 'no-cors']]) {
    assert.equal(intercepted(h, r, mode), true, 'root should still handle ' + r);
  }
  // and with findmyweed taken out of the pattern, the app's own requests would be intercepted again
  const src = read('sw.js'), planted = src.replace('kaitarako|findmyweed', 'kaitarako');
  assert.notEqual(planted, src);
  const handlers = new Map();
  vm.runInNewContext(planted, {
    self: { location: { origin: ORIGIN }, clients: { claim: async () => {} }, addEventListener(n, fn) { handlers.set(n, fn); }, skipWaiting: async () => {} },
    caches: { keys: async () => [], delete: async () => true, match: async () => undefined, open: async () => ({ addAll: async () => [], put: async () => {} }) },
    URL, Promise, fetch: async () => ({ ok: false }),
  }, { filename: 'sw.planted.js' });
  assert.equal(intercepted(handlers, '/app/findmyweed/index.html', 'navigate'), true, 'the planted worker intercepts the app');
});
