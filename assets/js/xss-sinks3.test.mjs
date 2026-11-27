/*
 * Stored/DOM XSS sinks found by the innerHTML audit (user/profile/event fields reaching innerHTML raw):
 *   (a) index.html  homepage Spotlight widget: profile_meta display_name / tagline / bio / avatar_url / slug
 *   (b) assets/js/keepitil-social.js  share menu: title (from data-share-title / document.title / event title)
 *   (c) profile.html renderCategories (class + label) and cpPreview (media URL)
 *   (d) assets/js/keepitil-radio.js paintStations: station name / art
 * Real functions are sliced out of the shipped files and run in node:vm with a minimal fake DOM.
 * Each hostile input must come out as inert text: no on* handler, no injected <img>/<script>, no attribute breakout.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(dir, '../..', rel), 'utf8');
const slice = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, 'marker: ' + from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, 'end marker: ' + to); return src.slice(a, b); };

const HOSTILE = '"><img src=x onerror=alert(1)>';
const HOSTILE_TAG = '<script>alert(1)</script>';

function fakeEl(tag) {
  const el = {
    tag, innerHTML: '', textContent: '', className: '', id: '', children: [], style: {}, onclick: null, _l: [],
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener(t, f) { el._l.push([t, f]); },
    setAttribute() {}, getAttribute() { return null; }, remove() {},
    querySelector() { return fakeEl('div'); }, querySelectorAll() { return []; }
  };
  return el;
}
/* every tag in the output, parsed properly (quoted values stripped before looking at attribute names) */
function assertInert(html, label) {
  const tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  let m, n = 0;
  while ((m = tagRe.exec(html))) {
    n++;
    const name = m[1].toLowerCase();
    const bare = m[2].replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
    const attrs = [...bare.matchAll(/([^\s=>\/]+)/g)].map((x) => x[1].toLowerCase());
    assert.notEqual(name, 'script', label + ': injected <script>');
    if (name === 'img') assert.equal(/\bsrc=x\b/.test(m[2].replace(/"[^"]*"/g, '""')), false, label + ': injected <img src=x>');
    for (const a of attrs) {
      if (!/^on/.test(a)) continue;
      // the one handler the code itself writes: the avatar fallback  onerror="this.style.display='none';..."
      if (a === 'onclick' && /onclick="cp(RemoveItem|MoveItem)\(\d+(,-?1)?\)"/.test(m[2])) continue;   // the code's own numeric index handlers
      assert.ok(a === 'onerror' && /this\.style\.display=/.test(m[2]) && !/alert/.test(m[2]), label + ': unexpected handler ' + a + ' in ' + m[0].slice(0, 90));
    }
  }
  assert.ok(n >= 1, label + ': markup present');
}

test('(a) index Spotlight: hostile profile_meta fields are escaped', () => {
  const src = read('index.html');
  const code = slice(src, 'function initials(', 'async function initWidgets');
  const track = fakeEl('div'), dots = fakeEl('div');
  const widget = fakeEl('div');
  widget.querySelector = (s) => (s.includes('dots') ? dots : track);
  const ctx = vm.createContext({ document: { createElement: fakeEl }, setInterval() { return 0; }, setTimeout() { return 0; }, String, RegExp });
  vm.runInContext(code + '\nthis.buildWidget=buildWidget;', ctx);
  ctx.buildWidget(widget, [
    { name: HOSTILE, tag: HOSTILE_TAG, bio: '<b onmouseover=alert(1)>x</b>', link: '/profile?slug=x" onclick="alert(1)', img: 'javascript:alert(1)', type: HOSTILE },
    { name: 'ok', tag: 't', bio: 'b', link: '/profile?slug=ok', img: 'https://cdn.example.test/a.jpg', type: 'Profile' },
    { name: 'x', tag: '', bio: '', link: '/p', img: '"><img src=x onerror=alert(1)>', type: 'Profile' }
  ], 'var(--artist-color)');
  assert.equal(track.children.length, 3);
  for (const s of track.children) assertInert(s.innerHTML, 'slide');
  assert.equal(/javascript:/i.test(track.children[0].innerHTML), false, 'javascript: image URL dropped');
  assert.match(track.children[1].innerHTML, /src="https:\/\/cdn\.example\.test\/a\.jpg"/, 'a normal https avatar still renders');
});

test('(b) share menu: hostile title cannot inject markup', () => {
  const src = read('assets/js/keepitil-social.js');
  const body = fakeEl('body'), head = fakeEl('head'); let ov;
  const doc = {
    body, head, title: 'T',
    getElementById() { return null; },
    createElement(t) { const e = fakeEl(t); if (t === 'div') ov = e; return e; },
    querySelector() { return null; }, addEventListener() {}
  };
  doc.body.appendChild = (c) => c;
  const win = {};
  const ctx = vm.createContext({ window: win, document: doc, navigator: {}, location: { href: 'https://keepitil.com/e' }, encodeURIComponent, String, RegExp, console, setTimeout() {} });
  vm.runInContext(src, ctx);
  win.KEEPITIL.share({ title: HOSTILE, text: 'x', url: 'https://keepitil.com/e?a="><img src=x onerror=alert(1)>' });
  assert.ok(ov, 'menu built');
  assertInert(ov.innerHTML, 'share');
  assert.equal(ov.innerHTML.includes(HOSTILE), false, 'raw title absent');
  assert.match(ov.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/, 'title shown as text');
});

test('(c) profile: category badges and cpPreview escape hostile values', () => {
  const src = read('profile.html');
  const escCode = src.slice(src.indexOf('function esc(s)'), src.indexOf('\n', src.indexOf('function esc(s)')));
  const cats = fakeEl('div');
  const els = { pfCats: cats };
  const doc = { getElementById: (id) => els[id] || null, createElement: fakeEl };
  const ctx = vm.createContext({ document: doc, PROFILE: { categories: [HOSTILE, 'artist'] }, String, RegExp, cpPreview() {} });
  vm.runInContext(escCode + '\n' + slice(src, 'function renderCategories(){', '\n}\n') + '\n}\nthis.renderCategories=renderCategories;', ctx);
  ctx.renderCategories();
  assertInert(cats.innerHTML, 'categories');
  assert.match(cats.innerHTML, /pf-catbadge artist">Artist</, 'valid category unchanged');

  const drop = fakeEl('div'), thumbs = fakeEl('div');
  const CP = { items: [{ media: HOSTILE, mtype: 'image' }, { media: HOSTILE, mtype: 'video' }] };
  const e2 = { cpDrop: drop, cpThumbs: thumbs, cpUrl: { value: '' } };
  const ctx2 = vm.createContext({ document: { getElementById: (id) => e2[id] || null, createElement: fakeEl }, CP, String, RegExp });
  const a = src.indexOf('function cpPreview(){'), z = src.indexOf('\nfunction ', a + 10);
  vm.runInContext(escCode + '\n' + src.slice(a, z) + '\nthis.cpPreview=cpPreview;', ctx2);
  ctx2.cpPreview();
  assertInert(drop.innerHTML, 'cpDrop');
  assertInert(thumbs.innerHTML, 'cpThumbs');
});

test('(d) radio paintStations: hostile station name/art are escaped', () => {
  const src = read('assets/js/keepitil-radio.js');
  const code = slice(src, 'function paintStations(){', '  function setRadioUI(');
  const host = fakeEl('div'); host.querySelectorAll = () => [];
  const ctx = vm.createContext({
    document: { getElementById: () => host }, KIL_PL: [{ name: HOSTILE_TAG + '<img src=x onerror=alert(1)>', art: HOSTILE }], KIL_PL_I: 0,
    syncStationArrows() {}, kilLoadPlaylist() {}, String, RegExp
  });
  vm.runInContext(code + '\nthis.paintStations=paintStations;', ctx);
  ctx.paintStations();
  assertInert(host.innerHTML, 'stations');
  assert.equal(host.innerHTML.includes('<script>'), false);
});
