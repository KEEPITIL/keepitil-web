/* Poka Dance — four-lane rhythm slice (C1.4). Tap Tap Music-style perspective note
   highway + DDR four-direction readability, all original PokaSnap art and sound.

   Paw (all five live): the four toes ARE the four lanes, left to right
   (outer-left = lane 1, inner-left = 2, inner-right = 3, outer-right = 4).
   Centre = SNAP and never touches the rhythm score.

   The sim (createDance / stepDance / press / simulateDance) is pure and seeded so
   tests can play whole songs headless. Music is an original pattern synthesized
   with WebAudio at play time: no external audio, no YouTube. */
import { drawPudding } from './pudding.js';
import { WEEKLY_MODES, danceGrade } from './weekly.js';
import { rng } from './core.js';
import { TAU, lg, blob, pill, bigText, toaster, legendDue, drawLegend, SAT, layer, star } from './gamekit.js';

export const DANCE = { bpm: 112, lengthBeats: 112, leadBeats: 8, travelS: 1.6, laneRoles: ['left', 'upLeft', 'upRight', 'right'] };
export const DANCE_PHOTO_OPS = ['perfect-streak', 'in-sync', 'spin', 'finale', 'encore'];
export const DANCE_HOOKS = { 'perfect-streak': 'Perfect Streak', 'in-sync': 'In Sync', spin: 'Spin Move', finale: 'Finale Pose', encore: 'Encore Bow' };
const SCORE = { perfect: 300, great: 200, good: 100, miss: 0 };
const BEAT = 60 / DANCE.bpm;

/* chart: four sections of rising density; later sections add chords (two lanes at once) */
export function buildChart(seed = 7) {
  const r = rng(seed), notes = []; let id = 0;
  for (let b = DANCE.leadBeats; b < DANCE.lengthBeats - 2; b++) {
    const sec = Math.min(3, Math.floor((b - DANCE.leadBeats) / 26));
    const subs = sec >= 2 ? [0, 0.5] : [0];
    for (const sub of subs) {
      if (sub && r() > 0.45 + sec * 0.1) continue;
      if (sec === 0 && b % 2) continue;
      const lane = Math.floor(r() * 4);
      notes.push({ id: id++, t: (b + sub) * BEAT, lane, res: null });
      if (sec >= 2 && !sub && r() < 0.18 + sec * 0.06) { notes[notes.length - 1].chord = true; notes.push({ id: id++, t: (b + sub) * BEAT, lane: (lane + 1 + Math.floor(r() * 3)) % 4, res: null, chord: true }); }
    }
  }
  return notes;
}
export function createDance({ seed = 7 } = {}) {
  return { t: -DANCE.travelS, notes: buildChart(seed), score: 0, combo: 0, maxCombo: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, last: null, ops: {}, opsLog: [], ended: false, phase: 'play', len: DANCE.lengthBeats * BEAT, presses: 0 };
}
const judgeWindow = () => WEEKLY_MODES.dance.timing.goodMs / 1000;
function grade(D, n, g, err) {
  n.res = g; D.counts[g]++; if (g === 'miss') D.combo = 0; else { D.combo++; D.maxCombo = Math.max(D.maxCombo, D.combo); }
  D.score += Math.round(SCORE[g] * (1 + Math.min(D.combo, 60) / 30)); D.last = { g, lane: n.lane, t: D.t, err };
  const open = (k, d = 1.2) => { const was = D.ops[k] > D.t; D.ops[k] = D.t + d; if (!was) D.opsLog.push({ op: k, t: +D.t.toFixed(2) }); };
  if (g === 'perfect' && D.combo >= 12 && D.combo % 12 === 0) open('perfect-streak', 1.6);
  if (n.chord && g !== 'miss') { const mate = D.notes.find(o => o !== n && o.chord && Math.abs(o.t - n.t) < 1e-6 && o.res && o.res !== 'miss'); if (mate) open('in-sync', 1.2); }
}
/* a lane press: the nearest un-judged note in THAT lane inside the window */
export function press(D, lane) {
  if (D.ended) return null; D.presses++;
  const w = judgeWindow(); let best = null;
  for (const n of D.notes) if (!n.res && n.lane === lane && Math.abs(n.t - D.t) <= w && (!best || Math.abs(n.t - D.t) < Math.abs(best.t - D.t))) best = n;
  if (!best) return null;
  const err = (D.t - best.t) * 1000; const g = danceGrade(err); grade(D, best, g, err); return g;
}
export function stepDance(D, dt) {
  if (D.ended) return; D.t += dt;
  const w = judgeWindow();
  for (const n of D.notes) if (!n.res && D.t - n.t > w) grade(D, n, 'miss', null);
  const beat = D.t / BEAT;
  if (Math.floor(beat) % 16 === 12 && beat > 20) { if (!(D.ops.spin > D.t)) { D.ops.spin = D.t + BEAT * 2; D.opsLog.push({ op: 'spin', t: +D.t.toFixed(2) }); } }
  if (D.len - D.t < 4 && !(D.ops.finale > D.t)) { D.ops.finale = D.len + 2; D.opsLog.push({ op: 'finale', t: +D.t.toFixed(2) }); }
  if (D.t >= D.len + 0.6) { D.ended = true; D.phase = 'result'; D.ops.encore = Infinity; D.opsLog.push({ op: 'encore', t: +D.t.toFixed(2) }); }
}
export const activeDanceOps = D => Object.entries(D.ops).filter(([, u]) => u > D.t).map(([k]) => k);
export function danceResult(D) {
  const total = D.notes.length, acc = total ? (D.counts.perfect + D.counts.great * 0.75 + D.counts.good * 0.4) / total : 0;
  const rank = acc >= 0.92 ? 'S' : acc >= 0.8 ? 'A' : acc >= 0.62 ? 'B' : acc >= 0.4 ? 'C' : 'D';
  return { accuracy: +acc.toFixed(3), rank, score: D.score, maxCombo: D.maxCombo, counts: { ...D.counts }, coins: 40 + Math.round(acc * 100), roll: acc >= 0.62 ? 10 : 5, prestige: rank === 'S' ? { cosmetic: 'Disco Bow Sparkles' } : null };
}
/* headless full song: skill = chance a note is hit, jitter = timing error spread (ms) */
export function simulateDance(seed = 7, skill = 0.9, jitter = 40) {
  const D = createDance({ seed }), r = rng(seed * 13 + 1), plan = D.notes.map(n => ({ n, at: n.t + (r() - 0.5) * 2 * jitter / 1000, go: r() < skill })).sort((a, b) => a.at - b.at);
  let i = 0; while (!D.ended) { stepDance(D, 1 / 120); while (i < plan.length && plan[i].at <= D.t) { if (plan[i].go) press(D, plan[i].n.lane); i++; } }
  return D;
}

