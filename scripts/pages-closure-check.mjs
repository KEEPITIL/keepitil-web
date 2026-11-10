#!/usr/bin/env node
// Link-closure check for the GitHub Pages artifact.
//
//   node scripts/pages-closure-check.mjs --site _site --source .
//
// Fails (exit 1) when:
//   1. a required file (CNAME, .nojekyll, index.html, 404.html, .well-known/apple-app-site-association)
//      is missing from the site;
//   2. a deployed html/css/webmanifest file references a local path that exists in the SOURCE tree
//      but was left out of the site (an exclusion broke a link);
//   3. a deployed js/json/xml/txt file contains a quoted path string that resolves to a file that
//      exists in the source but was left out of the site.
// A reference that does not exist in the source either is a PRE-EXISTING dangling reference: it is
// reported but does not fail the build, so it is never blamed on an exclusion. Without --source,
// every dangling html/css/manifest reference fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk } from './pages-build.mjs';

export const REQUIRED = ['CNAME', '.nojekyll', 'index.html', '404.html', '.well-known/apple-app-site-association'];
const HOSTS = new Set(['keepitil.com', 'www.keepitil.com']);
const SCAN_MAX = 20 * 1024 * 1024;

function stripQH(s) { return s.replace(/[?#].*$/, ''); }

// Resolve a reference found in `fromFile` to candidate site paths, or null if not a local reference.
export function candidates(ref, fromFile, { jsString = false } = {}) {
  let r = ref.trim();
  if (!r || r.startsWith('#') || /^(data|mailto|tel|javascript|blob|sms|webcal|about):/i.test(r)) return null;
  if (r.startsWith('//')) r = 'https:' + r;
  if (/^[a-z][a-z0-9+.-]*:/i.test(r)) {
    let u; try { u = new URL(r); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || !HOSTS.has(u.hostname)) return null;
    r = u.pathname;
  }
  r = stripQH(r);
  try { r = decodeURIComponent(r); } catch { /* keep raw */ }
  if (/[{}$<>\\'"`+()\s]/.test(r)) return null; // template or code fragment, not a path
  const bases = [];
  if (r.startsWith('/')) bases.push(path.posix.normalize(r).replace(/^\/+/, ''));
  else {
    const dir = path.posix.dirname(fromFile);
    bases.push(path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, r)));
    if (jsString) bases.push(path.posix.normalize(r)); // JS strings are often relative to the page or the root
  }
  const out = new Set();
  for (let b of bases) {
    if (b.startsWith('..')) continue;
    if (b === '' || b === '.') b = '';
    const dirLike = b === '' || b.endsWith('/') || r.endsWith('/');
    const clean = b.replace(/\/+$/, '');
    if (dirLike) out.add((clean ? clean + '/' : '') + 'index.html');
    else { out.add(clean); out.add(clean + '.html'); out.add(clean + '/index.html'); }
  }
  return [...out];
}

function htmlRefs(text) {
  const refs = [];
  const attr = /\b(?:href|src|poster|data-src|data-href|data-bg|action|manifest)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = attr.exec(text))) refs.push(m[2] ?? m[3]);
  const srcset = /\b(?:srcset|data-srcset)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  while ((m = srcset.exec(text))) for (const part of (m[2] ?? m[3]).split(',')) { const u = part.trim().split(/\s+/)[0]; if (u) refs.push(u); }
  const meta = /<meta\b[^>]*\b(?:property|name)\s*=\s*["'](?:og:image|og:image:url|og:video|og:audio|twitter:image)["'][^>]*>/gi;
  while ((m = meta.exec(text))) { const c = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(m[0]); if (c) refs.push(c[2] ?? c[3]); }
  return [...refs, ...cssRefs(text)];
}

function cssRefs(text) {
  const refs = [];
  let m;
  const url = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]+))\s*\)/gi;
  while ((m = url.exec(text))) refs.push(m[1] ?? m[2] ?? m[3]);
  const imp = /@import\s+(?:"([^"]*)"|'([^']*)')/gi;
  while ((m = imp.exec(text))) refs.push(m[1] ?? m[2]);
  return refs;
}

function manifestRefs(text) {
  const refs = [];
  try {
    (function walkJson(v) {
      if (Array.isArray(v)) v.forEach(walkJson);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
        if ((k === 'src' || k === 'start_url') && typeof x === 'string') refs.push(x); else walkJson(x);
      }
    })(JSON.parse(text));
  } catch { /* not json */ }
  return refs;
}

