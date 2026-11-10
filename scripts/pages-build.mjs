#!/usr/bin/env node
// Stage the GitHub Pages artifact: copy the repo tree into _site, minus the paths listed in
// .github/pages-exclude.txt. Plain fs, no dependencies, same behaviour on Linux/macOS/Windows.
//
//   node scripts/pages-build.mjs [--src .] [--out _site] [--exclude .github/pages-exclude.txt]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_KEPT = ['CNAME', '.nojekyll', 'index.html', '404.html'];

export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return re;
}

export function parseExcludes(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const dir = line.endsWith('/');
    const body = dir ? line.slice(0, -1) : line;
    rules.push({ line, re: new RegExp('^' + globToRegExp(body) + (dir ? '(?:/.*)?' : '') + '$') });
  }
  return rules;
}

export function isExcluded(rel, rules) {
  return rules.some((r) => r.re.test(rel));
}

// Every file under root as posix-relative paths. Always skips .git and any dir in `skipDirs`.
export function walk(root, skipDirs = []) {
  const out = [];
  const skip = new Set(['.git', ...skipDirs]);
  (function rec(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!skip.has(r)) rec(path.join(dir, e.name), r); }
      else out.push(r);
    }
  })(root, '');
  return out;
}

export function buildSite({ src, out, rules }) {
  const outRel = path.relative(src, out).split(path.sep).join('/');
  fs.rmSync(out, { recursive: true, force: true });
  const kept = [];
  const dropped = [];
  for (const rel of walk(src, [outRel])) {
    if (isExcluded(rel, rules)) { dropped.push(rel); continue; }
    const to = path.join(out, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(src, rel), to); // follows symlinks, like the upload step's tar --dereference
    kept.push(rel);
  }
  const keptSet = new Set(kept);
  const missing = REQUIRED_KEPT.filter((f) => !keptSet.has(f));
  return { kept, dropped, missing };
}

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = path.resolve(arg('src', '.'));
  const out = path.resolve(arg('out', '_site'));
  const rules = parseExcludes(fs.readFileSync(path.resolve(src, arg('exclude', '.github/pages-exclude.txt')), 'utf8'));
  const { kept, dropped, missing } = buildSite({ src, out, rules });
  const size = (list) => list.reduce((n, f) => n + fs.statSync(path.join(src, f)).size, 0);
  console.log(`pages-build: kept ${kept.length} files (${size(kept)} bytes), excluded ${dropped.length} files (${size(dropped)} bytes)`);
  const byRule = new Map();
  for (const f of dropped) {
    const r = rules.find((x) => x.re.test(f)).line;
    const v = byRule.get(r) || [0, 0];
    v[0]++; v[1] += fs.statSync(path.join(src, f)).size;
    byRule.set(r, v);
  }
  for (const [r, [n, b]] of byRule) console.log(`  excluded ${String(n).padStart(4)} files ${String(b).padStart(10)} bytes  ${r}`);
  if (missing.length) { console.error('pages-build: FAIL, required file(s) missing from _site: ' + missing.join(', ')); process.exit(1); }
}
