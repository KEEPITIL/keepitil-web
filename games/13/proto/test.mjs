// Thirteen Anchors prologue prototype tests. Run: node --test games/13/proto/test.mjs
// Checks the prototype carries the real prologue data/director/map verbatim, then exercises the prologue
// state machine (fuse -> power -> Hollow chase -> keypad 413) on the real map. DOM tests need jsdom
// (set T13_JSDOM to its path); everything else is plain node.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const jsDir = path.join(here, '..', 'js');
const rd = f => fs.readFileSync(path.join(jsDir, f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));

const a = html.indexOf('//LOGIC-BEGIN'), b = html.indexOf('//LOGIC-END');
assert.ok(a > 0 && b > a, 'logic markers present');
const ctx = vm.createContext({}); ctx.window = ctx;
const { P, T13 } = vm.runInContext(html.slice(a, b) + '\n;({ P: T13P, T13 })', ctx);

// deterministic RNG
const rng = (seed = 1) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fresh = (o = {}) => P.createWorld({ rng: rng(7), ...o });
const run = (w, secs, input = {}) => { for (let t = 0; t < secs; t += 0.05) P.step(w, 0.05, input); };
const place = (w, c, r, i = w.active) => { const p = P.center(c, r); w.sibs[i].x = p.x; w.sibs[i].z = p.z; };
const evs = w => J(P.drain(w));

/* A bot that walks the real collision/door code to a cell adjacent to (or on) a target. */
function walkTo(w, c, r, { maxSecs = 120 } = {}) {
  const me = () => P.cur(w), from = () => P.cellOf(me().x, me().z);
  const goal = [c, r];
  for (let guard = 0; guard < maxSecs / 0.05; guard++) {
    if (w.over) return false;
    const pth = P.path(w, from(), goal);
    if (!pth) return false;
    if (pth.length <= 1) { const p = P.center(c, r); if (Math.hypot(p.x - me().x, p.z - me().z) < 0.3) return true; P.step(w, 0.05, { mx: Math.sign(p.x - me().x) * Math.min(1, Math.abs(p.x - me().x)), mz: Math.sign(p.z - me().z) * Math.min(1, Math.abs(p.z - me().z)) }); continue; }
    const nxt = P.center(...pth[1]), dx = nxt.x - me().x, dz = nxt.z - me().z, d = Math.hypot(dx, dz) || 1;
    P.step(w, 0.05, { mx: dx / d, mz: dz / d });
  }
  return false;
}
const walkNear = (w, c, r) => {      // stand on the nearest walkable cell beside a solid object
  const cand = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]].filter(([x, y]) => !P.blocked(w, x, y, true));
  assert.ok(cand.length, 'object has a walkable neighbour');
  for (const [x, y] of cand) if (P.path(w, P.cellOf(P.cur(w).x, P.cur(w).z), [x, y])) return walkTo(w, x, y);
  return false;
};

test('page has no network calls, service worker or external resources', () => {
  assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|importScripts)\b/);
  assert.doesNotMatch(html, /(src|href)=["']https?:/i);
});

test('data.js, director.js, the level MAP and objectiveText are verbatim from the real game', () => {
  assert.ok(html.includes(rd('data.js').trimEnd()), 'data.js differs');
  assert.ok(html.includes(rd('director.js').trimEnd()), 'director.js differs');
  const lvl = rd('level.js'), i = lvl.indexOf('const MAP = ['), mp = lvl.slice(i, lvl.indexOf('];', i) + 2);
  assert.ok(html.includes(mp), 'MAP differs');
  const gm = rd('game.js'), m = gm.match(/function objectiveText\(\) \{ const O = CASE\.objectives, f = s\.flags; (.*?) \}\n/);
  assert.ok(m && html.includes(m[1]), 'objectiveText differs');
  assert.equal(T13.PROLOGUE.code, '413');
});

