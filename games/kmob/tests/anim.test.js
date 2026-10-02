/* KMOB animation-system tests (Node): clip library completeness, finite poses, clip semantics, selection, LOD,
   per-unit variation. Run: node tests/anim.test.js */
const path = require('path');
['core', 'sim', 'anim'].forEach(f => require(path.join(__dirname, '../js/' + f + '.js')));
const KM = globalThis.KM, A = KM.ANIM;
let pass = 0, fail = 0; const ok = (n, c, info) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c || info === undefined ? '' : ' ' + JSON.stringify(info))); };
const v = A.variation(3, 1.2, {}), out = new Float32Array(A.P);

ok('every required clip exists', A.REQUIRED.every(n => A.CLIPS[n]), A.REQUIRED.filter(n => !A.CLIPS[n]));
ok('additive hit layers exist (front/left/right/stagger)', ['hitFront', 'hitLeft', 'hitRight', 'stagger'].every(n => A.ADD.includes(n)));
let finite = true, bad = null;
for (const n of A.NAMES) { const c = A.CLIPS[n]; for (let k = 0; k <= 40; k++) { A.sample(A.ID[n], c.loop ? k * 0.37 : k / 40, v, out); if (!out.every(Number.isFinite) || out.some(x => Math.abs(x) > 4)) { finite = false; bad = bad || n; } } if (!c.loop && !(c.dur > 0)) { finite = false; bad = n + ':dur'; } }
ok('all clips produce finite, bounded poses', finite, bad);
const I = A.I, rest = new Float32Array(A.P); A.sample(A.ID.idle, 0, v, rest);
for (const n of ['attackA', 'attackB', 'heavy', 'cast', 'deploy']) { A.sample(A.ID[n], 1, v, out); ok(`${n} returns close to rest at the end`, Math.abs(out[I.armRP] - rest[I.armRP]) < 0.35 && Math.abs(out[I.rootP]) < 0.05); }
{ const aim = new Float32Array(A.P); A.sample(A.ID.aim, 0, v, aim); A.sample(A.ID.fire, 1, v, out); ok('fire returns to the aim pose (archers keep aiming)', Math.abs(out[I.armRP] - aim[I.armRP]) < 0.1 && Math.abs(out[I.armLP] - aim[I.armLP]) < 0.1); }
for (const n of ['attackA', 'heavy']) { let lo = 9; for (let k = 0; k <= 40; k++) { A.sample(A.ID[n], k / 40, v, out); lo = Math.min(lo, out[I.armRP]); } ok(`${n} winds up overhead`, lo < -2.4, lo); }
for (const n of ['deathA', 'deathB', 'deathHeavy']) { A.sample(A.ID[n], 1, v, out); ok(`${n} ends fallen`, Math.abs(out[I.rootP]) > 1.2); }
// selection against real sim state
const sim = new KM.Sim({ seed: 9 }); for (let k = 0; k < 60 * 40; k++) { KM.bot(sim, 1 / 60, 1); sim.step(1 / 60); }
let seen = new Set(), valid = true;
for (let k = 0; k < 600; k++) { KM.bot(sim, 1 / 60, 1); sim.step(1 / 60); for (let i = 0; i < sim.hi; i++) { if (!sim.st[i]) continue; const vv = A.variation(i, sim.stride[i] * 10, {}), id = A.select(sim, i, vv), t = A.clipTime(sim, i, id, vv); if (!(id >= 0 && id < A.NAMES.length) || !Number.isFinite(t)) valid = false; seen.add(A.NAMES[id]); } }
ok('selection always yields a valid clip + time', valid);
ok('live battle exercises idle/run/attack/death clips', ['run', 'deathA', 'deathB'].every(n => seen.has(n)) && (seen.has('attackA') || seen.has('attackB')), [...seen]);
// organic variation: neighbouring units almost never share a pose on the same frame
let same = 0, pairs = 0; for (let i = 0; i < 200; i++) { const a = A.variation(i, 0.5 + i * 0.01, {}), b = A.variation(i + 1, 0.5 + (i + 1) * 0.01, {}); const pa = new Float32Array(A.P), pb = new Float32Array(A.P); A.sample(A.ID.run, 2 + i * 0.1 * a.amp, a, pa); A.sample(A.ID.run, 2 + (i + 1) * 0.1 * b.amp, b, pb); let d = 0; for (let k = 0; k < A.P; k++) d += Math.abs(pa[k] - pb[k]); if (d < 0.02) same++; pairs++; }
ok('neighbouring units differ in pose (variation)', same / pairs < 0.02, { same, pairs });
const vs = Array.from({ length: 100 }, (_, i) => A.variation(i, 0.3, {})); ok('variation ranges stay controlled', vs.every(x => x.amp >= 0.85 && x.amp <= 1.15 && Math.abs(x.lean) <= 0.05 && x.tempo >= 0.9 && x.tempo <= 1.15));
// LOD
ok('LOD tiers by distance', A.lod(5, 100) === 0 && A.lod(35, 100) === 1 && A.lod(80, 100) === 2);
ok('LOD tightens with crowd density', A.lod(24, 2000) > A.lod(24, 100));
{ const h = new Uint16Array(160); for (let d = 0; d < 100; d++) h[d] = 20; const o = A.lodBudget(h, 120, 450, {}); ok('budgeted LOD caps full skeletons and animated units', o.near === 6 && o.mid === 28, o); const h2 = new Uint16Array(160); h2[10] = 30; const o2 = A.lodBudget(h2, 120, 450, {}); ok('small crowds stay fully animated', o2.near === 160 && o2.mid === 160, o2); }
// blending
const p0 = new Float32Array(A.P), p1 = new Float32Array(A.P).fill(1); A.blend(p0, p1, 0.25); ok('blend interpolates', Math.abs(p0[3] - 0.25) < 1e-6);
// strike timing: melee damage lands mid-swing, not at wind-up start
{ const s = new KM.Sim({ seed: 4 }); let hitAt = null, startAt = null; s.on((t, a) => { if (t === 'hit' && a === f && hitAt == null) hitAt = s.t; });
  const f = s.spawn(0, KM.FRIEND[0], 0, -10, { hp: 30, dmg: 6, spd: 1 }), e = s.spawn(1, KM.ENEMY[0], 0, -10.9, { hp: 1e6, dmg: 0, spd: 0 }); s.spd[e] = 0;
  for (let k = 0; k < 1200 && hitAt == null; k++) { s.L.inv = 1; s.budget = 0; s.formT = 99; const was = s.swing[f]; s.step(1 / 60); if (startAt == null && s.swing[f] > was && s.swing[f] > 0.9) startAt = s.t; }
  ok('melee damage lands on the strike frame (~0.2s after wind-up)', startAt != null && hitAt != null && hitAt - startAt > 0.12 && hitAt - startAt < 0.4, { startAt, hitAt }); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
