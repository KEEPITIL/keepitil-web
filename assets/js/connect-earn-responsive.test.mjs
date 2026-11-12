// KODE 7c-2: /connect + /earn responsive + accessibility audit fixes (static checks; no browser on CI).
// Env: SEVENC_ROOT points the page checks at another tree (negative control against clean main).
//      SEVENC_BASE=<git ref, e.g. origin/main> enables the diff-scope checks (skipped otherwise,
//      because they only mean something while this change is unmerged).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const root = process.env.SEVENC_ROOT ? new URL('file:///' + process.env.SEVENC_ROOT.replace(/\\/g, '/').replace(/\/?$/, '/')) : new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const pages = { connect: read('connect/index.html'), earn: read('earn/index.html') };
const base = process.env.SEVENC_BASE;
const git = (...a) => execFileSync(process.env.GIT || 'git', a, { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });

const LOCKED = ['index.html', 'connect/index.html', 'culture/index.html', 'earn/index.html', 'keepitil-shell.js', 'assets/js/keepitil-ai.js'];
const coarse = (html) => (html.match(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\n\}/) || [])[1] || '';

for (const [name, html] of Object.entries(pages)) {
  // Joe's ruling (2026-11-11, keepitil-web #165): one identical fixed-scale viewport tag on every page.
  test(name + ': viewport meta is the exact fixed-scale tag (Joe\'s ruling), no "no.0" variant', () => {
    const m = html.match(/<meta name="viewport" content="([^"]*)"/);
    assert.ok(m, 'viewport meta present');
    assert.equal(m[1], 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
    assert.ok(!/no\.0/.test(html));
  });

  test(name + ': search is 44px tall and 16px on touch', () => {
    const c = coarse(html);
    assert.match(c, /\.search\s*\{[^}]*min-height:\s*44px/);
    assert.match(c, /\.search input\s*\{[^}]*font-size:\s*16px/);
  });

  test(name + ': no page-owned font-size below 10px (rem/px, font shorthand included)', () => {
    const bad = [];
    const re = /font-size:\s*([\d.]+)(rem|em|px)|font:[^;}]*?(?<![\d.\w])([\d.]+)(rem|px)(?:\/[\d.]+)?\s+[A-Za-z'"]/g;
    for (const m of html.matchAll(re)) {
      const v = m[1] ? +m[1] : +m[3];
      const u = m[1] ? m[2] : m[4];
      const px = u === 'px' ? v : v * 16;
      if (px < 10) bad.push(m[0].slice(0, 60) + ' = ' + px + 'px');
    }
    assert.deepEqual(bad, []);
  });
}

test('connect: #seg buttons get a 44px coarse-pointer minimum height', () => {
  assert.match(coarse(pages.connect), /#seg button\s*\{[^}]*min-height:\s*44px/);
});

test('earn: #radSeg buttons get 44px and INFO gets a 44px hit area without changing its look', () => {
  const c = coarse(pages.earn);
  assert.match(c, /#radSeg button\s*\{[^}]*min-height:\s*44px/);
  assert.match(c, /\.sh \.hye-info\s*\{[^}]*position:\s*relative/);
  const m = c.match(/\.sh \.hye-info::after\s*\{([^}]*)\}/);
  assert.ok(m, 'INFO hit-area pseudo-element exists');
  assert.match(m[1], /top:\s*-8px/);
  assert.match(m[1], /bottom:\s*-8px/);
  // 32px pill (30px padding box + borders): -8px/-8px gives a 46px ::after; measured live 7px up + 6px down = 45px hit area
  assert.match(pages.earn, /\.sh \.hye-info\{[^}]*min-height:32px/);
});

test('earn: phone hero stats row reserves 56px on the right so labels clear the Kilo button', () => {
  assert.match(pages.earn, /@media\s*\(max-width:420px\)\s*\{\s*body\.rad-m \.hero \.stats\s*\{[^}]*padding-right:\s*56px/);
});

test('services/index.html is byte-identical to the base (#104 placeholders untouched)', { skip: !base }, () => {
  assert.equal(git('diff', '--name-only', base, '--', 'services/index.html').trim(), '');
});

test('only connect/index.html, earn/index.html and this test changed; shell/home/culture/ai untouched', { skip: !base }, () => {
  const changed = git('diff', '--name-only', base).split('\n').map((s) => s.trim()).filter(Boolean).sort();
  assert.deepEqual(changed, ['assets/js/connect-earn-responsive.test.mjs', 'connect/index.html', 'earn/index.html']);
  for (const f of ['index.html', 'culture/index.html', 'keepitil-shell.js', 'assets/js/keepitil-ai.js']) {
    assert.ok(!changed.includes(f), 'locked file changed: ' + f);
  }
  assert.ok(LOCKED.includes('connect/index.html') && LOCKED.includes('earn/index.html'));
});