test('map: 26x15, one of each key object, walls enclose the wing', () => {
  assert.equal(P.W, 26); assert.equal(P.R, 15);
  for (const ch of ['S', 'F', 'U', 'M', 'E', 'H', 'W', 'C']) assert.equal(P.find(ch).length, 1, ch);
  assert.ok(P.MAP.every(row => row.length === P.W));
  assert.ok([...P.MAP[0]].every(c => c === '#') && [...P.MAP[P.R - 1]].every(c => c === '#'));
  assert.ok(P.MAP.every(row => row[0] === '#' && row[row.length - 1] === '#'));
});

test('objectives follow the story flags in order', () => {
  const O = T13.PROLOGUE.objectives, f = {};
  assert.equal(P.objectiveText(f), O.enter);
  f.fuseboxSeen = true; assert.equal(P.objectiveText(f), O.fusebox);
  f.cabinetSeen = true; assert.equal(P.objectiveText(f), O.blocked);
  f.cabinetMoved = true; assert.equal(P.objectiveText(f), O.fuse);
  f.fuseTaken = true; assert.equal(P.objectiveText(f), O.hunt);
  f.power = true; assert.equal(P.objectiveText(f), O.exit);
  f.escaped = true; assert.equal(P.objectiveText(f), '');
});

test('geometry gating: ward needs the cabinet moved, utility needs the false wall unmasked', () => {
  const w = fresh({ hollowOff: true }), S = P.cellOf(P.cur(w).x, P.cur(w).z);
  const reach = to => !!P.path(w, S, to);
  assert.ok(reach([3, 3]), 'fuse box side reachable');
  assert.ok(reach([21, 2]), 'dayroom reachable through its door');
  assert.equal(reach([21, 7]), false, 'ward sealed by the cabinet');
  assert.equal(reach([23, 11]), false, 'fuse room sealed behind the false wall');
  w.cabinetMoved = true; assert.ok(reach([21, 7]), 'ward open after the push');
  assert.equal(reach([23, 11]), false);
  w.falseGone = true; assert.ok(reach([23, 11]), 'fuse reachable after Daniel unmasks the wall');
  const w2 = fresh({ hollowOff: true }); w2.flags.gated = true; w2.blockedCells.add('18,7'); w2.openCells.add('18,11'); w2.cabinetMoved = true;
  assert.equal(!!P.path(w2, [23, 11], [3, 3]), true, 'the way back after the collapse exists (new passage)');
  w2.openCells.delete('18,11'); assert.equal(!!P.path(w2, [23, 11], [3, 3]), false, 'without the new passage the fuse room would be a trap');
});

test('powers: only the right sibling, only near the object, with cooldowns', () => {
  const w = fresh({ hollowOff: true });
  // Mara cannot push the cabinet; Gabriel can only when near
  place(w, 17, 7); P.switchTo(w, 1); place(w, 4, 2); assert.equal(P.usePower(w), false, 'Gabriel far from cabinet does nothing');
  assert.equal(w.cabinetMoved, false);
  place(w, 17, 7); assert.equal(P.usePower(w), true); assert.equal(w.cabinetMoved, true);
  assert.equal(P.usePower(w), false, 'cooldown'); assert.ok(w.sibs[1].cdLeft > 11);
  run(w, 12.1); assert.equal(w.sibs[1].cdLeft, 0);
  // Daniel unmasks only within 7 m of the wall
  P.switchTo(w, 2); place(w, 4, 2); assert.equal(P.usePower(w), false); assert.equal(w.falseGone, false);
  place(w, 22, 7); assert.equal(P.usePower(w), true); assert.equal(w.falseGone, true);
  // Mara reads a memory near the music box, otherwise she senses the Hollow
  P.switchTo(w, 0); place(w, 22, 2); assert.equal(P.usePower(w), true);
  assert.equal(w.flags.musicbox, true); assert.equal(w.resonanceUntil, 0);
  run(w, 14.1); place(w, 12, 6); assert.equal(P.usePower(w), true); assert.ok(w.resonanceUntil > w.t);
});

