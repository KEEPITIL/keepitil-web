// KODE 7c-1: /create responsive + accessibility audit fixes (static checks; no browser on CI).
// Env: SEVENC_ROOT points the page checks at another tree (negative control against clean main).
//      SEVENC_BASE=<git ref, e.g. origin/main> enables the diff-scope checks (skipped otherwise,
//      because they only mean something while this change is unmerged).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const root = process.env.SEVENC_ROOT ? new URL('file:///' + process.env.SEVENC_ROOT.replace(/\\/g, '/').replace(/\/?$/, '/')) : new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('create/index.html');
const base = process.env.SEVENC_BASE;
const git = (...a) => execFileSync(process.env.GIT || 'git', a, { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });

const LOCKED = ['index.html', 'connect/index.html', 'culture/index.html', 'earn/index.html', 'keepitil-shell.js', 'assets/js/keepitil-ai.js'];

// Joe's ruling (2026-11-11, keepitil-web #165): every site page carries ONE identical fixed-scale viewport
// tag. Assert that exact string, and that no malformed "no.0" / "1.0" variant survives.
test('viewport meta is the exact fixed-scale tag (Joe\'s ruling), no "no.0" variant', () => {
  const m = html.match(/<meta name="viewport" content="([^"]*)"/);
  assert.ok(m, 'viewport meta present');
  assert.equal(m[1], 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
  assert.ok(!/no\.0/.test(html), 'no "user-scalable=no.0" left anywhere on the page');
});

test('coarse-pointer block gives chips and selects a 44px minimum height', () => {
  const mq = html.match(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(mq, '@media (pointer:coarse) block exists');
  assert.match(mq[1], /\.ce-row \.ce-chip\s*,\s*\.ce-row select\.ce-chip\s*\{[^}]*min-height:\s*44px/);
});

test('no page-owned text below 10px for the badge/fee/date selectors', () => {
  const size = (sel) => {
    const re = new RegExp('[^{}]*' + sel.replace('.', '\\.') + '[^{}]*\\{([^}]*)\\}', 'g');
    const out = [];
    for (const r of html.matchAll(re)) { const f = r[1].match(/font-size:\s*([\d.]+)px/); if (f) out.push(+f[1]); }
    return out;
  };
  for (const [sel, min] of [['.ce-badge', 10], ['.ce-fee', 10], ['.ce-date', 10.5]]) {
    const s = size(sel);
    assert.ok(s.length > 0, sel + ' has an explicit page-owned font-size override');
    assert.ok(s.every((v) => v >= min), sel + ' >= ' + min + 'px, got ' + s);
  }
});

test('form fields stay at 16px on touch so iOS does not zoom on focus', () => {
  assert.match(html, /@media\s*\(pointer:\s*coarse\)[\s\S]*#vs-app \.vs-form input[^}]*font-size:\s*16px/);
});

test('services/index.html is byte-identical to the base (#104 placeholders untouched)', { skip: !base }, () => {
  assert.equal(git('diff', '--name-only', base, '--', 'services/index.html').trim(), '');
});

test('only create/index.html and this test changed; no locked file touched', { skip: !base }, () => {
  const changed = git('diff', '--name-only', base).split('\n').map((s) => s.trim()).filter(Boolean).sort();
  assert.deepEqual(changed, ['assets/js/create-responsive.test.mjs', 'create/index.html']);
  for (const f of LOCKED) assert.ok(!changed.includes(f), 'locked file changed: ' + f);
});
