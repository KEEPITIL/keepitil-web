// Every target="_blank" anchor must carry rel="noopener noreferrer" and every
// window.open(..., '_blank') call must pass 'noopener,noreferrer'.
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

/** Returns descriptions of every <a ... target=_blank> whose rel lacks noopener or noreferrer. */
export function blankAnchorViolations(src) {
  const bad = [];
  for (const m of src.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/target\s*=\s*\\?["']?_blank/i.test(tag)) continue;
    const rel = /\brel\s*=\s*\\?"([^"]*)"|\brel\s*=\s*\\?'([^']*)'/i.exec(tag);
    const val = rel ? (rel[1] ?? rel[2]) : '';
    if (!(/noopener/i.test(val) && /noreferrer/i.test(val))) bad.push(tag.slice(0, 120));
  }
  // anchors made in JS: x.target = '_blank' / setAttribute('target','_blank') need a rel set too
  for (const m of src.matchAll(/(\.target\s*=\s*|setAttribute\(\s*['"]target['"]\s*,\s*)['"]_blank['"]/g)) {
    const near = src.slice(m.index, m.index + 400);
    if (!/noreferrer/.test(near) || !/noopener/.test(near)) bad.push('js target=_blank: ' + near.slice(0, 80).replace(/\s+/g, ' '));
  }
  return bad;
}

/** Returns the arguments of every window.open( call that does not pass noopener AND noreferrer. */
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
    if (!(/noopener/.test(args) && /noreferrer/.test(args))) bad.push(args.slice(0, 120));
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
  assert.equal(blankAnchorViolations('<a href="/" target="_blank" rel="sponsored noopener noreferrer nofollow">x</a>').length, 0);
  assert.equal(blankAnchorViolations('<a href="/" target="_self">x</a>').length, 0);
  assert.equal(blankAnchorViolations("a.target='_blank'; a.rel='noopener noreferrer';").length, 0);
});
test('control: window.open scanner flags bare and partial calls, passes safe ones', () => {
  assert.equal(windowOpenViolations("window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(t),'_blank');").length, 1);
  assert.equal(windowOpenViolations("window.open(u,'_blank','noopener')").length, 1);
  assert.equal(windowOpenViolations("window.open(f(a,(b)),'_blank')").length, 1);
  assert.equal(windowOpenViolations("window.open(u,'_blank','noopener,noreferrer')").length, 0);
  assert.equal(windowOpenViolations("window.openEditProfile()").length, 0);
});

// ---- the real corpus ----
const files = walk('.');
test('corpus: found published pages to scan', () => {
  assert.ok(files.length > 100, 'expected the published site, found ' + files.length);
  assert.ok(files.includes('article/bleu/index.html'));
});
test('no target=_blank anchor lacks rel="noopener noreferrer" (outside PENDING)', () => {
  const offenders = {};
  for (const f of files) {
    if (PENDING[f]) continue;
    const v = blankAnchorViolations(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (v.length) offenders[f] = v.length;
  }
  assert.deepEqual(offenders, {});
});
test('no window.open lacks noopener,noreferrer (outside PENDING)', () => {
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