test('interaction order: fuse box, cabinet, fuse, power, exit lock', () => {
  const w = fresh({ hollowOff: true });
  walkNear(w, P.find('F')[0].c, P.find('F')[0].r);      // beside the fuse box
  assert.equal(P.interact(w), true); assert.equal(w.flags.fuseboxSeen, true); assert.equal(P.objectiveText(w.flags), T13.PROLOGUE.objectives.fusebox);
  const f = P.find('F')[0]; place(w, f.c + 1, f.r);
  P.interact(w); assert.equal(w.flags.power, undefined, 'fuse box without the fuse does not give power');
  const x = P.find('E')[0]; place(w, x.c + 1, x.r); evs(w);
  P.interact(w); assert.equal(w.keypad, false, 'no keypad without power'); assert.match(JSON.stringify(evs(w)), /No power, no exit/);
  const u = P.find('U')[0]; place(w, u.c, u.r); P.interact(w);
  assert.equal(w.flags.fuseTaken, true); assert.equal(w.checkpoint.stage, 'fuseTaken'); assert.notEqual(w.enemy.state, 'dormant');
  place(w, f.c + 1, f.r); P.interact(w);
  assert.equal(w.flags.power, true); assert.equal(w.checkpoint.stage, 'power'); assert.equal(w.enemy.state, 'flee');
  place(w, x.c + 1, x.r); P.interact(w); assert.equal(w.keypad, true);
});

test('keypad: wrong codes count and make noise, 3 tries hints, 413 escapes', () => {
  const w = fresh({ hollowOff: true }); w.flags.power = true; const x = P.find('E')[0]; place(w, x.c + 1, x.r);
  assert.equal(P.tryCode(w, '413'), false, 'keypad not open yet');
  P.interact(w); assert.equal(w.keypad, true);
  for (const c of ['000', '314', '431']) assert.equal(P.tryCode(w, c), false);
  assert.equal(w.codeTries, 3); run(w, 1); assert.match(JSON.stringify(evs(w)), /four, one, three/);
  assert.equal(P.tryCode(w, '413'), true);
  assert.equal(w.over.kind, 'escaped'); assert.equal(w.flags.escaped, true); assert.equal(P.objectiveText(w.flags), '');
});

test('taking the fuse wakes the Hollow, collapses the ward door, then opens the hall passage', () => {
  const w = fresh(); w.cabinetMoved = w.falseGone = true; const u = P.find('U')[0]; place(w, u.c, u.r);
  P.interact(w); assert.notEqual(w.enemy.state, 'dormant');
  assert.equal(P.blocked(w, 18, 7, false), false, 'cabinet cell is walkable before the collapse');
  run(w, 3.6); assert.equal(P.blocked(w, 18, 7, false), true, 'collapse seals the ward door');
  assert.equal(P.blocked(w, 18, 11, false), true, 'new passage not open yet');
  run(w, 2.3); assert.equal(P.blocked(w, 18, 11, false), false, 'exposed passage opens');
  assert.equal(w.flags.gated, true);
});

test('Hollow: dormant for 40 s, then wakes', () => {
  const w = fresh(); P.step(w, 0.05, {}); assert.equal(w.enemy.state, 'dormant');
  run(w, 39); assert.equal(w.enemy.state, 'dormant'); run(w, 2.5); assert.notEqual(w.enemy.state, 'dormant');
});

