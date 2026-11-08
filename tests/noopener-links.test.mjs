// Every target="_blank" anchor must carry rel="noopener noreferrer", except affiliate/sponsor/partner links
// (SPONSORED_HOSTS / SPONSORED_PARAMS below), which carry rel="noopener sponsored" WITHOUT noreferrer so attribution
// keeps working. Every window.open(..., '_blank') call must pass 'noopener,noreferrer' (sponsored hosts: 'noopener').
// Run: node --test tests/noopener-links.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Directories that are not published site pages: build output, vendored libs,
// the build-service starter, game prototypes and scratch/test trees.
const SKIP_DIR = /^(\.git|\.github|node_modules|build-service|app\/tuitea|apps\/tuitea|docs|tests|vendor|lib)$|(^|\/)(proto|vendor|node_modules)$/;
const SKIP_FILE = /\.min\.js$|^app\/kaitarako\/assets\//;

// Files deliberately NOT fixed in this change, each pending the owner's go
// (locked file or touched by an open PR). Each entry must still contain a
// violation; when a file is fixed, delete it from this list (the test below
// fails on stale entries so the list cannot rot).
export const PENDING = {
  'index.html': 'locked frame',
  'connect/index.html': 'locked frame',
  'culture/index.html': 'locked frame',
  'earn/index.html': 'locked frame',
  'keepitil-shell.js': 'locked',
  'assets/js/keepitil-ai.js': 'locked (a.target=_blank set in JS)',
  'event.html': 'open PR #77',
  'games/index.html': 'open PR #77',
  'games/kbeats/submit/index.html': 'open PR #83/#85',
  'kode/app.html': 'open PR #83',
  'kode/embed.html': 'open PR #83',
  'organizers/dashboard.html': 'open PR #83',
  'profile.html': 'open PR #83',
  'services/index.html': 'open PR #85',
  'tickets.html': 'open PR #83',
  'venue.html': 'open PR #83',
};

// ---- link policy -------------------------------------------------------------------------------
// Affiliate, sponsor and partner links must keep the Referer so attribution works: rel="noopener sponsored" and NO
// noreferrer (existing tokens such as nofollow are kept). Every other target=_blank link gets "noopener noreferrer".
export const SPONSORED_HOSTS = [
  'vividseats.com', 'ticketmaster.com',
  'illestratedlifestyle.com', 'myshopify.com',          // the Shopify store
  'freecash.com', 'distrokid.com',                      // referral programmes used in the Support carousel and articles
];
export const SPONSORED_PARAMS = /[?&](ref|sca_ref|utm_[a-z_]+|aff|aff_id|affiliate|partner|pid)(=|&|#|$)/i;
export const AMAZON_TAG = /^(www\.)?amazon\.com$/i;   // amazon.com is sponsored only when it carries a ?tag= associate id
// hrefs built in JS for the Support/Partners/Products carousels and the dashboard buy link (all affiliate or store links)
export const SPONSORED_DYNAMIC_HREFS = [/^'\s*\+\s*(p\[2\]|p\[3\]|it\[3\])\s*\+\s*'$/, /^'\s*\+\s*esc\(p\.buy_url\)\s*\+\s*'$/];

const relOf = (tag) => { const m = /\brel\s*=\s*\\?"([^"]*)"|\brel\s*=\s*\\?'([^']*)'/i.exec(tag); return m ? (m[1] ?? m[2]) : ''; };
const hrefOf = (tag) => { const m = /\bhref\s*=\s*\\?"([^"]*)"|\bhref\s*=\s*\\?'([^']*)'/i.exec(tag); return m ? (m[1] ?? m[2]) : ''; };

