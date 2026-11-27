/*
 * games/*: places a game renders data that comes from OTHER users or the server.
 *   (a) KMOB weekly leaderboard: x.player (another player's id) reached innerHTML raw
 *   (b) KBeats artist page: a.avatar (artist-supplied URL) reached an <img src="..."> attribute raw
 *   (c) KWARS kingdom panel: profile name/title (also restored from cloud saves) reached innerHTML raw
 * Real code is sliced out of the shipped files and run in node:vm with hostile input.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(dir, '../..', rel), 'utf8');
const HOSTILE = '"><img src=x onerror=alert(1)>';
const noExec = (html, label) => {
  assert.equal(/<img[^>]*src=x/i.test(html), false, label + ': injected <img src=x>');
  assert.equal(/<script/i.test(html), false, label + ': injected <script>');
};

test('(a) KMOB weekly leaderboard escapes the other player id', () => {
  const src = read('games/kmob/js/main.js');
  const a = src.indexOf("LB.top('weekly').then(");
  assert.ok(a >= 0);
  const stmt = src.slice(a, src.indexOf('});', src.indexOf('el.innerHTML', a)) + 3);
  const el = { innerHTML: '' };
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ctx = vm.createContext({ LB: { top: async () => [{ player: '<img src=x onerror=alert(1)>', wave: 7 }, { player: 'abcd1234', wave: 3 }] }, $: () => el, save: { player: 'me' }, esc, String });
  vm.runInContext(stmt, ctx);
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    assert.ok(el.innerHTML.includes('THIS WEEK'), 'rendered');
    noExec(el.innerHTML, 'kmob lb');
    assert.match(el.innerHTML, /&lt;img/);
    assert.match(el.innerHTML, /2\. abcd W3/);
  });
});

test('(b) KBeats artist avatar is attribute-escaped', () => {
  const src = read('games/kbeats/js/app.js');
  const a = src.indexOf('<img class="av" src="');
  assert.ok(a >= 0);
  const frag = src.slice(a, src.indexOf('width="120"', a));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ctx = vm.createContext({ esc, coverArt: () => 'data:image/svg+xml,x', a: { avatar: HOSTILE, slug: 's' }, String });
  const html = vm.runInContext('`' + frag + '`', ctx);
  assert.equal(/src="[^"]*"[^>]*onerror/.test(html), false, 'attribute not broken out of');
  assert.equal((html.match(/"/g) || []).length, 6, 'only the code\'s own quotes (class, src, alt)');
});

test('(c) KWARS kingdom panel escapes profile name and title', () => {
  const src = read('games/kwars/src/systems/experience.js');
  const e = src.indexOf('function escH(');
  assert.ok(e >= 0, 'escH helper present');
  const escCode = src.slice(e, src.indexOf('\n', e));
  const a = src.indexOf('function showKingdom(){');
  const fn = src.slice(a, src.indexOf('\n', a));
  const body = { innerHTML: '' }, title = { textContent: '' };
  const ctx = vm.createContext({
    data: { profile: { name: HOSTILE, title: '<script>alert(1)</script>', legacyLevel: 1, legacyXP: 2, gems: 3 }, records: { highestWave: 1, longestRun: 2, enemiesDefeated: 3, bossesDefeated: 4 } },
    window: {}, mins: (n) => n + 'm',
    document: { getElementById: (id) => (id === 'panelbody' ? body : title) },
    panel: { classList: { remove() {} } }, String
  });
  vm.runInContext(escCode + '\nfunction showPanel(t,h){document.getElementById("paneltitle").textContent=t;document.getElementById("panelbody").innerHTML=h;}\n' + fn + '\nshowKingdom();', ctx);
  noExec(body.innerHTML, 'kwars kingdom');
  assert.match(body.innerHTML, /&lt;script&gt;/);
});
