// Kai Tarako web mirror (app/kaitarako/): every relative file the page or its built JS asks for must exist in the
// mirror. A sync that copies a new build but forgets a file (licenses.html, a mascot image, a hashed asset) would
// otherwise 404 only when a parent opens that screen. Run: node --test assets/js/kaitarako-mirror-links.test.mjs
// KT_MIRROR_ROOT overrides the mirror directory (used by the negative control below). Dependency-free.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MIRROR = path.join(REPO, 'app', 'kaitarako');

// Relative references a browser would fetch from the mirror. Absolute URLs, protocol-relative and root-absolute
// paths, data:/blob:/mailto:/tel:, fragments, and source-tree names that start with "../" (Vite glob keys) are not
// mirror files and are ignored.
const isMirrorRef = (r) => !!r && !/^([a-z][a-z0-9+.-]*:|\/|#|\.\.\/)/i.test(r) && !/[\s{}$<>]/.test(r);
const clean = (r) => r.replace(/[?#].*$/, '').replace(/^\.\//, '');

// index.html: href / src / content attributes (icons, manifest, scripts, styles, images).
function htmlRefs(html) {
  const out = new Set();
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) if (isMirrorRef(m[1])) out.add(clean(m[1]));
  return out;
}

// Built JS: string literals that look like files in the mirror (./x, assets/, brand/, mascot/, *.html, *.json,
// *.webmanifest, images). A literal used as an object KEY (`"./packs/x.json":`) is a bundled-module name, not a
// fetch, so it is skipped.
function jsRefs(js) {
  const out = new Set();
  const re = /(["'`])((?:\.\/)?(?:assets|brand|mascot|packs|support)\/[^"'`\s]+|\.\/[^"'`\s]+|[\w-]+\.(?:html|webmanifest))\1(\s*:)?/g;
  for (const m of js.matchAll(re)) {
    if (m[3]) continue;                                   // object key: a bundled module, not a request
    const r = m[2];
    if (!isMirrorRef(r)) continue;
    if (!/\.[a-z0-9]{2,12}$/i.test(clean(r)) && !r.endsWith('/')) continue;   // must name a file (or a folder page)
    out.add(clean(r));
  }
  return out;
}

// sw.js precache list and manifest icons: the offline install fails as a whole if one is missing.
function swRefs(sw) {
  const m = sw.match(/PRECACHE\s*=\s*(\[[^\]]*\])/);
  return new Set(m ? JSON.parse(m[1]).map(clean).filter((r) => r && isMirrorRef(r)) : []);   // './' is the page itself
}
function manifestRefs(text) {
  try { return new Set((JSON.parse(text).icons || []).map((i) => clean(i.src || '')).filter(isMirrorRef)); } catch { return new Set(); }
}

// Files the build names ON PURPOSE without shipping them. kai-tarako's release test forbids any mascot/*.webp in dist
// ('no photoreal mascot files', src/release.e2e.test.ts); the app falls back to the drawn badge when they are absent
// (kai-tarako #22). So a missing mascot/*.webp is expected; anything else missing is a broken sync.
export const INTENTIONALLY_ABSENT = [/^mascot\/[^/]+\.webp$/i];

export function missingInMirror(root) {
  const need = new Map();   // ref -> where it was found
  const add = (refs, from) => { for (const r of refs) if (!need.has(r)) need.set(r, from); };
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  add(htmlRefs(read('index.html')), 'index.html');
  const assetDir = path.join(root, 'assets');
  for (const f of fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : []) {
    if (f.endsWith('.js')) add(jsRefs(read(path.join('assets', f))), `assets/${f}`);
  }
  if (fs.existsSync(path.join(root, 'sw.js'))) add(swRefs(read('sw.js')), 'sw.js');
  if (fs.existsSync(path.join(root, 'manifest.webmanifest'))) add(manifestRefs(read('manifest.webmanifest')), 'manifest.webmanifest');
  const missing = [];
  for (const [r, from] of need) {
    const p = path.join(root, ...r.split('/').filter(Boolean));
    const ok = r === '' || (r.endsWith('/') ? fs.existsSync(path.join(p, 'index.html')) : fs.existsSync(p) && fs.statSync(p).isFile());
    if (!ok && !INTENTIONALLY_ABSENT.some((re) => re.test(r))) missing.push(`${r} (asked for by ${from})`);
  }
  return { checked: need.size, missing: missing.sort() };
}

const ROOT = process.env.KT_MIRROR_ROOT || DEFAULT_MIRROR;

test('every relative file the Kai Tarako mirror page and its built JS ask for is in the mirror', { skip: !fs.existsSync(path.join(ROOT, 'index.html')) && 'no mirror' }, () => {
  const { checked, missing } = missingInMirror(ROOT);
  assert.ok(checked > 5, `found ${checked} references: the scan itself is broken`);
  assert.deepEqual(missing, [], `missing in ${path.relative(REPO, ROOT) || ROOT}:\n  ${missing.join('\n  ')}`);
});

test('the scan finds the kinds of links a build uses (html attrs, ./x.html, brand/, mascot/, assets/, sw precache)', () => {
  assert.deepEqual([...htmlRefs('<link href="./manifest.webmanifest"><script src="./assets/i.js"></script><a href="https://x.y/z">x</a>')].sort(),
    ['assets/i.js', 'manifest.webmanifest']);
  const js = `a={href:"./licenses.html"};b="brand/logo.png";c={"./packs/x.json":k};d="mascot/a.webp";e="../../art/b.svg";f="youtube.html";g="https://x/y.html"`;
  assert.deepEqual([...jsRefs(js)].sort(), ['brand/logo.png', 'licenses.html', 'mascot/a.webp', 'youtube.html']);
  assert.deepEqual([...swRefs('const PRECACHE = ["./","./index.html","./assets/a.js"];')].sort(), ['assets/a.js', 'index.html']);
});

test('NEGATIVE CONTROL: a mirror whose JS links licenses.html, without the file, fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-mirror-'));
  try {
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<script type="module" src="./assets/index-x.js"></script>');
    fs.writeFileSync(path.join(dir, 'assets', 'index-x.js'), 'x={href:"./licenses.html"};y={href:"./privacy.html"};z="brand/logo.png"');
    fs.writeFileSync(path.join(dir, 'privacy.html'), '<p>policy</p>');
    fs.mkdirSync(path.join(dir, 'brand'));
    fs.writeFileSync(path.join(dir, 'brand', 'logo.png'), '');
    assert.deepEqual(missingInMirror(dir).missing, ['licenses.html (asked for by assets/index-x.js)']);
    fs.writeFileSync(path.join(dir, 'licenses.html'), '<p>licenses</p>');
    assert.deepEqual(missingInMirror(dir).missing, [], 'with the file present the same mirror passes');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('NEGATIVE CONTROL: the photoreal allowance is narrow (a missing mascot .svg or a hashed asset still fails)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-mirror-'));
  try {
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<script type="module" src="./assets/index-x.js"></script><link href="./assets/index-y.css">');
    fs.writeFileSync(path.join(dir, 'assets', 'index-x.js'), 'a="mascot/badge-cheer.webp";b="mascot/kai-hero.svg"');
    assert.deepEqual(missingInMirror(dir).missing,
      ['assets/index-y.css (asked for by index.html)', 'mascot/kai-hero.svg (asked for by assets/index-x.js)']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
