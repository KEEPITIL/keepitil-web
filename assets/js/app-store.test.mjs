// KEEPITIL storefront (/app/) and developer page (/app/submit/).
// Run: node --test assets/js/app-store.test.mjs
// APP_STORE_TEST_ROOT overrides the repo root.
// Every guard below also runs against a known-bad input (negative controls) so a guard that
// can never fail is caught.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.APP_STORE_TEST_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const STORE = 'app/index.html';
const SUBMIT = 'app/submit/index.html';
const SCRIPT = 'app/store.js';
const CATALOG = 'app/catalog.json';

// ---------- guards (pure functions, each with a negative control) ----------

// Root-relative path -> file in the repo, or null. Directories resolve to index.html.
function resolveLocal(ref, root = ROOT) {
  if (typeof ref !== 'string' || !/^\/(?!\/)/.test(ref)) return null;
  const r = ref.replace(/[?#].*$/, '');
  const p = path.join(root, ...r.split('/').filter(Boolean));
  if (r.endsWith('/') || (fs.existsSync(p) && fs.statSync(p).isDirectory())) return path.join(p, 'index.html');
  return p;
}
const pathExists = (ref) => { const f = resolveLocal(ref); return !!f && fs.existsSync(f); };

// Tab labels of the role="tablist" in document order.
function tabLabels(html) {
  const list = html.match(/<div[^>]*role="tablist"[^>]*>([\s\S]*?)<\/div>/i);
  if (!list) return [];
  return [...list[1].matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/gi)].map((m) => m[1].trim());
}

// Signs of a bottom tab bar: fixed/sticky positioning pinned to the bottom, or bottom-nav names.
function bottomBarProblems(text) {
  const out = [];
  const css = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') || text;
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = rule[2].replace(/\s+/g, '');
    if (/position:fixed/i.test(body)) out.push(`position:fixed in ${rule[1].trim()}`);
    if (/position:sticky/i.test(body) && /(^|;)bottom:/i.test(body)) out.push(`sticky bottom in ${rule[1].trim()}`);
  }
  if (/\b(tab-?bar|bottom-?nav|bottom-?tabs|mobile-?nav)\b/i.test(text)) out.push('bottom-nav style class or id');
  if (/keepitil-shell\.js/i.test(text)) out.push('loads keepitil-shell.js (site shell nav)');
  return out;
}

