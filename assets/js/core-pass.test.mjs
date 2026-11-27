// node --test assets/js/core-pass.test.mjs   (no dependencies)
//
// KEEPITIL web core pass (2026-11-21). One static guard over EVERY served page for the three
// rules the owner keeps repeating:
//   1. Mobile bottom tabs are exactly Discover, Connect, Create, Culture, Earn. No Shop tab, in the
//      shell or in any page that builds its own bottom/tab bar. /shop/ is reached inside Earn.
//   2. Nothing opens by itself: no modal, banner, sheet or prompt is shown from a timer or a
//      load/DOMContentLoaded/pageshow/scroll/exit handler without a user event.
//   3. Earn carries no Radio/playlist copy, phones get no docked radio bar there, and Kit is a
//      slide inside the Earn carousel.
// The narrower guards (nav-five-tabs, no-bf-popup, install-user-opened, earn-cleanup, earn-kit)
// stay; this one sweeps every page and every shared script so a new page cannot slip past them.
// Every detector has a NEGATIVE CONTROL that must fail on a known-bad input.
//
// W208-R2-1 (Sentinel): this file holds only the assertions that already hold on main's pages.
// The assertions that need the page changes (five tabs on every standalone page via kil-tabs.js,
// kil-tabs.js mirroring the shell, Earn's docked bar hidden at every width, the text-free Earn hero)
// ship with those pages in the "Core pass pages" PR split from #208.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
// Page scripts moved out of inline <script> blocks (CSP migration) live in assets/js/pages/*.js. This puts them back into the page text, so the guard still reads every page's real code.
const assemble = createRequire(import.meta.url)('../../tests/helpers/event-assembled.cjs').assemble;
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIVE = ['DISCOVER', 'CONNECT', 'CREATE', 'CULTURE', 'EARN'];

/* Served KEEPITIL pages. Out of scope: separate apps with their own UI (app/ = TUITEA, Kai Tarako,
   Find My Weed; games/; kode/; the TUITEA site and FMW pages), fixtures. */
const SKIP_TOP = new Set(['app', 'games', 'kode', 'tuiteaapp', 'tests', 'findmyweed', 'node_modules', 'scripts', 'db', 'docs']);
const SKIP_REL = ['apps/tuitea/', 'assets/js/vendor/'];
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    const rel = relative(ROOT, p).split(sep).join('/');
    if (SKIP_TOP.has(rel.split('/')[0])) continue;
    if (SKIP_REL.some((s) => (rel + '/').startsWith(s))) continue;
    if (/^findmyweed/.test(rel)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e)) && !name.endsWith('.test.mjs')) out.push(rel);
  }
  return out;
}
const read = (rel) => assemble(readFileSync(join(ROOT, rel), 'utf8'));
// *.play.html are the undeployed coming-soon originals (.github/pages-exclude.txt), not served pages.
const PAGES = walk(ROOT, ['.html']).filter((r) => !/^google[0-9a-f]+\.html$/.test(r) && !r.endsWith('.play.html'));
// assets/js/pages/* are PAGE scripts: they are scanned inside the page that loads them (read() above), under that page's own exemptions, never as shared scripts.
const SCRIPTS = walk(ROOT, ['.js']).filter((r) => r !== 'sw.js' && !r.startsWith('assets/js/pages/'));

/* ── helpers ─────────────────────────────────────────────────────────────────────────────── */
export function stripJsComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');
}
export function inlineScripts(html) {
  const out = [];
  html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    if (!/\bsrc\s*=/.test(attrs) && !/type\s*=\s*["']?(application\/(ld\+)?json|text\/template)/i.test(attrs)) out.push(body);
    return m;
  });
  return out;
}
/* index just past the ')' that closes the '(' at `open` (string- and template-aware enough for site JS) */
function closeParen(s, open) {
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i + 1; }
  }
  return s.length;
}

function closeBrace(s, open) {
  if (open < 0) return s.length;
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return s.length;
}
/* index just past the </div> that closes the <div> starting at `at` */
function divClose(html, at) {
  const re = /<div\b|<\/div>/gi; re.lastIndex = at; let depth = 0, m;
  while ((m = re.exec(html))) { depth += m[0][1] === '/' ? -1 : 1; if (depth === 0) return re.lastIndex; }
  return -1;
}

