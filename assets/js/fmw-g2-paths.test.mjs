// Find My Weed launch blocker G-2: /findmyweed moves to /app/findmyweed/.
//   - the old entry points (findmyweed.html serves /findmyweed and /findmyweed.html; findmyweed/index.html serves
//     /findmyweed/) are noindex redirect stubs to /app/findmyweed/;
//   - the old marketing page lives at app/findmyweed/for-business/index.html with its title and a new canonical;
//   - nothing deployed links to /findmyweed any more (the /findmyweed-join, -directory, -explore, -sample pages are
//     separate files and stay);
//   - sitemap.xml does not list /findmyweed.
// The Cloudflare 301 + X-Robots-Tag rules are a proposal only: docs/cloudflare/fmw-g2-rules.md.
// Run: node --test assets/js/fmw-g2-paths.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const TARGET = '/app/findmyweed/';
const OLD_TITLE = 'FindMyWeed — Cannabis Marketing by KEEPITIL';
const STUBS = ['findmyweed.html', 'findmyweed/index.html'];
const BUSINESS = 'app/findmyweed/for-business/index.html';

// ---- checkers (pure, so the negative controls exercise the exact same code) ----

function attr(tag, name) {
  const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i'));
  return m ? m[1] : null;
}
function tags(html, re) { return [...html.matchAll(re)].map((m) => m[0]); }

/** Problems with a redirect stub, [] when it is good. */
export function stubProblems(html) {
  const p = [];
  const refresh = tags(html, /<meta\b[^>]*http-equiv\s*=\s*"refresh"[^>]*>/gi);
  if (refresh.length !== 1) p.push('expected exactly one meta refresh, found ' + refresh.length);
  else {
    const c = (attr(refresh[0], 'content') || '').replace(/\s+/g, '');
    if (c !== '0;url=' + TARGET) p.push('meta refresh is "' + c + '", expected "0;url=' + TARGET + '"');
  }
  const canon = tags(html, /<link\b[^>]*rel\s*=\s*"canonical"[^>]*>/gi);
  if (canon.length !== 1 || attr(canon[0], 'href') !== 'https://keepitil.com' + TARGET) p.push('canonical must be https://keepitil.com' + TARGET);
  const robots = tags(html, /<meta\b[^>]*name\s*=\s*"robots"[^>]*>/gi);
  if (robots.length !== 1 || !/\bnoindex\b/i.test(attr(robots[0], 'content') || '')) p.push('missing robots noindex');
  const js = html.match(/location\.replace\(\s*"([^"]*)"/);
  if (js && js[1] !== TARGET) p.push('location.replace goes to ' + js[1]);
  return p;
}

/** Problems with the moved business page, [] when it is good. */
export function businessProblems(html) {
  const p = [];
  const t = html.match(/<title>([^<]*)<\/title>/i);
  if (!t || t[1].trim() !== OLD_TITLE) p.push('title is not the old page title');
  const canon = tags(html, /<link\b[^>]*rel\s*=\s*"canonical"[^>]*>/gi);
  if (canon.length !== 1 || attr(canon[0], 'href') !== 'https://keepitil.com/app/findmyweed/for-business/') p.push('canonical must be the for-business URL');
  if (/<meta\b[^>]*http-equiv\s*=\s*"refresh"/i.test(html)) p.push('business page must not redirect');
  // Sentinel M201-1: the moved page stays out of search while Find My Weed is pre-launch.
  const robots = tags(html, /<meta\b[^>]*name\s*=\s*"robots"[^>]*>/gi);
  if (robots.length !== 1 || !/\bnoindex\b/i.test(attr(robots[0], 'content') || '') || !/\bnofollow\b/i.test(attr(robots[0], 'content') || '')) p.push('business page must be robots noindex,nofollow');
  // The page moved two folders down: a relative href/src would now point somewhere else.
  for (const m of html.matchAll(/\b(?:href|src|action)\s*=\s*"([^"]*)"/gi)) {
    const r = m[1];
    if (!/^(https?:|mailto:|tel:|data:|#|\/)/i.test(r)) p.push('relative reference ' + r);
  }
  // base-uri 'none' in a CSP meta blocks a <base> that comes after it.
  const base = html.search(/<base\b/i), csp = html.search(/<meta\b[^>]*http-equiv\s*=\s*"Content-Security-Policy"/i);
  if (base >= 0 && csp >= 0 && base > csp) p.push('<base> must come before the CSP meta');
  return p;
}

/** Every quoted reference to the old /findmyweed path (with or without host, slash, .html, query). */
const OLD_LINK = /["'(=]\s*((?:https?:)?(?:\/\/(?:www\.)?keepitil\.com)?\/findmyweed(?:\.html)?(?:[/?#][^"'()\s]*)?)(?=["')\s>])/gi;
export function oldLinks(text) { return [...text.matchAll(OLD_LINK)].map((m) => m[1]); }

