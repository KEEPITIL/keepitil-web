// KBeats prototype tests. Run: node --test games/kbeats/proto/test.mjs
// Checks the prototype's inlined engine is the real games/kbeats/js engine, that its demo charts pass the
// real validator, and (if `jsdom` resolves; set KB_JSDOM to its path) drives the page end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const jsDir = path.join(here, '..', 'js');
const real = {
  judge: await import(pathToFileURL(path.join(jsDir, 'judge.js'))),
  chart: await import(pathToFileURL(path.join(jsDir, 'chart.js'))),
  config: await import(pathToFileURL(path.join(jsDir, 'config.js'))),
};
const J = x => JSON.parse(JSON.stringify(x));      // vm objects carry a foreign prototype

const a = html.indexOf('//LOGIC-BEGIN'), b = html.indexOf('//LOGIC-END');
assert.ok(a > 0 && b > a, 'logic markers present');
const P = vm.runInNewContext(html.slice(a, b) +
  '\n;({ CONFIG, Judge, classify, multiplierFor, gradeFor, simulate, verifySubmission, perfectRun, KB })', {});

const DIFFS = ['easy', 'normal', 'expert'];
const mkNotes = (diff) => P.KB.buildNotes(diff);

test('page has no network calls, service worker or external resources', () => {
  assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|importScripts)\b/);
  assert.doesNotMatch(html, /(src|href)=["']https?:/i);
  assert.doesNotMatch(html, /\b(import|export)\s.*from\s/);
});

test('inlined CONFIG and judge.js are verbatim copies of the real modules', () => {
  const cfg = fs.readFileSync(path.join(jsDir, 'config.js'), 'utf8');
  const i = cfg.indexOf('export const CONFIG = {'), j = cfg.indexOf('\n};', i) + 3;
  assert.ok(html.includes(cfg.slice(i, j).replace('export ', '')), 'CONFIG differs from config.js');
  let src = fs.readFileSync(path.join(jsDir, 'judge.js'), 'utf8');
  src = src.replace("import { CONFIG } from './config.js';\n", '').replaceAll('export function', 'function').replaceAll('export class', 'class');
  assert.ok(html.includes(src), 'judge code differs from judge.js');
  assert.deepEqual(J(P.CONFIG), J(real.config.CONFIG));
});

test('hit windows classify exactly at the config boundaries', () => {
  const c = P.classify;
  assert.equal(c(0), 'perfect'); assert.equal(c(45), 'perfect'); assert.equal(c(-45), 'perfect');
  assert.equal(c(45.1), 'great'); assert.equal(c(90), 'great');
  assert.equal(c(90.1), 'good'); assert.equal(c(-135), 'good');
  assert.equal(c(135.1), 'miss'); assert.equal(c(180), 'miss');
  assert.equal(c(180.1), null);
});

test('combo multiplier tiers and grade thresholds', () => {
  const m = P.multiplierFor;
  assert.deepEqual([0, 9, 10, 24, 25, 49, 50, 500].map(x => m(x)), [1, 1, 2, 2, 4, 4, 8, 8]);
  const g = P.gradeFor;
  assert.equal(g(0.98, false), 'S+'); assert.equal(g(0.9799, false), 'S'); assert.equal(g(0.95, false), 'S');
  assert.equal(g(0.9, false), 'A'); assert.equal(g(0.8, false), 'B'); assert.equal(g(0.7, false), 'C'); assert.equal(g(0.1, false), 'D');
  assert.equal(g(1, true), 'F');
});

test('judging: tap, late tap, ghost tap, combo, score multiplier', () => {
  const notes = [{ t: 1, lane: 0, type: 'tap' }, { t: 2, lane: 0, type: 'tap' }, { t: 3, lane: 1, type: 'tap' }];
  const j = new P.Judge(notes);
  assert.equal(j.press(0, 1.0), 'perfect');
  assert.equal(j.press(0, 2.1), 'good');              // 100 ms late
  assert.equal(j.press(2, 2.5), null);                // nothing on lane 2
  assert.equal(j.combo, 2);
  j.update(10);                                       // note 3 expires as a miss
  assert.equal(j.counts.miss, 1); assert.equal(j.combo, 0);
  assert.equal(j.score, 300 + 100);
  assert.equal(j.result().fullCombo, false);
});