/* Triggers that fire without the visitor doing anything. */
const AUTO_TRIGGER = /\b(?:setTimeout|setInterval|requestIdleCallback|requestAnimationFrame)\s*\(|\baddEventListener\s*\(\s*['"](?:load|DOMContentLoaded|pageshow|readystatechange|scroll|mouseout|mouseleave|visibilitychange|beforeinstallprompt)['"]/g;
/* User events: handlers registered INSIDE an auto trigger are user-opened, so their bodies are cut. */
const USER_REG = /\baddEventListener\s*\(\s*['"](?:click|pointerdown|pointerup|touchstart|touchend|mousedown|mouseup|keydown|keyup|submit|change|input)['"]|\.on(?:click|submit|change|input|keydown|pointerdown|touchend)\s*=\s*function\s*\(/g;
/* What "showing an overlay" looks like. */
const OVERLAY_WORD = /modal|popup|pop-up|overlay|banner|sheet|dialog|prompt|promo|newsletter|subscribe|cookie|consent|age-?gate|interstitial|lightbox|toast-?ad/i;
const SINKS = [
  /\.showModal\s*\(/,
  /\b(?:open|show|display|reveal)\w*?(?:Modal|Popup|PopUp|Pop|Sheet|Overlay|Banner|Dialog|Prompt|Promo|Newsletter|Subscribe|Install|Gate|Consent|Cookie|Interstitial|Lightbox|Drawer)\w*\s*[(,)]/,
];
const STATE_SINKS = [
  /classList\.(?:add|toggle)\(\s*['"](?:open|show|shown|visible|is-open|is-visible|active|in)['"]/,
  /\.hidden\s*=\s*false/,
  /removeAttribute\(\s*['"]hidden['"]/,
  /\.style\.display\s*=\s*['"](?:block|flex|grid)['"]/,
  /\.setAttribute\(\s*['"]open['"]/,
];

function cutUserHandlers(body) {
  let out = body;
  for (let guard = 0; guard < 200; guard++) {
    USER_REG.lastIndex = 0;
    const m = USER_REG.exec(out);
    if (!m) break;
    let end;
    if (m[0].endsWith('function(') || /function\s*\($/.test(m[0])) {
      // el.onclick = function(...){ ... }  -> cut through the matching '}'
      const brace = out.indexOf('{', m.index + m[0].length);
      end = closeBrace(out, brace);
    } else {
      end = closeParen(out, out.indexOf('(', m.index));
    }
    out = out.slice(0, m.index) + ' /*user*/ ' + out.slice(Math.max(end, m.index + m[0].length));
  }
  // inline onclick="..." attributes inside template strings are user-opened too
  return out.replace(/\bon(?:click|submit|change|input|keydown|pointerdown|touchend)\s*=\s*\\?["'][^"']*\\?["']/g, ' ');
}

/* Returns [{trigger, snippet}] for every auto trigger whose body shows an overlay. */
export function autoOpenFindings(js) {
  const src = stripJsComments(js);
  const hits = [];
  AUTO_TRIGGER.lastIndex = 0;
  let m;
  while ((m = AUTO_TRIGGER.exec(src))) {
    const open = src.indexOf('(', m.index);
    const end = closeParen(src, open);
    const body = cutUserHandlers(src.slice(open, end));
    const direct = SINKS.find((re) => re.test(body));
    const state = !direct && OVERLAY_WORD.test(body) && STATE_SINKS.find((re) => re.test(body));
    if (direct || state) {
      const re = direct || state;
      const at = body.search(re);
      hits.push({ trigger: m[0].replace(/\s+/g, ''), snippet: body.slice(Math.max(0, at - 60), at + 80).replace(/\s+/g, ' ') });
    }
  }
  return hits;
}

/* Reviewed exceptions: each opens only because the visitor asked for it in the URL they clicked,
   or is not an overlay. Keep this list short and explained. */
const ALLOW = [
  // INTERNAL TOOL (noindex, robots Disallow, linked from nowhere public): the radio grid tuner's
  // whole job is to hold the shipped radio drawer open so its sliders can resize it.
  { file: 'radio-tuner/index.html', has: 'openDrawer' },
];
const allowed = (file, snippet) => ALLOW.some((a) => a.file === file && snippet.includes(a.has));

test('inventory: the sweep covers the served pages and shared scripts', () => {
  assert.ok(PAGES.length > 60, 'only ' + PAGES.length + ' pages found');
  for (const must of ['index.html', 'earn/index.html', 'connect/index.html', 'create/index.html', 'culture/index.html', 'shop/index.html'])
    assert.ok(PAGES.includes(must), must + ' not swept');
  assert.ok(!PAGES.includes('early-access.html'), 'early-access.html is gone (owner order 2026-11-25) and must not come back; see assets/js/no-early-access.test.mjs');
  for (const must of ['keepitil-shell.js', 'assets/js/keepitil-radio.js', 'assets/js/kil-bf-popup.js'])
    assert.ok(SCRIPTS.includes(must), must + ' not swept');
  assert.ok(!PAGES.some((p) => /^(app|games|kode)\//.test(p)), 'sub-apps leaked into the sweep');
});

/* ── 1. tabs ─────────────────────────────────────────────────────────────────────────────── */
export function shellTabs(shellSrc) {
  const start = shellSrc.indexOf('var DESTINATIONS=[');
  if (start < 0) return null;
  const end = shellSrc.indexOf('\n];', start);
  const body = stripJsComments(shellSrc.slice(start, end));
  return [...body.matchAll(/\bpill\s*:\s*'([^']+)'/g)].map((x) => x[1].toUpperCase());
}
/* Any self-built bottom/tab bar in a page: an element whose id/class says bottom-nav/tabbar. */
export function pageTabBars(html) {
  const bars = [];
  const re = /<(nav|div|footer|ul)\b[^>]*\b(?:id|class)\s*=\s*["'][^"']*\b(bnav|bottom-?nav|bottom-?tabs|tab-?bar|tabbar|mobile-?tabs)\b[^"']*["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1];
    const closeIdx = html.indexOf(`</${tag}>`, m.index);
    const inner = html.slice(m.index + m[0].length, closeIdx < 0 ? m.index + 2000 : closeIdx);
    const labels = [...inner.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((a) => a[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().toUpperCase())
      .filter(Boolean);
    if (labels.length) bars.push({ marker: m[2], labels });
  }
  return bars;
}
const isFive = (labels) => labels.length === 5 && labels.every((l, i) => l === FIVE[i] || l.endsWith(' ' + FIVE[i]));

test('shell bottom tabs are exactly Discover, Connect, Create, Culture, Earn (no Shop)', () => {
  const tabs = shellTabs(read('keepitil-shell.js'));
  assert.deepEqual(tabs, FIVE);
});

test('the shell builds #kil-bnav from DESTINATIONS only (no hard-coded extra tab)', () => {
  const src = stripJsComments(read('keepitil-shell.js'));
  const i = src.indexOf("bn.id='kil-bnav'");
  assert.ok(i > 0, 'bottom nav builder not found');
  const block = src.slice(i, i + 4000);
  assert.match(block, /DESTINATIONS\.(forEach|map)/);
  assert.doesNotMatch(block, /['"]\/shop\/?['"]|>\s*shop\s*</i);
});

test('no served page builds its own bottom/tab bar with anything but the five', () => {
  const bad = [];
  for (const rel of PAGES) {
    for (const bar of pageTabBars(read(rel))) {
      if (bar.labels.some((l) => /\bSHOP\b/.test(l)) || (bar.labels.length >= 4 && !isFive(bar.labels) && bar.labels.some((l) => FIVE.includes(l))))
        bad.push(`${rel} [${bar.marker}]: ${bar.labels.join(', ')}`);
    }
  }
  assert.deepEqual(bad, []);
});

/* ── 2. nothing opens by itself ───────────────────────────────────────────────────────────── */
test('no served page or shared script shows a modal/banner/sheet/prompt from a timer or load handler', () => {
  const bad = [];
  for (const rel of PAGES) for (const js of inlineScripts(read(rel)))
    for (const h of autoOpenFindings(js)) if (!allowed(rel, h.snippet)) bad.push(`${rel} ${h.trigger} … ${h.snippet}`);
  for (const rel of SCRIPTS)
    for (const h of autoOpenFindings(read(rel))) if (!allowed(rel, h.snippet)) bad.push(`${rel} ${h.trigger} … ${h.snippet}`);
  assert.deepEqual(bad, []);
});

test('no page ships a <dialog open> or an aria-modal that is visible in the markup', () => {
  const bad = [];
  for (const rel of PAGES) {
    const html = read(rel).replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '');
    if (/<dialog\b[^>]*\bopen\b/i.test(html)) bad.push(`${rel}: <dialog open>`);
    for (const m of html.matchAll(/<[a-z]+\b[^>]*aria-modal\s*=\s*["']true["'][^>]*>/gi))
      if (!/\bhidden\b|display\s*:\s*none|aria-hidden\s*=\s*["']true/i.test(m[0])) bad.push(`${rel}: ${m[0].slice(0, 120)}`);
  }
  assert.deepEqual(bad, []);
});

/* ── 3. Earn ──────────────────────────────────────────────────────────────────────────────── */
export function visibleCopy(html) {
  const noCode = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
  const attrs = [...noCode.matchAll(/\b(?:alt|title|aria-label|placeholder|content)\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
  const title = (noCode.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1];
  const text = noCode.replace(/<[^>]+>/g, ' ');
  return [title, ...attrs, text].join(' \n ').replace(/&[a-z#0-9]+;/gi, ' ');
}
const RADIO_COPY = /\bradio\b|\bplaylists?\b/i;
export function earnProblems(html) {
  const p = [];
  const copy = visibleCopy(html);
  const m = copy.match(new RegExp('.{0,40}(?:' + RADIO_COPY.source + ').{0,40}', 'i'));
  if (m) p.push('radio/playlist copy: ' + m[0].replace(/\s+/g, ' ').trim());
  if (!/body\.rad-m\s+#kil-radio\s*\{\s*display\s*:\s*none\s*!important/.test(html.replace(/<!--[\s\S]*?-->/g, '')))
    p.push('phones: docked radio bar (#kil-radio) is not hidden on Earn');
  if (!/matchMedia\(\s*['"]\(max-width:\s*860px\)['"]\s*\)[\s\S]{0,200}classList\.toggle\(\s*['"]rad-m['"]/.test(html))
    p.push('phones: body.rad-m is not set on ≤860px, so the hide rule never applies');
  const gridId = html.indexOf('id="affGrid"');
  const grid = gridId < 0 ? -1 : html.lastIndexOf('<div', gridId);
  const gridEnd = grid < 0 ? -1 : divClose(html, grid);
  const kit = html.indexOf('id="kitAffiliate"');
  if (grid < 0 || gridEnd < 0 || kit < grid || kit > gridEnd || !/partners\.kit\.com/.test(html.slice(kit, kit + 300)))
    p.push('Kit is not a slide inside the #affGrid carousel');
  return p;
}

test('Earn: no radio/playlist copy, no docked radio bar on phones, Kit inside the carousel', () => {
  assert.deepEqual(earnProblems(read('earn/index.html')), []);
});

/* ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────────────────── */
test('NEGATIVE CONTROL: tab checks fail on a Shop tab, a six-tab shell and a wrong order', () => {
  const shell = read('keepitil-shell.js');
  const six = shell.replace("{href:'/culture/',", "{href:'/shop/', label:'Shop', pill:'SHOP', icon:'shop', match:/shop/},\n  {href:'/culture/',");
  assert.notDeepEqual(shellTabs(six), FIVE);
  const swapped = shell.replace("pill:'CONNECT'", "pill:'TMP'").replace("pill:'CREATE'", "pill:'CONNECT'").replace("pill:'TMP'", "pill:'CREATE'");
  assert.notDeepEqual(shellTabs(swapped), FIVE);
  const page = '<nav class="bottom-nav"><a href="/">Discover</a><a href="/connect/">Connect</a><a href="/create/">Create</a>'
    + '<a href="/shop/">Shop</a><a href="/culture/">Culture</a><a href="/earn/">Earn</a></nav>';
  const bars = pageTabBars(page);
  assert.equal(bars.length, 1);
  assert.ok(bars[0].labels.includes('SHOP') && !isFive(bars[0].labels));
  assert.ok(isFive(pageTabBars(page.replace('<a href="/shop/">Shop</a>', ''))[0].labels));
});

test('NEGATIVE CONTROL: the auto-open detector catches timed, load, scroll and exit pop-ups', () => {
  const bad = [
    "setTimeout(openModal, 5000);",
    "window.addEventListener('load', function(){ document.getElementById('promo-banner').classList.add('show'); });",
    "document.addEventListener('DOMContentLoaded', () => { document.querySelector('dialog').showModal(); });",
    "window.addEventListener('scroll', function(){ if (scrollY > 900) showNewsletterPopup(); });",
    "document.addEventListener('mouseout', e => { if (!e.relatedTarget) openExitPopup(); });",
    "setTimeout(function(){ var c=document.getElementById('cookie-consent'); c.hidden = false; }, 800);",
    "addEventListener('load',function(){ var r=document.getElementById('radio-prompt'); r.style.display='flex'; });",
    "var t=setInterval(function(){ if(openDrawer()){ clearInterval(t); } }, 400);",
    // the pre-hotfix guest-list popup (kil-bf-popup.js before 11-20)
    "function init(){ var host=doc.getElementById('kil-bf-inline'); if(host){mountInline(host);return;} root.setTimeout(openModal, 5000); }",
  ];
  for (const s of bad) assert.ok(autoOpenFindings(s).length > 0, 'missed: ' + s);
});

test('NEGATIVE CONTROL: user-opened overlays inside load handlers are NOT flagged', () => {
  const good = [
    "document.addEventListener('DOMContentLoaded', function(){ btn.addEventListener('click', function(){ openModal(); }); });",
    "window.addEventListener('load', function(){ el.onclick = function(){ document.getElementById('sheet').classList.add('open'); }; });",
    "setTimeout(function(){ grid.innerHTML = '<button onclick=\"openShareSheet()\">Share</button>'; }, 0);",
    "setTimeout(function(){ document.getElementById('cards').classList.add('in'); }, 100);",
    "/* setTimeout(openModal, 5000) was removed */ var x = 1;",
  ];
  for (const s of good) assert.deepEqual(autoOpenFindings(s), [], 'false positive: ' + s);
});

test('NEGATIVE CONTROL: Earn checks fail on radio copy, a visible docked bar and Kit outside the carousel', () => {
  const earn = read('earn/index.html');
  const withCopy = earn.replace('id="affGrid">', 'id="affGrid">\n<h2>KEEPITIL RADIO</h2>');
  assert.ok(earnProblems(withCopy).some((p) => p.startsWith('radio/playlist copy')));
  const withMeta = earn.replace(/<title>([\s\S]*?)<\/title>/i, '<title>Earn — Radio & Playlists</title>');
  assert.ok(earnProblems(withMeta).some((p) => p.startsWith('radio/playlist copy')));
  const barShown = earn.replace(/body\.rad-m\s+#kil-radio\s*\{\s*display\s*:\s*none\s*!important\s*\}/, 'body.rad-m #kil-radio{display:flex}');
  assert.notEqual(barShown, earn, 'control did not apply');
  assert.ok(earnProblems(barShown).some((p) => p.includes('docked radio bar')));
  const kitStart = earn.indexOf('<a class="card aff-card" id="kitAffiliate"');
  const kitEnd = earn.indexOf('</a>', kitStart) + 4;
  const kit = earn.slice(kitStart, kitEnd);
  const moved = earn.slice(0, kitStart) + earn.slice(kitEnd);
  const outside = moved.replace('<footer', kit + '\n<footer');
  assert.ok(earnProblems(outside).some((p) => p.startsWith('Kit')));
});
