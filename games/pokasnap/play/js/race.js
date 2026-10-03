/* Poka Race — renderer + paw wiring (C1.4: one shared course).
   Rules live in raceSim.js (pure, seeded, tested); this file only draws and
   routes the paw. All four racers share ONE side-scrolling course: rolling
   hills, wooden-bridge upper routes, a tunnel, the same obstacles and Paw Pods,
   so overtakes and collisions are visible. Vertical separation comes from
   terrain and jumps, never from permanent lanes.

   Paw in Race (all five live): centre = JUMP (again in the air = high jump),
   outer-left = ITEM (empty slot until a Paw Pod), inner-left = ROLL (under low
   branches, dodges a Super Ball), inner-right = SNAP, outer-right = BOOST
   (charged by clean clears and pickups). Pause/exit is the small II button. */
import { drawPudding } from './pudding.js';
import * as Sim from './raceSim.js';
import { legendDue, drawLegend } from './gamekit.js';

const TAU = Math.PI * 2;
let R = null, env = null, camX = 0, camY = 0, photos = [], cues = [], legendT = 0;
const ORD = n => n + ['st', 'nd', 'rd', 'th'][Math.min(3, n - 1)];

export function state() {
  if (!R) return null; const h = Sim.human(R);
  return { phase: R.phase, t: +R.t.toFixed(2), x: +h.x.toFixed(1), length: R.course.length, place: Sim.placeOf(R, h.id), item: h.item, airborne: h.air, cleared: h.cleared, hits: h.hits, boostM: +h.boostM.toFixed(2), rolls: h.rolls, boosts: h.boosts, onBridge: !!h.plat, rolling: h.roll > 0,
           racers: R.racers.map(r => ({ id: r.id, kind: r.kind, x: +r.x.toFixed(1), finished: r.finished, place: r.place })), finishOrder: R.finishOrder.slice(), ops: Sim.activeOps(R), photos: photos.map(p => p.ops), ended: R.ended };
}
export function start(e, opts = {}) {
  env = e; photos = []; cues = []; lastEv = 0;
  R = Sim.createRace({ seed: opts.seed ?? (Date.now() % 100000), slots: Sim.DEFAULT_SLOTS(e.pal), autopilot: !!opts.autopilot });
  camX = 0; camY = 0; legendT = legendDue('race') ? 3.2 : 0; syncPads(); return R;
}
export function sim() { return R; }
export function input(role) {
  if (!R) return;
  const h = Sim.human(R);
  if (R.phase === 'podium') { if (role === 'upRight') shoot(); else finish(); return; }
  if (role === 'center') { Sim.input(R, h.id, 'jump'); env.haptic(); }
  else if (role === 'left') { if (!h.item) { toast('ITEM slot empty: run through a Paw Pod', '#8f7fe8'); return; } Sim.input(R, h.id, 'item'); env.haptic(); }
  else if (role === 'upLeft') { Sim.input(R, h.id, 'dodge'); env.haptic(); }
  else if (role === 'upRight') shoot();
  else if (role === 'right') { if (h.boostM < 1) { toast(`BOOST charging · ${Math.round(h.boostM * 100)}%`, '#8f7fe8'); return; } Sim.input(R, h.id, 'boost'); env.haptic(); }
}
export function quit() { if (R) finish(true); }
/* The user controls the shutter: a SNAP during an open photo moment is tagged with it. */
function shoot() {
  const ops = Sim.activeOps(R), h = Sim.human(R), p = screenOf(h);
  const ph = env.snap({ race: { ops, place: Sim.placeOf(R, h.id), t: +R.t.toFixed(2) }, at: p });
  if (ph) { photos.push({ ops, t: R.t }); if (ops.length) toast('📸 ' + ops.map(o => Sim.ALBUM_HOOKS[o]).join(' · '), '#4fc3f7'); }
}
function syncPads() {
  if (!R || !env.pad) return; const h = Sim.human(R);
  env.pad('left', h.item ? { icon: Sim.ITEMS[h.item].icon, label: 'ITEM', state: 'lit' } : { icon: '🎁', label: 'EMPTY', state: 'empty' });
  env.pad('right', { meter: h.boostM, state: h.boostM >= 1 ? 'lit' : null });
  env.pad('upLeft', { state: h.roll > 0 ? 'lit' : null });
}
function toast(text, c) { cues.push({ text, c, t0: performance.now() }); if (cues.length > 3) cues.shift(); }
function finish(quit) {
  const rw = Sim.rewards(R), done = R.ended;
  const result = quit && !done ? { place: Sim.placeOf(R, Sim.human(R).id), coins: 25, roll: 0, quit: true }
    : { place: rw.place, coins: rw.participation.coins + rw.performance.coins, roll: (rw.milestone?.roll || 0) + rw.performance.roll, prestige: rw.prestige, photos: photos.length };
  R = null; env.onExit(result);
}

let lastEv = 0;
export function step(dt) {
  if (!R) return;
  Sim.step(R, dt);
  const h = Sim.human(R);
  for (const e of R.events) if (e.id > lastEv) {
    lastEv = e.id;
    if (e.type === 'pickup' && e.racer === h.id) { toast(`${Sim.ITEMS[e.item].icon} ${Sim.ITEMS[e.item].name} ready: tap ITEM`, '#8f7fe8'); env.haptic(); }
    if (e.type === 'effect' && e.racer === h.id && e.by && e.by !== h.id) toast(e.effect === 'poof' ? '🫧 Shield saved you!' : '💫 Bonk! Back on your paws', '#ff8a6b');
    if (e.type === 'use' && e.racer === h.id) toast(`${Sim.ITEMS[e.item].icon} ${Sim.ITEMS[e.item].name}!`, '#2fc2a3');
    if (e.type === 'finish' && e.racer === h.id) { toast(`🏁 ${ORD(e.place)} place!`, '#ffc23d'); env.haptic(); }
  }
  syncPads(); legendT = Math.max(0, legendT - dt);
  camX += (Math.min(h.x, R.course.length + 2) - camX) * Math.min(1, dt * 8);
  camY += (Sim.terrain(camX) - camY) * Math.min(1, dt * 3);
}

