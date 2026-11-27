// Articles must not ship dead same-site references or placeholder links.
// QA 2026-11-22 (live crawl): /article/age-of-war-play-free/ pointed its image and og:image at
// /games/ageofwars/app-icon-512.png (the game folder was removed), and
// /article/wifi-remote-control-the-room/ had href="APP_STORE_URL_PENDING" plus a visible
// "Draft note for review" paragraph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARTICLES = path.join(ROOT, 'article');

function pages(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...pages(p));
    else if (e.name === 'index.html') out.push(p);
  }
  return out;
}

// Same rule GitHub Pages applies: a file, a folder with index.html, or a .html sibling.
export function resolves(urlPath) {
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  const abs = path.join(ROOT, clean);
  if (!abs.startsWith(ROOT)) return false;
  if (clean.endsWith('/')) return fs.existsSync(path.join(abs, 'index.html'));
  return (fs.existsSync(abs) && fs.statSync(abs).isFile())
    || fs.existsSync(path.join(abs, 'index.html'))
    || fs.existsSync(abs + '.html');
}

// Static attribute values only: strip <script> bodies so JS string building is not read as markup.
export function refs(html) {
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const out = [];
  for (const m of body.matchAll(/\s(href|src|content)\s*=\s*"([^"]*)"/gi)) out.push({ attr: m[1].toLowerCase(), val: m[2] });
  return out;
}

const SELF = /^https:\/\/keepitil\.com(\/[^"]*)$/;

export function problems(html) {
  const bad = [];
  for (const { attr, val } of refs(html)) {
    let p = null;
    if (attr !== 'content' && val.startsWith('/') && !val.startsWith('//')) p = val;
    else if (SELF.test(val) && /\.(png|jpe?g|webp|gif|svg)$/i.test(val)) p = val.match(SELF)[1]; // og:image / twitter:image
    if (p && !resolves(p)) bad.push(`${attr}=${val} does not exist`);
    if (attr === 'href' && /^[A-Z][A-Z0-9_]{5,}$/.test(val)) bad.push(`placeholder href=${val}`);
  }
  if (/Draft note for review/i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) bad.push('visible "Draft note for review" text');
  return bad;
}

test('negative controls: the checks catch each defect class', () => {
  assert.ok(problems('<img src="/games/ageofwars/app-icon-512.png">').length, 'missing file');
  assert.ok(problems('<meta content="https://keepitil.com/games/ageofwars/app-icon-512.png">').length, 'missing og:image');
  assert.ok(problems('<a href="APP_STORE_URL_PENDING">x</a>').length, 'placeholder href');
  assert.ok(problems('<p><em>Draft note for review: fix me</em></p>').length, 'visible draft note');
  assert.deepEqual(problems('<!-- Draft note for review --><a href="/games/">x</a><img src="/keepitil-og.png">'), [], 'clean markup passes');
});

test('every served article has resolvable same-site refs and no placeholders', () => {
  const list = pages(ARTICLES);
  assert.ok(list.length >= 10, 'article sweep found too few pages: ' + list.length);
  const failures = [];
  for (const f of list) for (const b of problems(fs.readFileSync(f, 'utf8'))) failures.push(path.relative(ROOT, f) + ': ' + b);
  assert.deepEqual(failures, []);
});
