/* Poka Switch — behind-view three-lane runner slice (C1.4). Subway Surfers-style
   lane readability with original PokaSnap world, props and art.

   Paw (all five live, owner-locked mapping): centre = JUMP, outer-left = LEFT,
   inner-left = RIGHT, inner-right = SLIDE, outer-right = SNAP. Swipes stay a full
   alternative (left / right / up = jump / down = slide). Paw and swipe both call
   the SAME act(), so scoring can never differ by input source. */
import { drawPudding } from './pudding.js';
import { switchInput, swipeFrom } from './weekly.js';
import { rng } from './core.js';
import { TAU, lg, blob, pill, bigText, toaster, legendDue, drawLegend, SAT } from './gamekit.js';

export const SWITCH = { length: 700, v0: 9, vMax: 15.5, accel: 0.11, jumpV: 7.2, g: 22, slideT: 0.7, laneSnap: 9, coinPts: 10 };
export const SWITCH_PHOTO_OPS = ['jump-barrier', 'slide-under', 'lane-dodge', 'pickup-streak', 'finish'];
export const SWITCH_HOOKS = { 'jump-barrier': 'Fence Leap', 'slide-under': 'Slide Under', 'lane-dodge': 'Close Dodge', 'pickup-streak': 'Treat Streak', finish: 'Finish Pose' };
/* obstacles: fence = jump it, bar = slide under it, cart = change lane */
export const SW_OBS = { fence: { need: 'jump', h: 0.6 }, bar: { need: 'slide' }, cart: { need: 'lane' } };