test('holds: complete, early release, and swipes', () => {
  const j = new P.Judge([{ t: 1, lane: 0, type: 'hold', dur: 1 }, { t: 3, lane: 1, type: 'hold', dur: 1 },
    { t: 5, lane: 2, type: 'swipe', dir: 'up' }, { t: 6, lane: 3, type: 'swipe', dir: 'up' }]);
  assert.equal(j.press(0, 1), 'perfect'); assert.equal(j.release(0, 1.95), 'perfect');          // within the 120 ms grace of the tail
  assert.equal(j.press(1, 3), 'perfect'); assert.equal(j.release(1, 3.4), 'miss');     // let go 0.6 s early
  assert.equal(j.press(2, 5, 'touch'), null);                                            // touch must flick
  assert.equal(j.swipe(2, 5, 'up'), 'perfect');
  assert.equal(j.swipe(3, 6, 'left'), 'good');                                           // wrong direction lands as good
  assert.equal(j.total, 4 + 2);
});

test('failing: health drains on misses unless practice', () => {
  const notes = Array.from({ length: 40 }, (_, i) => ({ t: 1 + i * 0.5, lane: i % 4, type: 'tap' }));
  const hard = new P.Judge(notes); hard.update(100);
  assert.equal(hard.failed, true); assert.equal(hard.result().grade, 'F');
  const easy = new P.Judge(notes, { practice: true }); easy.update(100);
  assert.equal(easy.failed, false);
});

test('inlined engine replays identically to the real engine on random input logs', () => {
  for (const diff of DIFFS) {
    const notes = mkNotes(diff);
    const rnd = P.KB.mulberry32(42);
    for (let run = 0; run < 25; run++) {
      const log = [];
      for (const n of notes) {
        if (rnd() < 0.15) continue;
        const dt = (rnd() - 0.5) * 0.34;
        if (n.type === 'swipe' && rnd() < 0.7) log.push([n.t + dt, n.lane, 's', rnd() < 0.5 ? n.dir : 'left']);
        else log.push([n.t + dt, n.lane, 'p', rnd() < 0.5 ? 'key' : 'touch']);
        if (n.type === 'hold') log.push([n.t + n.dur * rnd() * 1.1, n.lane, 'r']);
      }
      log.sort((x, y) => x[0] - y[0]);
      const mine = J(P.simulate(notes, log)), ref = real.judge.simulate(notes, log);
      assert.deepEqual(mine, ref, diff + ' run ' + run);
    }
  }
});

test('demo charts: deterministic, validated by the real chart.js, tiered by difficulty', () => {
  const counts = {};
  for (const diff of DIFFS) {
    const n1 = mkNotes(diff), n2 = mkNotes(diff);
    assert.deepEqual(J(n1), J(n2), diff + ' is deterministic');
    const chart = real.chart.makeChart({ trackId: 'kbeats-proto-demo', difficulty: diff, bpm: P.KB.BPM, offsetMs: P.KB.OFFSET_MS, durationMs: P.KB.DURATION_MS, notes: J(n1) });
    const v = real.chart.validate(chart);
    assert.deepEqual(v.errors, [], diff + ' validator errors');
    assert.deepEqual(v.warnings.filter(w => /off-grid/.test(w)), [], diff + ' off-grid');
    // round-trips through the real loader
    assert.equal(real.chart.loadChart(chart).length, n1.length);
    counts[diff] = n1.length;
    assert.ok(n1.length >= 50, diff + ' has enough notes');
    assert.ok(n1.every(n => n.lane >= 0 && n.lane <= 3));
  }
  assert.ok(counts.easy < counts.normal && counts.normal < counts.expert, JSON.stringify(counts));
  assert.ok(mkNotes('normal').some(n => n.type === 'hold') && mkNotes('normal').some(n => n.type === 'swipe'));
  assert.ok(mkNotes('expert').some(n => n.type === 'hold') && mkNotes('expert').some(n => n.type === 'swipe'));
  assert.ok(mkNotes('easy').every(n => n.type !== 'swipe'));
  assert.throws(() => P.KB.buildNotes('impossible'));
});