test('Hollow: sees you in line of sight within range, light and crouch change that range', () => {
  const w = fresh(); w.enemy.state = 'patrol'; w.enemy.path = null;
  place(w, 12, 5); const e = w.enemy; const p = P.center(12, 1); e.x = p.x; e.z = p.z;     // 12 m apart down the hall
  assert.ok(P.los(w, e.x, e.z, P.cur(w).x, P.cur(w).z), 'clear line');
  P.step(w, 0.05, {}); assert.equal(e.state, 'hunt', 'torch on: seen at 12 m');
  const w2 = fresh(); w2.enemy.state = 'patrol'; place(w2, 12, 5); const q = P.center(12, 1); w2.enemy.x = q.x; w2.enemy.z = q.z; w2.light = false;
  P.step(w2, 0.05, {}); assert.notEqual(w2.enemy.state, 'hunt', 'torch off: range halves, not seen at 12 m');
  const w3 = fresh(); w3.enemy.state = 'patrol'; place(w3, 12, 5); w3.enemy.x = q.x; w3.enemy.z = q.z;
  P.step(w3, 0.05, { crouch: true }); assert.notEqual(w3.enemy.state, 'hunt', 'crouching shrinks the range');
  const w4 = fresh(); w4.enemy.state = 'patrol'; place(w4, 4, 6); const far = P.center(12, 1); w4.enemy.x = far.x; w4.enemy.z = far.z;
  P.step(w4, 0.05, {}); assert.notEqual(w4.enemy.state, 'hunt', 'a wall between you and it');
});

test('Hollow: catches you at arm’s length, ends the run, and the checkpoint restores progress', () => {
  const w = fresh(); w.cabinetMoved = true; w.flags.cabinetMoved = true; place(w, 17, 7);
  w.stage = 'cabinet'; w.checkpoint = { stage: 'cabinet', flags: { ...w.flags }, x: P.cur(w).x, z: P.cur(w).z };
  const a = P.cur(w); w.enemy.state = 'hunt'; w.enemy.x = a.x + 1.0; w.enemy.z = a.z; w.enemy.lastSeen = { x: a.x, z: a.z };
  P.step(w, 0.05, {}); assert.equal(w.over.kind, 'caught');
  const r = P.restart(w); assert.equal(r.cabinetMoved, true); assert.equal(r.flags.cabinetMoved, true); assert.equal(r.over, null);
  assert.equal(P.objectiveText(r.flags), T13.PROLOGUE.objectives.fuse);
  assert.ok(Math.abs(P.cur(r).x - a.x) < 1.5);
});

test('Hollow: Gabriel’s push staggers it for 3.5 s and shoves it back', () => {
  const w = fresh(); P.switchTo(w, 1); place(w, 12, 6); const a = P.cur(w), e = w.enemy;
  e.state = 'hunt'; e.x = a.x + 3; e.z = a.z; const x0 = e.x;
  assert.equal(P.usePower(w), true); assert.equal(e.state, 'stagger'); assert.ok(e.x > x0 + 1, 'pushed away');
  run(w, 3.4); assert.equal(e.state, 'stagger'); run(w, 0.3); assert.equal(e.state, 'hunt');
});

test('Hollow: hiding in a locker works unless it watched you hide', () => {
  const lockers = P.find('L'); assert.ok(lockers.length >= 4);
  const mk = (sawHide) => { const w = fresh(); const L = lockers.find(l => l.c === 13 && l.r === 3) || lockers[0]; place(w, L.c, L.r + 1); w.enemy.state = 'patrol'; P.interact(w); assert.ok(w.hidden, 'hid'); w.enemy.sawHide = sawHide; return w; };
  const safe = mk(false), a = safe.hidden; safe.enemy.state = 'hunt'; safe.enemy.x = a.x + 1.5; safe.enemy.z = a.z; safe.enemy.lastSeen = { x: a.x, z: a.z };
  run(safe, 4); assert.equal(safe.over, null, 'unseen hider survives'); assert.ok(safe.hidden);
  const doomed = mk(true), d = doomed.hidden; doomed.enemy.state = 'hunt'; doomed.enemy.x = d.x + 1.5; doomed.enemy.z = d.z; doomed.enemy.lastSeen = { x: d.x, z: d.z };
  run(doomed, 4); assert.equal(doomed.over && doomed.over.kind, 'caught'); assert.match(doomed.over.why, /watched you hide/);
  P.interact(safe); assert.equal(safe.hidden, null, 'E leaves the locker');
});