const PATHY = /^(?:\/|\.\.?\/)?[A-Za-z0-9_@~%.\-]+(?:\/[A-Za-z0-9_@~%.\-]+)*\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|m4a|mp3|ogg|wav|woff2?|ttf|otf|css|js|mjs|json|html|xml|txt|wasm|glb|gltf|pdf|md|zip|symbols|webmanifest|sql)(?:[?#][^"'`\s]*)?$/i;
const ABSURL = /^https?:\/\/(?:www\.)?keepitil\.com\/[^"'`\s]*$/i;

function stringRefs(text) {
  const refs = new Set();
  const q = /(["'`])((?:(?!\1)[^\n\\]){3,300})\1/g;
  let m;
  while ((m = q.exec(text))) if (PATHY.test(m[2]) || ABSURL.test(m[2])) refs.add(m[2]);
  return [...refs];
}

export function checkClosure({ site, source, required = REQUIRED }) {
  const siteFiles = new Set(walk(site));
  const srcFiles = source ? new Set(walk(source, [path.relative(source, site).split(path.sep).join('/')])) : null;
  const result = { required: [], violations: [], preexisting: [], scanned: 0 };
  for (const f of required) if (!siteFiles.has(f)) result.required.push(f);

  const classify = (file, ref, cands, kind) => {
    if (!cands) return;
    if (cands.some((c) => siteFiles.has(c))) return;
    const inSource = srcFiles && cands.filter((c) => srcFiles.has(c));
    if (inSource && inSource.length) result.violations.push({ file, ref, target: inSource[0], kind });
    else if (kind !== 'js-string') result.preexisting.push({ file, ref, kind });
  };

  for (const file of siteFiles) {
    const ext = path.posix.extname(file).toLowerCase();
    const isHtml = ext === '.html' || ext === '.htm';
    const isCss = ext === '.css';
    const isManifest = ext === '.webmanifest' || file.endsWith('manifest.json');
    const isScan = ['.js', '.mjs', '.json', '.xml', '.txt'].includes(ext) || file === '_headers';
    if (!(isHtml || isCss || isManifest || isScan)) continue;
    const abs = path.join(site, file);
    if (fs.statSync(abs).size > SCAN_MAX) continue;
    const text = fs.readFileSync(abs, 'utf8');
    result.scanned++;
    if (isHtml) {
      // Inline <script> bodies are code: scan them as JS strings, everything else as markup.
      const scripts = [];
      const markup = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, body) => { scripts.push(body); return ''; });
      for (const r of htmlRefs(markup)) classify(file, r, candidates(r, file), 'html');
      for (const body of scripts) for (const r of stringRefs(body)) classify(file, r, candidates(r, file, { jsString: true }), 'js-string');
    }
    else if (isCss) for (const r of cssRefs(text)) classify(file, r, candidates(r, file), 'css');
    else if (isManifest) for (const r of manifestRefs(text)) classify(file, r, candidates(r, file), 'manifest');
    if (file.endsWith('sitemap.xml') || /^sitemap.*\.xml$/.test(path.posix.basename(file))) {
      for (const m of text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) classify(file, m[1], candidates(m[1], file), 'sitemap');
    }
    if (isScan && !(isCss || isHtml)) for (const r of stringRefs(text)) classify(file, r, candidates(r, file, { jsString: true }), 'js-string');
  }
  return result;
}

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const site = path.resolve(arg('site', '_site'));
  const sourceArg = arg('source', null);
  const res = checkClosure({ site, source: sourceArg ? path.resolve(sourceArg) : null });
  console.log(`closure-check: scanned ${res.scanned} files in ${site}`);
  console.log(`closure-check: ${res.preexisting.length} pre-existing dangling reference(s) (not in source either; not an exclusion effect)`);
  if (process.argv.includes('--list-preexisting')) for (const p of res.preexisting) console.log(`  pre-existing [${p.kind}] ${p.file} -> ${p.ref}`);
  let bad = false;
  if (res.required.length) { bad = true; console.error('closure-check: FAIL, required file(s) missing from site: ' + res.required.join(', ')); }
  if (!sourceArg && res.preexisting.length) { bad = true; console.error('closure-check: FAIL (no --source given, every dangling reference counts)'); }
  for (const v of res.violations) { bad = true; console.error(`closure-check: FAIL [${v.kind}] ${v.file} references "${v.ref}" -> ${v.target}, which exists in the source but is NOT in the site`); }
  if (bad) process.exit(1);
  console.log(`closure-check: OK, 0 references from deployed files point at excluded files`);
}
