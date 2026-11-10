// Static guards for the shell-owned touch-target fixes from the 7c responsive audit.
// Run: node --test assets/js/shell-tap-targets.test.mjs
// Diff-scope check is opt-in: SEVENC_BASE=origin/main node --test assets/js/shell-tap-targets.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shell = readFileSync(path.join(root, 'keepitil-shell.js'), 'utf8');
const ai = readFileSync(path.join(root, 'assets/js/keepitil-ai.js'), 'utf8');

// Collapse the JS string-concatenation noise so CSS can be matched as plain text.
const flat = (src) => src.replace(/'\s*\+\s*'/g, '').replace(/',\s*\n\s*'/g, '').replace(/\s+/g, ' ');
const shellCss = flat(shell);
const aiCss = flat(ai);

// Return the body of every @media(pointer:coarse){...} block (balanced braces).
function coarseBlocks(css) {
  const out = [];
  const re = /@media\s*\(\s*pointer\s*:\s*coarse\s*\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    out.push(css.slice(re.lastIndex, i - 1));
  }
  return out;
}
const shellCoarse = coarseBlocks(shellCss).join(' ');
const aiCoarse = coarseBlocks(aiCss).join(' ');

// The declarations of the rule for `selector` inside a coarse block ('' if absent).
function rule(block, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?:^|[}\\s,])' + esc + '\\s*\\{([^}]*)\\}').exec(block);
  return m ? m[1] : '';
}
const px = (decl, prop) => { const m = new RegExp('(?:^|;|\\s)' + prop + '\\s*:\\s*(\\d+)px').exec(decl); return m ? +m[1] : 0; };

test('footer legal links are >=44px tall on touch', () => {
  const d = rule(shellCoarse, '#v3-footer .v3-foot-legal a');
  assert.ok(px(d, 'min-height') >= 44, 'legal links need min-height:44px in (pointer:coarse): ' + d);
  assert.match(d, /align-items\s*:\s*center/);
});

test('footer brand link is >=44px tall on touch', () => {
  const d = rule(shellCoarse, '#v3-footer .v3-foot-about a.v3-foot-brand');
  assert.ok(px(d, 'min-height') >= 44, 'brand link needs min-height:44px in (pointer:coarse): ' + d);
});

test('back-to-top button is 44x44 on touch', () => {
  const d = rule(shellCoarse, '#kil-top');
  assert.ok(px(d, 'width') >= 44 && px(d, 'height') >= 44, '#kil-top must be 44x44 in (pointer:coarse): ' + d);
});

test('bottom-nav label is at least 10px (no 8px text)', () => {
  const m = /#kil-bnav \.kb-l\s*\{[^}]*font-size\s*:\s*(\d+)px/.exec(shellCss);
  assert.ok(m, '#kil-bnav .kb-l font-size rule not found');
  assert.ok(+m[1] >= 10, '.kb-l font-size is ' + m[1] + 'px');
  assert.match(shellCss, /#kil-bnav \.kb-l\s*\{[^}]*text-overflow\s*:\s*ellipsis/, 'label must still ellipsize instead of widening the nav');
});

test('Kilo close and send are 44x44 on touch', () => {
  for (const sel of ['#kilo-close', '#kilo-send']) {
    const d = rule(aiCoarse, sel);
    assert.ok(px(d, 'width') >= 44 && px(d, 'height') >= 44, sel + ' must be 44x44 in (pointer:coarse): ' + d);
  }
});

test('Kilo input is >=44px tall with 16px text on touch', () => {
  const d = rule(aiCoarse, '#kilo-input');
  assert.ok(px(d, 'min-height') >= 44, '#kilo-input needs min-height:44px: ' + d);
  assert.equal(px(d, 'font-size'), 16, '#kilo-input needs font-size:16px (iOS focus zoom)');
});

test('every touch-target rule is gated by pointer:coarse (desktop unchanged)', () => {
  // The unconditional base rules must keep their desktop sizes.
  assert.match(shellCss, /#kil-top\{position:fixed;[^}]*width:35px;height:35px/);
  assert.match(aiCss, /#kilo-close\{background:none;[^}]*width:30px;height:30px/);
  assert.match(aiCss, /#kilo-send\{background:[^}]*width:36px;height:36px/);
});

test('diff scope: only the expected files changed (SEVENC_BASE)', { skip: !process.env.SEVENC_BASE }, () => {
  const base = process.env.SEVENC_BASE;
  const names = execFileSync('git', ['diff', '--name-only', base + '...HEAD'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const allowed = new Set(['keepitil-shell.js', 'assets/js/keepitil-ai.js', 'assets/js/shell-tap-targets.test.mjs']);
  const extra = names.filter((n) => !allowed.has(n));
  assert.deepEqual(extra, [], 'unexpected files changed: ' + extra.join(', '));
  for (const locked of ['index.html', 'connect/index.html', 'culture/index.html', 'earn/index.html']) {
    assert.ok(!names.includes(locked), locked + ' is locked and owned by other PRs');
  }
});
