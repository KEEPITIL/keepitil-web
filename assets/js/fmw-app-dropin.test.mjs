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
const BUSINESS_SHA256 = 'c94de27bfaf1799844f83faf694ed67fdcb745bd57756efaa0d71854167f73ba';   // Joe 2026-11-22 "keep it public to verified business owners only": prices + Stripe links hidden, on top of the no-sample pin below
const BUSINESS_SHA256_NOSAMPLE = 'c65d53dbff2f136ff98c34a7a9142cdef43ff1fe47a381f24b6d20e049428676';
// [previous, hidden] text pairs (each hidden text unique); undoing them gives back the no-sample page byte for byte
const HIDE_PRICES = [[" and add-on marketing services. $10/mo or $100/yr.\">", " and add-on marketing services. Pricing is shown to verified licensed businesses.\">"], ["and one price covers every location your licenses cover.</p>", "and one price covers every location your licenses cover. <b>Pricing is shown to verified licensed businesses</b> — verify your license and email to see it.</p>"], ["      <div class=\"price\">$10<small>/mo</small></div>\n      <div class=\"per\">or <b>$100/yr</b> — 2 months free</div>\n      <div class=\"per\">Brands, manufacturers, distributors, cultivators, testing labs, microbusinesses, and services — every category except retail and delivery.</div>\n      <a class=\"btn\" href=\"https://buy.stripe.com/00wfZhfAVgieaoJ8S11440j\">Start Annual — $100/yr</a>\n      <a class=\"btn ghost\" style=\"margin-top:8px\" href=\"https://buy.stripe.com/bJe9AT74pd62bsN4BL1440i\">Start Monthly — $10/mo</a>", "      <div class=\"per\">Brands, manufacturers, distributors, cultivators, testing labs, microbusinesses, and services — every category except retail and delivery.</div>\n      <a class=\"btn\" href=\"https://keepitil.com/app/findmyweed/signup.html?as=business\">Verify your license to see pricing</a>"], ["      <div class=\"price\">$50<small>/mo</small></div>\n      <div class=\"per\">or <b>$500/yr</b> — 2 months free</div>\n      <div class=\"per\">Storefronts and delivery only — the customer-facing categories, ranked in your county.</div>\n      <a class=\"btn\" href=\"https://buy.stripe.com/bJe3cv2O9gie9kF6JT1440l\">Start Monthly — $50/mo</a>\n      <a class=\"btn ghost\" style=\"margin-top:8px\" href=\"https://keepitil.com/app/findmyweed/signup.html?as=business\">Start Annual — join &amp; pick Retail</a>", "      <div class=\"per\">Storefronts and delivery only — the customer-facing categories, ranked in your county.</div>\n      <a class=\"btn\" href=\"https://keepitil.com/app/findmyweed/signup.html?as=business\">Verify your license to see pricing</a>"], ["<th>Listing</th><td class=\"fm\">$10–$50/mo<br><small style=\"font-weight:400\">$100–$500/yr — 2 months free</small></td>", "<th>Listing</th><td class=\"fm\">Shown to verified businesses</td>"], ["<th>Top placement</th><td class=\"fm\">$100–$500/mo<br><small style=\"font-weight:400\">$1,000–$5,000/yr — 2 months free</small></td>", "<th>Top placement</th><td class=\"fm\">Shown to verified businesses</td>"], ["      <li><b>1st in your county — $500/mo</b> · <a href=\"https://buy.stripe.com/28E4gz9cx0jg40lc4d1440m\">Claim 1st</a></li>\n      <li><b>2nd in your county — $400/mo</b> · <a href=\"https://buy.stripe.com/3cI14n88t4zw68t7NX1440n\">Claim 2nd</a></li>\n      <li><b>3rd in your county — $300/mo</b> · <a href=\"https://buy.stripe.com/14A9ATdsN3vsfJ38S11440o\">Claim 3rd</a></li>\n      <li><b>4th in your county — $200/mo</b> · <a href=\"https://buy.stripe.com/fZueVdewR6HEdAVgkt1440p\">Claim 4th</a></li>\n      <li><b>5th in your county — $100/mo</b> · <a href=\"https://buy.stripe.com/5kQdR94Wh7LI0O9gkt1440q\">Claim 5th</a></li>", "      <li><b>1st through 5th in your county</b> — priced by rank. <a href=\"https://keepitil.com/app/findmyweed/signup.html?as=business\">Verify your license and email to see placement pricing</a></li>"], ["Ours are published flat, for everyone.</p>", "Ours are flat, and shown to every verified business.</p>"], ["<li><b>County top placement — $100–$500/mo</b> — 1st through 5th", "<li><b>County top placement</b> — 1st through 5th"]];   // Joe 2026-11-22 "Remove the link": no 'See a sample member profile' link, on top of the table pin below
const BUSINESS_SHA256_TABLE = '6603448efc2f2f5b4f021c12bd62e736f567501bb3d71a4cc2e3b3ff21b12cd6';   // QA 2026-11-22 (2): the comparison table fits a 390px phone (13px text, 7px/6px cells under 480px), on top of the join-button pin below
const BUSINESS_SHA256_JOIN = 'd334009b97c7885ad8d612876ba11f6e27d80996a1e1cd5cc99d5d4505866398';   // QA 2026-11-22: the two join buttons open the live business sign-up (signup.html?as=business) instead of reloading this page, on top of the R-J1 pin below
const BUSINESS_SHA256_RJ1 = '606b4b942866d5cd7f8c264abb6ed87a565ff1be376c390874a5f65617c5545b';   // R-J1: the two /findmyweed-join buttons point at /app/findmyweed/for-business/ (findmyweed-join.html deleted), and the /needs "Tell Us What You Need" button is removed (+ one .cta spacing rule), on top of the A205 pin below
const BUSINESS_SHA256_A205 = '337b4a6cbebab54852ea5e6c61e108865afdeea04ccbb1934b156b645c7d0db9';   // A205 (post-launch): link colour + '21+ (18+ medical where legal)' on top of the launch pin below
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
  // sign-up LIVE (find-my-weed #77, owner GO 2026-11-22): accounts + claims on, the public project URL + anon key only
  assert.match(read(APP + '/js/site-config.js'), /var CONFIG = \{ launched: true, reportForm: false, basePath: "\/app\/findmyweed", accounts: true, claims: true, authProject: \{ url: "https:\/\/ovmqtzjfpzrbzrlkxwgw\.supabase\.co", anonKey: "[A-Za-z0-9_.-]+" \} \};/);
  assert.doesNotMatch(read(APP + '/js/site-config.js'), /service_role/);
  // signup.html is noindex,follow (an account page, like the 404)
  assert.match(read(APP + '/signup.html'), /<meta name="robots" content="noindex,follow">/);
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
  assert.equal(linkProblems(idx.replace(/src="js\/fmw\.js(\?v=[0-9a-f]+)?"/, 'src="/js/fmw.js$1"'), 'index.html').length, 1, 'root-absolute');
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
  // R-J1: the only differences from the A205 page are the two buttons that pointed at the deleted /findmyweed-join,
  // and the removed /needs CTA button with the .cta spacing rule that keeps the button-less box even
  // QA 2026-11-22: the only difference from the R-J1 page is the two join buttons now opening the business sign-up
  // Joe 2026-11-22: the only difference from the table page is the removed sample-profile link
  // Joe 2026-11-22: the only difference from the no-sample page is that prices and Stripe links are hidden
  let nosample = biz.toString('utf8');
  for (const [prev, hidden] of HIDE_PRICES) nosample = nosample.replace(hidden, () => prev);
  assert.equal(sha(nosample), BUSINESS_SHA256_NOSAMPLE);
  const table = nosample.replace('>Browse the live directory</a></p>', '>Browse the live directory</a> \u00b7 <a href="https://keepitil.com/findmyweed-sample">See a sample member profile</a></p>');
  assert.equal(sha(table), BUSINESS_SHA256_TABLE);
  const join = table.replace('@media(max-width:480px){.cmp{font-size:13px}.cmp th,.cmp td{padding:7px 6px}}</style>', '</style>');
  assert.equal(sha(join), BUSINESS_SHA256_JOIN);
  const rj1 = join
    .replace('href="https://keepitil.com/app/findmyweed/signup.html?as=business">Start Annual', 'href="https://keepitil.com/app/findmyweed/for-business/">Start Annual')
    .replace('href="https://keepitil.com/app/findmyweed/signup.html?as=business">Join the Network', 'href="https://keepitil.com/app/findmyweed/for-business/">Join the Network');
  assert.equal(sha(rj1), BUSINESS_SHA256_RJ1);
  const a205 = rj1
    .replace('href="https://keepitil.com/app/findmyweed/for-business/">Start Annual', 'href="https://keepitil.com/findmyweed-join">Start Annual')
    .replace('href="https://keepitil.com/app/findmyweed/for-business/">Join the Network', 'href="https://keepitil.com/findmyweed-join">Join the Network')
    .replace('  .cta p:last-child{margin-bottom:0}\n', '')
    .replace(' add-ons for your brand.</p>\n', '$&    <a class="btn" href="https://keepitil.com/needs">Tell Us What You Need</a>\n');
  assert.equal(sha(a205), BUSINESS_SHA256_A205);
  const launched = a205
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
