'use strict';
// Traffic Pop prototype tests. Run: node --test games/trafficpop/proto/test.cjs
// Extracts the pure rules block from index.html and checks it against the real game's level data.
// The optional DOM smoke test runs only if `jsdom` can be resolved (set TP_JSDOM to its path if needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const a = html.indexOf('//LOGIC-BEGIN'), b = html.indexOf('//LOGIC-END');
assert.ok(a > 0 && b > a, 'logic markers present');
const TP = vm.runInNewContext(html.slice(a, b) + '\nTP;', {});
const RAW = JSON.parse(html.match(/<script id="levelData" type="application\/json">([\s\S]*?)<\/script>/)[1]);

// helper: tiny level builder
const J = x => JSON.parse(JSON.stringify(x)); // vm objects have a foreign prototype
const lvl = (o) => TP.expand(Object.assign({ w: 4, h: 4, p: 2, v: [], d: [[], []] }, o));

test('page makes no network calls and has no tracking', () => {
  assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|importScripts)\b/);
  assert.doesNotMatch(html, /(src|href)=["']https?:/i);
});

test('level data matches the real game (games/trafficpop/app.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const i = src.indexOf('var A=[{id:"L1"');
  assert.ok(i >= 0, 'found level array in app.js');
  let d = 0, j = i + 6;
  for (; ; j++) { if (src[j] === '[') d++; if (src[j] === ']') { d--; if (!d) break; } }
  const real = J(vm.runInNewContext(src.slice(i + 6, j + 1), {}));
  assert.equal(RAW.length, real.length);
  assert.equal(RAW.length, 60);
  real.forEach((r, k) => {
    const L = TP.expand(RAW[k]);
    assert.equal(L.w, r.w); assert.equal(L.h, r.h); assert.equal(L.parking, r.parking);
    assert.deepEqual(J(L.vehicles.map(v => ({ kind: v.kind, color: v.color, dir: v.dir, x: v.x, y: v.y }))),
      r.vehicles.map(v => ({ kind: v.kind, color: v.color, dir: v.dir, x: v.x, y: v.y })), 'vehicles L' + (k + 1));
    assert.deepEqual(J(L.docks), r.docks, 'docks L' + (k + 1));
  });
});

test('exit rule: only a clear road ahead can leave', () => {
  // car A faces right at x0; car B sits in front at x2.
  const L = lvl({ v: [['car', 'red', 'right', 0, 0], ['car', 'blue', 'right', 2, 0]], d: [[['red', 2]], [['blue', 2]]] });
  const s = TP.initState(L);
  assert.equal(TP.canExit(L, s, 0), false);
  assert.equal(TP.canExit(L, s, 1), true);
  assert.equal(TP.exitVehicle(L, s, 0).reason, 'blocked');
  assert.deepEqual(J(TP.movable(L, s)), [1]);
});

test('multi-cell vehicles use the head cell; direction matters', () => {
  const L = lvl({ v: [['bus', 'red', 'left', 3, 1], ['car', 'blue', 'left', 0, 1]], d: [[['red', 4]], [['blue', 2]]] });
  assert.deepEqual(J(TP.cells(L.vehicles[0])), [[3, 1], [2, 1], [1, 1]]);
  const s = TP.initState(L);
  assert.equal(TP.canExit(L, s, 0), false); // car at x0 is ahead of the bus head at x1
  assert.equal(TP.canExit(L, s, 1), true);
});

test('boarding: matching colour fills seats, dock advances, partial boards stay parked', () => {
  const L = lvl({ v: [['bus', 'red', 'up', 0, 3], ['car', 'blue', 'up', 1, 3], ['car', 'red', 'up', 2, 3]], d: [[['red', 5]], [['blue', 2]]] });
  let r = TP.exitVehicle(L, TP.initState(L), 0); // bus: 4 seats
  assert.ok(r.ok); assert.deepEqual(J(r.boarded), [{ vehicle: 0, dock: 0, n: 4 }]);
  assert.equal(r.state.left[0], 1); assert.equal(r.state.parking[0], null);
  r = TP.exitVehicle(L, r.state, 2); // car: 2 seats, only 1 left -> boards 1 and dock completes
  assert.equal(r.state.dock[0], 1);
  r = TP.exitVehicle(L, r.state, 1);
  assert.ok(TP.isWon(L, r.state));
  assert.equal(r.state.moves, 3);
});

test('non-matching vehicle parks, parking fills, stuck detected', () => {
  const L = lvl({ p: 1, v: [['car', 'green', 'up', 0, 3], ['car', 'green', 'up', 1, 3]], d: [[['red', 2]], [['blue', 2]]] });
  let r = TP.exitVehicle(L, TP.initState(L), 0);
  assert.ok(r.ok); assert.equal(r.state.parking[0], 0);
  assert.equal(TP.exitVehicle(L, r.state, 1).reason, 'parking-full');
  assert.ok(TP.isStuck(L, r.state));
  const more = TP.addSpace(r.state);
  assert.equal(more.parking.length, 2); assert.ok(!TP.isStuck(L, more));
});

test('lift ignores blocking but not parking capacity', () => {
  const L = lvl({ v: [['car', 'red', 'right', 0, 0], ['car', 'blue', 'right', 1, 0]], d: [[['red', 2]], [['blue', 2]]] });
  const s = TP.initState(L);
  assert.equal(TP.exitVehicle(L, s, 0).ok, false);
  const r = TP.liftVehicle(L, s, 0);
  assert.ok(r.ok); assert.equal(r.boarded.length, 1);
});

test('exitVehicle does not mutate the input state', () => {
  const L = TP.expand(RAW[0]); const s = TP.initState(L); const before = JSON.stringify(s);
  const free = TP.movable(L, s)[0];
  TP.exitVehicle(L, s, free);
  assert.equal(JSON.stringify(s), before);
});

test('every one of the 60 levels is solvable and the solution replays to a win', () => {
  RAW.forEach((raw, k) => {
    const L = TP.expand(raw);
    const path = TP.solve(L, TP.initState(L));
    assert.ok(path && path.length, 'level ' + (k + 1) + ' has a solution');
    let s = TP.initState(L);
    for (const i of path) { const r = TP.exitVehicle(L, s, i); assert.ok(r.ok, 'L' + (k + 1) + ' step ' + i + ' ' + r.reason); s = r.state; }
    assert.ok(TP.isWon(L, s), 'level ' + (k + 1) + ' ends won');
    assert.equal(TP.passengersLeft(L, s), 0);
  });
});

test('hint from a mid-game state still leads to a win', () => {
  const L = TP.expand(RAW[9]); let s = TP.initState(L);
  for (let n = 0; n < 3; n++) { const p = TP.solve(L, s); s = TP.exitVehicle(L, s, p[0]).state; }
  const p = TP.solve(L, s); assert.ok(p);
  for (const i of p) s = TP.exitVehicle(L, s, i).state;
  assert.ok(TP.isWon(L, s));
});

// ---- optional DOM smoke check ----
let JSDOM = null;
for (const m of [process.env.TP_JSDOM, 'jsdom'].filter(Boolean)) { try { JSDOM = require(m).JSDOM; break; } catch (e) { /* try next */ } }
test('DOM smoke: play level 1 by clicking vehicles to a win', { skip: !JSDOM && 'jsdom not available' }, async () => {
  const errors = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/proto/',
    beforeParse(w) { w.addEventListener('error', e => errors.push(e.message)); } });
  const w = dom.window, d = w.document, sleep = ms => new Promise(r => setTimeout(r, ms));
  assert.equal(d.querySelectorAll('#levels .lv').length, 60);
  d.querySelectorAll('#levels .lv')[0].click();
  assert.ok(!d.getElementById('game').classList.contains('hidden'));
  const L0 = TP.expand(RAW[0]);
  assert.equal(d.querySelectorAll('#board .veh').length, L0.vehicles.length);
  // blocked vehicle shakes and does not move
  const blocked = [...d.querySelectorAll('#board .veh')].find(e => !e.classList.contains('free'));
  blocked.click();
  assert.equal(d.getElementById('moves').textContent, '0');
  // play the solver's line through real clicks
  const path = TP.solve(L0, TP.initState(L0));
  for (const i of path) { d.querySelector('#board .veh[data-i="' + i + '"]').click(); await sleep(260); }
  assert.match(d.getElementById('ovBody').textContent, /Level cleared/);
  assert.equal(d.getElementById('moves').textContent, String(path.length));
  assert.ok(JSON.parse(w.localStorage.getItem('tp-proto-v1')).cleared[0] > 0);
  assert.deepEqual(errors, []);
  w.close();
});
