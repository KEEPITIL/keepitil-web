// UNRUN: written under the light-work rule (KODE JOB 16, 2026-11-10). No test, build or browser
// has been executed for this file. Run it only after KODE clears the Mac:
//   node --test assets/js/kapp-tabs.test.mjs
// Env: KAPP_ROOT=<dir> points the checks at another tree (negative control: run it against a clean
//      origin/main checkout and EVERY structural assertion below must FAIL there).
//
// What it proves (static, no browser; jsdom parses markup, the shell array is evaluated alone):
//   1. keepitil-shell.js DESTINATIONS is exactly Discover, Connect, Create, Culture, Earn, in order.
//   2. No Shop tab anywhere shared: shell array, bottom/desktop/footer-sitemap sources, static no-JS navs.
//   3. /shop/ and its children select the EARN slot; /shop/ is linked from Earn > Merch; Shop has a crumb back.
//   4. earn/index.html has exactly four sections (Partner, Merch, Apps & Games, Content Creators).
//   5. The removed Earn markup AND its initialization (radio, playlists, competitions, arcade, pager,
//      airplay, radio opt-in) are gone, and Earn opts out of radio on both breakpoints.
//   6. No money numbers, fees or percentages of KEEPITIL's own, and no "coming soon" dead buttons.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.KAPP_ROOT || join(here, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const shellSrc = read('keepitil-shell.js');
const earnSrc = read('earn/index.html');
const shopSrc = read('shop/index.html');

// ---- helpers -------------------------------------------------------------------------------------
function destinations() {
  const start = shellSrc.indexOf('var DESTINATIONS=[');
  assert.ok(start > -1, 'DESTINATIONS array found');
  const end = shellSrc.indexOf('\n];', start);
  assert.ok(end > start, 'DESTINATIONS array end found');
  const body = shellSrc.slice(start + 'var DESTINATIONS='.length, end + 2); // "[ ... ]"
  return new Function('return ' + body)();
}
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const stripStyle = (s) => s.replace(/<style[\s\S]*?<\/style>/gi, '');
const scriptsOf = (html) => [...stripComments(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const dom = (html) => new JSDOM(html).window.document;
const earnDoc = dom(stripComments(earnSrc));

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (['.git', 'node_modules', 'games', 'app', 'docs', 'db', 'supabase', 'tests', 'kode', 'build-service'].includes(n)) continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (n.endsWith('.html')) out.push(p);
  }
  return out;
}

// ---- 1. the five tabs ------------------------------------------------------------------------------
test('DESTINATIONS is exactly five tabs, in order: Discover, Connect, Create, Culture, Earn', () => {
  const d = destinations();
  assert.deepEqual(d.map((x) => x.label), ['Discover', 'Connect', 'Create', 'Culture', 'Earn']);
  assert.deepEqual(d.map((x) => x.pill), ['DISCOVER', 'CONNECT', 'CREATE', 'CULTURE', 'EARN']);
  assert.deepEqual(d.map((x) => x.href), ['/', '/connect/', '/create/', '/culture/', '/earn/']);
});

test('no Shop tab in the shell: no shop row, no SHOP pill, no shop icon on a destination', () => {
  const d = destinations();
  assert.ok(!d.some((x) => /shop/i.test(x.label + x.pill + x.href + x.icon)));
  assert.ok(!/pill:'SHOP'/.test(shellSrc), "no pill:'SHOP' anywhere in the shell");
});