export function buildRun(seed = 7) {
  const r = rng(seed), obs = [], coins = []; let z = 30;
  while (z < SWITCH.length - 20) {
    const k = z / SWITCH.length, gap = 16 - k * 6;
    const type = ['fence', 'bar', 'cart', 'cart', 'fence', 'bar'][Math.floor(r() * 6)], lane = Math.floor(r() * 3);
    obs.push({ z, lane, type });
    if (type === 'cart' && k > 0.4 && r() < 0.5) obs.push({ z, lane: (lane + 1 + Math.floor(r() * 2)) % 3, type: 'cart' });   // two carts: one lane left open
    const cl = (lane + 1) % 3; for (let i = 0; i < 5; i++) coins.push({ z: z + 3 + i * 1.6, lane: cl, got: false });
    z += gap + r() * 6;
  }
  return { obs, coins, length: SWITCH.length };
}
export function createSwitch({ seed = 7 } = {}) {
  return { t: 0, z: 0, v: SWITCH.v0, lane: 1, x: 1, y: 0, vy: 0, slide: 0, run: buildRun(seed), coins: 0, streak: 0, score: 0, ops: {}, opsLog: [], events: [], phase: 'ready', ended: false, result: null, inputs: { button: 0, swipe: 0 }, lastLaneChange: -9 };
}
const ev = (S, type, d = {}) => S.events.push({ t: +S.t.toFixed(2), type, ...d });
const open = (S, k, d = 1.2) => { const was = S.ops[k] > S.t; S.ops[k] = S.t + d; if (!was) S.opsLog.push({ op: k, t: +S.t.toFixed(2) }); };
export const activeSwitchOps = S => Object.entries(S.ops).filter(([, u]) => u > S.t).map(([k]) => k);
/* the ONE action door for both paw buttons and swipes */
export function act(S, a, source = 'button') {
  if (S.ended) return false;
  if (S.phase === 'ready') S.phase = 'run';
  S.inputs[source] = (S.inputs[source] || 0) + 1;
  const n = switchInput({ lane: S.lane }, { type: 'swipe', dir: { left: 'left', right: 'right', jump: 'up', slide: 'down' }[a] });
  if (n.lane !== S.lane) { S.lane = n.lane; S.lastLaneChange = S.t; return true; }
  if (n.action === 'jump' && S.y <= 0.001) { S.vy = SWITCH.jumpV; S.slide = 0; return true; }
  if (n.action === 'slide') { S.slide = SWITCH.slideT; if (S.y > 0) S.vy = -SWITCH.jumpV; return true; }
  return false;
}
export function swipeAct(S, dx, dy) { const g = swipeFrom(dx, dy); if (g.type !== 'swipe') return false; return act(S, { left: 'left', right: 'right', up: 'jump', down: 'slide' }[g.dir], 'swipe'); }
export function stepSwitch(S, dt) {
  if (S.ended || S.phase !== 'run') return;
  S.t += dt; S.v = Math.min(SWITCH.vMax, S.v + SWITCH.accel * dt); const pz = S.z; S.z += S.v * dt;
  S.x += (S.lane - S.x) * Math.min(1, dt * SWITCH.laneSnap);
  if (S.y > 0 || S.vy > 0) { S.vy -= SWITCH.g * dt; S.y = Math.max(0, S.y + S.vy * dt); if (S.y === 0) S.vy = 0; }
  S.slide = Math.max(0, S.slide - dt);
  for (const o of S.run.obs) {
    if (o.done || !(pz < o.z && S.z >= o.z)) continue; o.done = true;
    if (o.lane !== Math.round(S.x)) { if (o.type === 'cart' && S.t - S.lastLaneChange < 0.6 && Math.abs(o.lane - S.x) < 1.2) open(S, 'lane-dodge'); continue; }
    const ok = o.type === 'fence' ? S.y >= SW_OBS.fence.h : o.type === 'bar' ? S.slide > 0 : false;
    if (!ok) { S.phase = 'over'; endRun(S, false); ev(S, 'crash', { obstacleType: o.type }); return; }
    S.score += 25; open(S, o.type === 'fence' ? 'jump-barrier' : 'slide-under');
  }
  for (const c of S.run.coins) if (!c.got && pz < c.z && S.z >= c.z) { if (c.lane === Math.round(S.x) && S.y < 1.4) { c.got = true; S.coins++; S.streak++; S.score += SWITCH.coinPts; if (S.streak % 10 === 0) open(S, 'pickup-streak', 1.6); } else if (c.lane === Math.round(S.x)) {} else S.streak = 0; }
  S.score += Math.round(S.v * dt);
  if (S.z >= S.run.length) { open(S, 'finish', 99); S.phase = 'done'; endRun(S, true); }
}
function endRun(S, done) { S.ended = true; S.result = { completed: done, distance: Math.round(S.z), coins: S.coins, score: S.score, reward: 30 + Math.round(S.z / 10) + (done ? 40 : 0), roll: done ? 10 : S.z > 350 ? 5 : 0 }; }
/* headless autopilot: reads the next obstacle in its lane and answers it */
export function simulateSwitch(seed = 7, source = 'button') {
  const S = createSwitch({ seed }); act(S, 'jump', source); S.vy = 0; S.y = 0;
  for (let i = 0; i < 60 * 200 && !S.ended; i++) { autopilot(S, source); stepSwitch(S, 1 / 60); }
  return S;
}
function autopilot(S, source) {
  const lane = Math.round(S.x), next = S.run.obs.find(o => !o.done && o.z > S.z && o.z - S.z < S.v * 0.55 && o.lane === lane);
  if (!next) return; const d = next.z - S.z;
  const doAct = a => source === 'swipe' ? swipeAct(S, a === 'left' ? -60 : a === 'right' ? 60 : 0, a === 'jump' ? -60 : a === 'slide' ? 60 : 0) : act(S, a, 'button');
  if (next.type === 'cart') { const blocked = l => S.run.obs.some(o => !o.done && o.type === 'cart' && o.lane === l && Math.abs(o.z - next.z) < 1); const to = [lane - 1, lane + 1, lane - 2, lane + 2].find(l => l >= 0 && l <= 2 && !blocked(l)); if (to != null && Math.abs(S.x - lane) < 0.35) doAct(to < lane ? 'left' : 'right'); }
  else if (next.type === 'fence' && d < S.v * 0.22 && S.y === 0) doAct('jump');
  else if (next.type === 'bar' && d < S.v * 0.2 && S.slide <= 0) doAct('slide');
}