// <form action> values that leave keepitil.com.
function offsiteFormActions(html) {
  const bad = [];
  for (const m of html.matchAll(/<form\b[^>]*>/gi)) {
    const a = m[0].match(/\baction\s*=\s*["']?([^"'\s>]*)/i);
    const v = a ? a[1] : '';
    if (/^(https?:)?\/\//i.test(v) && !/^(https?:)?\/\/(www\.)?keepitil\.com(\/|$)/i.test(v)) bad.push(v);
    if (/^(javascript|data|mailto):/i.test(v)) bad.push(v);
  }
  for (const m of html.matchAll(/\bformaction\s*=\s*["']?([^"'\s>]*)/gi)) {
    if (/^(https?:)?\/\//i.test(m[1]) && !/keepitil\.com/i.test(m[1])) bad.push(m[1]);
  }
  return bad;
}

// Every string in the catalog that looks like a URL or path.
function catalogUrls(node, out = []) {
  if (typeof node === 'string') { if (/^(\/|[a-z][a-z0-9+.-]*:)/i.test(node)) out.push(node); }
  else if (Array.isArray(node)) node.forEach((n) => catalogUrls(n, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => catalogUrls(n, out));
  return out;
}

test('negative controls: each guard fails on a bad input', () => {
  assert.equal(pathExists('/app/no-such-app-xyz/'), false);
  assert.equal(pathExists('https://keepitil.com/app/'), false, 'absolute URLs are not accepted as local paths');
  assert.equal(pathExists('//evil.example/x'), false);
  assert.deepEqual(tabLabels('<div role="tablist"><button role="tab">Today</button><button role="tab">Arcade</button></div>'), ['Today', 'Arcade']);
  assert.ok(bottomBarProblems('<style>.nav{position:fixed;bottom:0}</style>').length > 0);
  assert.ok(bottomBarProblems('<nav class="tab-bar"></nav>').length > 0);
  assert.ok(bottomBarProblems('<script src="/keepitil-shell.js"></script>').length > 0);
  assert.deepEqual(offsiteFormActions('<form action="https://evil.example/collect" method="post">'), ['https://evil.example/collect']);
  assert.deepEqual(offsiteFormActions('<form action=//evil.example/x>'), ['//evil.example/x']);
  assert.deepEqual(offsiteFormActions('<button formaction="https://evil.example/">'), ['https://evil.example/']);
  assert.deepEqual(offsiteFormActions('<form action="/local">'), []);
  assert.deepEqual(catalogUrls({ a: ['/x', 'https://e.example', 'text'] }), ['/x', 'https://e.example']);
});

// ---------- the pages ----------

test('pages live at folder/index.html, with no foo.html shadowing the folder', () => {
  assert.ok(fs.existsSync(path.join(ROOT, STORE)), 'app/index.html missing');
  assert.ok(fs.existsSync(path.join(ROOT, SUBMIT)), 'app/submit/index.html missing');
  // On GitHub Pages /app/submit would serve app/submit.html before redirecting to the folder.
  assert.ok(!fs.existsSync(path.join(ROOT, 'app.html')), 'app.html would shadow /app/');
  assert.ok(!fs.existsSync(path.join(ROOT, 'app', 'submit.html')), 'app/submit.html would shadow /app/submit/');
});

test('store has the segmented top tabs Today | Apps | Games | Search, each wired to a panel', () => {
  const h = read(STORE);
  assert.deepEqual(tabLabels(h), ['Today', 'Apps', 'Games', 'Search']);
  for (const t of ['today', 'apps', 'games', 'search']) {
    assert.match(h, new RegExp(`id="tab-${t}"[^>]*aria-controls="panel-${t}"`));
    assert.match(h, new RegExp(`<section role="tabpanel" id="panel-${t}"`));
  }
  // The tabs sit at the top, before the panels.
  assert.ok(h.indexOf('role="tablist"') < h.indexOf('id="panel-today"'), 'tabs must come before the panels');
  assert.ok(h.indexOf('role="tablist"') < h.indexOf('<main'), 'tabs must be above the content');
  assert.match(h, /id="q"[^>]*type="search"/, 'Search tab has a search input');
});

test('no bottom tab bar on /app/ or /app/submit/', () => {
  assert.deepEqual(bottomBarProblems(read(STORE)), []);
  assert.deepEqual(bottomBarProblems(read(SUBMIT)), []);
  assert.doesNotMatch(read(SCRIPT), /position\s*=\s*['"]fixed|['"]fixed['"]/, 'store.js must not pin anything');
});

test('catalog only references paths that exist in this repo', () => {
  const cat = JSON.parse(read(CATALOG));
  const urls = catalogUrls(cat);
  assert.ok(urls.length >= 10, 'expected the catalog to carry icons and links');
  for (const u of urls) {
    assert.match(u, /^\/(?!\/)/, `catalog URL is not a root-relative keepitil.com path: ${u}`);
    assert.ok(pathExists(u), `catalog path does not exist in the repo: ${u} -> ${path.relative(ROOT, resolveLocal(u) || '')}`);
  }
  for (const it of cat.items) {
    for (const k of ['id', 'kind', 'name', 'subtitle', 'icon', 'href', 'cta']) assert.ok(it[k], `${it.id || '?'} missing ${k}`);
    assert.ok(['app', 'game'].includes(it.kind), `${it.id} kind`);
    assert.ok(['Get', 'Open', 'Soon'].includes(it.cta), `${it.id} cta`);
  }
  const ids = new Set(cat.items.map((i) => i.id));
  assert.equal(ids.size, cat.items.length, 'duplicate item ids');
  const refs = [
    ...cat.today.map((s) => s.item),
    ...Object.values(cat.features).map((f) => f.item),
    ...Object.values(cat.shelves).flat().flatMap((s) => s.items),
  ];
  for (const r of refs) assert.ok(ids.has(r), `unknown catalog item referenced: ${r}`);
  for (const it of cat.items) assert.ok(refs.includes(it.id), `${it.id} is in the catalog but shown nowhere`);
});

test('catalog has no invented ratings, reviews or prices', () => {
  const raw = read(CATALOG);
  assert.doesNotMatch(raw, /"(rating|ratings|stars|reviews?|price|prices|downloads|rank)"\s*:/i);
  assert.doesNotMatch(raw, /[$£€]\s?\d/, 'no prices');
});

test('kids apps link only to their own page and are not tracked', () => {
  const cat = JSON.parse(read(CATALOG));
  const kids = cat.items.filter((i) => i.kids);
  assert.ok(kids.some((k) => k.id === 'kaitarako'), 'Kai Tarako is flagged as a kids app');
  for (const k of kids) {
    const home = k.href;
    assert.match(home, /^\/app\/[a-z0-9-]+\/$/, `${k.id} href must be its own app page`);
    for (const u of catalogUrls(k)) assert.ok(u.startsWith(home), `${k.id} references ${u}, outside ${home}`);
  }
  for (const f of [STORE, SCRIPT]) {
    assert.doesNotMatch(read(f), /google-analytics|googletagmanager|gtag\(|kt-analytics|plausible|segment\.com|fbq\(|sendBeacon/i, `${f} must not track`);
  }
});

test('store uses no third-party scripts and fetches only the same-origin catalog', () => {
  const h = read(STORE);
  const srcs = [...h.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
  assert.deepEqual(srcs, ['/app/store.js']);
  assert.doesNotMatch(h, /<script(?![^>]*\bsrc=)[^>]*>\s*\S/i, 'no inline scripts (CSP script-src self)');
  const js = read(SCRIPT);
  const fetches = [...js.matchAll(/fetch\(\s*'([^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['/app/catalog.json']);
  assert.doesNotMatch(js, /XMLHttpRequest|WebSocket|EventSource|sendBeacon|innerHTML|localStorage|document\.cookie/);
  const refs = [...h.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).filter((r) => !/^(mailto:|#|https:\/\/keepitil\.com\/)/.test(r));
  for (const r of refs) assert.ok(pathExists(r), `dangling reference in /app/: ${r}`);
});

test('/app/submit/ posts nowhere: no off-site form action, no scripts, CSP form-action none', () => {
  const h = read(SUBMIT);
  assert.deepEqual(offsiteFormActions(h), []);
  assert.doesNotMatch(h, /<form\b/i, 'submit page is a static explainer with no form');
  assert.doesNotMatch(h, /<script\b/i, 'submit page has no scripts');
  assert.doesNotMatch(h, /<iframe\b/i);
  assert.match(h, /href="mailto:info@keepitil\.com/);
  const refs = [...h.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).filter((r) => !/^(mailto:|#|https:\/\/keepitil\.com\/)/.test(r));
  for (const r of refs) assert.ok(pathExists(r), `dangling reference in /app/submit/: ${r}`);
});

test('both pages carry a CSP meta; any <base> comes before it', () => {
  for (const f of [STORE, SUBMIT]) {
    const h = read(f);
    const csp = h.search(/<meta http-equiv="Content-Security-Policy"/i);
    assert.ok(csp > 0, `${f} has no CSP meta`);
    const m = h.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i)[1];
    assert.match(m, /form-action 'none'/);
    assert.match(m, /object-src 'none'/);
    assert.doesNotMatch(m, /https?:|\*/, `${f} CSP allows another host`);
    const base = h.search(/<base\b/i);
    if (base >= 0) assert.ok(base < csp, `${f}: <base> must come before the CSP meta`);
  }
});