test('a perfect run of each chart scores S+ and is accepted by the real verifier', () => {
  for (const diff of DIFFS) {
    const notes = mkNotes(diff);
    const r = J(P.perfectRun(notes));
    assert.equal(r.grade, 'S+'); assert.equal(r.fullCombo, true); assert.equal(r.stars, 5);
    assert.deepEqual(r, real.judge.perfectRun(notes));
    // build the matching log and let the REAL verifier replay it
    const j = new P.Judge(notes), ev = [];
    for (const n of j.notes) { ev.push([n.t, 0, n]); ev.push([n.t + (n.type === 'hold' ? n.dur : 0.03), -1, n]); }
    ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    for (const [t, k, n] of ev) k === 0 ? j.press(n.lane, t) : j.release(n.lane, t);
    j.update(Infinity);
    const sub = { score: j.score, maxCombo: j.maxCombo, log: J(j.log) };
    assert.ok(real.judge.verifySubmission(notes, sub).ok, diff + ' verified');
    assert.equal(real.judge.verifySubmission(notes, { ...sub, score: sub.score + 1 }).ok, false, 'tampered score rejected');
  }
});

test('synthesised backing: right length, audible, bounded, deterministic', () => {
  const sr = 8000, d1 = P.KB.renderBacking(sr), d2 = P.KB.renderBacking(sr);
  assert.equal(d1.length, Math.ceil(P.KB.DURATION_MS / 1000 * sr));
  let peak = 0, energy = 0; for (const v of d1) { peak = Math.max(peak, Math.abs(v)); energy += v * v; }
  assert.ok(peak > 0.5 && peak <= 0.81, 'peak ' + peak);
  assert.ok(energy / d1.length > 0.005, 'not silent');
  assert.ok(d1.every((v, i) => v === d2[i]));
  let first = 0; while (Math.abs(d1[first]) < 1e-4) first++;
  assert.ok(first / sr >= 0.9 && first / sr < 1.2, 'count-in starts ~1 s in: ' + first / sr);
});

test('geometry helpers', () => {
  const K = P.KB;
  assert.equal(K.progress(5, 5, 1.6), 1); assert.ok(Math.abs(K.progress(6.6, 5, 1.6)) < 1e-9); assert.ok(Math.abs(K.progress(5.8, 5, 1.6) - 0.5) < 1e-9);
  assert.deepEqual([99, 100, 199, 399, 400].map(x => K.laneAt(x, 100, 300)), [-1, 0, 1, 3, -1]);   // 4 lanes of 75 px
  assert.deepEqual(['left', 'right', 'up', 'down'], [K.flickDir(-30, 5), K.flickDir(30, -5), K.flickDir(2, -30), K.flickDir(-2, 30)]);
});

// ---- DOM end-to-end (optional) ----
const require = createRequire(import.meta.url);
let JSDOM = null;
for (const m of [process.env.KB_JSDOM, 'jsdom'].filter(Boolean)) { try { JSDOM = require(m).JSDOM; break; } catch { /* next */ } }
const { VirtualConsole } = JSDOM ? require(process.env.KB_JSDOM || 'jsdom') : {};

async function page() {
  let T = -1;
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!/getContext|not implemented/i.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/proto/', virtualConsole: vc,
    beforeParse(w) { w.__kbClock = () => T; w.addEventListener('error', e => errors.push(e.message)); } });
  return { w: dom.window, setT: v => { T = v; }, errors };
}
const key = (w, type, k) => w.dispatchEvent(new w.KeyboardEvent(type, { key: k, bubbles: true }));

test('DOM: perfect keyboard play reaches S+ full combo', { skip: !JSDOM && 'jsdom not available' }, async (t) => {
  const { w, setT, errors } = await page();
  t.after(() => w.close());   // a failing assertion must not leave jsdom's animation loop alive
  w.document.querySelector('[data-d="normal"]').click();
  w.document.getElementById('start').click();
  const st = w.__kb.state(); assert.equal(st.mode, 'play');
  const ev = [];
  for (const n of st.notes) { ev.push([n.t, 1, n]); ev.push([n.t + (n.type === 'hold' ? n.dur : 0.03), 0, n]); }
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const keys = ['d', 'f', 'j', 'k'];
  for (const [t, press, n] of ev) { setT(t); w.__kb.frame(); key(w, press ? 'keydown' : 'keyup', keys[n.lane]); }
  setT(st.notes.at(-1).t + 5); w.__kb.frame();
  assert.equal(w.__kb.state().mode, 'result');
  const r = w.__kbResult;
  assert.equal(r.grade, 'S+'); assert.equal(r.fullCombo, true); assert.equal(r.miss, 0); assert.equal(r.total, w.__kb.state().judge.total);
  assert.match(w.document.getElementById('resBody').textContent, /S\+/);
  assert.deepEqual(errors, []);
});

