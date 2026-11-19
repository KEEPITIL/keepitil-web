// Kai Tarako 1.0 web drop-in (games/kai/), DRAFT, never merged: the folder is the kai-tarako web build of SOURCE_SHA,
// made with KT_BASE=/games/kai/ (kai-tarako#100), copied as-is. This keeps the copy honest in keepitil-web's own CI:
// every page noindex,nofollow; every file URL under /games/kai/; the manifest and the worker live there; nothing calls out.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'games', 'kai');
const BASE = '/games/kai/';
export const SOURCE_SHA = '4b9f2ccb55c2291696616ac66d7cf010a6cbe2c4';   // KEEPITIL/kai-tarako, KT_BASE=/games/kai/ npm run build
const walk = (d) => fs.readdirSync(d).flatMap((f) => (fs.statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
const rel = (f) => path.relative(DIR, f).split(path.sep).join('/');
const TEXT = /\.(html|js|mjs|css|webmanifest|json|svg|txt)$/;

// a root-absolute URL that names a file of this build must sit under BASE (the same rule as kai-tarako's base-check)
export function outsideBase(files) {
  const tops = new Set(Object.keys(files).map((f) => f.split('/')[0]));
  const bad = [];
  for (const [name, text] of Object.entries(files)) {
    if (!/\.(html|css|js|mjs|webmanifest)$/.test(name)) continue;
    const refs = new Set();
    for (const m of text.matchAll(/\b(?:src|href|content)\s*=\s*["']([^"']+)["']/g)) refs.add(m[1]);
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) refs.add(m[1]);
    for (const m of text.matchAll(/["'`](\/[^"'`\s]*)["'`]/g)) refs.add(m[1]);
    for (const r of refs) {
      if (!r.startsWith('/') || r.startsWith('//') || r.startsWith(BASE)) continue;
      if (r.startsWith('/assets/') || tops.has(r.slice(1).split(/[/?#]/)[0])) bad.push(`${name}: ${r}`);
    }
  }
  return bad;
}

test('games/kai/ exists and is the Kai Tarako web build (index.html, sw.js, manifest at its top)', () => {
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'privacy.html']) assert.ok(fs.existsSync(path.join(DIR, f)), f);
  assert.match(SOURCE_SHA, /^[0-9a-f]{40}$/);
});

test('every page in games/kai/ is noindex,nofollow', () => {
  const pages = walk(DIR).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 3, 'index, privacy, licenses');
  for (const f of pages) assert.match(fs.readFileSync(f, 'utf8'), /<meta name="robots" content="noindex, nofollow"/, rel(f));
});

test('every file URL in games/kai/ is under /games/kai/ (NEGATIVE CONTROL: a planted /assets/x.js is caught)', () => {
  const files = {};
  for (const f of walk(DIR)) files[rel(f)] = TEXT.test(f) ? fs.readFileSync(f, 'utf8') : '';
  assert.deepEqual(outsideBase(files), []);
  const planted = { ...files, 'index.html': files['index.html'] + '<script src="/assets/x.js"></script>' };
  assert.deepEqual(outsideBase(planted), ['index.html: /assets/x.js']);
});

test('the manifest start_url / scope / id resolve to /games/kai/', () => {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.webmanifest'), 'utf8'));
  const at = new URL(BASE + 'manifest.webmanifest', 'file:///');
  for (const k of ['start_url', 'scope', 'id']) assert.equal(new URL(m[k], at).pathname, BASE, k);
});

test('the built app registers its worker under /games/kai/ (the base is in the bundle, the worker precaches only relative paths)', () => {
  const js = walk(path.join(DIR, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.ok(js.includes(JSON.stringify(BASE)), 'KT_BASE in the bundle');
  const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
  const pre = JSON.parse(/const PRECACHE = (\[[^\]]*\]);/.exec(sw)[1]);
  assert.ok(pre.length > 10 && pre.every((p) => p.startsWith('./')), 'precache entries are relative to /games/kai/');
});

test('nothing in games/kai/ names an outside URL beyond the allowed identifiers (the kids-guard release scan, re-run here)', () => {
  const ALLOWED = /^https?:\/\/(www\.w3\.org\/|react\.dev\/errors\/|capacitorjs\.com\/?$|www\.sil\.org\/?$|scripts\.sil\.org\/OFL$)/;
  const out = [];
  for (const f of walk(DIR).filter((p) => TEXT.test(p))) for (const u of fs.readFileSync(f, 'utf8').match(/https?:\/\/[^\s'"`)<>\\;]+/g) ?? []) if (!ALLOWED.test(u)) out.push(`${rel(f)}: ${u}`);
  assert.deepEqual(out, []);
});
