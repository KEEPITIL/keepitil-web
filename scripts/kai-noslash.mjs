#!/usr/bin/env node
// Kai Tarako no-slash pages. GitHub Pages 301-redirects /app/kaitarako to /app/kaitarako/, but it serves
// app/kaitarako.html at /app/kaitarako with a 200 (a foo.html file beats the foo/ directory redirect).
// So the no-slash URLs get their own files: a copy of the directory's index.html with
// <base href="/app/kaitarako/"> as the FIRST child of <head>, so every relative URL in the page
// (./assets, manifest, icons, audio clips, ./privacy.html links) still resolves under /app/kaitarako/.
// The base tag must come before the CSP meta: the CSP says base-uri 'none', and a <base> parsed after it is ignored.
//
// EVERY Kai web deploy that changes app/kaitarako/index.html or app/kaitarako/support/index.html must re-run:
//   node scripts/kai-noslash.mjs           (rewrites the copies)
//   node scripts/kai-noslash.mjs --check   (exit 1 if a copy is stale; assets/js/kai-noslash.test.mjs checks the same)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PAGES = [
  { src: 'app/kaitarako/index.html', out: 'app/kaitarako.html', base: '/app/kaitarako/' },
  { src: 'app/kaitarako/support/index.html', out: 'app/kaitarako/support.html', base: '/app/kaitarako/support/' },
];

export const baseTag = (href) => `\n<base href="${href}" />`;

export function withBase(html, href) {
  const i = html.indexOf('<head>');
  if (i < 0 || html.indexOf('<head>', i + 1) >= 0) throw new Error('expected exactly one bare <head> tag');
  if (/<base\b/i.test(html)) throw new Error('source already has a <base> tag');
  const at = i + '<head>'.length;
  return html.slice(0, at) + baseTag(href) + html.slice(at);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const p of PAGES) {
    const want = withBase(fs.readFileSync(path.join(ROOT, p.src), 'utf8'), p.base);
    const outPath = path.join(ROOT, p.out);
    const have = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    if (have === want) { console.log(`ok     ${p.out}`); continue; }
    if (check) { stale++; console.error(`STALE  ${p.out} (run: node scripts/kai-noslash.mjs)`); continue; }
    fs.writeFileSync(outPath, want);
    console.log(`wrote  ${p.out} <- ${p.src}`);
  }
  if (stale) process.exit(1);
}