/* ================================================================ runtime == */
let S = null, env = null, photos = [], legendT = 0, opts0 = {};
const toasts = toaster();
export function start(e, opts = {}) { env = e; opts0 = opts; photos = []; toasts.clear(); S = createSwitch({ seed: opts.seed ?? 7 }); legendT = legendDue('switch') ? 3.2 : 0; S.autopilot = !!opts.autopilot; return S; }
export const sim = () => S;
export function state() { return S && { phase: S.phase, t: +S.t.toFixed(2), z: Math.round(S.z), v: +S.v.toFixed(1), lane: S.lane, score: S.score, coins: S.coins, ops: activeSwitchOps(S), photos: photos.map(p => p.ops), ended: S.ended, inputs: { ...S.inputs } }; }
export function quit() { if (S) finish(true); }
export function input(role) {
  if (!S) return;
  if (S.ended) { if (role === 'right') shoot(); else if (role === 'center') { start(env, opts0); toasts.push('↻ Go again', '#2fc2a3'); } else finish(); return; }
  const a = { center: 'jump', left: 'left', upLeft: 'right', upRight: 'slide' }[role];
  if (role === 'right') return shoot();
  if (a && act(S, a, 'button')) env.haptic();
}
export function swipe(dx, dy) { if (S && !S.ended && swipeAct(S, dx, dy)) env.haptic(); }
function shoot() { const ops = activeSwitchOps(S); const ph = env.snap({ meta: { ops, z: Math.round(S.z), t: +S.t.toFixed(2) }, at: { x: innerWidth / 2, y: innerHeight * 0.55 } }); if (ph) { photos.push({ ops, t: S.t }); if (ops.length) toasts.push('📸 ' + ops.map(o => SWITCH_HOOKS[o]).join(' · '), '#4fc3f7'); } }
function finish(quit) { const r = S.result || { reward: 20, roll: 0, distance: Math.round(S.z) }; env.onExit(quit && !S.ended ? { quit: true } : { coins: r.reward, roll: r.roll, summary: `${r.distance} m${r.completed ? ' · run complete!' : ''}` }); S = null; }
let lastEv = 0;
export function step(dt) { if (!S) return; if (S.autopilot) { if (S.phase === 'ready') act(S, 'jump'); autopilot(S, 'button'); } stepSwitch(S, dt); legendT = Math.max(0, legendT - dt); for (const e of S.events.slice(lastEv)) if (e.type === 'crash') toasts.push('Bonk! Tap JUMP to go again', '#ff8a6b'); lastEv = S.events.length; }