/* ================================================================ runtime == */
let D = null, env = null, photos = [], legendT = 0, audio = null, nextBeat = 0, T0 = 0, dancer = { phase: 'idle', u: 0 };
const toasts = toaster();
const LANE_C = ['#ff6b8b', '#4fc3f7', '#2fd08a', '#ffc23d'];
const LANE_ICON = ['◀', '▼', '▲', '▶'];
export function start(e, opts = {}) {
  env = e; photos = []; toasts.clear(); D = createDance({ seed: opts.seed ?? 7 }); legendT = legendDue('dance') ? 3.2 : 0;
  DANCE.laneRoles.forEach((r, i) => env.pad?.(r, { lane: i, icon: LANE_ICON[i], label: String(i + 1) }));
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); nextBeat = 0; T0 = audio.currentTime + DANCE.travelS; } catch (err) { audio = null; }
  D.autopilot = !!opts.autopilot; return D;
}
export const sim = () => D;
export function state() { return D && { phase: D.phase, t: +D.t.toFixed(2), score: D.score, combo: D.combo, maxCombo: D.maxCombo, counts: { ...D.counts }, notes: D.notes.length, ops: activeDanceOps(D), photos: photos.map(p => p.ops), ended: D.ended, last: D.last }; }
export function quit() { if (D) finish(true); }
export function input(role) {
  if (!D) return;
  if (D.ended) { if (role === 'center') shoot(); else finish(); return; }
  if (role === 'center') return shoot();          // SNAP only; never part of the rhythm score
  const lane = DANCE.laneRoles.indexOf(role); if (lane < 0) return;
  const g = press(D, lane); hitFx.push({ lane, g: g || 'empty', t0: performance.now() }); env.haptic();
  if (g) { blip(lane, g); dancer = { phase: g === 'perfect' ? 'binky' : g === 'great' ? 'happy' : 'hop', u: 0 }; }
}
function shoot() { const ops = activeDanceOps(D); const ph = env.snap({ meta: { ops, combo: D.combo, t: +D.t.toFixed(2) }, at: { x: innerWidth / 2, y: innerHeight * 0.3 } }); if (ph) { photos.push({ ops, t: D.t }); if (ops.length) toasts.push('📸 ' + ops.map(o => DANCE_HOOKS[o]).join(' · '), '#4fc3f7'); } }
function finish(quit) { const r = danceResult(D); env.onExit(quit && !D.ended ? { quit: true } : { coins: r.coins, roll: r.roll, prestige: r.prestige, summary: `${r.rank} · ${Math.round(r.accuracy * 100)}% · combo ${r.maxCombo}` }); D = null; }
const hitFx = [];
export function step(dt) {
  if (!D) return;
  if (D.autopilot) for (const n of D.notes) if (!n.res && Math.abs(n.t - D.t) < 0.012) input(DANCE.laneRoles[n.lane]);
  stepDance(D, dt); legendT = Math.max(0, legendT - dt); dancer.u = Math.min(1, dancer.u + dt * 2.2); if (dancer.u >= 1) dancer.phase = 'idle';
  if (audio) beatAudio();
}
/* original synthesized groove: kick on every beat, hat on off-beats, a two-chord pad */
function beatAudio() {
  const now = audio.currentTime; while (T0 + nextBeat * BEAT < now + 0.15 && nextBeat < DANCE.lengthBeats + 1) { const at = T0 + nextBeat * BEAT; tone(at, 'sine', 110, 55, 0.18, 0.5); tone(at + BEAT / 2, 'square', 6000, 6000, 0.03, 0.04); if (nextBeat % 4 === 0) { const root = nextBeat % 8 === 0 ? 261.6 : 220; for (const m of [1, 1.26, 1.5]) tone(at, 'triangle', root * m, root * m, BEAT * 3.6, 0.05); } nextBeat++; }
}
function tone(at, type, f0, f1, dur, vol) { try { const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(g).connect(audio.destination); o.start(at); o.stop(at + dur + 0.02); } catch (e) {} }
function blip(lane, g) { if (!audio) return; tone(audio.currentTime, 'triangle', [523, 587, 659, 784][lane], [523, 587, 659, 784][lane] * (g === 'perfect' ? 2 : 1.5), 0.12, 0.08); }