const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'tests', 'scripts', 'db', 'supabase', '.github']);
const EXT = /\.(html?|m?js|css|xml|json|webmanifest|txt)$/i;
function* deployedText(dir = ROOT, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* deployedText(path.join(dir, e.name), r); continue; }
    if (!EXT.test(e.name) || /\.test\.(m?js|cjs)$/.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (fs.statSync(full).size > 20 * 1024 * 1024) continue;
    yield [r, fs.readFileSync(full, 'utf8')];
  }
}

// ---- the repo ----

for (const f of STUBS) {
  test(f + ' is a noindex redirect stub to ' + TARGET, () => {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' is missing');
    assert.deepEqual(stubProblems(read(f)), []);
  });
}

test('for-business exists with the old page title and its own canonical', () => {
  assert.ok(fs.existsSync(path.join(ROOT, BUSINESS)), BUSINESS + ' is missing');
  assert.deepEqual(businessProblems(read(BUSINESS)), []);
});

test('M201-1: for-business is noindex,nofollow (and the checker rejects it without)', () => {
  const html = read(BUSINESS);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  // NEGATIVE CONTROLS: removed, indexable, and noindex without nofollow are each refused
  const has = (h) => businessProblems(h).some((x) => /noindex,nofollow/.test(x));
  assert.ok(has(html.replace(/<meta name="robots"[^>]*>\n?/, '')), 'missing robots meta is caught');
  assert.ok(has(html.replace('content="noindex,nofollow"', 'content="index,follow"')), 'index,follow is caught');
  assert.ok(has(html.replace('content="noindex,nofollow"', 'content="noindex"')), 'noindex alone is caught');
  assert.equal(has(html), false, 'CONTROL: the real page passes');
});

test('no deployed file links to /findmyweed', () => {
  const hits = [];
  let n = 0;
  for (const [rel, text] of deployedText()) { n++; for (const l of oldLinks(text)) hits.push(rel + ': ' + l); }
  assert.ok(n > 100, 'scanned only ' + n + ' files: the walk is broken');
  assert.deepEqual(hits, []);
});

test('sitemap.xml does not list /findmyweed', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0, 'sitemap has no <loc>: parse broken');
  assert.deepEqual(locs.filter((l) => /\/findmyweed(?:\.html)?\/?$/.test(l) || /\/findmyweed\//.test(l)), []);
});

// ---- negative controls: each checker must FAIL on a known-bad input ----

test('negative control: link scan catches every old form and spares the new ones', () => {
  const bad = ['<a href="/findmyweed">', '<a href="/findmyweed/">', '<a href="https://keepitil.com/findmyweed">',
    '<a href="https://www.keepitil.com/findmyweed/listing.html?id=1">', "fetch('/findmyweed.html')", '<a href="//keepitil.com/findmyweed#x">'];
  for (const b of bad) assert.equal(oldLinks(b).length, 1, 'missed: ' + b);
  const good = ['<a href="/app/findmyweed/">', '<a href="https://keepitil.com/app/findmyweed/for-business/">',
    '<a href="https://keepitil.com/findmyweed-join">', '<a href="/findmyweed-directory">', '<a href="https://example.com/findmyweed">'];
  for (const g of good) assert.deepEqual(oldLinks(g), [], 'false positive: ' + g);
});

test('negative control: stub checker rejects a stub without noindex, a wrong target, a delay, a wrong canonical', () => {
  const good = read(STUBS[0]);
  assert.deepEqual(stubProblems(good), []);
  assert.notDeepEqual(stubProblems(good.replace(/<meta name="robots"[^>]*>/, '')), []);
  assert.notDeepEqual(stubProblems(good.replace('0;url=/app/findmyweed/', '0;url=/findmyweed-join')), []);
  assert.notDeepEqual(stubProblems(good.replace('0;url=', '5;url=')), []);
  assert.notDeepEqual(stubProblems(good.replace('https://keepitil.com/app/findmyweed/"', 'https://keepitil.com/findmyweed"')), []);
  assert.notDeepEqual(stubProblems(good.replace('location.replace("/app/findmyweed/"', 'location.replace("/"')), []);
});

test('negative control: business checker rejects a wrong title, a relative link, a missing canonical, base after CSP', () => {
  const good = read(BUSINESS);
  assert.notDeepEqual(businessProblems(good.replace(OLD_TITLE, 'Something else')), []);
  assert.notDeepEqual(businessProblems(good.replace('</body>', '<img src="keepitil-mark.png"></body>')), []);
  assert.notDeepEqual(businessProblems(good.replace(/<link rel="canonical"[^>]*>/, '')), []);
  assert.notDeepEqual(businessProblems(good.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="base-uri \'none\'"><base href="/">')), []);
  assert.deepEqual(businessProblems(good.replace('<head>', '<head><base href="/"><meta http-equiv="Content-Security-Policy" content="base-uri \'none\'">')), []);
});