test('DOM: idle play fails, practice idle does not; pause blocks input', { skip: !JSDOM && 'jsdom not available' }, async (t) => {
  const { w, setT, errors } = await page();
  t.after(() => w.close());   // a failing assertion must not leave jsdom's animation loop alive
  w.document.getElementById('start').click();
  for (let t = 0; t < 70 && w.__kb.state().mode === 'play'; t += 0.1) { setT(t); w.__kb.frame(); }
  assert.equal(w.__kb.state().mode, 'result'); assert.equal(w.__kbResult.failed, true); assert.equal(w.__kbResult.grade, 'F');
  // practice mode + pause
  w.document.getElementById('practice').checked = true;
  setT(-1); w.document.querySelector('#result button').click();       // Play again
  assert.equal(w.__kb.state().mode, 'play');
  key(w, 'keydown', 'Escape'); assert.equal(w.__kb.state().mode, 'pause');
  const before = w.__kb.state().judge.log.length; key(w, 'keydown', 'd'); assert.equal(w.__kb.state().judge.log.length, before, 'no input while paused');
  key(w, 'keydown', 'Escape'); assert.equal(w.__kb.state().mode, 'play');
  for (let t = 0; t < 70 && w.__kb.state().mode === 'play'; t += 0.1) { setT(t); w.__kb.frame(); }
  assert.equal(w.__kb.state().mode, 'result'); assert.equal(w.__kbResult.failed, false); assert.equal(w.__kbResult.practice, true);
  assert.deepEqual(errors, []);
});

test('DOM: touch tap and flick are judged', { skip: !JSDOM && 'jsdom not available' }, async (t) => {
  const { w, setT, errors } = await page();
  t.after(() => w.close());   // a failing assertion must not leave jsdom's animation loop alive
  w.document.querySelector('[data-d="expert"]').click();
  w.document.getElementById('start').click();
  const { notes, judge } = w.__kb.state();
  const tap = notes.find(n => n.type === 'tap'), sw = notes.find(n => n.type === 'swipe');
  const lw = Math.min(w.innerWidth, 560) / 4, left = (w.innerWidth - Math.min(w.innerWidth, 560)) / 2;
  const ptr = (type, id, x, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { pointerId: id, clientX: x, clientY: y }); w.document.getElementById('c').dispatchEvent(e); };
  setT(tap.t); w.__kb.frame(); ptr('pointerdown', 1, left + tap.lane * lw + lw / 2, 500); ptr('pointerup', 1, left + tap.lane * lw + lw / 2, 500);
  assert.equal(judge.counts.perfect, 1);
  setT(sw.t); w.__kb.frame();
  const x = left + sw.lane * lw + lw / 2;
  ptr('pointerdown', 2, x, 500); assert.equal(judge.counts.perfect, 1, 'touch-down alone does not satisfy a swipe');
  const dx = { left: -60, right: 60, up: 0, down: 0 }[sw.dir], dy = { up: -60, down: 60, left: 0, right: 0 }[sw.dir];
  ptr('pointermove', 2, x + dx, 500 + dy); ptr('pointerup', 2, x + dx, 500 + dy);
  assert.equal(judge.counts.perfect, 2, 'flick in the right direction is perfect');
  assert.deepEqual(errors, []);
});

test('hold left to its tail completes by itself (no release needed)', () => {
  const j = new P.Judge([{ t: 1, lane: 0, type: 'hold', dur: 1 }]);
  assert.equal(j.press(0, 1), 'perfect'); j.update(2.01);
  assert.equal(j.counts.perfect, 2); assert.equal(j.result().fullCombo, true);
});

test('chart generator obeys the validator rules for many seeds, not just the shipped one', () => {
  for (const diff of DIFFS) for (let seed = 1; seed <= 40; seed++) {
    const notes = P.KB.buildNotes(diff, seed);
    const chart = real.chart.makeChart({ trackId: 'seed-' + seed, difficulty: diff, bpm: P.KB.BPM, offsetMs: P.KB.OFFSET_MS, durationMs: P.KB.DURATION_MS, notes: J(notes) });
    const v = real.chart.validate(chart);
    assert.deepEqual(v.errors, [], diff + ' seed ' + seed);
  }
});