/* ------------------------------------------------------------------ draw -- */
const STAGE = () => layer('dance_stage', 400, 260, (x, w, h) => {
  x.fillStyle = lg(x, 0, 0, 0, h, ['#2b1a5e', '#5a3aa8', '#8f5fd6']); x.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.12})`; x.beginPath(); x.arc((i * 97) % w, (i * 37) % (h * 0.5), 1 + (i % 3), 0, TAU); x.fill(); }
  x.fillStyle = lg(x, 0, h * 0.62, 0, h, ['#ff9fc4', '#e04a8e']); x.beginPath(); x.ellipse(w / 2, h * 0.86, w * 0.48, h * 0.16, 0, 0, TAU); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 3; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.ellipse(w / 2, h * 0.84, w * 0.4, h * 0.1, 0, 0, TAU); x.fill();
  for (const sx of [w * 0.08, w * 0.92]) { x.fillStyle = '#3b2d4f'; x.fillRect(sx - 12, h * 0.25, 24, h * 0.6); for (let k = 0; k < 4; k++) blob(x, sx, h * 0.3 + k * 26, 9, ['#ff6b8b', '#ffd84a', '#4fc3f7', '#2fd08a'][k]); }
});
function crowd(ctx, W, y, T, hype) { for (let i = 0; i < 18; i++) { const x = (i + 0.5) * W / 18, b = Math.abs(Math.sin(T * (4 + hype * 4) + i)) * (3 + hype * 8); ctx.fillStyle = ['#ffd1a6', '#cfc6f2', '#bfe8d6', '#ffc6d6', '#fff0b3'][i % 5]; ctx.beginPath(); ctx.arc(x, y - b, 9, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x - 5, y - 11 - b, 3, 7, -0.3, 0, TAU); ctx.ellipse(x + 5, y - 11 - b, 3, 7, 0.3, 0, TAU); ctx.fill(); if (hype > 0.5 && i % 3 === 0) { ctx.fillStyle = LANE_C[i % 4]; ctx.fillRect(x + 6, y - 30 - b, 3, 14); } } }
export function render(ctx, W, H, dpr, T) {
  if (!D) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hype = Math.min(1, D.combo / 30), beatK = ((D.t / BEAT) % 1 + 1) % 1, pulse = 1 - beatK;
  const S = STAGE(); ctx.fillStyle = lg(ctx, 0, H * 0.55, 0, H, ['#e04a8e', '#5a3aa8', '#2b1a5e']); ctx.fillRect(0, 0, W, H); ctx.drawImage(S.c, 0, 0, W, H * 0.62);
  // light beams scale with the combo
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + Math.sin(T * 0.8 + i) * 0.5 + (i - 2.5) * 0.18; ctx.save(); ctx.translate(W * (0.1 + i * 0.16), 0); ctx.rotate(a + Math.PI / 2); ctx.fillStyle = `${['rgba(255,107,139,', 'rgba(79,195,247,', 'rgba(47,208,138,', 'rgba(255,194,61,'][i % 4]}${0.08 + hype * 0.18})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(H * 0.7, -40); ctx.lineTo(H * 0.7, 40); ctx.fill(); ctx.restore(); }
  crowd(ctx, W, H * 0.6, T, hype);
  // Pudding performs large, on the beat
  const dy = Math.sin(beatK * TAU) * 4, scale = Math.min(W, 420) / 375 * 0.95;
  ctx.save(); ctx.translate(W / 2, H * 0.47 + dy); ctx.scale(scale, scale);
  const spin = D.ops.spin > D.t ? Math.sin((D.ops.spin - D.t) / (BEAT * 2) * Math.PI) : 0;
  if (spin) ctx.scale(Math.cos(spin * Math.PI), 1);
  drawPudding(ctx, { view: 'front', phase: D.ended ? 'happy' : dancer.phase === 'idle' ? (Math.floor(D.t / BEAT) % 2 ? 'paw' : 'happy') : dancer.phase, u: dancer.u, t: T, pal: env.pal });
  ctx.restore();
  highway(ctx, W, H, T, pulse);
  // HUD: score, combo, song progress
  const top = SAT() + 10;
  ctx.fillStyle = 'rgba(43,35,80,.8)'; ctx.beginPath(); ctx.roundRect(10, top, W - 20, 44, 22); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.roundRect(110, top + 19, W - 200, 6, 3); ctx.fill(); ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.roundRect(110, top + 19, (W - 200) * Math.max(0, Math.min(1, D.t / D.len)), 6, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'left'; ctx.fillText(D.score.toLocaleString(), 24, top + 28); ctx.textAlign = 'right'; ctx.fillText(`×${D.combo}`, W - 26, top + 28);
  if (D.combo >= 5) bigText(ctx, `${D.combo} COMBO`, W / 2, H * 0.2, 22 + hype * 8, '#ffd84a');
  if (D.last && D.t - D.last.t < 0.5) { const g = D.last.g; bigText(ctx, { perfect: 'PURRFECT!', great: 'GREAT', good: 'GOOD', miss: 'MISS' }[g], W / 2, H * 0.27, 26, { perfect: '#ffd84a', great: '#7dffb0', good: '#9ee4ff', miss: '#ffb3c6' }[g]); }
  const ops = activeDanceOps(D); if (ops.length && !D.ended) pill(ctx, W / 2, top + 66, '📸 ' + DANCE_HOOKS[ops[0]], 'rgba(79,195,247,.92)');
  toasts.draw(ctx, W, top + 100);
  if (D.t < 0) bigText(ctx, String(Math.ceil(-D.t)), W / 2, H * 0.36, 60);
  if (legendT > 0) drawLegend(ctx, W, H, 'dance', Math.min(1, legendT / 0.4));
  if (D.ended) result(ctx, W, H);
}
/* perspective highway: four lanes converge toward the stage; paw-print notes slide to the hit line */
function highway(ctx, W, H, T, pulse) {
  const yTop = H * 0.4, yHit = H * 0.66, xc = W / 2, wTop = W * 0.18, wHit = Math.min(W * 0.92, 380);
  const X = (lane, k) => xc + ((lane + 0.5) / 4 - 0.5) * (wTop + (wHit - wTop) * k), Y = k => yTop + (yHit - yTop) * k * k * 0.25 + (yHit - yTop) * (k - k * k * 0.25);
  ctx.beginPath(); ctx.moveTo(xc - wTop / 2, yTop); ctx.lineTo(xc + wTop / 2, yTop); ctx.lineTo(xc + wHit / 2 + 10, yHit + 26); ctx.lineTo(xc - wHit / 2 - 10, yHit + 26); ctx.closePath();
  ctx.fillStyle = lg(ctx, 0, yTop, 0, yHit, ['rgba(43,26,94,.35)', 'rgba(43,26,94,.85)']); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
  for (let l = 1; l < 4; l++) { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xc + (l / 4 - 0.5) * wTop, yTop); ctx.lineTo(xc + (l / 4 - 0.5) * (wHit + 20), yHit + 26); ctx.stroke(); }
  for (let b = Math.ceil(D.t / BEAT); b < D.t / BEAT + DANCE.travelS / BEAT; b++) { const k = 1 - (b * BEAT - D.t) / DANCE.travelS; if (k < 0 || k > 1) continue; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(0, k) - (wTop + (wHit - wTop) * k) / 8, Y(k)); ctx.lineTo(X(3, k) + (wTop + (wHit - wTop) * k) / 8, Y(k)); ctx.stroke(); }
  // receptors on the hit line, coloured like their toes
  const now = performance.now();
  for (let l = 0; l < 4; l++) { const x = X(l, 1), fx = hitFx.filter(f => f.lane === l && now - f.t0 < 220).pop(), on = !!fx;
    ctx.fillStyle = on ? LANE_C[l] : 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(x, yHit, 26 + pulse * 2, 15 + pulse, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = LANE_C[l]; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText(LANE_ICON[l], x, yHit + 6); }
  // notes: paw-print tokens
  for (const n of D.notes) { if (n.res && n.res !== 'miss') continue; const k = 1 - (n.t - D.t) / DANCE.travelS; if (k < 0 || k > 1.12) continue; const x = X(n.lane, Math.min(1.12, k)), y = Y(Math.min(1.12, k)), s = 0.35 + 0.65 * k;
    ctx.globalAlpha = n.res === 'miss' ? 0.3 : 1; pawNote(ctx, x, y, 17 * s, LANE_C[n.lane], n.chord); ctx.globalAlpha = 1; }
  hitFx.splice(0, Math.max(0, hitFx.length - 12));
}
function pawNote(ctx, x, y, r, c, chord) { ctx.fillStyle = c; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, r * 0.18); ctx.beginPath(); ctx.ellipse(x, y + r * 0.2, r, r * 0.72, 0, 0, TAU); ctx.fill(); ctx.stroke(); for (const [ox, oy] of [[-0.75, -0.6], [-0.27, -0.95], [0.27, -0.95], [0.75, -0.6]]) { ctx.beginPath(); ctx.ellipse(x + ox * r, y + oy * r, r * 0.26, r * 0.32, 0, 0, TAU); ctx.fill(); ctx.stroke(); } if (chord) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, r * 1.35, r * 1.1, 0, 0, TAU); ctx.stroke(); } }
function result(ctx, W, H) {
  const r = danceResult(D), y = H * 0.16;
  ctx.fillStyle = 'rgba(43,35,80,.9)'; ctx.beginPath(); ctx.roundRect(20, y, W - 40, 190, 24); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  bigText(ctx, `RANK ${r.rank}`, W / 2, y + 48, 34, '#ffd84a');
  ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(`Score ${r.score.toLocaleString()} · Accuracy ${Math.round(r.accuracy * 100)}% · Max combo ${r.maxCombo}`, W / 2, y + 82);
  ctx.fillText(`Purrfect ${r.counts.perfect} · Great ${r.counts.great} · Good ${r.counts.good} · Miss ${r.counts.miss}`, W / 2, y + 104);
  for (let i = 0; i < 5; i++) star(ctx, W / 2 - 60 + i * 30, y + 134, 11, i < { S: 5, A: 4, B: 3, C: 2, D: 1 }[r.rank] ? '#ffd84a' : 'rgba(255,255,255,.25)');
  ctx.fillText('📸 SNAP the encore bow · tap any toe to collect', W / 2, y + 172);
}