/* ================================================================= art == */
const cache = {};
function layer(key, w, h, paint) { if (cache[key]) return cache[key]; const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const x = c.getContext('2d'); x.scale(2, 2); paint(x, w, h); return (cache[key] = { c, w, h }); }
const lg = (x, x0, y0, x1, y1, st) => { const g = x.createLinearGradient(x0, y0, x1, y1); st.forEach((c, i) => g.addColorStop(i / (st.length - 1), c)); return g; };
const shadeC = (hex, k) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; const f = k < 0 ? 0 : 255, p = Math.abs(k); return `rgb(${Math.round((f - r) * p + r)},${Math.round((f - g) * p + g)},${Math.round((f - b) * p + b)})`; };
function blob(x, cx, cy, r, c) { const g = x.createRadialGradient(cx - r * 0.4, cy - r * 0.5, r * 0.1, cx, cy, r * 1.1); g.addColorStop(0, shadeC(c, 0.35)); g.addColorStop(0.6, c); g.addColorStop(1, shadeC(c, -0.3)); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
function repeatX(ctx, L, off, y, W, sc = 1) { const w = L.w * sc; const x0 = -((off % w) + w) % w; for (let x = x0; x < W; x += w) ctx.drawImage(L.c, x, y, w, L.h * sc); }

/* far hills with Puddle Park rooftops; mid tree line; the grandstand */
const HILLS = () => layer('hills', 720, 120, (x, w, h) => {
  for (const [c, amp, base, f] of [['#b9dfa8', 26, 40, 90], ['#9ccf8c', 20, 22, 60]]) { x.fillStyle = c; x.beginPath(); x.moveTo(0, h); for (let i = 0; i <= w; i += 8) x.lineTo(i, h - base - amp * (0.5 + 0.5 * Math.sin(i / w * TAU * 3 + f))); x.lineTo(w, h); x.fill(); }
  for (const [px, c] of [[120, '#ff9fc4'], [380, '#ffb36b'], [590, '#c49bf0']]) { x.fillStyle = shadeC(c, -0.1); x.fillRect(px, h - 70, 30, 30); x.fillStyle = c; x.beginPath(); x.moveTo(px - 4, h - 70); x.lineTo(px + 15, h - 88); x.lineTo(px + 34, h - 70); x.fill(); x.fillStyle = '#fff6c8'; x.fillRect(px + 10, h - 62, 8, 9); }
});
const TREES = () => layer('trees', 560, 110, (x, w, h) => {
  for (let i = 0; i < 14; i++) { const px = i * 40 + (i % 3) * 7, s = 0.8 + (i % 4) * 0.12; x.fillStyle = '#7a5236'; x.fillRect(px - 3, h - 30 * s, 6, 30 * s); for (const [a, b, r] of [[0, -40, 20], [-13, -30, 14], [13, -30, 14]]) blob(x, px + a * s, h + b * s, r * s, ['#5fbf5a', '#4fae6a', '#7ccf5e'][i % 3]); if (i % 4 === 1) { x.fillStyle = '#ff9fc4'; for (let k = 0; k < 6; k++) { x.beginPath(); x.arc(px - 14 * s + (k * 11) % 28, h - 46 * s + (k * 7) % 18, 2.4, 0, TAU); x.fill(); } } }
});
function STANDS(frame) { return layer('stands' + frame, 600, 120, (x, w, h) => {
  x.fillStyle = lg(x, 0, 30, 0, h, ['#8f7fe8', '#6a58d6']); x.fillRect(0, 40, w, h - 40);
  for (let r = 0; r < 4; r++) { x.fillStyle = r % 2 ? '#7d6cdc' : '#9888ee'; x.fillRect(0, 48 + r * 17, w, 14); }
  x.fillStyle = '#5b4a6a'; for (let px = 0; px < w; px += 100) x.fillRect(px, 20, 6, h - 20);
  x.fillStyle = lg(x, 0, 12, 0, 30, ['#ff8aa6', '#e84d74']); x.fillRect(0, 22, w, 16); for (let px = 0; px < w; px += 20) { x.fillStyle = (px / 20) % 2 ? '#fff' : '#ff6b8b'; x.beginPath(); x.arc(px + 10, 38, 10, 0, Math.PI); x.fill(); }
  const cols = ['#ffd1a6', '#cfc6f2', '#bfe8d6', '#ffc6d6', '#fff0b3', '#c6e6ff', '#d9d0c2'];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 30; i++) { const px = i * 20 + (r % 2) * 10 + 4, py = 58 + r * 17, b = ((i * 7 + r * 3 + frame) % 3 === 0) ? -4 : 0; x.fillStyle = cols[(i + r) % 7]; x.beginPath(); x.arc(px, py + b, 6, 0, TAU); x.fill(); x.beginPath(); x.ellipse(px - 3.5, py - 7 + b, 2, 5, -0.3, 0, TAU); x.ellipse(px + 3.5, py - 7 + b, 2, 5, 0.3, 0, TAU); x.fill(); x.fillStyle = '#3b2d4f'; x.fillRect(px - 2.5, py - 1 + b, 1.6, 1.6); x.fillRect(px + 1, py - 1 + b, 1.6, 1.6); if ((i + r + frame) % 9 === 0) { x.fillStyle = ['#ff6b8b', '#ffd84a', '#4fc3f7'][i % 3]; x.fillRect(px + 4, py - 16 + b, 3, 12); x.fillRect(px + 4, py - 16 + b, 10, 6); } }
  for (let px = 50; px < w; px += 200) { x.fillStyle = '#fff3dc'; x.beginPath(); x.roundRect(px, 2, 100, 18, 9); x.fill(); x.strokeStyle = '#e04a6e'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#e04a6e'; x.font = '900 11px system-ui'; x.textAlign = 'center'; x.fillText('POKA RACE', px + 50, 15); }
}); }
const TRACK = () => layer('track', 256, 64, (x, w, h) => { x.fillStyle = lg(x, 0, 0, 0, h, ['#ecc995', '#d9ae6e']); x.fillRect(0, 0, w, h); let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 260; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(120,70,30,.14)'; x.fillRect(r() * w, r() * h, 2 + r() * 2, 1.5); } });
const FORE = () => layer('fore', 420, 70, (x, w, h) => {
  x.fillStyle = lg(x, 0, 0, 0, h, ['#7ccf5e', '#4fa84a']); x.beginPath(); x.moveTo(0, 18); for (let i = 0; i <= w; i += 10) x.lineTo(i, 14 + Math.sin(i / w * TAU * 3) * 4); x.lineTo(w, h); x.lineTo(0, h); x.fill();
  for (let i = 0; i < 40; i++) { const px = (i * 47) % w, py = 20 + (i * 13) % 30; x.strokeStyle = '#3f9a4a'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, py + 10); x.lineTo(px + 2, py - 4); x.stroke(); if (i % 3 === 0) { x.fillStyle = ['#ff6b8b', '#ffd84a', '#fff', '#c49bf0'][i % 4]; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; x.beginPath(); x.arc(px + 2 + Math.cos(a) * 3, py - 6 + Math.sin(a) * 3, 2.2, 0, TAU); x.fill(); } x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(px + 2, py - 6, 1.6, 0, TAU); x.fill(); } }
  for (let px = 30; px < w; px += 140) { x.fillStyle = '#fff6e6'; x.fillRect(px, 0, 8, 24); x.fillRect(px - 6, 4, 140, 5); }
});

/* obstacle sprites (per lane, scaled) */
const OBS = {
  hurdle: () => layer('o_hurdle', 60, 60, x => { for (const px of [8, 48]) { x.fillStyle = lg(x, px, 0, px + 5, 0, ['#ffffff', '#cfc6e0']); x.fillRect(px, 20, 5, 40); } x.fillStyle = lg(x, 0, 14, 0, 26, ['#ff9ab2', '#e84d74']); x.beginPath(); x.roundRect(2, 14, 56, 12, 4); x.fill(); x.fillStyle = '#fff'; for (const px of [12, 34]) x.fillRect(px, 14, 10, 12); x.strokeStyle = '#a8344f'; x.lineWidth = 1.2; x.strokeRect(2, 14, 56, 12); }),
  log: () => layer('o_log', 100, 54, x => { x.fillStyle = lg(x, 0, 6, 0, 52, ['#c98a5a', '#8a5a3a', '#6d4228']); x.beginPath(); x.roundRect(4, 8, 84, 44, 22); x.fill(); x.strokeStyle = '#5a3820'; x.lineWidth = 1.5; x.stroke(); x.fillStyle = '#e8c59a'; x.beginPath(); x.ellipse(86, 30, 12, 22, 0, 0, TAU); x.fill(); x.strokeStyle = '#b07a4a'; for (const r of [5, 10, 15]) { x.beginPath(); x.ellipse(86, 30, r * 0.55, r, 0, 0, TAU); x.stroke(); } x.fillStyle = '#5fbf5a'; x.beginPath(); x.ellipse(30, 10, 9, 4, -0.3, 0, TAU); x.fill(); }),
  inflatable: () => layer('o_infl', 110, 130, x => { const c = ['#ff9fc4', '#9ee4ff', '#ffe680', '#b9f5c8']; for (let i = 0; i < 4; i++) { x.fillStyle = lg(x, 8 + i * 24, 0, 30 + i * 24, 0, [shadeC(c[i], 0.3), c[i], shadeC(c[i], -0.2)]); x.beginPath(); x.roundRect(8 + i * 24, 16, 24, 112, 12); x.fill(); x.strokeStyle = shadeC(c[i], -0.35); x.lineWidth = 1.2; x.stroke(); } x.fillStyle = lg(x, 0, 2, 0, 22, ['#ff8aa6', '#e84d74']); x.beginPath(); x.roundRect(2, 4, 106, 20, 10); x.fill(); x.fillStyle = '#fff'; x.font = '900 11px system-ui'; x.textAlign = 'center'; x.fillText('BOING!', 55, 18); }),
  ramp: () => layer('o_ramp', 110, 50, x => { x.fillStyle = lg(x, 0, 10, 0, 50, ['#ffcf8a', '#c98a5a']); x.beginPath(); x.moveTo(2, 48); x.lineTo(104, 48); x.lineTo(104, 6); x.closePath(); x.fill(); x.strokeStyle = '#8a5a3a'; x.lineWidth = 1.5; x.stroke(); x.strokeStyle = 'rgba(120,70,30,.4)'; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(2 + i * 17, 48); x.lineTo(2 + i * 17, 48 - i * 7); x.stroke(); } x.fillStyle = '#ffd84a'; x.beginPath(); x.moveTo(60, 34); x.lineTo(80, 26); x.lineTo(72, 38); x.fill(); }),
  spring: () => layer('o_spring', 60, 36, x => { x.strokeStyle = '#8a95b8'; x.lineWidth = 3; for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(30, 30 - i * 5, 18, 4, 0, 0, TAU); x.stroke(); } x.fillStyle = lg(x, 0, 2, 0, 12, ['#7dffb0', '#2fc2a3']); x.beginPath(); x.roundRect(6, 4, 48, 9, 4); x.fill(); x.strokeStyle = '#1f8a72'; x.lineWidth = 1.2; x.stroke(); }),
  puddle: () => layer('o_puddle', 140, 30, x => { x.fillStyle = lg(x, 0, 2, 0, 28, ['#bdf0ff', '#3fa9e0']); x.beginPath(); x.ellipse(70, 15, 66, 11, 0, 0, TAU); x.fill(); x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.4; x.beginPath(); x.ellipse(50, 13, 20, 3, 0, 0, TAU); x.stroke(); }),
  pod: () => layer('pod', 46, 46, x => { const g = x.createRadialGradient(23, 23, 4, 23, 23, 23); g.addColorStop(0, 'rgba(255,240,180,.9)'); g.addColorStop(1, 'rgba(255,240,180,0)'); x.fillStyle = g; x.fillRect(0, 0, 46, 46); x.fillStyle = lg(x, 10, 0, 36, 0, ['#c9b8ff', '#8f7fe8']); x.beginPath(); x.ellipse(23, 24, 13, 15, 0, 0, TAU); x.fill(); x.strokeStyle = '#5a48c8'; x.lineWidth = 1.5; x.stroke(); x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(18, 17, 4, 6, -0.4, 0, TAU); x.fill(); x.fillStyle = '#ffd84a'; x.beginPath(); x.ellipse(23, 28, 5, 4, 0, 0, TAU); x.fill(); for (const [a, b] of [[-6, -4], [-2, -8], [3, -8], [7, -4]]) { x.beginPath(); x.arc(23 + a, 28 + b, 2.2, 0, TAU); x.fill(); } }),
  treat: () => layer('treat', 18, 18, x => { x.fillStyle = lg(x, 0, 2, 0, 16, ['#ffe08a', '#e0a040']); x.beginPath(); x.arc(9, 9, 7, 0, TAU); x.fill(); x.strokeStyle = '#b07a20'; x.lineWidth = 1; x.stroke(); x.fillStyle = '#8a5a20'; for (const [a, b] of [[6, 7], [11, 6], [9, 11]]) { x.beginPath(); x.arc(a, b, 1.2, 0, TAU); x.fill(); } }),
};

