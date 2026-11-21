// node --test assets/js/earn-cleanup.test.mjs   (no dependencies)
//
// Joe 2026-11-20 6:42 PM: "For the earn pay remove sections 1.) Keepitil radio 2.) playlist"
// Joe 2026-11-20 6:43 PM: "Also this affiliate is supposed to be in the earn section carousel. Not on its own."
//
// Earn has no radio or playlist section, no Radio / Playlists filter chips and no station/genre
// search. The Kit affiliate is ONE slide inside the #affGrid carousel, with its link and its
// "Affiliate link" disclosure; there is no standalone affiliate card anywhere on Earn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EARN = readFileSync(new URL('../../earn/index.html', import.meta.url), 'utf8');
const SHELL = readFileSync(new URL('../../keepitil-shell.js', import.meta.url), 'utf8');

/* Markup only: comments and <script>/<style> bodies removed. */
const markup = (h) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');

/* The inner HTML of the element whose opening tag matches `openRe`, honouring nested <div>/<a>. */
export function innerOf(html, openRe) {
  const m = openRe.exec(html);
  if (!m) return null;
  const tag = /^<(\w+)/.exec(m[0])[1];
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'g');
  re.lastIndex = m.index + m[0].length;
  let depth = 1, t;
  while ((t = re.exec(html))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(m.index + m[0].length, t.index);
  }
  return null;
}

export function radioPlaylistProblems(html) {
  const m = markup(html);
  const out = [];
  for (const id of ['stations', 'playlists', 'stationGrid', 'plList', 'krBar', 'kilPlaylistFlow', 'radQ', 'eS']) {
    if (new RegExp('\\bid="' + id + '"').test(m)) out.push('#' + id);
  }
  if (/<h2>\s*KEEPITIL RADIO\s*<\/h2>|<h2>\s*ADD PLAYLIST\s*<\/h2>/i.test(m)) out.push('radio/playlist heading');
  if (/href="#(stations|playlists)"/.test(m)) out.push('anchor to removed section');
  if (/<h3>\s*(RADIO|PLAYLISTS)\s*<\/h3>/.test(m)) out.push('radio/playlist INFO card');
  const seg = innerOf(m, /<div class="seg" id="radSeg">/) || '';
  const chips = [...seg.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((b) => b[1].trim().toUpperCase());
  if (chips.some((c) => /RADIO|PLAYLIST|HIPHOP|HIP-HOP|RAP/.test(c))) out.push('chips: ' + chips.join(','));
  if (/data-k="(stations|playlists)"/.test(m)) out.push('stations/playlists filter key');
  if (/<script[^>]*src="[^"]*(keepitil-playlist-submit|keepitil-earn-tuner)\.js|_t\.src='[^']*keepitil-earn-tuner/.test(html)) out.push('playlist form script');
  return out;
}

export function kitProblems(html) {
  const m = markup(html);
  const out = [];
  if ((m.match(/partners\.kit\.com/g) || []).length !== 1) out.push('Kit link count != 1');
  const grid = innerOf(m, /<div class="grid g-cards" id="affGrid">/);
  if (grid == null) { out.push('no #affGrid carousel'); return out; }
  const kit = innerOf(grid, /<a [^>]*id="kitAffiliate"[^>]*>/);
  if (kit == null) out.push('Kit tile is not inside #affGrid');
  else {
    const tag = /<a [^>]*id="kitAffiliate"[^>]*>/.exec(grid)[0];
    if (!/href="https:\/\/partners\.kit\.com\/9goaxz09kexk"/.test(tag)) out.push('Kit href changed');
    if (!/rel="noopener sponsored"/.test(tag)) out.push('Kit rel changed');
    if (!/<span class="chip">Affiliate link<\/span>/.test(kit)) out.push('Kit disclosure missing');
  }
  // No affiliate card outside the carousel: every aff-card in static markup sits inside #affGrid.
  const all = (m.match(/class="card aff-card"/g) || []).length;
  const inside = (grid.match(/class="card aff-card"/g) || []).length;
  if (all !== inside) out.push(all - inside + ' aff-card(s) outside the carousel');
  if (/id="affKit"/.test(m)) out.push('standalone #affKit grid');
  return out;
}

test('Earn has no KEEPITIL Radio or playlist section, chips, search, INFO cards or anchors', () => {
  assert.deepEqual(radioPlaylistProblems(EARN), []);
});