test('Hollow: noise draws it, and it opens doors itself', () => {
  const w = fresh(); w.enemy.state = 'patrol'; const p = P.center(12, 6); w.enemy.x = p.x; w.enemy.z = p.z;
  P.noise(w, p.x + 5, p.z, 7); assert.equal(w.enemy.state, 'investigate');
  const w2 = fresh(); w2.enemy.state = 'patrol'; const q = P.center(12, 6); w2.enemy.x = q.x; w2.enemy.z = q.z;
  P.noise(w2, q.x + 12, q.z, 7); assert.equal(w2.enemy.state, 'patrol', 'out of range');
  const w3 = fresh(); assert.ok(P.blocked(w3, 8, 2, false), 'closed door stops the player'); assert.equal(P.blocked(w3, 8, 2, true), false, 'doors do not stop the Hollow');
  place(w3, 20, 6, 0); const e3 = w3.enemy, s3 = P.center(6, 2); e3.state = 'patrol'; e3.x = s3.x; e3.z = s3.z;
  const t3 = P.center(12, 2); P.noise(w3, t3.x, t3.z, 40); assert.equal(e3.state, 'investigate'); assert.equal(w3.doors.has('8,2'), false);
  run(w3, 8); assert.equal(w3.doors.has('8,2'), true, 'it opened the door on its way'); assert.ok(P.drain(w3).some(x => x.type === 'door' && x.slam), 'with a slam');
});

test('full prologue walkthrough (Hollow off): every step uses real collision and doors', () => {
  const w = fresh({ hollowOff: true }); const F = P.find('F')[0], C = P.find('C')[0], U = P.find('U')[0], E = P.find('E')[0];
  assert.ok(walkNear(w, F.c, F.r)); P.interact(w); assert.equal(w.flags.fuseboxSeen, true);
  assert.ok(walkTo(w, C.c - 1, C.r), 'reach the hall side of the cabinet'); P.interact(w); assert.equal(w.flags.cabinetSeen, true);
  P.switchTo(w, 1); assert.equal(P.usePower(w), true); assert.equal(w.flags.cabinetMoved, true);
  assert.ok(walkTo(w, 22, 7), 'enter the ward'); P.switchTo(w, 2); assert.equal(P.usePower(w), true); assert.equal(w.falseGone, true);
  assert.ok(walkTo(w, U.c, U.r), 'through the vanished wall'); assert.equal(P.interact(w), true); assert.equal(w.flags.fuseTaken, true);
  run(w, 6.5); assert.equal(P.blocked(w, C.c, C.r, false), true, 'ward door collapsed behind us');
  assert.ok(walkNear(w, F.c, F.r), 'back to the fuse box via the new passage'); P.interact(w); assert.equal(w.flags.power, true);
  assert.ok(walkNear(w, E.c, E.r)); P.interact(w); assert.equal(w.keypad, true);
  assert.equal(P.tryCode(w, '412'), false); assert.equal(P.tryCode(w, '413'), true); assert.equal(w.over.kind, 'escaped');
});

// ---- DOM (optional) ----
const require = createRequire(import.meta.url);
let JSDOM = null, VirtualConsole = null;
for (const m of [process.env.T13_JSDOM, 'jsdom'].filter(Boolean)) { try { ({ JSDOM, VirtualConsole } = require(m)); break; } catch { /* next */ } }

function page() {
  const errors = []; let T = 0;
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!/getContext|not implemented/i.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/proto/', virtualConsole: vc,
    beforeParse(win) { win.__t13Clock = () => T; win.__t13NoAudio = true; win.addEventListener('error', e => errors.push(e.message)); } });
  return { w: dom.window, errors, setT: v => { T = v; } };
}
const press = (w, key) => w.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true }));