/* ============================================================ geometry == */
let G = null;
function geom(W, H) {
  const ppm = W / 10, base = H * 0.6;
  return { W, H, ppm, px: W * 0.32, base, top: H * 0.4, bot: H * 0.69, gy: x => base - (Sim.terrain(x) - camY) * ppm * 0.55 };
}
function screenOf(r) { if (!G) return { x: 0, y: 0 }; return { x: sxOf(r.x), y: G.gy(r.x) - r.y * G.ppm - 40 }; }
const sxOf = x => G.px + (x - camX) * G.ppm;
const wxOf = sx => camX + (sx - G.px) / G.ppm;

/* ============================================================== render == */
export function render(ctx, W, H, dpr, T) {
  if (!R) return;
  G = geom(W, H);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (R.phase === 'podium') return podium(ctx, W, H, T);
  // sky + sun + drifting clouds
  const sky = ctx.createLinearGradient(0, 0, 0, G.top); sky.addColorStop(0, '#5fb6ee'); sky.addColorStop(0.7, '#a8dcf6'); sky.addColorStop(1, '#fff1d8'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, G.top + 4);
  const sg = ctx.createRadialGradient(W * 0.8, G.top * 0.35, 4, W * 0.8, G.top * 0.35, 90); sg.addColorStop(0, 'rgba(255,248,210,.95)'); sg.addColorStop(1, 'rgba(255,248,210,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, G.top);
  for (let i = 0; i < 4; i++) { const cx = ((i * 170 - camX * 2 - T * 6) % (W + 160) + W + 160) % (W + 160) - 80, cy = G.top * (0.28 + (i % 2) * 0.18); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); for (const [ox, oy, r] of [[0, 0, 16], [16, -6, 20], [34, 0, 15], [18, 6, 16]]) { ctx.moveTo(cx + ox + r, cy + oy); ctx.ellipse(cx + ox, cy + oy, r, r * 0.7, 0, 0, TAU); } ctx.fill(); }
  // parallax layers
  ctx.fillStyle = '#9ccf8c'; ctx.fillRect(0, G.top - 60, W, H);   // the field fills everything below the stands, whatever the terrain does
  repeatX(ctx, HILLS(), camX * G.ppm * 0.08, G.top - 190, W, 1.1);
  repeatX(ctx, TREES(), camX * G.ppm * 0.2, G.top - 150, W, 1.05);
  repeatX(ctx, STANDS(Math.floor(T * 4) % 3), camX * G.ppm * 0.45, G.top - 74, W, 0.66);
  // ground under the track and behind the paw
  ctx.fillStyle = '#4fa84a'; ctx.fillRect(0, G.bot + 20, W, H - G.bot);
  // ONE shared course: a dirt track that rides the hills, grass below it
  const track = (pad, step = 6) => { ctx.beginPath(); ctx.moveTo(-10, H); for (let sx = -10; sx <= W + 10; sx += step) ctx.lineTo(sx, G.gy(wxOf(sx)) + pad); ctx.lineTo(W + 10, H); ctx.closePath(); };
  track(-4); ctx.fillStyle = '#5fb85a'; ctx.fill();
  track(0); ctx.fillStyle = lg(ctx, 0, G.base - 40, 0, G.base + 60, ['#ecc995', '#d9ae6e', '#c99a5c']); ctx.fill();
  track(34); ctx.fillStyle = '#4fa84a'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.setLineDash([18, 12]); ctx.lineDashOffset = camX * G.ppm;
  ctx.beginPath(); for (let sx = -10; sx <= W + 10; sx += 8) { const y = G.gy(wxOf(sx)) + 14; sx < -9 ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y); } ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(120,70,30,.35)'; ctx.lineWidth = 2; ctx.beginPath(); for (let sx = -10; sx <= W + 10; sx += 8) { const y = G.gy(wxOf(sx)); sx < -9 ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y); } ctx.stroke();
  gate(ctx, 0, 'START', T); gate(ctx, R.course.length, 'FINISH', T);
  for (const p of R.course.plats) bridge(ctx, p);
  for (const z of R.zones) { const x = sxOf(z.x); if (x > -80 && x < W + 80) { ctx.fillStyle = 'rgba(232,170,60,.75)'; ctx.beginPath(); ctx.ellipse(x + z.w * G.ppm / 2, G.gy(z.x) + 3, z.w * G.ppm / 2, 6, 0, 0, TAU); ctx.fill(); } }
  for (const o of R.course.obs) { const x = sxOf(o.x); if (x < -160 || x > W + 160) continue; obstacle(ctx, o, x, G.gy(o.x), 1, 3, T); }
  const h0 = Sim.human(R);
  for (const p of R.course.pods) { if (p.taken[h0.id]) continue; const x = sxOf(p.x); if (x < -40 || x > W + 40) continue; const S = OBS.pod(), b = Math.sin(T * 4 + p.x) * 4; ctx.drawImage(S.c, x - S.w / 2, G.gy(p.x) - 70 - S.h / 2 + b, S.w, S.h); }
  for (const tr of R.course.treats) { if (tr.got[h0.id]) continue; const x = sxOf(tr.x); if (x < -20 || x > W + 20) continue; const S = OBS.treat(); ctx.drawImage(S.c, x - 7, G.gy(tr.x) - tr.y * G.ppm - 17, 14, 14); }
  // racers share the space: drawn back-to-front with only a small depth stagger so they overlap
  const order = [...R.racers].sort((a, b) => (a.kind === 'human') - (b.kind === 'human') || a.slot - b.slot);
  order.forEach((r, i) => racer(ctx, r, T, (i - 1.5) * 4));
  for (const o of R.course.obs) if (o.type === 'tunnel' || o.type === 'branch') { const x = sxOf(o.x); if (x > -200 && x < W + 200) front(ctx, o, x, G.gy(o.x), 1, 3, T); }
  for (const s of R.shots) { const t = R.racers.find(q => q.id === s.target); if (!t) continue; const x = sxOf(s.x), y = G.gy(s.x) - 12; ctx.save(); ctx.translate(x, y); ctx.rotate(s.x * 3); ctx.fillStyle = '#4fc3f7'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-9, -2, 18, 4); ctx.restore(); }
  repeatX(ctx, FORE(), camX * G.ppm * 1.25, Math.max(G.bot + 14, G.gy(camX) + 70), W);
  // incoming telegraph: the next solid obstacles show at the right edge before they arrive
  const h = Sim.human(R);
  const next = R.course.obs.filter(o => Sim.OBSTACLES[o.type].solid && o.x > h.x + 6 && o.x < h.x + 22).slice(0, 2);
  next.forEach((o, i) => { const y = G.base - 150 - i * 30; ctx.globalAlpha = 0.85; ctx.fillStyle = '#2b2350'; ctx.beginPath(); ctx.roundRect(W - 62, y - 12, 54, 24, 12); ctx.fill(); ctx.fillStyle = o.type === 'inflatable' ? '#ffd84a' : o.type === 'branch' ? '#7dffb0' : '#fff'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(o.type === 'inflatable' ? '⇈ HIGH' : o.type === 'branch' ? '↻ ROLL' : o.type === 'gate' ? '⏱ GATE' : '⇡ JUMP', W - 35, y + 4); ctx.globalAlpha = 1; });
  hud(ctx, W, H, T);
  if (legendT > 0) drawLegend(ctx, W, H, 'race', Math.min(1, legendT / 0.4));
}
function gate(ctx, x, label, T) {
  const sx = sxOf(x); if (sx < -80 || sx > G.W + 80) return;
  const gy = G.gy(x), top = gy - 150;
  for (const px of [sx - 46, sx + 46]) { ctx.fillStyle = lg(ctx, px - 5, 0, px + 5, 0, ['#fff', '#cfc6e0']); ctx.fillRect(px - 5, top, 10, gy - top + 6); }
  ctx.save(); ctx.beginPath(); ctx.rect(sx - 46, top, 92, 26); ctx.clip();
  for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = (i + j) % 2 ? '#2b2350' : '#fff'; ctx.fillRect(sx - 46 + i * 10, top + j * 9, 10, 9); }
  ctx.restore();
  ctx.fillStyle = label === 'FINISH' ? '#ffd84a' : '#ff6b8b'; ctx.beginPath(); ctx.roundRect(sx - 38, top - 26, 76, 22, 11); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = '#2b2350'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, sx, top - 11);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#ff6b8b', '#ffd84a', '#4fc3f7'][i % 3]; const fx = sx - 46 + 92 * i / 5, fy = top + 28 + Math.sin(T * 6 + i) * 2; ctx.beginPath(); ctx.moveTo(fx - 4, fy); ctx.lineTo(fx + 4, fy); ctx.lineTo(fx, fy + 9); ctx.fill(); }
}
/* the upper route: a wooden bridge deck on posts, riding the same hills */
function bridge(ctx, p) {
  const x0 = sxOf(p.x0), x1 = sxOf(p.x1); if (x1 < -40 || x0 > G.W + 40) return;
  const deck = x => G.gy(x) - p.top * G.ppm;
  for (let wx = p.x0; wx <= p.x1; wx += 3.2) { const sx = sxOf(wx); ctx.fillStyle = '#7a4a2a'; ctx.fillRect(sx - 3, deck(wx), 6, G.gy(wx) - deck(wx)); }
  ctx.beginPath(); ctx.moveTo(x0, deck(p.x0) - 2); for (let wx = p.x0; wx <= p.x1; wx += 1) ctx.lineTo(sxOf(wx), deck(wx) - 2); for (let wx = p.x1; wx >= p.x0; wx -= 1) ctx.lineTo(sxOf(wx), deck(wx) + 9); ctx.closePath();
  ctx.fillStyle = lg(ctx, 0, deck(p.x0) - 4, 0, deck(p.x0) + 10, ['#e0a46a', '#a86a3a']); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#6d4228'; ctx.stroke();
  ctx.strokeStyle = 'rgba(110,66,40,.55)'; ctx.lineWidth = 1; for (let wx = p.x0; wx < p.x1; wx += 0.8) { const sx = sxOf(wx); ctx.beginPath(); ctx.moveTo(sx, deck(wx) - 1); ctx.lineTo(sx, deck(wx) + 8); ctx.stroke(); }
  ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 2.5; ctx.beginPath(); for (let wx = p.x0; wx <= p.x1; wx += 1) { const y = deck(wx) - 18; wx === p.x0 ? ctx.moveTo(sxOf(wx), y) : ctx.lineTo(sxOf(wx), y); } ctx.stroke();
  for (let wx = p.x0; wx <= p.x1; wx += 3.2) { const sx = sxOf(wx); ctx.fillStyle = '#8a5a3a'; ctx.fillRect(sx - 1.5, deck(wx) - 18, 3, 16); }
}
function obstacle(ctx, o, x, y, k, l, T) {
  const ppm = G.ppm * k, w = o.w * ppm;
  ctx.fillStyle = 'rgba(80,40,10,.22)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + 3, Math.max(10, w * 0.6), 5 * k, 0, 0, TAU); ctx.fill();
  const draw = (S, ww, hh, dx = 0) => ctx.drawImage(S.c, x + dx, y - hh, ww, hh);
  switch (o.type) {
    case 'hurdle': draw(OBS.hurdle(), 0.55 * ppm * 1.6, 0.6 * ppm * 1.35, -0.3 * ppm); break;
    case 'log': draw(OBS.log(), w * 1.1, 0.52 * ppm * 1.2); break;
    case 'inflatable': { const sq = 1 + Math.sin(T * 5 + o.x) * 0.03; ctx.save(); ctx.translate(x + w / 2, y); ctx.scale(1 / sq, sq); ctx.drawImage(OBS.inflatable().c, -w * 0.6, -1.3 * ppm, w * 1.2, 1.3 * ppm); ctx.restore(); break; }
    case 'ramp': draw(OBS.ramp(), w, 0.45 * ppm); break;
    case 'spring': { const c = Math.abs(Math.sin(T * 6)) * 3; draw(OBS.spring(), w * 1.2, 0.36 * ppm - c); break; }
    case 'puddle': ctx.drawImage(OBS.puddle().c, x, y - 8 * k, w, 18 * k); break;
    case 'ball': { const r = 0.36 * ppm; ctx.save(); ctx.translate(x + w / 2, y - r); ctx.rotate(-T * 3); const cs = ['#ff6b8b', '#ffd84a', '#4fc3f7', '#2fc2a3']; for (let i = 0; i < 4; i++) { ctx.fillStyle = cs[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, i * Math.PI / 2, (i + 1) * Math.PI / 2); ctx.fill(); } ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, TAU); ctx.fill(); ctx.restore(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(x + w / 2 - r * 0.35, y - r * 1.35, r * 0.25, 0, TAU); ctx.fill(); break; }
    case 'gate': { const st = Sim.obstacleState(o, R.t, R.racers), hgt = 1.4 * ppm; ctx.fillStyle = '#7a4a2a'; ctx.fillRect(x - 4, y - hgt - 10, 8, hgt + 10); ctx.save(); ctx.translate(x, y - hgt); ctx.scale(st.open ? 0.15 : 1, 1); ctx.fillStyle = lg(ctx, 0, 0, w * 1.4, 0, ['#ffcf8a', '#c98a5a']); ctx.fillRect(0, 0, w * 1.4, hgt); ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 2; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, hgt * i / 4); ctx.lineTo(w * 1.4, hgt * i / 4); ctx.stroke(); } ctx.restore(); if (l === 3) { ctx.fillStyle = st.open ? '#7dffb0' : '#ff6b8b'; ctx.beginPath(); ctx.arc(x, y - hgt - 16, 6, 0, TAU); ctx.fill(); } break; }
    case 'tunnel': { ctx.fillStyle = lg(ctx, 0, y - 1.3 * ppm, 0, y, ['#5a48c8', '#3b2d8a']); ctx.beginPath(); ctx.ellipse(x + w / 2, y, w / 2, 1.25 * ppm, 0, Math.PI, TAU); ctx.fill(); break; }
    case 'branch': { ctx.fillStyle = '#6d4a2e'; ctx.fillRect(x - 8, y - 2.6 * ppm, 14, 2.6 * ppm); break; }
  }
}
function front(ctx, o, x, y, k, l, T) {   // the near half of hollow obstacles goes over the racer
  const ppm = G.ppm * k, w = o.w * ppm;
  if (o.type === 'tunnel') { ctx.strokeStyle = '#8f7fe8'; ctx.lineWidth = 9 * k; ctx.beginPath(); ctx.ellipse(x + w / 2, y, w / 2, 1.25 * ppm, 0, Math.PI, TAU); ctx.stroke(); }
  if (o.type === 'branch') { const by = y - 1.05 * ppm; ctx.strokeStyle = '#7a5236'; ctx.lineWidth = 7 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, by - 0.9 * ppm); ctx.quadraticCurveTo(x + w * 0.4, by, x + w, by + 4); ctx.stroke(); ctx.lineCap = 'butt'; for (let i = 0; i < 5; i++) blob(ctx, x + w * (0.2 + i * 0.2), by - 4 + Math.sin(T * 2 + i) * 1.5, 9 * k, i % 2 ? '#5fbf5a' : '#7ccf5e'); }
}
function racer(ctx, r, T, stagger = 0) {
  const k = 1, x = sxOf(r.x), gy = G.gy(r.x) + stagger, y = gy - r.y * G.ppm;
  if (x < -80 || x > G.W + 80) return;
  ctx.fillStyle = 'rgba(60,30,10,.28)'; ctx.beginPath(); ctx.ellipse(x, gy + 2, 24 * k * Math.max(0.4, 1 - r.y * 0.3), 6 * k, 0, 0, TAU); ctx.fill();
  if (r.boost > 0 && r.kind === 'human' && r.boosts) { ctx.fillStyle = 'rgba(255,216,74,.35)'; ctx.beginPath(); ctx.ellipse(x - 24, y - 26, 46, 26, 0, 0, TAU); ctx.fill(); }
  if (r.boost > 0 || r.wind > 0) for (let i = 0; i < 5; i++) { ctx.strokeStyle = r.wind > 0 ? `rgba(160,240,200,${0.7 - i * 0.12})` : `rgba(255,255,255,${0.7 - i * 0.12})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 30 * k - i * 9, y - 20 * k - i * 7); ctx.lineTo(x - 60 * k - i * 9, y - 20 * k - i * 7); ctx.stroke(); }
  const phase = r.finished ? 'happy' : r.tumble > 0 ? 'land' : r.roll > 0 ? 'loaf' : r.air ? (r.high ? 'binky' : 'hop') : 'approach';
  const u = r.air ? Math.min(0.95, Math.max(0.05, 0.5 - r.vy / 14)) : (T * 2) % 1;
  ctx.save(); ctx.translate(x, y); if (r.roll > 0) { ctx.translate(0, -18); ctx.rotate((1 - r.roll / Sim.RACE.rollT) * TAU); ctx.translate(0, 18); } if (r.spin > 0) { ctx.translate(0, -30 * k); ctx.rotate((1 - r.spin) * TAU); ctx.translate(0, 30 * k); }
  const s = 0.42 * k; ctx.scale(s, s);
  drawPudding(ctx, { view: 'side', phase, u, t: T * (r.v > 1 ? 1.4 : 1) + r.slot, pal: r.pal, bow: r.kind === 'human' });
  ctx.restore();
  if (r.kind !== 'human') { ctx.fillStyle = 'rgba(43,35,80,.7)'; ctx.font = `900 ${Math.round(9 * k + 1)}px system-ui`; ctx.textAlign = 'center'; const tw = ctx.measureText(r.name).width + 10; ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 92 * k, tw, 14 * k + 2, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(r.name, x, y - 81 * k); }
  else { ctx.fillStyle = '#ff6b8b'; ctx.beginPath(); ctx.moveTo(x - 7, y - 94 * k); ctx.lineTo(x + 7, y - 94 * k); ctx.lineTo(x, y - 84 * k); ctx.fill(); }
  if (r.shield) { ctx.strokeStyle = 'rgba(79,195,247,.85)'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(180,235,255,.22)'; ctx.beginPath(); ctx.arc(x, y - 30 * k, 40 * k, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x - 14 * k, y - 46 * k, 6 * k, 0, TAU); ctx.fill(); }
  if (r.stars > 0) for (let i = 0; i < 4; i++) { const a = T * 6 + i * TAU / 4; star(ctx, x + Math.cos(a) * 22 * k, y - 76 * k + Math.sin(a) * 6 * k, 5 * k, ['#ffd84a', '#fff', '#ff9fc4', '#7dffb0'][i]); }
  if (r.poof > 0) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, d = (1 - r.poof) * 30 * k + 10; ctx.fillStyle = `rgba(255,255,255,${Math.min(1, r.poof * 1.5)})`; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y - 30 * k + Math.sin(a) * d * 0.6, 9 * k, 0, TAU); ctx.fill(); }
  if (r.magnet > 0) { ctx.strokeStyle = 'rgba(255,107,139,.5)'; ctx.lineWidth = 2; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x, y - 30 * k, (40 + ((T * 40 + i * 20) % 40)) * k, 0, TAU); ctx.stroke(); } }
  if (r.springNext) { ctx.font = '900 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🌀', x, gy + 16); }
}
function star(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
const SAT = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;

function hud(ctx, W, H, T) {
  const h = Sim.human(R), top = SAT() + 10;
  const bx = 70, bw = W - 140, by = top + 22;
  ctx.fillStyle = 'rgba(43,35,80,.72)'; ctx.beginPath(); ctx.roundRect(10, top, W - 20, 46, 23); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.roundRect(bx, by - 3, bw, 6, 3); ctx.fill();
  for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? '#2b2350' : '#fff'; ctx.fillRect(bx + bw - 6, by - 9 + i * 6, 6, 6); }
  for (const r of [...R.racers].sort((a, b) => (a.kind === 'human') - (b.kind === 'human'))) { const px = bx + bw * Math.min(1, r.x / R.course.length); ctx.fillStyle = r.kind === 'human' ? '#ff6b8b' : r.pal.base; ctx.beginPath(); ctx.arc(px, by, r.kind === 'human' ? 9 : 6.5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); if (r.kind === 'human') { ctx.fillStyle = '#fff'; ctx.font = '900 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText('P', px, by + 3); } }
  const pl = Sim.placeOf(R, h.id);
  ctx.fillStyle = ['#ffd84a', '#d9e2f2', '#ffb36b', '#c9c0d8'][pl - 1]; ctx.beginPath(); ctx.arc(36, by, 20, 0, TAU); ctx.fill(); ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#2b2350'; ctx.font = '900 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText(ORD(pl), 36, by + 5);
  ctx.fillStyle = '#fff'; ctx.font = '900 13px system-ui'; ctx.fillText(`${Math.floor(R.t / 60)}:${String(Math.floor(R.t % 60)).padStart(2, '0')}`, W - 38, by + 5);
  if (h.item) { const it = Sim.ITEMS[h.item]; ctx.fillStyle = 'rgba(143,127,232,.92)'; ctx.beginPath(); ctx.roundRect(14, top + 54, 156, 26, 13); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '900 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${it.icon} ${it.name} · ITEM`, 24, top + 71); }
  const ops = Sim.activeOps(R); if (ops.length) { const lab = Sim.ALBUM_HOOKS[ops[0]]; ctx.font = '900 11px system-ui'; const tw = ctx.measureText('📸 ' + lab).width + 22; ctx.fillStyle = 'rgba(79,195,247,.92)'; ctx.beginPath(); ctx.roundRect(W - tw - 14, top + 54, tw, 26, 13); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText('📸 ' + lab, W - 25, top + 71); }
  if (R.phase === 'countdown') { const n = Math.ceil(R.countdown), k = R.countdown % 1; ctx.save(); ctx.translate(W / 2, H * 0.3); ctx.scale(1 + k * 0.4, 1 + k * 0.4); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 8; ctx.font = '900 64px system-ui'; ctx.textAlign = 'center'; ctx.strokeText(String(n), 0, 0); ctx.fillText(String(n), 0, 0); ctx.restore(); }
  else if (R.t < 0.8) { ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 8; ctx.font = '900 56px system-ui'; ctx.textAlign = 'center'; ctx.strokeText('GO!', W / 2, H * 0.3); ctx.fillText('GO!', W / 2, H * 0.3); }
  toasts(ctx, W, G.top - 30);
}
function toasts(ctx, W, y0) { const now = performance.now(); cues = cues.filter(c => now - c.t0 < 1800); cues.forEach((c, i) => { ctx.globalAlpha = Math.min(1, (1800 - (now - c.t0)) / 300); ctx.font = '900 12px system-ui'; const tw = ctx.measureText(c.text).width + 26, y = y0 - i * 30; ctx.fillStyle = c.c; ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, y - 14, tw, 26, 13); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(c.text, W / 2, y + 3); ctx.globalAlpha = 1; }); }

