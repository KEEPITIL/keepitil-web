/* KMOB animation — one shared humanoid skeleton for every infantry unit (friendly and enemy), a clip library
   sampled procedurally, cross-fade blending between clips, additive hit reactions, and per-unit variation so two
   neighbours almost never share a pose on the same frame. Pure logic (no THREE) so it is unit-tested in Node.

   Skeleton (rigid bones, rendered as instanced parts):  root ─ hips ─ torso ─ head
                                                                     ├─ armL (shield / bow hand)
                                                                     └─ armR (weapon hand)
                                                              hips ─ legL, legR
   Pose layout (Float32Array(P)):                                                                            */
(function (G) {
  const KM = G.KM = G.KM || {};
  const P = 16;
  const I = { y: 0, rootP: 1, rootR: 2, rootY: 3, torsoP: 4, torsoY: 5, torsoR: 6, headP: 7, headY: 8, armLP: 9, armLR: 10, armRP: 11, armRR: 12, armRY: 13, legLP: 14, legRP: 15 };
  const { sin, cos, PI, min, max, abs } = Math;
  const ease = u => u * u * (3 - 2 * u);
  const seg = (u, a, b) => min(1, max(0, (u - a) / (b - a)));
  const mix = (a, b, u) => a + (b - a) * u;
  // arm pitch: negative = forward/up. Weapons point forward from the fist, so -1.6 holds a sword upright.
  const REST_R = -0.55, REST_L = -0.15;

  function base(o, v) { o.fill(0); o[I.armRP] = REST_R; o[I.armLP] = REST_L; o[I.armLR] = 0.12; o[I.armRR] = -0.12; o[I.torsoP] = 0.04 + v.lean * 0.5; }

  // Clips: loop clips receive phase in radians (from the sim's stride-driven phase); one-shots receive u in 0..1.
  const C = {
    idle: { loop: true, fn(o, ph, v) { base(o, v); const b = sin(ph * 0.35 + v.seed * 6); o[I.y] = b * 0.012; o[I.torsoP] += b * 0.02; o[I.headY] = sin(ph * 0.13 + v.seed * 9) * 0.35; o[I.headP] = sin(ph * 0.21 + v.seed * 3) * 0.06; o[I.armRP] += sin(ph * 0.3 + v.seed) * 0.06; o[I.armLP] += sin(ph * 0.27 + v.seed * 2) * 0.05; } },
    run: { loop: true, fn(o, ph, v) {
      base(o, v); const s = sin(ph), a = v.amp;
      o[I.legLP] = s * 0.85 * a; o[I.legRP] = -s * 0.85 * a;
      o[I.armLP] = REST_L - s * 0.55 * a; o[I.armRP] = REST_R + s * 0.35 * a;
      o[I.y] = abs(cos(ph)) * 0.075 * a; o[I.torsoP] = 0.16 + v.lean; o[I.torsoR] = s * 0.05; o[I.torsoY] = s * 0.09 * a; o[I.headY] = -s * 0.06; o[I.headP] = -0.05;
    } },
    sprint: { loop: true, fn(o, ph, v) {
      base(o, v); const s = sin(ph), a = v.amp * 1.25;
      o[I.legLP] = s * 1.05 * a; o[I.legRP] = -s * 1.05 * a; o[I.armLP] = REST_L - 0.2 - s * 0.8 * a; o[I.armRP] = REST_R - 0.15 + s * 0.45 * a;
      o[I.y] = abs(cos(ph)) * 0.1 * a; o[I.torsoP] = 0.3 + v.lean; o[I.torsoR] = s * 0.07; o[I.torsoY] = s * 0.13; o[I.headP] = -0.18;
    } },
    attackA: { dur: 0.42, fn(o, u, v) { // overhead chop
      base(o, v); const w = ease(seg(u, 0, 0.38)), st = ease(seg(u, 0.38, 0.58)), rc = ease(seg(u, 0.62, 1));
      o[I.armRP] = mix(mix(REST_R, -2.75, w), -0.15, st); o[I.armRP] = mix(o[I.armRP], REST_R, rc);
      o[I.torsoP] = mix(mix(0.05, -0.12, w), 0.32, st) * (1 - rc) + 0.06 * rc; o[I.torsoY] = mix(0.18 * w, -0.1, st) * (1 - rc);
      o[I.armLP] = mix(REST_L, -0.6, w) * (1 - st) + mix(-0.6, 0.2, st) * st * (1 - rc) + REST_L * rc; o[I.y] = -0.04 * st * (1 - rc); o[I.headP] = 0.12 * st * (1 - rc);
    } },
    attackB: { dur: 0.38, fn(o, u, v) { // horizontal slash
      base(o, v); const w = ease(seg(u, 0, 0.32)), st = ease(seg(u, 0.32, 0.55)), rc = ease(seg(u, 0.6, 1));
      o[I.armRP] = mix(REST_R, -1.45, w); o[I.armRY] = mix(mix(0, -1.0, w), 1.15, st); o[I.armRR] = -0.12 - 0.5 * w;
      o[I.torsoY] = mix(mix(0, 0.45, w), -0.5, st); o[I.torsoP] = 0.1 + 0.12 * st;
      for (const k of [I.armRP, I.armRY, I.armRR, I.torsoY]) o[k] *= 1 - rc; o[I.armRP] += REST_R * rc;
    } },
    heavy: { dur: 0.75, fn(o, u, v) { // two-handed slam (brutes, warlord, knights)
      base(o, v); const w = ease(seg(u, 0, 0.5)), st = ease(seg(u, 0.5, 0.66)), rc = ease(seg(u, 0.72, 1));
      const arm = mix(mix(REST_R, -3.0, w), 0.1, st); o[I.armRP] = mix(arm, REST_R, rc); o[I.armLP] = mix(mix(REST_L, -2.7, w), 0.0, st) * (1 - rc) + REST_L * rc;
      o[I.torsoP] = (mix(-0.25 * w, 0.5, st)) * (1 - rc); o[I.y] = (0.05 * w - 0.14 * st) * (1 - rc); o[I.legLP] = -0.35 * st * (1 - rc); o[I.legRP] = 0.3 * st * (1 - rc);
    } },
    aim: { loop: true, fn(o, ph, v) { base(o, v); o[I.armLP] = -1.5; o[I.armLR] = 0.05; o[I.armRP] = -1.35; o[I.armRR] = -0.55; o[I.armRY] = 0.25; o[I.torsoY] = 0.35; o[I.headY] = -0.3; o[I.y] = sin(ph * 0.3) * 0.008; } },
    fire: { dur: 0.32, fn(o, u, v) { C.aim.fn(o, 0, v); const r = ease(seg(u, 0, 0.18)), rc = ease(seg(u, 0.4, 1)); o[I.armRP] = mix(-1.35, -1.05, r) * (1 - rc) - 1.35 * rc; o[I.armRR] = mix(-0.55, 0.15, r) * (1 - rc) - 0.55 * rc; o[I.torsoP] = 0.04 - 0.06 * r * (1 - rc); } },
    cast: { dur: 0.6, fn(o, u, v) { base(o, v); const w = ease(seg(u, 0, 0.45)), st = ease(seg(u, 0.45, 0.6)), rc = ease(seg(u, 0.65, 1)); o[I.armRP] = mix(mix(REST_R, -2.6, w), -1.5, st) * (1 - rc) + REST_R * rc; o[I.armLP] = -1.0 * w * (1 - rc); o[I.armLR] = 0.6 * w * (1 - rc); o[I.headP] = -0.2 * w * (1 - rc); o[I.torsoP] = (0.25 * st - 0.1 * w) * (1 - rc); } },
    brace: { loop: true, fn(o, ph, v) { base(o, v); o[I.armLP] = -0.45; o[I.armLR] = -0.4; o[I.torsoP] = 0.2; o[I.y] = -0.05 + sin(ph * 0.4) * 0.008; o[I.legLP] = -0.35; o[I.legRP] = 0.3; o[I.armRP] = -0.9; } },
    cheer: { loop: true, fn(o, ph, v) { base(o, v); const s = sin(ph * 1.6); o[I.armRP] = -2.7 + s * 0.3; o[I.armLP] = -2.6 - s * 0.3; o[I.armLR] = 0.4; o[I.armRR] = -0.4; o[I.y] = max(0, s) * 0.12; o[I.headP] = -0.25; } },
    deploy: { dur: 0.4, fn(o, u, v) { base(o, v); const a = sin(u * PI); o[I.armLP] = -1.2 * a; o[I.armLR] = 0.8 * a; o[I.armRR] = -0.8 * a; o[I.legLP] = -0.6 * a; o[I.legRP] = 0.5 * a; o[I.torsoP] = 0.2 * a; } },
    deathA: { dur: 0.7, fn(o, u, v) { base(o, v); const f = ease(seg(u, 0, 0.35)); o[I.rootP] = -1.5 * f; o[I.armLP] = -2.4 * f; o[I.armRP] = mix(REST_R, -2.2, f); o[I.legLP] = -0.6 * f; o[I.headP] = -0.4 * f; o[I.y] = 0.1 * sin(f * PI); } },
    deathB: { dur: 0.7, fn(o, u, v) { base(o, v); const f = ease(seg(u, 0, 0.32)); o[I.rootP] = 1.45 * f; o[I.rootR] = 0.4 * f * (v.seed > 0.5 ? 1 : -1); o[I.armLP] = -1.6 * f; o[I.armRP] = -1.9 * f; o[I.legRP] = 0.5 * f; o[I.headP] = 0.3 * f; } },
    deathHeavy: { dur: 1.0, fn(o, u, v) { base(o, v); const k = ease(seg(u, 0, 0.3)), f = ease(seg(u, 0.25, 0.7)); o[I.y] = -0.25 * k; o[I.legLP] = -1.3 * k; o[I.legRP] = -1.1 * k; o[I.rootP] = 1.35 * f; o[I.armRP] = mix(REST_R, 0.3, k); o[I.armLP] = -0.4 * f; o[I.headP] = 0.4 * k; } },
  };
  // Additive layers (weighted, never interrupt the base clip): hit direction + stagger.
  const ADD = {
    hitFront: o => { o.fill(0); o[I.torsoP] = -0.38; o[I.headP] = -0.32; o[I.armRP] = 0.2; o[I.armLP] = 0.25; },
    hitLeft: o => { o.fill(0); o[I.torsoR] = 0.32; o[I.rootY] = 0.22; o[I.headY] = 0.25; },
    hitRight: o => { o.fill(0); o[I.torsoR] = -0.32; o[I.rootY] = -0.22; o[I.headY] = -0.25; },
    stagger: o => { o.fill(0); o[I.rootP] = -0.4; o[I.torsoP] = -0.3; o[I.armLP] = -0.7; o[I.armRP] = -0.5; o[I.y] = 0.05; },
  };
  const NAMES = Object.keys(C), ID = Object.fromEntries(NAMES.map((n, i) => [n, i])), CL = NAMES.map(n => C[n]);
  const REQUIRED = ['idle', 'run', 'sprint', 'attackA', 'attackB', 'heavy', 'aim', 'fire', 'cast', 'brace', 'cheer', 'deploy', 'deathA', 'deathB', 'deathHeavy'];

  const tmp = new Float32Array(P);
  const sample = (id, t, v, out) => { CL[id].fn(out, CL[id].loop ? t : min(1, max(0, t)), v); return out; };
  const blend = (out, a, w) => { for (let k = 0; k < P; k++) out[k] += (a[k] - out[k]) * w; return out; };
  const additive = (out, name, w) => { if (w <= 0.001) return out; ADD[name](tmp); for (let k = 0; k < P; k++) out[k] += tmp[k] * w; return out; };

  // Decide the clip for unit i from simulation state. Returns clip id; one-shot timing is driven by sim timers.
  function select(sim, i, v) {
    const d = sim.def(i), st = sim.st[i];
    if (st === 2) return d.sc >= 1.6 || d.el ? ID.deathHeavy : (v.seed < 0.5 ? ID.deathA : ID.deathB);
    if (sim.birth[i] > 0) return ID.deploy;
    if (sim.swing[i] > 0) {
      if (d.r) return d.wpn === 'staff' || d.wpn === 'cannon' ? ID.cast : ID.fire;
      if (d.el || d.sc >= 1.3 || d.wpn === 'axe') return ID.heavy;
      return v.seed2 < 0.55 ? ID.attackA : ID.attackB;
    }
    const sp = abs(sim.vx[i]) + abs(sim.vz[i]);
    if (d.r && sim.tgt[i] !== -1 && sp < 0.6) return ID.aim;
    if (d.sh && sim.tgt[i] !== -1 && sp < 0.6) return ID.brace;
    if (sp > 4.6) return ID.sprint;
    if (sp > 0.45) return ID.run;
    if (sim.team[i] === 0 && sim.tgt[i] === -1 && v.seed > 0.82) return ID.cheer;
    return ID.idle;
  }
  // Clip-local time for one-shots, derived from sim timers so animation always matches what the sim is doing.
  function clipTime(sim, i, id, v) {
    const c = CL[id];
    if (c.loop) return sim.phase[i];
    if (id === ID.deploy) return sim.birth[i] / 0.4;
    if (id >= ID.deathA) return sim.die[i] / c.dur;
    // swing runs 1→0 over ~0.31s in the sim; per-unit tempo variation stretches it slightly
    return min(1, (1 - sim.swing[i]) * v.tempo);
  }
  // Animation LOD: 0 = full skeleton every frame, 1 = full skeleton at half rate, 2 = far: single merged body.
  function lod(dist, crowd) {
    const k = crowd > 1400 ? 0.65 : crowd > 800 ? 0.8 : 1;
    return dist < 26 * k ? 0 : dist < 46 * k ? 1 : 2;
  }
  // Budgeted LOD: from a 1-unit distance histogram pick thresholds so at most nearMax units get the full skeleton
  // and nearMax+midMax get any skeleton; the rest render as statues. O(n), stable frame cost at any crowd size.
  function lodBudget(hist, nearMax, midMax, out) {
    let acc = 0, dn = hist.length, dm = hist.length;
    for (let d = 0; d < hist.length; d++) { acc += hist[d]; if (acc > nearMax && dn === hist.length) dn = d; if (acc > nearMax + midMax) { dm = d; break; } }
    out.near = dn; out.mid = dm; return out;
  }
  // Per-unit variation, deterministic from the slot index + spawn phase.
  function variation(i, phase, out) {
    const h = x => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
    out.seed = h(i * 1.37 + phase); out.seed2 = h(i * 3.1 + phase * 7.7); out.amp = 0.85 + h(i + phase * 3) * 0.3; out.lean = (h(i * 7 + phase) - 0.5) * 0.1; out.tempo = 0.9 + h(i * 11 + phase) * 0.25;
    return out;
  }
  KM.ANIM = { P, I, CLIPS: C, NAMES, ID, REQUIRED, ADD: Object.keys(ADD), sample, blend, additive, select, clipTime, lod, lodBudget, variation, FADE: 0.13 };
})(typeof window !== 'undefined' ? window : globalThis);