test('bottom bar, desktop header, header menu and footer sitemap all derive from DESTINATIONS (no separate list)', () => {
  assert.match(shellSrc, /bn\.innerHTML=DESTINATIONS\.map\(/);
  assert.match(shellSrc, /function namedDestinations\(\)\{ return DESTINATIONS\.filter\(/);
  assert.match(shellSrc, /\+DESTINATIONS\.map\(function\(d\)\{ return '<a href="'\+d\.href\+'">'\+d\.label\+'<\/a>'; \}\)\.join\(''\)/);
  // __kilBnavActive indexes DESTINATIONS by position against the rendered anchors: one list, one index.
  assert.match(shellSrc, /DESTINATIONS\.forEach\(function\(d,i\)\{ var a=links\[i\]/);
});

test('/shop/ and its children select the EARN slot, and only the Earn slot', () => {
  const d = destinations();
  const hits = (p) => d.filter((x) => x.match.test(p)).map((x) => x.label);
  for (const p of ['/shop/', '/shop', '/shop.html', '/shop/anything']) {
    assert.deepEqual(hits(p), ['Earn'], p);
  }
  for (const p of ['/earn/', '/earn', '/earn.html', '/radio', '/radio.html']) assert.deepEqual(hits(p), ['Earn'], p);
  assert.deepEqual(hits('/'), ['Discover']);
  assert.deepEqual(hits('/connect/'), ['Connect']);
  assert.deepEqual(hits('/create/'), ['Create']);
  assert.deepEqual(hits('/culture/'), ['Culture']);
  for (const p of ['/shopping', '/services/', '/earnings', '/workshop/']) assert.deepEqual(hits(p), [], p);
});

test('footer keeps direct Shop access as a secondary link, not a destination', () => {
  assert.match(shellSrc, /<a href="\/shop\/" class="v3-foot-sub">Merch shop<\/a>/);
});

test('no static / no-JS nav copy anywhere still lists SHOP as a pillar', () => {
  const offenders = [];
  for (const f of walk(root)) {
    const s = readFileSync(f, 'utf8');
    if (/<a href="\/shop\/">SHOP<\/a>/.test(s)) offenders.push(relative(root, f));
  }
  assert.deepEqual(offenders, []);
});

test('static navs on the pillar pages list the other four pillars plus Login', () => {
  for (const p of ['index.html', 'connect/index.html', 'create/index.html', 'culture/index.html', 'earn/index.html', 'shop/index.html']) {
    const nav = read(p).match(/<ul class="nav-links">([\s\S]*?)<\/ul>/);
    assert.ok(nav, p + ' has a static nav');
    assert.deepEqual([...nav[1].matchAll(/>([A-Z]+)<\/a>/g)].map((m) => m[1]), ['DISCOVER', 'CONNECT', 'CREATE', 'CULTURE', 'EARN'], p);
  }
});

// ---- 3. Shop under Earn > Merch -----------------------------------------------------------------------
test('/shop/ is reachable from Earn > Merch and Shop links back to Earn / Merch', () => {
  assert.ok(earnDoc.querySelector('main #merch a[href="/shop/"]'), 'Merch links to /shop/');
  const crumb = dom(shopSrc).querySelector('nav[aria-label="Breadcrumb"]');
  assert.ok(crumb, 'shop has a breadcrumb');
  assert.ok(crumb.querySelector('a[href="/earn/"]'));
  assert.ok(crumb.querySelector('a[href="/earn/#merch"]'));
  assert.match(crumb.textContent.replace(/\s+/g, ' '), /Earn \/ Merch \/ Shop/);
});

// ---- 4. exactly four Earn sections ---------------------------------------------------------------------
test('Earn has exactly four sections with the spec headings and ids, in order', () => {
  const secs = [...earnDoc.querySelectorAll('main > section')];
  assert.deepEqual(secs.map((s) => s.id), ['partner', 'merch', 'apps-games', 'creators']);
  assert.deepEqual(secs.map((s) => s.querySelector('h2').textContent.trim()), ['PARTNER', 'MERCH', 'APPS & GAMES', 'CONTENT CREATORS']);
  assert.deepEqual(secs.map((s) => s.getAttribute('data-program')), ['partner', 'merch', 'apps-games', 'creators']);
});

test('Earn filter has All + exactly the four programs; ids kept for the shared coarse-pointer CSS', () => {
  const b = [...earnDoc.querySelectorAll('#radSeg button')];
  assert.deepEqual(b.map((x) => x.getAttribute('data-k')), ['all', 'partner', 'merch', 'apps-games', 'creators']);
  assert.ok(earnDoc.getElementById('radQ'));
});

test('Partner keeps its rail and the Kit tile outside the repainted grid (tests/earn-kit.test.mjs contract)', () => {
  assert.ok(earnDoc.querySelector('#partner #affGrid'));
  assert.ok(earnDoc.querySelector('#partner #affKit #kitAffiliate'));
  assert.ok(!earnDoc.querySelector('#affGrid #kitAffiliate'));
});

// ---- 5. removal scope: markup AND initialization -------------------------------------------------------
const REMOVED_IDS = ['stations', 'playlists', 'create', 'earn', 'games', 'howyouearn', 'stationGrid', 'plList', 'earnGrid', 'gamesGrid',
  'krBar', 'kilPlaylistFlow', 'eS', 'eC', 'eG', 'radMTabs', 'radMSecs', 'hyeOv'];

test('removed Earn markup is gone (Radio, Playlists, competition rail, old Earn id, arcade, How you earn, stats)', () => {
  const left = REMOVED_IDS.filter((id) => earnDoc.getElementById(id));
  assert.deepEqual(left, []);
  assert.equal(earnDoc.querySelectorAll('.hye, .hye-grid, .stat, .kr-bar, .g-stations').length, 0);
});

test('no radio / playlist / pager / tuner script is loaded by Earn, and Earn opts out of radio', () => {
  const srcs = [...earnDoc.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
  for (const bad of ['keepitil-radio', 'keepitil-pager', 'keepitil-playlist-submit', 'keepitil-earn-tuner']) {
    assert.ok(!srcs.some((s) => s.includes(bad)), 'script still loaded: ' + bad);
  }
  assert.equal(earnDoc.documentElement.getAttribute('data-radio'), 'off');
  assert.ok(!/data-radio=["']page["']/.test(earnSrc.replace(/<style[\s\S]*?<\/style>/g, '')));
});

test('removed initialization is gone from every inline script (fetches, listeners, loaders)', () => {
  const code = scriptsOf(earnSrc).join('\n');
  for (const bad of ['user_playlists', 'radio_airplay_requests', 'vs_competitions', 'soundcloud', 'renderStations', 'renderPls', 'submitAirplay',
    'kil-radio-state', '__kilRadioSelect', 'KIL_PAGER', 'KIL_PLAYLIST_SUBMIT', 'kil-playlist-submitted', 'getElementById(\'krBar\')',
    'stationGrid', 'plList', 'earnGrid', 'gamesGrid', 'hyeOv', 'radMSecs', 'supabase.co', 'localStorage']) {
    assert.ok(!code.includes(bad), 'initialization remains: ' + bad);
  }
});

test('the shell honours the data-radio="off" opt-out on both breakpoints', () => {
  assert.match(shellSrc, /RADIO_OFF = document\.documentElement\.getAttribute\('data-radio'\) === 'off'/);
  assert.match(shellSrc, /var RADIO_ALLOWED = RULES\.radio && !RADIO_OFF && /);
});

test('legacy Earn hashes map to a new home or the page top, and never throw', () => {
  const code = scriptsOf(earnSrc).join('\n');
  assert.match(code, /var LEGACY=\{earn:'partner',games:'apps-games',stations:'',playlists:'',create:'',howyouearn:''\}/);
  assert.match(code, /hasOwnProperty\.call\(LEGACY,h\)/);
});

// ---- 6. no money numbers, no dead stub buttons ----------------------------------------------------------
function visibleEarnText() {
  const d = dom(stripComments(stripStyle(earnSrc)));
  d.querySelectorAll('script, #affKit').forEach((n) => n.remove()); // #affKit: Kit's own published terms, pinned by tests/earn-kit.test.mjs
  return d.querySelector('main').textContent.replace(/\s+/g, ' ');
}

test('Earn shows no payout numbers, fees, percentages or dollar amounts of KEEPITIL\'s own', () => {
  const t = visibleEarnText();
  assert.ok(!/\d\s*%/.test(t), 'percentage found');
  assert.ok(!/[$€£]\s*\d/.test(t), 'currency amount found');
  assert.ok(!/\b\d+(\.\d+)?\s*(usd|dollars?|cents?|percent|bps)\b/i.test(t), 'money word found');
  assert.ok(!/\b(commission|royalty|revenue share|payout)s?\s+(of|is|are|at)\s+\d/i.test(t));
});

test('no "coming soon" / "details coming" copy and no dead buttons in the four sections', () => {
  const t = visibleEarnText();
  assert.ok(!/coming soon|details coming|stay tuned|waitlist/i.test(t));
  for (const id of ['partner', 'merch', 'apps-games', 'creators']) {
    const s = earnDoc.getElementById(id);
    assert.equal(s.querySelectorAll('button, [role="button"], a[href="#"], a:not([href])').length, 0, id + ' has a dead control');
  }
  // every program card without a live action offers a staffed mailbox, not a button
  for (const id of ['submitArtwork', 'appsGamesInfo', 'creatorsInfo']) {
    assert.ok(earnDoc.querySelector('#' + id + ' a[href="mailto:info@keepitil.com"]'), id + ' mailbox link');
  }
});

test('no Stripe code in this slice', () => {
  for (const [name, src] of [['earn', earnSrc], ['shell', shellSrc]]) {
    assert.ok(!/\bstripe\b/i.test(stripComments(src)), name + ' mentions stripe');
  }
});