/* ------------------------------------------------------------------ draw -- */
export function render(ctx, W, H, dpr, T) {
  if (!S) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hor = H * 0.26, near = H * 0.62, cx = W / 2, laneW = Math.min(W * 0.3, 130), FAR = 70;
  // depth projection: z ahead of the runner → screen y/scale
  const P = (dz, lane, h = 0) => { const k = 1 / (1 + dz / 6), y = hor + (near - hor) * k, x = cx + (lane - 1 - (S.x - 1) * 0.35) * laneW * k; return { x, y: y - h * 60 * k, k }; };
  ctx.fillStyle = lg(ctx, 0, 0, 0, hor, ['#5fb6ee', '#a8dcf6', '#fff1d8']); ctx.fillRect(0, 0, W, hor + 2);
  for (let i = 0; i < 9; i++) { const x = ((i * 120 - S.z * 2) % (W + 120) + W + 120) % (W + 120) - 60; blob(ctx, x, hor - 18 - (i % 3) * 8, 26 + (i % 2) * 10, ['#7ccf5e', '#5fbf5a', '#4fae6a'][i % 3]); }
  ctx.fillStyle = '#7ccf5e'; ctx.fillRect(0, hor, W, H - hor);
  // the path: three lanes converging to the horizon
  const L = P(FAR, -0.5), R = P(FAR, 2.5), L0 = P(0, -0.5), R0 = P(0, 2.5);
  ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(R.x, R.y); ctx.lineTo(R0.x + 60, H); ctx.lineTo(L0.x - 60, H); ctx.closePath(); ctx.fillStyle = lg(ctx, 0, hor, 0, H, ['#e9d1a2', '#d9b07a']); ctx.fill();
  for (const ln of [0.5, 1.5]) { for (let s = -((S.z % 4) + 4); s < FAR; s += 4) { const a = P(Math.max(0, s), ln), b = P(Math.max(0, s + 2), ln); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3 * a.k; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
  // side scenery: lamps and trees streaming past
  for (let s = -(S.z % 9); s < FAR; s += 9) for (const side of [-1.1, 3.1]) { const p = P(Math.max(0.1, s), side); if (p.y > H + 20) continue; ctx.fillStyle = '#4a5578'; ctx.fillRect(p.x - 2 * p.k, p.y - 90 * p.k, 4 * p.k, 90 * p.k); blob(ctx, p.x + (side < 0 ? -30 : 30) * p.k, p.y - 60 * p.k, 26 * p.k, '#5fbf5a'); const g = ctx.createRadialGradient(p.x, p.y - 92 * p.k, 0, p.x, p.y - 92 * p.k, 14 * p.k); g.addColorStop(0, 'rgba(255,240,170,.9)'); g.addColorStop(1, 'rgba(255,240,170,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y - 92 * p.k, 14 * p.k, 0, TAU); ctx.fill(); }
  // obstacles and treats, far to near
  const items = [...S.run.obs.filter(o => !o.done || o.z > S.z - 1).map(o => ({ ...o, kind: 'obs' })), ...S.run.coins.filter(c => !c.got).map(c => ({ ...c, kind: 'coin' }))].filter(o => o.z - S.z > -1 && o.z - S.z < FAR).sort((a, b) => b.z - a.z);
  for (const o of items) { const p = P(Math.max(0, o.z - S.z), o.lane), w = laneW * 0.8 * p.k;
    if (o.kind === 'coin') { ctx.fillStyle = lg(ctx, 0, p.y - 40 * p.k, 0, p.y - 20 * p.k, ['#ffe08a', '#e0a040']); ctx.beginPath(); ctx.ellipse(p.x, p.y - 30 * p.k, 9 * p.k * Math.abs(Math.cos(T * 4 + o.z)) + 2, 9 * p.k, 0, 0, TAU); ctx.fill(); continue; }
    ctx.fillStyle = 'rgba(60,40,20,.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, w / 2, 6 * p.k, 0, 0, TAU); ctx.fill();
    if (o.type === 'fence') { ctx.fillStyle = '#fff6e6'; for (let i = 0; i < 5; i++) ctx.fillRect(p.x - w / 2 + i * w / 4.5, p.y - 40 * p.k, 7 * p.k, 40 * p.k); ctx.fillStyle = '#ff6b8b'; ctx.fillRect(p.x - w / 2, p.y - 32 * p.k, w, 8 * p.k); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * p.k; ctx.strokeRect(p.x - w / 2, p.y - 32 * p.k, w, 8 * p.k); }
    else if (o.type === 'bar') { ctx.fillStyle = '#7a4a2a'; ctx.fillRect(p.x - w / 2, p.y - 110 * p.k, 6 * p.k, 110 * p.k); ctx.fillRect(p.x + w / 2 - 6 * p.k, p.y - 110 * p.k, 6 * p.k, 110 * p.k); ctx.fillStyle = lg(ctx, 0, p.y - 80 * p.k, 0, p.y - 56 * p.k, ['#ffd84a', '#e8930a']); ctx.fillRect(p.x - w / 2, p.y - 80 * p.k, w, 22 * p.k); ctx.fillStyle = '#2b2350'; ctx.font = `900 ${Math.max(6, 13 * p.k)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('SLIDE', p.x, p.y - 64 * p.k); }
    else { ctx.fillStyle = lg(ctx, 0, p.y - 120 * p.k, 0, p.y, ['#9be07a', '#4fae6a']); ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y - 120 * p.k, w, 112 * p.k, 14 * p.k); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * p.k; ctx.stroke(); for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#ff6b8b', '#ffd84a', '#fff'][i % 3]; ctx.beginPath(); ctx.arc(p.x - w / 3 + i * w / 6, p.y - (90 - (i % 2) * 30) * p.k, 5 * p.k, 0, TAU); ctx.fill(); } ctx.fillStyle = '#5b4a6a'; for (const d of [-w / 3, w / 3]) { ctx.beginPath(); ctx.arc(p.x + d, p.y - 6 * p.k, 9 * p.k, 0, TAU); ctx.fill(); } } }
  // Pudding from behind, leaning into lane changes
  const me = P(0.4, S.x), lean = (S.lane - S.x) * 0.6, sc = 0.62;
  ctx.fillStyle = 'rgba(60,40,20,.3)'; ctx.beginPath(); ctx.ellipse(me.x, me.y + 2, 34 * (1 - S.y * 0.2), 9, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(me.x, me.y - S.y * 70); ctx.rotate(lean * 0.25); ctx.scale(sc, sc * (S.slide > 0 ? 0.62 : 1));
  drawPudding(ctx, { view: 'back', phase: S.phase === 'over' ? 'land' : S.y > 0 ? 'binky' : 'approach', u: 0.5, t: T * 1.6, pal: env.pal }); ctx.restore();
  if (S.v > 12 && S.phase === 'run') for (let i = 0; i < 8; i++) { ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; const a = i / 8 * TAU, r0 = 130 + ((T * 400 + i * 50) % 100); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, hor + 80 + Math.sin(a) * r0 * 0.6); ctx.lineTo(cx + Math.cos(a) * (r0 + 30), hor + 80 + Math.sin(a) * (r0 + 30) * 0.6); ctx.stroke(); }
  // HUD
  const top = SAT() + 10;
  ctx.fillStyle = 'rgba(43,35,80,.8)'; ctx.beginPath(); ctx.roundRect(10, top, W - 20, 44, 22); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.roundRect(120, top + 19, W - 230, 6, 3); ctx.fill(); ctx.fillStyle = '#7dffb0'; ctx.beginPath(); ctx.roundRect(120, top + 19, (W - 230) * Math.min(1, S.z / S.run.length), 6, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${Math.round(S.z)} m`, 24, top + 28); ctx.textAlign = 'right'; ctx.fillText(`🍪 ${S.coins} · ${S.v.toFixed(0)} m/s`, W - 66, top + 28);
  const ops = activeSwitchOps(S); if (ops.length && !S.ended) pill(ctx, W / 2, top + 66, '📸 ' + SWITCH_HOOKS[ops[0]], 'rgba(79,195,247,.92)');
  toasts.draw(ctx, W, top + 100);
  if (S.phase === 'ready') bigText(ctx, 'Tap JUMP or swipe to run!', W / 2, H * 0.24, 22, '#ffd84a');
  if (legendT > 0) drawLegend(ctx, W, H, 'switch', Math.min(1, legendT / 0.4));
  if (S.ended) { const r = S.result, y = H * 0.16; ctx.fillStyle = 'rgba(43,35,80,.9)'; ctx.beginPath(); ctx.roundRect(20, y, W - 40, 150, 24); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); bigText(ctx, r.completed ? 'RUN COMPLETE!' : `${r.distance} m`, W / 2, y + 46, 28, '#ffd84a'); ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`Score ${r.score} · Treats ${r.coins} · +${r.reward} coins`, W / 2, y + 80); ctx.fillText('⤒ JUMP = go again · 📸 SNAP · any other toe to collect', W / 2, y + 118); }
}