/** True when a link belongs to the sponsored class (host list, param patterns, dynamic carousel hrefs, or a rel that already says sponsored/nofollow). */
export function isSponsoredLink(href, rel = '') {
  if (/sponsored|nofollow/i.test(rel)) return true;
  if (SPONSORED_DYNAMIC_HREFS.some((re) => re.test(href))) return true;
  let u; try { u = new URL(href); } catch { return false; }
  const host = u.hostname.toLowerCase();
  if (SPONSORED_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return true;
  if (AMAZON_TAG.test(host) && u.searchParams.has('tag')) return true;
  return SPONSORED_PARAMS.test(href);
}

/** Returns descriptions of every <a ... target=_blank> whose rel breaks the policy above. */
export function blankAnchorViolations(src) {
  const bad = [];
  for (const m of src.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/target\s*=\s*\\?["']?_blank/i.test(tag)) continue;
    const val = relOf(tag);
    const ok = isSponsoredLink(hrefOf(tag), val)
      ? /noopener/i.test(val) && /sponsored/i.test(val) && !/noreferrer/i.test(val)
      : /noopener/i.test(val) && /noreferrer/i.test(val);
    if (!ok) bad.push((isSponsoredLink(hrefOf(tag), val) ? 'SPONSORED ' : '') + tag.slice(0, 120));
  }
  // anchors made in JS: x.target = '_blank' / setAttribute('target','_blank') need a rel set too
  for (const m of src.matchAll(/(\.target\s*=\s*|setAttribute\(\s*['"]target['"]\s*,\s*)['"]_blank['"]/g)) {
    const near = src.slice(m.index, m.index + 400);
    if (!/noreferrer|sponsored/.test(near) || !/noopener/.test(near)) bad.push('js target=_blank: ' + near.slice(0, 80).replace(/\s+/g, ' '));
  }
  return bad;
}

/** Returns the arguments of every window.open( call that breaks the policy (noopener,noreferrer; sponsored hosts noopener only). */
export function windowOpenViolations(src) {
  const bad = [];
  for (const m of src.matchAll(/\bwindow\.open\(/g)) {
    let i = m.index + m[0].length, depth = 1, q = null;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    const args = src.slice(start, i - 1);
    const url = /['"](https?:\/\/[^'"]+)['"]/.exec(args);
    const sponsored = url && isSponsoredLink(url[1]);
    const ok = sponsored ? /noopener/.test(args) && !/noreferrer/.test(args) : /noopener/.test(args) && /noreferrer/.test(args);
    if (!ok) bad.push(args.slice(0, 120));
  }
  return bad;
}

function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP_DIR.test(r) && !SKIP_DIR.test(e.name)) walk(path.join(dir, e.name), r, out); }
    else if (/\.(html|js|mjs)$/.test(e.name) && !SKIP_FILE.test(r)) out.push(r);
  }
  return out;
}

// ---- negative controls: the scanners must flag known-bad input and pass known-good input ----
test('control: scanner flags target=_blank without rel', () => {
  assert.equal(blankAnchorViolations('<a href="https://x.example" target="_blank">x</a>').length, 1);
});
test('control: scanner flags rel with only noopener, or only unrelated tokens', () => {
  assert.equal(blankAnchorViolations('<a href="/" target="_blank" rel="noopener">x</a>').length, 1);
  assert.equal(blankAnchorViolations('<a href="/" target="_blank" rel="nofollow">x</a>').length, 1);
});
test('control: scanner flags JS-template anchors and DOM-set targets', () => {
  assert.equal(blankAnchorViolations("el.innerHTML='<a href=\"'+u+'\" target=\"_blank\">x</a>'").length, 1);
  assert.equal(blankAnchorViolations("a.target = '_blank'; a.href = u;").length, 1);
});
test('control: scanner passes correct anchors (any attribute order, merged tokens)', () => {
  assert.equal(blankAnchorViolations('<a rel="noopener noreferrer" target="_blank" href="/">x</a>').length, 0);
  assert.equal(blankAnchorViolations('<a href="/" target="_blank" rel="noopener noreferrer">x</a>').length, 0);
  assert.equal(blankAnchorViolations('<a href="/" target="_self">x</a>').length, 0);
  assert.equal(blankAnchorViolations("a.target='_blank'; a.rel='noopener noreferrer';").length, 0);
});
test('control: sponsored links must be noopener + sponsored and must NOT carry noreferrer', () => {
  const V = 'https://www.vividseats.com/x-tickets/performer/1';
  assert.equal(blankAnchorViolations(`<a href="${V}" target="_blank" rel="noopener sponsored">x</a>`).length, 0);
  assert.equal(blankAnchorViolations(`<a href="${V}" target="_blank" rel="noopener sponsored nofollow">x</a>`).length, 0);
  assert.equal(blankAnchorViolations(`<a href="${V}" target="_blank" rel="noopener noreferrer">x</a>`).length, 1, 'noreferrer on a sponsored host');
  assert.equal(blankAnchorViolations(`<a href="${V}" target="_blank" rel="noopener sponsored noreferrer">x</a>`).length, 1, 'noreferrer kept');
  assert.equal(blankAnchorViolations(`<a href="${V}" target="_blank" rel="noopener">x</a>`).length, 1, 'missing sponsored');
  assert.equal(blankAnchorViolations(`<a href="${V}" target="_blank">x</a>`).length, 1);
});
test('control: every sponsored-class signal is recognised (host, params, amazon tag, existing rel, dynamic carousel href)', () => {
  const bad = (href) => blankAnchorViolations(`<a href="${href}" target="_blank" rel="noopener noreferrer">x</a>`).length;
  for (const href of ['https://www.ticketmaster.com/e/1', 'https://www.illestratedlifestyle.com/products/x', 'https://shop.myshopify.com/p', 'https://example.org/p?ref=abc',
    'https://example.org/p?x=1&utm_source=keepitil', 'https://example.org/?aff=9', 'https://example.org/?affiliate=9', 'https://example.org/?partner=k', 'https://example.org/?pid=3',
    'https://concept47.store?sca_ref=1.abc', 'https://www.amazon.com/dp/B0?tag=tuitea09-20', 'https://freecash.com/r/Tuitea']) assert.equal(bad(href), 1, href + ' is sponsored class');
  assert.equal(blankAnchorViolations('<a href="https://example.org/" target="_blank" rel="noopener noreferrer nofollow">x</a>').length, 1, 'existing nofollow marks it sponsored class');
  assert.equal(blankAnchorViolations("<a href=\"'+p[3]+'\" target=\"_blank\" rel=\"noopener noreferrer'+(p[4]?' sponsored nofollow':'')+'\">").length, 1);
  assert.equal(blankAnchorViolations("<a href=\"'+p[3]+'\" target=\"_blank\" rel=\"noopener sponsored'+(p[4]?' nofollow':'')+'\">").length, 0);
  // not sponsored: plain amazon (no tag), an ordinary article link, and a non-affiliate param
  for (const href of ['https://www.amazon.com/dp/B0', 'https://en.wikipedia.org/wiki/House_music', 'https://example.org/?page=2']) assert.equal(bad(href), 0, href + ' is a normal link');
  assert.equal(blankAnchorViolations('<a href="https://en.wikipedia.org/wiki/X" target="_blank" rel="noopener">x</a>').length, 1, 'a normal link must have noreferrer too');
});
test('control: window.open scanner flags bare and partial calls, passes safe ones', () => {
  assert.equal(windowOpenViolations("window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(t),'_blank');").length, 1);
  assert.equal(windowOpenViolations("window.open(u,'_blank','noopener')").length, 1);
  assert.equal(windowOpenViolations("window.open(f(a,(b)),'_blank')").length, 1);
  assert.equal(windowOpenViolations("window.open(u,'_blank','noopener,noreferrer')").length, 0);
  assert.equal(windowOpenViolations("window.open('https://twitter.com/intent/tweet?text=x','_blank','noopener,noreferrer')").length, 0, 'X share keeps noreferrer');
  assert.equal(windowOpenViolations("window.open('https://www.vividseats.com/x','_blank','noopener,noreferrer')").length, 1, 'affiliate host must not get noreferrer');
  assert.equal(windowOpenViolations("window.open('https://www.vividseats.com/x','_blank','noopener')").length, 0);
  assert.equal(windowOpenViolations("window.openEditProfile()").length, 0);
});

// ---- the real corpus ----
const files = walk('.');
test('corpus: found published pages to scan', () => {
  assert.ok(files.length > 100, 'expected the published site, found ' + files.length);
  assert.ok(files.includes('article/bleu/index.html'));
});
test('every target=_blank anchor follows the rel policy: sponsored = noopener sponsored (no noreferrer), others = noopener noreferrer (outside PENDING)', () => {
  const offenders = {};
  for (const f of files) {
    if (PENDING[f]) continue;
    const v = blankAnchorViolations(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (v.length) offenders[f] = v.length;
  }
  assert.deepEqual(offenders, {});
});
test('every window.open follows the policy (outside PENDING)', () => {
  const offenders = {};
  for (const f of files) {
    if (PENDING[f]) continue;
    const v = windowOpenViolations(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (v.length) offenders[f] = v.length;
  }
  assert.deepEqual(offenders, {});
});
test('every PENDING entry still has a violation (delete it once fixed)', () => {
  for (const f of Object.keys(PENDING)) {
    const p = path.join(ROOT, f);
    assert.ok(fs.existsSync(p), f + ' no longer exists: remove from PENDING');
    const s = fs.readFileSync(p, 'utf8');
    assert.ok(blankAnchorViolations(s).length + windowOpenViolations(s).length > 0, f + ' is clean now: remove from PENDING');
  }
});
