// Find My Weed web app drop-in at /app/findmyweed/ (merges together with #201, which put the old marketing page at
// app/findmyweed/for-business/ and turned /findmyweed into redirect stubs to /app/findmyweed/).
//   - app/findmyweed/index.html exists and is the LAUNCHED build (find-my-weed launch/web-1.0): index,follow, launched true,
//     the real share image, open browsing (no age prompt script, no under-21 exit page), a sitemap of its static pages;
//   - every src/href in the app's pages resolves under /app/findmyweed/ and to a file that is in the drop-in;
//   - for-business/ is #201's page minus its M201-1 noindex (indexable at launch), and shares no file name with the drop-in;
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
const PAGES = ['index.html', 'results.html', 'listing.html', 'about.html', 'privacy.html', '404.html'];
const BUSINESS = APP + '/for-business/index.html';
const BUSINESS_SHA256 = '337b4a6cbebab54852ea5e6c61e108865afdeea04ccbb1934b156b645c7d0db9';   // A205 (post-launch): link colour + '21+ (18+ medical where legal)' on top of the launch pin below
const BUSINESS_SHA256_LAUNCH = '595e06ff59e450fbb09bf5b3ae50d8cdafc503e9fefcf4dc236b3faf32009342';   // as launched: #201 minus the M201-1 robots meta and the 10% commission bullet
const BUSINESS_SHA256_PRELAUNCH = 'e042b44d4a008e1117dc4401843906dcfd32342909a99465901496bb2f1dd343';   // #201 with M201-1 noindex

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
/** Problems with the launched state of a page: exactly one robots meta, and it is index,follow. */
export function indexableProblems(html, file) {
  const all = [...html.matchAll(/<meta\s+name="robots"\s+content="([^"]*)"\s*\/?>/gi)];
  if (all.length !== 1) return [file + ': expected one robots meta, found ' + all.length];
  return /\bnoindex\b|\bnofollow\b/.test(all[0][1]) || !/\bindex\b/.test(all[0][1]) ? [file + ': robots is "' + all[0][1] + '", not index,follow'] : [];
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
  for (const f of [...PAGES, 'robots.txt', 'sitemap.xml', 'data/listings.json', 'js/site-config.js', 'css/fmw.css', 'img/og.png']) {
    assert.ok(fs.statSync(path.join(ROOT, APP, f)).isFile(), APP + '/' + f);
  }
  assert.equal(fs.existsSync(path.join(ROOT, APP, '.fmw-build')), false, 'the build marker is not committed');
});

