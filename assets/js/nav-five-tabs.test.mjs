// node --test assets/js/nav-five-tabs.test.mjs   (no dependencies)
//
// Joe 2026-11-20 6:38 PM: "Remove the shop option. I mentioned it several times. No shop button
// allowed as the core mobile tabs on the bottom navigations for the Keepitil website or apps."
//
// The bottom tabs AND the main menu are EXACTLY five items, in this order:
//   Discover, Connect, Create, Culture, Earn
// Every nav on the site is checked: the shell's DESTINATIONS array (which renders the mobile bottom
// tabs, the desktop header, the burger menu and the footer's nav row) and every static
// <nav id="main-nav"> / <div class="mobile-menu"> in every HTML page. /shop/ stays live: it is a
// footer link and an Earn carousel slide, never a tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EXPECTED = ['DISCOVER', 'CONNECT', 'CREATE', 'CULTURE', 'EARN'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'games']);   // games are separate apps with their own in-game SHOP buttons

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').trim().toUpperCase();

/* The labels in the shell's DESTINATIONS array, in order. */
export function shellNavLabels(src) {
  const start = src.indexOf('var DESTINATIONS=[');
  if (start < 0) return null;
  const end = src.indexOf('\n];', start);
  const body = stripComments(src.slice(start, end));
  return [...body.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1].toUpperCase());
}
export function shellNavPills(src) {
  const start = src.indexOf('var DESTINATIONS=[');
  const end = src.indexOf('\n];', start);
  const body = stripComments(src.slice(start, end));
  return [...body.matchAll(/pill:\s*'([^']+)'/g)].map((m) => m[1].toUpperCase());
}
/* Every static platform nav in one HTML document: [{kind, labels}] (logo and LOGIN excluded). */
export function htmlNavs(html) {
  const navs = [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const blocks = [
    ...[...clean.matchAll(/<nav\b[^>]*\bid="main-nav"[^>]*>([\s\S]*?)<\/nav>/g)].map((m) => ['main-nav', m[1]]),
    ...[...clean.matchAll(/<div\b[^>]*\bclass="mobile-menu"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => ['mobile-menu', m[1]]),
  ];
  for (const [kind, inner] of blocks) {
    const labels = [...inner.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
      .filter((a) => !/class="[^"]*\b(nav-logo|nav-cta)\b/.test(a[1]))
      .map((a) => text(a[2]));
    navs.push({ kind, labels });
  }
  return navs;
}
/* null when the list is exactly the five, in order; otherwise the reason. An empty static nav is
   allowed: the shell removes it and renders DESTINATIONS in its place. */
export function navProblem(labels, { allowEmpty = false } = {}) {
  if (allowEmpty && labels.length === 0) return null;
  if (labels.some((l) => /SHOP/.test(l))) return 'has a Shop item: ' + labels.join(',');
  if (labels.length !== EXPECTED.length || labels.some((l, i) => l !== EXPECTED[i])) {
    return 'expected ' + EXPECTED.join(',') + ' got ' + labels.join(',');
  }
  return null;
}

const SHELL = readFileSync(join(ROOT, 'keepitil-shell.js'), 'utf8');

test('shell DESTINATIONS (bottom tabs, header, burger menu, footer row) is exactly the five, in order', () => {
  assert.deepEqual(shellNavLabels(SHELL), EXPECTED);
  assert.deepEqual(shellNavPills(SHELL), EXPECTED);
  assert.equal(navProblem(shellNavLabels(SHELL)), null);
});

test('every shell nav surface renders from DESTINATIONS, so none can add a sixth item', () => {
  const src = stripComments(SHELL);
  assert.match(src, /bn\.innerHTML=DESTINATIONS\.map\(/, 'mobile bottom tabs');
  assert.match(src, /var links = namedDestinations\(\)\.map\(/, 'desktop header + burger menu');
  assert.match(src, /'<div class="v3s-menu">'\+links\+/, 'burger menu uses the same links');
  assert.match(src, /'<div class="v3s-links">'\+links\+/, 'header uses the same links');
});

test('/shop/ stays reachable from the footer (a link, not a tab)', () => {
  assert.match(SHELL, /\+'<a href="\/shop\/">Shop<\/a>'\s*\n\s*\+'<a href="\/apply">Login<\/a><\/nav>'/);
});

test('no shared nav JS defines a Shop tab', () => {
  const files = [...walk(ROOT, '.js')].filter((p) => !/\/vendor\/|\.test\.|\/app\/|\/apps\//.test(p));
  const bad = [];
  for (const f of files) {
    const s = stripComments(readFileSync(f, 'utf8'));
    if (/pill\s*:\s*['"]SHOP['"]/i.test(s) || /\{\s*href\s*:\s*['"]\/shop\/?['"]/.test(s)) bad.push(relative(ROOT, f));
  }
  assert.deepEqual(bad, []);
});

test('every static main nav and mobile menu in every HTML page is exactly the five, in order', () => {
  const pages = walk(ROOT, '.html');
  assert.ok(pages.length > 50, 'walked the site (' + pages.length + ' pages)');
  let checked = 0;
  const bad = [];
  for (const f of pages) {
    for (const nav of htmlNavs(readFileSync(f, 'utf8'))) {
      checked++;
      const why = navProblem(nav.labels, { allowEmpty: true });
      if (why) bad.push(relative(ROOT, f) + ' ' + nav.kind + ': ' + why);
    }
  }
  assert.ok(checked >= 25, 'found the static navs (' + checked + ')');
  assert.deepEqual(bad, []);
});

test('NEGATIVE CONTROL: the checks fail on the pre-hotfix six-tab nav and on a wrong order', () => {
  // The exact pre-fix markup and shell entry (origin/main 2663aa7).
  const oldHtml = '<nav id="main-nav" aria-label="KEEPITIL platform"><div class="nav-inner">'
    + '<a class="nav-logo" href="/"><span class="nav-brand">KEEPITIL</span></a>'
    + '<ul class="nav-links"><li><a href="/">DISCOVER</a></li><li><a href="/connect/">CONNECT</a></li><li><a href="/create/">CREATE</a></li><li><a href="/shop/">SHOP</a></li><li><a href="/culture/">CULTURE</a></li><li><a href="/earn/">EARN</a></li></ul>'
    + '<a href="/apply" class="nav-cta">LOGIN</a></div></nav>'
    + '<div class="mobile-menu" id="mm"><a href="/">DISCOVER</a><a href="/connect/">CONNECT</a><a href="/create/">CREATE</a><a href="/shop/">SHOP</a><a href="/culture/">CULTURE</a><a href="/earn/">EARN</a><a href="/apply" class="nav-cta">LOGIN</a></div>';
  const navs = htmlNavs(oldHtml);
  assert.equal(navs.length, 2);
  for (const n of navs) assert.match(navProblem(n.labels, { allowEmpty: true }), /Shop/);

  const oldShell = SHELL.replace("  {href:'/culture/', label:'Culture'",
    "  {href:'/shop/',    label:'Shop',    pill:'SHOP',     icon:'shop',    match:/x/},\n  {href:'/culture/', label:'Culture'");
  assert.notEqual(oldShell, SHELL, 'control actually injected the Shop entry');
  assert.match(navProblem(shellNavLabels(oldShell)), /Shop/);

  const swapped = ['DISCOVER', 'CREATE', 'CONNECT', 'CULTURE', 'EARN'];
  assert.match(navProblem(swapped), /expected/);
  assert.match(navProblem(EXPECTED.slice(0, 4)), /expected/);
  assert.match(navProblem([...EXPECTED, 'GAMES']), /expected/);
  assert.equal(navProblem([], { allowEmpty: false }) === null, false, 'empty only passes where allowed');
});