test('DOM: briefing gates Begin for the mandatory seconds, start shows HUD', { skip: !JSDOM && 'jsdom not available' }, async (t) => {
  const { w, errors } = page(); t.after(() => w.close());
  assert.equal(w.document.getElementById('begin').disabled, true);
  assert.match(w.document.getElementById('lines').textContent, /four, one, three/);
  w.__t13.start(false);
  assert.equal(w.__t13.state().mode, 'play');
  assert.ok(!w.document.getElementById('hud').classList.contains('hidden'));
  assert.equal(w.document.getElementById('obj').textContent, T13.PROLOGUE.objectives.enter);
  assert.deepEqual(errors, []);
});

test('DOM: keys drive the world; keypad UI accepts 413 and shows the escape card', { skip: !JSDOM && 'jsdom not available' }, async (t) => {
  const { w, errors, setT } = page(); t.after(() => w.close());
  w.__t13.start(false); const S = () => w.__t13.state().w;
  const F = P.find('F')[0]; place(S(), F.c + 1, F.r);
  press(w, 'e'); assert.equal(S().flags.fuseboxSeen, true); assert.equal(w.document.getElementById('obj').textContent, T13.PROLOGUE.objectives.fusebox);
  press(w, '2'); assert.equal(S().active, 1); press(w, 'Tab'); assert.equal(S().active, 2); press(w, '1'); assert.equal(S().active, 0);
  const before = S().light; press(w, 'f'); assert.equal(S().light, !before);
  // movement through the frame loop
  const x0 = P.cur(S()).x; w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'd', bubbles: true })); setT(0.1); w.__t13.frame(0.1); w.__t13.frame(0.1);
  w.dispatchEvent(new w.KeyboardEvent('keyup', { key: 'd', bubbles: true })); assert.ok(P.cur(S()).x > x0, 'moved east');
  // keypad
  S().flags.power = true; S().enemy.state = 'dormant'; S().enemy.t = 1e9; const E = P.find('E')[0]; place(S(), E.c + 1, E.r);
  press(w, 'e'); assert.equal(S().keypad, true); w.__t13.frame(0.016);
  assert.ok(!w.document.getElementById('kp').classList.contains('hidden'), 'keypad shown');
  for (const k of ['1', '2', '3']) w.__t13.keyIn(k);
  assert.equal(S().codeTries, 1); assert.equal(w.document.getElementById('kpd').textContent, 'ERROR');
  for (const k of ['4', '1', '3']) w.__t13.keyIn(k);
  assert.equal(S().over.kind, 'escaped'); assert.equal(w.__t13.state().mode, 'end');
  assert.match(w.document.getElementById('endBody').textContent, /ESCAPED/);
  assert.match(w.document.getElementById('endBody').textContent, /DON.T FOLLOW ME/);
  assert.equal(JSON.parse(w.localStorage.getItem('t13-proto-v1')).prologueDone, true);
  assert.deepEqual(errors, []);
});

test('DOM: being caught offers a retry from the checkpoint', { skip: !JSDOM && 'jsdom not available' }, async (t) => {
  const { w, errors } = page(); t.after(() => w.close());
  w.__t13.start(false); const S = () => w.__t13.state().w;
  place(S(), 17, 7); S().cabinetMoved = true; S().flags.cabinetMoved = true; S().checkpoint = { stage: 'cabinet', flags: { ...S().flags }, x: P.cur(S()).x, z: P.cur(S()).z };
  const a = P.cur(S()); S().enemy.state = 'hunt'; S().enemy.x = a.x + 0.9; S().enemy.z = a.z; S().enemy.lastSeen = { x: a.x, z: a.z };
  w.__t13.frame(0.05);
  assert.equal(w.__t13.state().mode, 'end'); assert.match(w.document.getElementById('endBody').textContent, /TAKEN/);
  w.document.querySelector('#endBody button').click();
  assert.equal(w.__t13.state().mode, 'play'); assert.equal(S().flags.cabinetMoved, true); assert.equal(S().over, null);
  assert.deepEqual(errors, []);
});
