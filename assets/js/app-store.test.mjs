// KEEPITIL storefront (/app/) and developer page (/app/submit/).
// Run: node --test assets/js/app-store.test.mjs
// APP_STORE_TEST_ROOT overrides the repo root.
// Every guard below also runs against a known-bad input (negative controls) so a guard that
// can never fail is caught.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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

// Content of <meta name="robots">, lower-cased with spaces removed, or null when absent.
function robotsMeta(html) {
  const m = html.match(/<meta\s+name\s*=\s*["']robots["']\s+content\s*=\s*["']([^"']*)["']/i)
    || html.match(/<meta\s+content\s*=\s*["']([^"']*)["']\s+name\s*=\s*["']robots["']/i);
  return m ? m[1].toLowerCase().replace(/\s+/g, '') : null;
}
const isNoindexNofollow = (html) => { const r = robotsMeta(html); return !!r && r.split(',').includes('noindex') && r.split(',').includes('nofollow'); };

// Apple marks or wording (A199-3). Case-insensitive; also catches app-store / appstore.
const APPLE_WORDING = /app[\s_-]*store|apple|iphone|ipad/gi;
const appleWording = (text) => [...text.matchAll(APPLE_WORDING)].map((m) => m[0]);

// Form controls a visitor could type into or pick from.
const formControls = (html) => [...html.matchAll(/<(input|textarea|select)\b/gi)].map((m) => m[1].toLowerCase());

// href values that are mailto: links.
const mailtoLinks = (html) => [...html.matchAll(/\bhref\s*=\s*["']?(mailto:[^"'\s>]*)/gi)].map((m) => m[1]);

// Sitemap <loc> entries for the storefront pages /app/ and /app/submit/.
const sitemapStoreLocs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
  .filter((u) => /^https?:\/\/(www\.)?keepitil\.com\/app(\/(submit\/?)?)?(index\.html)?([?#].*)?$/i.test(u));

// Storefront files this page owns: everything directly in app/ plus app/submit/. The per-product
// bundles under app/<product>/ (tuitea, kaitarako) predate the storefront and ship third-party
// build output, so they are not part of this scan.
function storefrontFiles(root = ROOT) {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, 'app'), { withFileTypes: true })) if (e.isFile()) out.push(path.posix.join('app', e.name));
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = path.posix.join(rel, e.name);
      if (e.isDirectory()) walk(r); else out.push(r);
    }
  };
  walk('app/submit');
  return out.sort();
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

  assert.equal(isNoindexNofollow('<meta name="robots" content="index,follow">'), false);
  assert.equal(isNoindexNofollow('<meta name="robots" content="noindex">'), false, 'noindex alone is not enough');
  assert.equal(isNoindexNofollow('<title>no robots meta</title>'), false);
  assert.equal(isNoindexNofollow('<meta name="robots" content="noindex, nofollow">'), true);
  assert.equal(isNoindexNofollow('<meta content="NOINDEX,NOFOLLOW" name="robots">'), true);
  assert.deepEqual(appleWording('<title>KEEPITIL App Store</title>'), ['App Store']);
  assert.deepEqual(appleWording('font:-apple-system; APPLE; app-store; AppStore; iPhone'), ['apple', 'APPLE', 'app-store', 'AppStore', 'iPhone']);
  assert.deepEqual(appleWording('KEEPITIL Apps /app/store.js'), []);
  assert.deepEqual(formControls('<input type="text"><TEXTAREA></TEXTAREA><select></select>'), ['input', 'textarea', 'select']);
  assert.deepEqual(formControls('<p>no input fields here</p>'), []);
  assert.deepEqual(mailtoLinks('<a href="mailto:a@x">a</a><a href=mailto:b@x>b</a><a href="/x">x</a>'), ['mailto:a@x', 'mailto:b@x']);
  assert.deepEqual(sitemapStoreLocs('<loc>https://keepitil.com/app/</loc><loc>https://keepitil.com/app/submit/</loc><loc>https://keepitil.com/app/tuitea/</loc>'),
    ['https://keepitil.com/app/', 'https://keepitil.com/app/submit/']);
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

// ---------- Sentinel / Grok A199 findings ----------

test('A199-1/2: /app/ and /app/submit/ are noindex, nofollow and not in any sitemap', () => {
  for (const f of [STORE, SUBMIT]) {
    const h = read(f);
    assert.equal(robotsMeta(h), 'noindex,nofollow', `${f} robots meta`);
    assert.equal((h.match(/<meta\s+name\s*=\s*["']robots["']/gi) || []).length, 1, `${f} has exactly one robots meta`);
  }
  const maps = fs.readdirSync(ROOT).filter((n) => /^sitemap.*\.xml$/i.test(n));
  assert.ok(maps.includes('sitemap.xml'), 'sitemap.xml present');
  for (const m of maps) assert.deepEqual(sitemapStoreLocs(read(m)), [], `${m} lists the storefront`);
});

test('A199-3: no App Store or Apple wording anywhere in the storefront files (catalog included)', () => {
  const files = storefrontFiles();
  for (const f of [STORE, SUBMIT, SCRIPT, CATALOG]) assert.ok(files.includes(f), `${f} is scanned`);
  for (const f of files) {
    assert.deepEqual(appleWording(f), [], `file name ${f}`);
    if (/\.(html|js|mjs|json|css|txt|md|svg|xml|webmanifest)$/i.test(f)) assert.deepEqual(appleWording(read(f)), [], `${f}`);
  }
  // The catalog values themselves, after JSON decoding.
  assert.deepEqual(appleWording(JSON.stringify(JSON.parse(read(CATALOG)))), []);
  for (const f of [STORE, SUBMIT]) {
    const title = read(f).match(/<title>([^<]*)<\/title>/i)[1];
    assert.match(title, /KEEPITIL Apps/, `${f} title says KEEPITIL Apps`);
  }
});

test('A199-4: /app/submit/ has no form fields and exactly one mailto link', () => {
  const h = read(SUBMIT);
  assert.deepEqual(formControls(h), [], 'no input, textarea or select');
  assert.doesNotMatch(h, /class="[^"]*\b(placeholder|field)\b/i, 'no placeholder field boxes');
  const mails = mailtoLinks(h);
  assert.equal(mails.length, 1, `expected one mailto link, got ${mails.length}`);
  assert.match(mails[0], /^mailto:info@keepitil\.com(\?|$)/);
  assert.match(h, /<h1>Email us to submit your app<\/h1>/);
});

// ---------- Decisions 2026-11-20: Kai Tarako listed, Soon tiles kept, Find My Weed pre-launch ----------
// These run the real app/store.js logic (loaded in node:vm with no document), not a copy of it.

function storeLogic() {
  const ctx = {};
  vm.runInNewContext(read(SCRIPT), ctx, { filename: SCRIPT });
  assert.ok(ctx.KILStoreLogic, 'store.js exposes its pure logic when there is no document');
  return ctx.KILStoreLogic;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
// Array.from keeps results in this realm (arrays made inside node:vm fail deepStrictEqual on prototype).
const ids = (list) => Array.from(list, (i) => i.id);

test('Kai Tarako is listed and visible; Soon tiles kept for Kingdom Wars, PokaSnap and The Thirteen Anchors', () => {
  const L = storeLogic();
  const cat = JSON.parse(read(CATALOG));
  const vis = ids(L.visibleItems(cat));
  assert.ok(vis.includes('kaitarako'), 'Kai Tarako is rendered');
  const kai = cat.items.find((i) => i.id === 'kaitarako');
  assert.equal(kai.hidden, undefined);
  assert.equal(kai.href, '/app/kaitarako/');
  for (const id of ['kwars', 'pokasnap', 'thirteen']) {
    const it = cat.items.find((i) => i.id === id);
    assert.ok(it && vis.includes(id), `${id} is rendered`);
    assert.equal(it.cta, 'Soon', `${id} keeps its Soon button`);
    assert.equal(it.status, 'soon');
  }
});

test('Find My Weed: catalog entry is hidden until launch, age-labelled 21+ (18+ medical where legal), and links only under /app/findmyweed/', () => {
  const L = storeLogic();
  const cat = JSON.parse(read(CATALOG));
  const fmw = cat.items.find((i) => i.id === 'findmyweed');
  assert.ok(fmw, 'Find My Weed has a catalog entry');
  assert.equal(fmw.hidden, true, 'hidden until the web launch is live');
  assert.equal(fmw.adults, true);
  assert.ok(!fmw.kids);
  const AGE = '21+ (18+ medical where legal)';
  assert.equal(fmw.ageLabel, AGE, 'badge text');
  assert.equal(fmw.caption, AGE);
  assert.equal(fmw.subtitle, 'Cannabis directory \u00b7 age rules vary by state');
  // Joe 11-21 00:13: 21+, with 18+ medical where legal. Never a bare 18+ and never a 21+-only claim.
  // The catalog and page carry every visible string; store.js adds only these labels.
  const ONLY_21 = /21\s*\+\s*only|only\s+(?:adults\s+)?21|21\s+and\s+over\s+only|adults\s+21\s*\+?\s*only/i;
  // The catalog and the page carry every visible age string (store.js renders the catalog ageLabel).
  for (const f of [CATALOG, STORE]) assert.doesNotMatch(read(f), ONLY_21, `${f} claims 21+ only`);
  assert.ok(!ONLY_21.test(AGE) && ONLY_21.test('Adults 21+ only'), 'CONTROL: the rule passes the real label and catches a 21+-only claim');
  assert.doesNotMatch(read(SCRIPT), /el\('span', 'adult', '18\+'\)/, 'no hard-coded bare 18+ badge');
  assert.match(read(SCRIPT), /el\('span', 'adult', item\.ageLabel/, 'badge comes from the catalog ageLabel');
  assert.ok(!cat.items.some((i) => i.kids && i.ageLabel), 'no age label on kids content');
  assert.match(read(SCRIPT), /text: 'For adults'/, 'search heading is For adults');
  assert.equal(fmw.href, '/app/findmyweed/');
  for (const u of catalogUrls(fmw)) assert.ok(u.startsWith('/app/findmyweed/'), `FMW references ${u}`);

  // Hidden: never rendered, not even by search.
  assert.ok(!ids(L.visibleItems(cat)).includes('findmyweed'));
  const items = L.visibleItems(cat);
  for (const q of ['', 'cannabis', 'find my weed', '18+', 'adults', 'apps']) {
    const g = L.searchGroups(items, q);
    assert.ok(!ids(g.main).includes('findmyweed') && !ids(g.adults).includes('findmyweed'), `search "${q}" shows FMW`);
  }

  // CONTROL: the same code with hidden:false renders it, but only grouped as adults, only when searched.
  const launched = clone(cat);
  launched.items.find((i) => i.id === 'findmyweed').hidden = false;
  const li = L.visibleItems(launched);
  assert.ok(ids(li).includes('findmyweed'), 'CONTROL: unhiding makes it visible');
  assert.ok(!ids(L.searchGroups(li, '').main).includes('findmyweed'), 'not in Suggested');
  assert.deepEqual(ids(L.searchGroups(li, '').adults), [], 'Suggested never shows adult items');
  assert.deepEqual(ids(L.searchGroups(li, 'cannabis').adults), ['findmyweed']);
  assert.ok(!ids(L.searchGroups(li, 'apps').main).includes('findmyweed'), 'adult items never mix into the main results');
  const byId = Object.fromEntries(li.map((i) => [i.id, i]));
  const adultShelf = launched.shelves.apps.find((s) => s.adults);
  assert.deepEqual(ids(L.shelfItems(adultShelf, byId)), ['findmyweed']);
  for (const s of launched.shelves.apps.filter((x) => !x.adults)) assert.ok(!ids(L.shelfItems(s, byId)).includes('findmyweed'));
  assert.equal(L.placeable(byId.findmyweed), false, 'never on Today or a feature card');
});

test('layout: the For adults shelf is separate from and never next to the kids shelf', () => {
  const L = storeLogic();
  const cat = JSON.parse(read(CATALOG));
  assert.deepEqual(Array.from(L.layoutProblems(cat)), []);
  const apps = cat.shelves.apps;
  const kidsAt = apps.findIndex((s) => s.items.includes('kaitarako'));
  const adultsAt = apps.findIndex((s) => s.adults);
  assert.ok(kidsAt >= 0 && adultsAt >= 0 && Math.abs(kidsAt - adultsAt) > 1, 'at least one shelf between kids and For adults');

  // NEGATIVE CONTROLS: each rule fails on a planted bad layout.
  const bad = (mut) => { const c = clone(cat); mut(c); return L.layoutProblems(c); };
  assert.ok(bad((c) => c.today.push({ item: 'findmyweed', title: 'x' })).some((p) => /on Today/.test(p)));
  assert.ok(bad((c) => { c.features.apps.item = 'findmyweed'; }).some((p) => /feature/.test(p)));
  assert.ok(bad((c) => { c.shelves.apps = [c.shelves.apps[0], c.shelves.apps[2], c.shelves.apps[1]]; }).some((p) => /next to kids shelf/.test(p)));
  assert.ok(bad((c) => c.shelves.apps.find((s) => s.adults).items.push('kaitarako')).some((p) => /kids item kaitarako in an adults shelf/.test(p)));
  assert.ok(bad((c) => c.shelves.apps[1].items.push('findmyweed')).some((p) => /outside an adults shelf/.test(p)));
  assert.ok(bad((c) => { c.shelves.apps.find((s) => s.adults).title = 'Grown-ups'; }).some((p) => /must say adults/.test(p)));
  assert.ok(bad((c) => { c.shelves.apps.find((s) => s.adults).subtitle = 'Adults 21+ only'; }).some((p) => /must not claim 21\+ only/.test(p)));
  assert.ok(bad((c) => { c.items.find((i) => i.id === 'findmyweed').ageLabel = '18+'; }).some((p) => /bare 18\+/.test(p)));
  assert.ok(bad((c) => { c.items.find((i) => i.id === 'findmyweed').ageLabel = '21+ only'; }).some((p) => /findmyweed: must not claim 21\+ only/.test(p)));
  assert.ok(bad((c) => { delete c.items.find((i) => i.id === 'findmyweed').ageLabel; }).some((p) => /needs an ageLabel/.test(p)));
  assert.ok(bad((c) => { c.items.find((i) => i.id === 'kaitarako').ageLabel = '21+'; }).some((p) => /kids item carries an age label/.test(p)));
  // The corrected label itself passes.
  assert.deepEqual(Array.from(L.layoutProblems(cat)), []);
  assert.ok(bad((c) => { c.items.find((i) => i.id === 'kaitarako').adults = true; }).some((p) => /both kids and adults/.test(p)));
  // shelfItems refuses a kids item in an adults shelf even if the catalog put it there.
  const byId = Object.fromEntries(cat.items.map((i) => [i.id, i]));
  assert.deepEqual(ids(L.shelfItems({ adults: true, items: ['kaitarako', 'findmyweed'] }, byId)), ['findmyweed']);
  assert.deepEqual(ids(L.shelfItems({ items: ['kaitarako', 'findmyweed'] }, byId)), ['kaitarako']);
});

// ---------- Sentinel round 3 ----------

const shelfTitles = (list) => Array.from(list, (x) => x.shelf.title);

test('M199-R3-1: a shelf with no visible items is not drawn, in every tab (no empty For adults shelf while FMW is hidden)', () => {
  const L = storeLogic();
  const cat = JSON.parse(read(CATALOG));
  const visById = (c) => Object.fromEntries(Array.from(L.visibleItems(c), (i) => [i.id, i]));
  const byId = visById(cat);
  for (const tab of Object.keys(cat.shelves)) {
    const drawn = Array.from(L.visibleShelves(cat.shelves[tab], byId));
    for (const x of drawn) assert.ok(x.items.length > 0, `${tab}/${x.shelf.title} drawn empty`);
    for (const s of cat.shelves[tab]) {
      const n = L.shelfItems(s, byId).length;
      assert.equal(shelfTitles(drawn).includes(s.title), n > 0, `${tab}/${s.title}: drawn iff it has visible items`);
    }
  }
  assert.deepEqual(shelfTitles(L.visibleShelves(cat.shelves.apps, byId)), ['For kids', 'KEEPITIL Apps'], 'no For adults shelf while FMW is hidden');
  // store.js draws shelves only through visibleShelves.
  const js = read(SCRIPT);
  assert.match(js, /visibleShelves\(\(cat\.shelves && cat\.shelves\[k\]\)/);
  assert.doesNotMatch(js, /\.forEach\(function \(s\) \{ box\.appendChild\(shelf\(s/);

  // NEGATIVE CONTROL: once FMW is unhidden the same code does draw the For adults shelf.
  const launched = clone(cat);
  launched.items.find((i) => i.id === 'findmyweed').hidden = false;
  assert.deepEqual(shelfTitles(L.visibleShelves(launched.shelves.apps, visById(launched))), ['For kids', 'KEEPITIL Apps', 'For adults']);
  // NEGATIVE CONTROL: a plain shelf whose items are all hidden is skipped too.
  const allHidden = clone(cat);
  allHidden.items.find((i) => i.id === 'kaitarako').hidden = true;
  assert.ok(!shelfTitles(L.visibleShelves(allHidden.shelves.apps, visById(allHidden))).includes('For kids'));
});

test('search with FMW unhidden: kids rows first, then a divider, then the For adults group', () => {
  const L = storeLogic();
  const cat = JSON.parse(read(CATALOG));
  const launched = clone(cat);
  launched.items.find((i) => i.id === 'findmyweed').hidden = false;
  // A query that matches Kai Tarako, other apps and FMW at once.
  for (const it of launched.items) if (['kaitarako', 'tuitea', 'findmyweed'].includes(it.id)) it.keywords = [...it.keywords, 'zzshared'];
  const seq = Array.from(L.searchLayout(L.visibleItems(launched), 'zzshared'), (e) => e.type === 'row' ? 'row:' + e.item.id : e.type);
  assert.deepEqual(seq.slice(0, 1), ['row:kaitarako'], 'kids content first');
  const div = seq.indexOf('divider');
  assert.ok(div > 0, 'a divider separates the groups');
  assert.equal(seq[div + 1], 'heading', 'the For adults heading follows the divider');
  assert.ok(seq.indexOf('row:findmyweed') > div + 1, 'adult rows only after the divider and heading');
  assert.ok(seq.indexOf('row:kaitarako') < div && seq.indexOf('row:tuitea') < div);
  assert.equal(Array.from(L.searchLayout(L.visibleItems(launched), 'zzshared')).find((e) => e.type === 'heading').text, 'For adults');
  // store.js draws the divider.
  assert.match(read(SCRIPT), /el\('hr', 'search-divider'\)/);
  assert.match(read(STORE), /\.search-divider\{/);

  // CONTROLS: no adult results -> no divider or heading, and the usual order (kids not forced first).
  const noAdults = Array.from(L.searchLayout(L.visibleItems(launched), ''), (e) => e.type);
  assert.ok(!noAdults.includes('divider') && !noAdults.includes('heading'));
  const hiddenSeq = Array.from(L.searchLayout(L.visibleItems(cat), 'zzshared'), (e) => e.type);
  assert.ok(!hiddenSeq.includes('divider'), 'while FMW is hidden there is no For adults group at all');
  // CONTROL: a layout that put an adult row before the divider would be caught by the checks above.
  const planted = ['row:findmyweed', 'divider', 'heading', 'row:kaitarako'];
  assert.ok(!(planted.indexOf('row:findmyweed') > planted.indexOf('divider') + 1));
});

test('search: when only the For adults group matches (e.g. "weed"), there is no leading divider', () => {
  const L = storeLogic();
  const launched = JSON.parse(read(CATALOG));
  launched.items.find((i) => i.id === 'findmyweed').hidden = false;
  const seq = Array.from(L.searchLayout(L.visibleItems(launched), 'weed'), (e) => e.type === 'row' ? 'row:' + e.item.id : e.type);
  assert.deepEqual(seq, ['heading', 'row:findmyweed']);
  // CONTROL: when the main group is not empty, the divider is still there.
  const both = Array.from(L.searchLayout(L.visibleItems(launched), 'apps'), (e) => e.type);
  assert.equal(both[0], 'row');
  assert.ok(both.indexOf('divider') > 0, 'divider between the main rows and the For adults group');
  for (const it of launched.items) if (['kaitarako', 'findmyweed'].includes(it.id)) it.keywords = [...it.keywords, 'zzpair'];
  const pair = Array.from(L.searchLayout(L.visibleItems(launched), 'zzpair'), (e) => e.type === 'row' ? 'row:' + e.item.id : e.type);
  assert.deepEqual(pair, ['row:kaitarako', 'divider', 'heading', 'row:findmyweed']);
});
