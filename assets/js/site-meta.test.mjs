// Site meta: every indexable page carries html lang, og:type, og:image and twitter:card, and every
// og:image / twitter:image on keepitil.com points at a file that ships (no new share-image 404s).
// Out of scope: games/*/play (game screens), app/ and apps/ (app builds), noindex pages, and files the
// Pages build excludes (.github/pages-exclude.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const OUT_OF_SCOPE = /^(app|apps)\/|^games\/[^/]+\/play\//;
const excluded = readFileSync('.github/pages-exclude.txt', 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.includes('*'));
const isExcluded = (f) => excluded.some((e) => (e.endsWith('/') ? f.startsWith(e) : f === e));

const pages = execSync('git ls-files "*.html"', { encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((f) => !OUT_OF_SCOPE.test(f) && !isExcluded(f))
  .map((f) => ({ f, html: readFileSync(f, 'utf8') }))
  .filter(({ html }) => !/<meta\s+name=["']robots["'][^>]*noindex/i.test(html))
  .filter(({ html }) => /<head[\s>]/i.test(html)); // fragments and redirects without a head are not pages

const has = (html, re) => re.test(html);
const CHECKS = {
  'html lang': /<html[^>]*\slang=["'][a-z]/i,
  'og:type': /<meta[^>]+property=["']og:type["'][^>]+content=["'][^"']+/i,
  'og:image': /<meta[^>]+property=["']og:image["'][^>]+content=["'][^"']+/i,
  'twitter:card': /<meta[^>]+name=["']twitter:card["'][^>]+content=["'][^"']+/i,
};

test('the scan sees the indexable site pages', () => {
  assert.ok(pages.length > 30, `only ${pages.length} pages`);
  assert.ok(pages.some((p) => p.f === 'index.html'));
});

test('every indexable page has html lang, og:type, og:image and twitter:card', () => {
  const missing = [];
  for (const { f, html } of pages)
    for (const [name, re] of Object.entries(CHECKS)) if (!has(html, re)) missing.push(`${f}: ${name}`);
  assert.deepEqual(missing, []);
});

test('every keepitil.com share image points at a file that exists', () => {
  const broken = [];
  for (const { f, html } of pages) {
    for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi)) {
      const u = m[1];
      const local = u.startsWith('https://keepitil.com/') ? u.slice('https://keepitil.com/'.length)
        : u.startsWith('/') ? u.slice(1) : null;
      if (local === null) continue; // third-party image, not ours to check statically
      const path = decodeURIComponent(local.split(/[?#]/)[0]);
      if (!existsSync(path) || isExcluded(path)) broken.push(`${f}: ${u}`);
    }
  }
  assert.deepEqual(broken, []);
});
