// Kai Tarako 1.0 web drop-in (games/kai/), DRAFT, never merged: the folder is the kai-tarako web build of SOURCE_SHA,
// made with the RELATIVE "./" base (KT_BASE unset; Grok 08:23, option b), copied as-is from DIST_SHA. This keeps the copy
// honest in keepitil-web's own CI: every page noindex,nofollow; every file URL relative and resolving to a file under
// /games/kai/ (never root-absolute); the manifest and the worker scope resolve to /games/kai/; nothing calls out.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'games', 'kai');
const BASE = '/games/kai/';
const AT = (name) => new URL(BASE + name, 'file:///');   // where a file of the folder is served (path only; no network)
export const SOURCE_SHA = 'b24198b8fc4ea083bc74070ee9daee8d91303937';   // KEEPITIL/kai-tarako#100: npm run build, KT_BASE unset
export const DIST_SHA = '64e30ce521c347473e941e064fcdc1445459bb49';     // kai-tarako kt/web-dist-b24198b8: adds only web-dist/ on SOURCE_SHA
const walk = (d) => fs.readdirSync(d).flatMap((f) => (fs.statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
const rel = (f) => path.relative(DIR, f).split(path.sep).join('/');
const TEXT = /\.(html|js|mjs|css|webmanifest|json|svg|txt)$/;
const SKIP = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;   // other schemes (https:, data:, mailto:), fragments, protocol-relative: not file URLs

// Every file URL of the build: in HTML src / href and CSS url() it must be RELATIVE and resolve to an existing file under
// BASE; anywhere (HTML, CSS, JS, manifest) a ROOT-ABSOLUTE URL that names a file of this build is refused outright.
export function badUrls(files) {
  const tops = new Set(Object.keys(files).map((f) => f.split('/')[0]));
  const bad = [];
  for (const [name, text] of Object.entries(files)) {
    if (!/\.(html|css|js|mjs|webmanifest)$/.test(name)) continue;
    const attr = new Set();
    if (/\.html$/.test(name)) for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) attr.add(m[1]);
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) attr.add(m[1]);
    for (const r of attr) {
      if (SKIP.test(r)) continue;
      if (r.startsWith('/')) { bad.push(`${name}: root-absolute ${r}`); continue; }
      const p = decodeURIComponent(new URL(r, AT(name)).pathname);
      if (!p.startsWith(BASE)) bad.push(`${name}: ${r} leaves ${BASE}`);
      else if (!(p.slice(BASE.length) in files) && p !== BASE) bad.push(`${name}: ${r} names no file of the build`);
    }
    const quoted = new Set();
    for (const m of text.matchAll(/["'`](\/[^"'`\s]*)["'`]/g)) quoted.add(m[1]);
    for (const r of quoted) if (!r.startsWith('//') && !attr.has(r) && (r.startsWith('/assets/') || tops.has(r.slice(1).split(/[/?#]/)[0]))) bad.push(`${name}: root-absolute ${r}`);
  }
  return bad;
}

const files = {};
for (const f of walk(DIR)) files[rel(f)] = TEXT.test(f) ? fs.readFileSync(f, 'utf8') : '';

test('games/kai/ exists and is the Kai Tarako web build (index.html, sw.js, manifest at its top)', () => {
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'privacy.html', 'licenses.html']) assert.ok(f in files, f);
  assert.match(SOURCE_SHA, /^[0-9a-f]{40}$/); assert.match(DIST_SHA, /^[0-9a-f]{40}$/);
});

test('every page in games/kai/ is noindex,nofollow', () => {
  const pages = Object.keys(files).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 3, 'index, privacy, licenses');
  for (const f of pages) assert.match(files[f], /<meta name="robots" content="noindex, nofollow"/, f);
});

test('every file URL is relative and resolves to a file under /games/kai/ (NEGATIVE CONTROLS: a planted absolute URL, an escape, a dangling path)', () => {
  assert.deepEqual(badUrls(files), []);
  const refs = [...files['index.html'].matchAll(/\b(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.some((r) => r.startsWith('./assets/index-')), 'the app script is loaded relatively');
  const plant = (html) => badUrls({ ...files, 'index.html': files['index.html'] + html });
  assert.deepEqual(plant('<script src="/assets/x.js"></script>'), ['index.html: root-absolute /assets/x.js']);
  assert.deepEqual(plant('<script src="../kmob/app.js"></script>'), ['index.html: ../kmob/app.js leaves /games/kai/']);
  assert.deepEqual(plant('<img src="./brand/nope.png">'), ['index.html: ./brand/nope.png names no file of the build']);
  assert.deepEqual(badUrls({ ...files, 'assets/z.js': 'const u="/brand/logo.png";' }), ['assets/z.js: root-absolute /brand/logo.png']);
});

test('the manifest start_url / scope / id resolve to /games/kai/', () => {
  const m = JSON.parse(files['manifest.webmanifest']);
  for (const k of ['start_url', 'scope', 'id']) assert.equal(new URL(m[k], AT('manifest.webmanifest')).pathname, BASE, k);
  for (const i of m.icons) assert.ok(new URL(i.src, AT('manifest.webmanifest')).pathname.slice(BASE.length) in files, i.src);
});

test('the worker is /games/kai/sw.js with scope /games/kai/, precaches only relative paths, and keeps its own per-scope cache', () => {
  // the app registers ./sw.js with the relative base './' (kai-tarako src/lib/swRegister.ts), from the folder's pages
  for (const page of ['', 'index.html']) {
    const scope = new URL('./', AT(page)).pathname;
    assert.equal(scope, BASE, page || '(folder)');
    assert.equal(new URL('sw.js', AT(page)).pathname, BASE + 'sw.js');
  }
  const sw = files['sw.js'];
  const pre = JSON.parse(/const PRECACHE = (\[[^\]]*\]);/.exec(sw)[1]);
  assert.ok(pre.length > 10 && pre.every((p) => p.startsWith('./')), 'precache entries are relative');
  for (const p of pre) assert.ok(p === './' || p.slice(2) in files, 'precache names a file: ' + p);
  assert.match(sw, /const CACHE = 'kai-tarako-[0-9a-f]{12}';/);
  assert.ok(sw.includes("const PREFIX = 'kai-tarako-' + scopeTag(self.registration.scope) + '-';"), 'one cache per scope (never deletes /app/kaitarako/\'s)');
  assert.ok(!/["'`]\/games\/kai\//.test(Object.entries(files).filter(([n]) => n.endsWith('.js')).map(([, t]) => t).join('\n')), 'no absolute base baked into the scripts');
});

test('nothing in games/kai/ names an outside URL beyond the allowed identifiers (the kids-guard release scan, re-run here)', () => {
  const ALLOWED = /^https?:\/\/(www\.w3\.org\/|react\.dev\/errors\/|capacitorjs\.com\/?$|www\.sil\.org\/?$|scripts\.sil\.org\/OFL$)/;
  const out = [];
  for (const [f, t] of Object.entries(files)) for (const u of t.match(/https?:\/\/[^\s'"`)<>\\;]+/g) ?? []) if (!ALLOWED.test(u)) out.push(`${f}: ${u}`);
  assert.deepEqual(out, []);
});