test('launched: every page is index,follow, the switch says launched, robots.txt allows all and names the sitemap', () => {
  // A205: the 404 page is noindex,follow (it answers any missing path); every other page is index,follow
  for (const f of PAGES.filter((p) => p !== '404.html')) assert.deepEqual(indexableProblems(read(APP + '/' + f), f), []);
  assert.match(read(APP + '/404.html'), /<meta name="robots" content="noindex,follow">/);
  assert.equal(indexableProblems(read(APP + '/404.html'), '404.html').length, 1, 'CONTROL: the indexable check rejects the 404, as intended');
  assert.match(read(APP + '/js/site-config.js'), /var CONFIG = \{ launched: true, reportForm: false, basePath: "\/app\/findmyweed" \};/);
  const robots = read(APP + '/robots.txt');
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /Disallow/);
  assert.match(robots, /^Sitemap: https:\/\/keepitil\.com\/app\/findmyweed\/sitemap\.xml$/m);
  const locs = [...read(APP + '/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [ORIGIN + PREFIX, ORIGIN + PREFIX + 'about.html', ORIGIN + PREFIX + 'privacy.html']);
  // the real share image, never the placeholder; open browsing (no age prompt, no exit page)
  for (const f of PAGES) {
    const h = read(APP + '/' + f);
    assert.match(h, /<meta property="og:image" content="https:\/\/keepitil\.com\/app\/findmyweed\/img\/og\.png">/, f);
    assert.doesNotMatch(h, /og-placeholder|agegate/, f);
  }
  for (const gone of ['img/og-placeholder.png', 'js/agegate.js', 'under21.html']) assert.equal(fs.existsSync(path.join(ROOT, APP, gone)), false, gone + ' is gone');
  // NEGATIVE CONTROLS: a noindex page, a missing robots meta and a doubled one are each caught
  const idx = read(APP + '/index.html');
  assert.equal(indexableProblems(idx.replace('content="index,follow"', 'content="noindex,nofollow"'), 'index.html').length, 1, 'noindex');
  assert.equal(indexableProblems(idx.replace(/<meta name="robots"[^>]*>/, ''), 'index.html').length, 1, 'missing');
  assert.equal(indexableProblems(idx.replace(/(<meta name="robots"[^>]*>)/, '$1$1'), 'index.html').length, 1, 'doubled');
  assert.deepEqual(indexableProblems(idx, 'index.html'), [], 'CONTROL: the real page passes');
});

test('the root sitemap lists the launched app pages and for-business, and nothing else under /app/findmyweed/', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const fmw = locs.filter((l) => l.startsWith(ORIGIN + PREFIX));
  const appMap = [...read(APP + '/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(fmw, [...appMap, ORIGIN + PREFIX + 'for-business/'], 'the app sitemap\'s pages, then for-business');
  for (const l of fmw) {
    let rel = l.slice(ORIGIN.length + 1); if (rel.endsWith('/')) rel += 'index.html';
    assert.ok(fs.existsSync(path.join(ROOT, rel)), l + ' is a real file');
  }
  // NEGATIVE CONTROL: a listed page that does not exist is caught by the same file check
  assert.equal(fs.existsSync(path.join(ROOT, APP, 'under21.html')), false);
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

test('for-business/: the #201 bytes minus the M201-1 robots meta and the commission bullet, only its index.html, no shared file names', () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, APP, 'for-business')), ['index.html']);
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const biz = fs.readFileSync(path.join(ROOT, BUSINESS));
  assert.equal(sha(biz), BUSINESS_SHA256, BUSINESS + ' changed (if it changed on purpose, update the pin)');
  // the ONLY differences from #201's pre-launch bytes: the removed robots meta and the removed "10% commission" bullet
  const COMMISSION_BULLET = '      <li>10% commission only on orders that come through us \u2014 wholesale and retail. No orders, no commission</li>\n';
  // A205: the only differences from the launched page are the link colour rule and the two age qualifiers
  const launched = biz.toString('utf8')
    .replace('  a{color:var(--green)}\n', '')
    .replace('>Consumers 21+ (18+ medical where legal) join free.', '>Consumers 21+ join free.')
    .replace('· Cannabis marketing services · 21+ (18+ medical where legal)', '· Cannabis marketing services · 21+ only');
  assert.equal(sha(launched), BUSINESS_SHA256_LAUNCH);
  const back = launched
    .replace('<link rel="canonical" href="https://keepitil.com/app/findmyweed/for-business/">\n', '$&<meta name="robots" content="noindex,nofollow">\n')
    .replace('      <li>Your brand in front of our network of delivery, retail, and manufacturing partners</li>\n', '$&' + COMMISSION_BULLET);
  assert.equal(sha(back), BUSINESS_SHA256_PRELAUNCH);
  assert.equal(fs.existsSync(path.join(ROOT, APP, 'for-business.html')), false);
  // NEGATIVE CONTROL: one changed byte changes the hash
  assert.notEqual(sha(read(BUSINESS) + ' '), BUSINESS_SHA256);
});

test('the root service worker skips /app/findmyweed/*', () => {
  const h = swWorker();
  for (const r of ['/app/findmyweed/', '/app/findmyweed/index.html', '/app/findmyweed/js/fmw.js', '/app/findmyweed/css/fmw.css',
    '/app/findmyweed/data/listings.json', '/app/findmyweed/img/og.png', '/app/findmyweed/for-business/']) {
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
