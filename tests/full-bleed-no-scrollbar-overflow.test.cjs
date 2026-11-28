'use strict';
// A 100vw full-bleed bar is wider than the page wherever the vertical scrollbar takes space (Windows, Linux): the whole site then scrolls sideways by
// the scrollbar's width (live QA 2026-11-27: 3px at 1366, from .kil-filter-shell). The shell publishes --kil-sbw (innerWidth - clientWidth) and every
// full-bleed rule subtracts it. Verified rendered: 1366 with a 6px scrollbar -> bar 1360 wide, scrollWidth 1360 (was 1363). jsdom has no layout, so this
// guards the source; the negative control shows the guard catches the old rule.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const shell = fs.readFileSync(path.join(__dirname, '..', 'keepitil-shell.js'), 'utf8');
const strings = (s) => [...s.matchAll(/'([^'\n]*)'/g)].map((m) => m[1]).join('');   // the CSS the shell injects, as one text
const BARE = /width:100vw(?![\w-])(?!\s*-)/;
const bleedRules = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*margin-left:calc\(50% - 50vw[^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
test('the shell publishes --kil-sbw from the real scrollbar width, now and on resize', () => {
  assert.match(shell, /function publishScrollbar\(\)\{ var w=Math\.max\(0, window\.innerWidth - document\.documentElement\.clientWidth\); document\.documentElement\.style\.setProperty\('--kil-sbw', w\+'px'\); \}/);
  assert.match(shell, /addEventListener\('resize', publishScrollbar, \{passive:true\}\)/);
});
test('every full-bleed rule subtracts --kil-sbw: no bare width:100vw, and both margins add half of it back', () => {
  const rules = bleedRules(strings(shell));
  assert.ok(rules.length >= 2, 'found the .kil-filter-shell and .kil-deck rules');
  for (const r of rules) {
    assert.doesNotMatch(r.body, BARE, r.sel);
    assert.match(r.body, /width:calc\(100vw - var\(--kil-sbw,0px\)\)/, r.sel);
    assert.match(r.body, /margin-left:calc\(50% - 50vw \+ var\(--kil-sbw,0px\) \/ 2\)/, r.sel);
  }
  // NEGATIVE CONTROL: the old rule is caught by the same check
  const old = bleedRules(".kil-filter-shell{width:100vw!important;margin-left:calc(50% - 50vw)!important;}")[0];
  assert.match(old.body, BARE);
});