/* ------------------------------------------------------------ podium -- */
function podium(ctx, W, H, T) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7f6fe0'); g.addColorStop(0.55, '#c9b8ff'); g.addColorStop(1, '#ffe8c8'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) { ctx.save(); ctx.translate(W / 2, H * 0.62); ctx.rotate(-Math.PI / 2 + (i - 4) * 0.22 + Math.sin(T * 0.6) * 0.05); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(H, -40); ctx.lineTo(H, 40); ctx.fill(); ctx.restore(); }
  repeatX(ctx, STANDS(Math.floor(T * 5) % 3), 0, H * 0.2, W);
  const order = R.finishOrder.map(id => R.racers.find(r => r.id === id));
  const base = H * 0.64, steps = [{ i: 1, x: W * 0.2, h: 70, c: '#d9e2f2' }, { i: 0, x: W * 0.46, h: 104, c: '#ffd84a' }, { i: 2, x: W * 0.72, h: 50, c: '#ffb36b' }];
  for (const s of steps) {
    const w = W * 0.24; ctx.fillStyle = lg(ctx, 0, base - s.h, 0, base, [shadeC(s.c, 0.3), s.c]); ctx.beginPath(); ctx.roundRect(s.x - w / 2, base - s.h, w, s.h + 40, 8); ctx.fill(); ctx.strokeStyle = 'rgba(43,35,80,.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#2b2350'; ctx.font = '900 26px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(s.i + 1), s.x, base - s.h + 34);
    const r = order[s.i]; if (!r) continue;
    ctx.save(); ctx.translate(s.x, base - s.h); ctx.scale(0.62, 0.62); drawPudding(ctx, { view: 'front', phase: s.i === 0 ? 'happy' : 'idle', t: T + s.i, pal: r.pal, bow: r.kind === 'human' }); ctx.restore();
    ctx.fillStyle = r.kind === 'human' ? '#ff6b8b' : 'rgba(43,35,80,.75)'; ctx.font = '900 12px system-ui'; const tw = ctx.measureText(r.name).width + 16; ctx.beginPath(); ctx.roundRect(s.x - tw / 2, base - s.h - 132, tw, 20, 10); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(r.name, s.x, base - s.h - 118);
    if (s.i === 0) { const tx = s.x + 46, ty = base - s.h - 70; ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(tx - 14, ty - 20); ctx.lineTo(tx + 14, ty - 20); ctx.quadraticCurveTo(tx + 14, ty, tx, ty + 4); ctx.quadraticCurveTo(tx - 14, ty, tx - 14, ty - 20); ctx.fill(); ctx.strokeStyle = '#c47d10'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillRect(tx - 3, ty + 4, 6, 10); ctx.fillRect(tx - 10, ty + 14, 20, 5); }
  }
  const fourth = order[3]; if (fourth) { ctx.save(); ctx.translate(W * 0.92, base + 20); ctx.scale(0.3, 0.3); drawPudding(ctx, { view: 'front', phase: 'idle', t: T, pal: fourth.pal, bow: fourth.kind === 'human' }); ctx.restore(); }
  for (let i = 0; i < 40; i++) { const x = (i * 97 + T * 30 * (1 + i % 3)) % W, y = (i * 53 + T * 60 * (1 + (i % 4) * 0.3)) % (H * 0.7); ctx.save(); ctx.translate(x, y); ctx.rotate(T * 3 + i); ctx.fillStyle = ['#ff6b8b', '#ffd84a', '#4fc3f7', '#7dffb0', '#fff'][i % 5]; ctx.fillRect(-4, -2, 8, 4); ctx.restore(); }
  const h = Sim.human(R), top = SAT() + 14;
  ctx.fillStyle = 'rgba(43,35,80,.8)'; ctx.beginPath(); ctx.roundRect(16, top, W - 32, 62, 20); ctx.fill();
  ctx.fillStyle = '#ffd84a'; ctx.font = '900 19px system-ui'; ctx.textAlign = 'center'; ctx.fillText(h.place <= 3 ? `Podium! ${h.name} ${ORD(h.place)}` : `${h.name} finished ${ORD(h.place)}: great run!`, W / 2, top + 26);
  ctx.fillStyle = '#fff'; ctx.font = '800 12px system-ui'; ctx.fillText('📸 SNAP the podium · tap JUMP to collect rewards', W / 2, top + 48);
  toasts(ctx, W, top + 96);
}