test('Earn filter chips are exactly All, Create, Earn', () => {
  const seg = innerOf(markup(EARN), /<div class="seg" id="radSeg">/);
  const chips = [...seg.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((b) => b[1].trim());
  assert.deepEqual(chips, ['All', 'Create', 'Earn']);
});

test('INFO panels stay index-aligned: MAP rows match the HOW YOU EARN cards in order', () => {
  const map = /var MAP = \[([\s\S]*?)\];/.exec(EARN)[1];
  const labels = [...map.matchAll(/\['(\w+)',\s*'(\w+)'\]/g)].map((r) => r[2]);
  const hye = innerOf(EARN, /<section id="howyouearn">/);
  const cards = [...hye.matchAll(/<article class="hye">[\s\S]*?<h3>(\w+)<\/h3>/g)].map((r) => r[1]);
  assert.deepEqual(labels, ['CREATE', 'EARN']);
  assert.deepEqual(cards, labels);
});

test('Earn JS no longer wires radio/playlist sections (filter map, pager, bar swap)', () => {
  assert.match(EARN, /var SEC=\{create:'create',earn:'earn'\};/);
  assert.ok(!/EARN MOBILE RADIO\/SEARCH SWAP/.test(EARN));
  assert.ok(!/\{ ids:\['stations'\]/.test(EARN));
  assert.ok(!/body\.rad-m #kil-radio\{display:none/.test(EARN), 'the shell player is not hidden on Earn phones any more');
});

test('Kit affiliate is one slide inside the Earn carousel, same link, same disclosure', () => {
  assert.deepEqual(kitProblems(EARN), []);
});

test('the carousel repaint keeps the Kit and Shop slides', () => {
  assert.match(EARN, /var KEEP_SLIDES=\['kitAffiliate','earnShopCard'\]/);
  const paint = /function paintPartners\(\)\{([\s\S]*?)\n  \}/.exec(EARN)[1];
  assert.ok(paint.indexOf('grid.innerHTML') < paint.indexOf('KEEP_SLIDES.forEach(function(n){ grid.appendChild(n); });'));
});

test('/shop/ is reachable from Earn (carousel slide) and the footer', () => {
  const grid = innerOf(markup(EARN), /<div class="grid g-cards" id="affGrid">/);
  assert.match(grid, /<a class="card aff-card" id="earnShopCard" href="\/shop\/"/);
  assert.match(SHELL, /\+'<a href="\/shop\/">Shop<\/a>'/);
});

test('NEGATIVE CONTROL: the checks fail on the pre-hotfix Earn markup', () => {
  // Shapes from origin/main 2663aa7.
  const oldRadio = '<div class="controls kil-filter-shell" id="radControls"><div class="controls-row"><div class="seg" id="radSeg">'
    + '<button data-k="all" class="on">All</button><button data-k="stations">Radio</button><button data-k="playlists">Playlists</button>'
    + '<button data-k="create">Create</button><button data-k="earn">Earn</button></div></div></div>'
    + '<section id="stations"><div class="sh"><h2>KEEPITIL RADIO</h2></div><div class="grid g-stations" id="stationGrid"></div></section>'
    + '<section id="playlists"><div class="sh"><h2>ADD PLAYLIST</h2></div><div id="kilPlaylistFlow"></div><div class="grid g-cards" id="plList"></div></section>'
    + '<script src="/assets/js/keepitil-playlist-submit.js?v=20260924a" defer></script>';
  const r = radioPlaylistProblems(oldRadio);
  for (const want of ['#stations', '#playlists', '#stationGrid', '#plList', '#kilPlaylistFlow', 'radio/playlist heading', 'stations/playlists filter key', 'playlist form script']) {
    assert.ok(r.includes(want), want + ' in ' + r);
  }
  assert.ok(r.some((x) => x.startsWith('chips:')));

  const oldKit = '<section id="earn"><div class="grid g-cards" id="affGrid"></div>'
    + '<div class="grid g-cards" id="affKit" style="margin-top:14px">'
    + '<a class="card aff-card" id="kitAffiliate" href="https://partners.kit.com/9goaxz09kexk" target="_blank" rel="noopener sponsored"><span class="chip">Affiliate link</span></a>'
    + '</div></section>';
  const k = kitProblems(oldKit);
  assert.ok(k.includes('Kit tile is not inside #affGrid'), k);
  assert.ok(k.includes('standalone #affKit grid'), k);
  assert.ok(k.some((x) => /outside the carousel/.test(x)), k);

  // Inside the carousel but with the disclosure dropped: still caught.
  const noChip = '<div class="grid g-cards" id="affGrid"><a class="card aff-card" id="kitAffiliate" href="https://partners.kit.com/9goaxz09kexk" rel="noopener sponsored">Kit</a></div>';
  assert.ok(kitProblems(noChip).includes('Kit disclosure missing'));
});
