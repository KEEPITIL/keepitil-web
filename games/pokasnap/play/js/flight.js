/* Poka Flight — one-touch flying slice (C1.4). Flappy-style timing grammar with
   original PokaSnap art: Pudding in a balloon harness threading flower-hedge
   gates over a floating garden. No pipes, bird, fonts or sounds copied.

   Paw (all five live): centre = FLAP (one fixed lift per press; holding adds
   nothing), outer-left = ITEM (shield / petal magnet / gentle lift, from item
   bubbles), inner-left = VIEW (standard ↔ slightly wider follow), inner-right =
   SNAP, outer-right = SAVE: spend an EARNED one-use recovery after a bump; when
   none is earned, the same toe is RETRY after a fall (never pay-to-win, never
   unlimited). */
import { drawPudding } from './pudding.js';
import { WEEKLY_MODES, flightStep } from './weekly.js';
import { rng } from './core.js';
import { TAU, lg, blob, pill, bigText, toaster, legendDue, drawLegend, SAT, layer, repeatX, star } from './gamekit.js';

export const FLIGHT = { gates: 40, spacing: 7.5, top: 9.6, r: 0.36, gap0: 3.0, gapMin: 2.05, saveWindow: 1.6, recoverEvery: 12, items: ['shield', 'magnet', 'lift'] };
export const FLIGHT_PHOTO_OPS = ['gap-center', 'near-miss', 'rare', 'scenic', 'streak', 'finish'];
export const FLIGHT_HOOKS = { 'gap-center': 'Dead Centre', 'near-miss': 'Near Miss', rare: 'Golden Butterfly', scenic: 'Sky Vista', streak: 'Gate Streak', finish: 'Touchdown Cheer' };

export function buildSky(seed = 7) {
  const r = rng(seed), gates = [], petals = [], bubbles = [], rares = [];
  for (let i = 0; i < FLIGHT.gates; i++) {
    const k = i / FLIGHT.gates, gap = FLIGHT.gap0 - (FLIGHT.gap0 - FLIGHT.gapMin) * k;
    const cy = 2.4 + r() * (FLIGHT.top - 4.8), x = 14 + i * FLIGHT.spacing, moving = i >= 18 && i % 3 === 0;
    gates.push({ i, x, cy, gap, moving, amp: moving ? 0.8 + r() * 0.5 : 0, ph: r() * TAU, w: 1.2 });
    petals.push({ x: x + FLIGHT.spacing / 2, y: cy + (r() - 0.5) * 1.2, got: false });
    if (i % 7 === 3) bubbles.push({ x: x + FLIGHT.spacing / 2 + 1, y: cy, item: FLIGHT.items[Math.floor(r() * 3)], got: false });
    if (i % 13 === 9) rares.push({ x: x + FLIGHT.spacing / 2 - 1, y: cy + 0.6, got: false });
  }
  return { gates, petals, bubbles, rares, finishX: 14 + FLIGHT.gates * FLIGHT.spacing };
}
export function gateY(g, t) { return g.cy + (g.moving ? Math.sin(t * 1.4 + g.ph) * g.amp : 0); }
export function createFlight({ seed = 7 } = {}) {
  return { t: 0, seed, sky: buildSky(seed), p: { x: 0, y: 5, vy: 0 }, phase: 'ready', passed: 0, streak: 0, score: 0, petals: 0, item: null, shield: false, magnet: 0, lift: 0,
           recover: 0, recoverUsed: 0, invuln: 0, saveT: 0, view: 'standard', ops: {}, opsLog: [], events: [], ended: false, result: null, flaps: 0 };
}
const ev = (F, type, data = {}) => F.events.push({ t: +F.t.toFixed(2), type, ...data });
const open = (F, k, d = 1.2) => { const was = F.ops[k] > F.t; F.ops[k] = F.t + d; if (!was) F.opsLog.push({ op: k, t: +F.t.toFixed(2) }); };
export const activeFlightOps = F => Object.entries(F.ops).filter(([, u]) => u > F.t).map(([k]) => k);

/* one press = one action; there is no "held" state anywhere in this sim */
export function act(F, a) {
  if (F.ended) return false;
  if (a === 'flap') { if (F.phase === 'ready') F.phase = 'fly'; if (F.phase !== 'fly') return false; F.pending = (F.pending || 0) + 1; F.flaps++; return true; }
  if (a === 'item') { if (!F.item || F.phase !== 'fly') return false; const it = F.item; F.item = null; if (it === 'shield') F.shield = true; else if (it === 'magnet') F.magnet = 5; else if (it === 'lift') F.lift = 1.1; ev(F, 'item', { item: it }); return true; }
  if (a === 'view') { F.view = F.view === 'standard' ? 'wide' : 'standard'; return true; }
  if (a === 'recover') {
    if (F.phase === 'falling' && F.recover > 0) { F.recover--; F.recoverUsed++; F.phase = 'fly'; F.invuln = 1.4; const g = F.sky.gates.find(q => q.x + q.w > F.p.x - 1); F.p.y = g ? gateY(g, F.t) : 5; F.p.vy = 2; ev(F, 'recover'); return true; }
    if (F.phase === 'over') { F.retry = true; return true; }
    return false;
  }
  return false;
}
export function stepFlight(F, dt) {
  if (F.ended || F.phase === 'ready') return;
  F.t += dt;
  if (F.phase === 'falling') { F.saveT -= dt; F.p.vy = Math.max(-11, F.p.vy - 22 * dt); F.p.y = Math.max(0, F.p.y + F.p.vy * dt); if (F.saveT <= 0) { F.phase = 'over'; endRun(F, false); } return; }
  if (F.phase !== 'fly') return;
  const events = []; while (F.pending > 0) { events.push('tapdown'); F.pending--; }
  let s = flightStep(F.p, dt, events);
  if (F.lift > 0) { F.lift -= dt; s.vy = Math.max(s.vy, 1.2); }
  F.p = s; F.magnet = Math.max(0, F.magnet - dt); F.invuln = Math.max(0, F.invuln - dt);
  if (F.p.y > FLIGHT.top) { F.p.y = FLIGHT.top; F.p.vy = Math.min(0, F.p.vy); }
  // gates: pass through the gap, or bump
  for (const g of F.sky.gates) {
    if (g.done) continue;
    const gy = gateY(g, F.t), inX = F.p.x + FLIGHT.r > g.x && F.p.x - FLIGHT.r < g.x + g.w;
    if (inX && F.invuln <= 0 && Math.abs(F.p.y - gy) > g.gap / 2 - FLIGHT.r) { bump(F, g); break; }
    if (F.p.x - FLIGHT.r > g.x + g.w) { g.done = true; F.passed++; F.streak++; F.score += 10 + Math.min(F.streak, 20);
      const off = Math.abs(F.p.y - gy), edge = g.gap / 2 - FLIGHT.r - off;
      if (off < 0.25) open(F, 'gap-center'); else if (edge < 0.2) open(F, 'near-miss');
      if (F.streak % 10 === 0) open(F, 'streak', 1.6);
      if (F.passed % 15 === 0) open(F, 'scenic', 3);
      if (F.passed % FLIGHT.recoverEvery === 0 && F.recover < 1) { F.recover = 1; ev(F, 'earn-recover'); }
      ev(F, 'gate', { i: g.i }); }
  }
  if (F.p.y <= 0 && F.phase === 'fly' && F.invuln <= 0) bump(F, null);
  if (F.p.y <= 0) F.p.y = 0;
  for (const pe of F.sky.petals) if (!pe.got && Math.abs(pe.x - F.p.x) < (F.magnet > 0 ? 3 : 0.6) && Math.abs(pe.y - F.p.y) < (F.magnet > 0 ? 3 : 0.7)) { pe.got = true; F.petals++; F.score += 2; }
  for (const b of F.sky.bubbles) if (!b.got && Math.abs(b.x - F.p.x) < 0.7 && Math.abs(b.y - F.p.y) < 0.8) { b.got = true; if (!F.item) { F.item = b.item; ev(F, 'pickup', { item: b.item }); } }
  for (const r of F.sky.rares) if (!r.got && Math.abs(r.x - F.p.x) < 0.7 && Math.abs(r.y - F.p.y) < 0.8) { r.got = true; F.score += 25; open(F, 'rare', 1.6); }
  if (F.p.x >= F.sky.finishX) { open(F, 'finish', 99); endRun(F, true); }
}
function bump(F, g) {
  if (F.shield) { F.shield = false; F.invuln = 1; F.p.vy = 3; ev(F, 'shield-pop'); return; }
  F.phase = 'falling'; F.saveT = F.recover > 0 ? FLIGHT.saveWindow : 0.9; F.streak = 0; F.p.vy = 2.5; ev(F, 'bump', { gate: g ? g.i : 'ground' });
}
function endRun(F, done) { F.ended = true; F.phase = done ? 'done' : 'over'; F.result = { completed: done, gates: F.passed, score: F.score, petals: F.petals, coins: 30 + F.passed * 3 + (done ? 40 : 0), roll: done ? 10 : F.passed >= 20 ? 5 : 0 }; }
/* headless autopilot run: flap when sinking below the next gap centre */
export function simulateFlight(seed = 7, skill = 1) {
  const F = createFlight({ seed }); act(F, 'flap'); const r = rng(seed + 5);
  for (let i = 0; i < 60 * 240 && !F.ended; i++) {
    const g = F.sky.gates.find(q => !q.done && q.x + q.w > F.p.x - 0.5), target = g ? gateY(g, F.t + (g.x - F.p.x) / 4.2) - 0.35 : 5;
    if (F.phase === 'fly' && F.p.y < target && F.p.vy < 1.5 && r() < skill) act(F, 'flap');
    if (F.phase === 'falling') act(F, 'recover');
    if (F.item && F.phase === 'fly' && (F.item !== 'lift' || F.p.y < target - 1)) act(F, 'item');
    stepFlight(F, 1 / 60);
  }
  return F;
}

/* ================================================================ runtime == */
let F = null, env = null, photos = [], legendT = 0, zoom = 1, opts0 = {};
const toasts = toaster();
export function start(e, opts = {}) { env = e; opts0 = opts; photos = []; toasts.clear(); F = createFlight({ seed: opts.seed ?? 7 }); legendT = legendDue('flight') ? 3.2 : 0; zoom = 1; F.autopilot = !!opts.autopilot; syncPads(); return F; }
export const sim = () => F;
export function state() { return F && { phase: F.phase, t: +F.t.toFixed(2), passed: F.passed, score: F.score, item: F.item, recover: F.recover, view: F.view, ops: activeFlightOps(F), photos: photos.map(p => p.ops), ended: F.ended, flaps: F.flaps }; }
export function quit() { if (F) finish(true); }
export function input(role) {
  if (!F) return;
  if (F.ended && role !== 'upRight' && role !== 'right') return finish();
  if (role === 'center') { if (act(F, 'flap')) env.haptic(); }
  else if (role === 'left') { if (!act(F, 'item')) toasts.push(F.item ? 'Use items while flying' : 'ITEM empty: fly through a bubble', '#8f7fe8'); else env.haptic(); }
  else if (role === 'upLeft') { act(F, 'view'); toasts.push(F.view === 'wide' ? '🔭 Wider view' : '🔭 Standard view', '#8f7fe8'); }
  else if (role === 'upRight') shoot();
  else if (role === 'right') {
    if (F.phase === 'over' || F.ended) { start(env, opts0); toasts.push('↻ Retry', '#2fc2a3'); return; }
    if (!act(F, 'recover')) toasts.push(F.recover ? 'SAVE works right after a bump' : `SAVE earned every ${FLIGHT.recoverEvery} gates`, '#8f7fe8'); else { env.haptic(); toasts.push('✚ Saved! Back in the air', '#2fc2a3'); }
  }
  syncPads();
}
function syncPads() {
  if (!F || !env.pad) return;
  env.pad('left', F.item ? { icon: { shield: '🫧', magnet: '🧲', lift: '🎈' }[F.item], label: 'ITEM', state: 'lit' } : { icon: '🎁', label: 'EMPTY', state: 'empty' });
  env.pad('upLeft', { label: F.view === 'wide' ? 'WIDE' : 'VIEW' });
  const over = F.phase === 'over' || F.ended;
  env.pad('right', over ? { icon: '↻', label: 'RETRY', state: 'lit' } : F.recover ? { icon: '✚', label: 'SAVE', state: F.phase === 'falling' ? 'lit' : null } : { icon: '✚', label: 'SAVE', state: 'empty' });
}
function shoot() { const ops = activeFlightOps(F); const ph = env.snap({ meta: { ops, gates: F.passed, t: +F.t.toFixed(2) }, at: { x: innerWidth * 0.32, y: innerHeight * 0.4 } }); if (ph) { photos.push({ ops, t: F.t }); if (ops.length) toasts.push('📸 ' + ops.map(o => FLIGHT_HOOKS[o]).join(' · '), '#4fc3f7'); } }
function finish(quit) { const r = F.result || { coins: 20, roll: 0, gates: F.passed }; env.onExit(quit && !F.ended ? { quit: true } : { coins: r.coins, roll: r.roll, summary: `${r.gates} gates${r.completed ? ' · course complete!' : ''}` }); F = null; }
let lastEv = 0;
export function step(dt) {
  if (!F) return;
  if (F.autopilot) { const g = F.sky.gates.find(q => !q.done && q.x + q.w > F.p.x - 0.5), tgt = g ? gateY(g, F.t + (g.x - F.p.x) / 4.2) - 0.35 : 5; if (F.phase === 'ready' || (F.phase === 'fly' && F.p.y < tgt && F.p.vy < 1.5)) input('center'); if (F.phase === 'falling' && F.recover) input('right'); }
  stepFlight(F, dt); legendT = Math.max(0, legendT - dt); zoom += ((F.view === 'wide' ? 0.82 : 1) - zoom) * Math.min(1, dt * 4);
  for (const e of F.events.slice(lastEv)) { if (e.type === 'pickup') toasts.push(`🎁 ${e.item} ready: tap ITEM`, '#8f7fe8'); if (e.type === 'earn-recover') toasts.push('✚ SAVE earned', '#2fc2a3'); if (e.type === 'bump') toasts.push(F.recover ? 'Bump! Tap SAVE ✚' : 'Bump!', '#ff8a6b'); if (e.type === 'shield-pop') toasts.push('🫧 Shield popped', '#4fc3f7'); }
  lastEv = F.events.length; syncPads();
}

/* ------------------------------------------------------------------ draw -- */
const ISLES = () => layer('fl_isles', 640, 200, (x, w, h) => { for (const [px, py, r] of [[90, 120, 50], [300, 80, 36], [500, 130, 58]]) { x.fillStyle = lg(x, 0, py, 0, py + r, ['#a98a6a', '#6d4a2e']); x.beginPath(); x.moveTo(px - r, py); x.quadraticCurveTo(px, py + r * 1.5, px + r, py); x.fill(); x.fillStyle = lg(x, 0, py - 10, 0, py + 8, ['#b4ea8a', '#5fb85a']); x.beginPath(); x.ellipse(px, py, r, r * 0.3, 0, 0, TAU); x.fill(); for (let k = 0; k < 4; k++) blob(x, px - r * 0.5 + k * r * 0.33, py - 10, r * 0.18, ['#5fbf5a', '#7ccf5e', '#4fae6a'][k % 3]); } });
const CLOUDS = () => layer('fl_clouds', 520, 140, (x, w, h) => { for (let i = 0; i < 5; i++) { const cx = 50 + i * 100, cy = 40 + (i % 2) * 50; x.fillStyle = 'rgba(255,255,255,.9)'; for (const [ox, oy, r] of [[0, 0, 22], [22, -8, 28], [48, 0, 21], [24, 8, 22]]) { x.beginPath(); x.ellipse(cx + ox, cy + oy, r, r * 0.7, 0, 0, TAU); x.fill(); } } });
export function render(ctx, W, H, dpr, T) {
  if (!F) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ppm = Math.min(W / 9.5, H / 15) * zoom, groundY = H * 0.74, camX = F.p.x - (W * 0.32) / ppm;
  const sx = x => (x - camX) * ppm, sy = y => groundY - y * ppm;
  const dusk = Math.min(1, F.passed / FLIGHT.gates);
  ctx.fillStyle = lg(ctx, 0, 0, 0, groundY, [dusk > 0.5 ? '#6a6ad6' : '#5fb6ee', dusk > 0.5 ? '#ff9fc4' : '#a8dcf6', '#fff1d8']); ctx.fillRect(0, 0, W, groundY);
  const sun = ctx.createRadialGradient(W * 0.78, groundY * (0.25 + dusk * 0.5), 4, W * 0.78, groundY * (0.25 + dusk * 0.5), 90); sun.addColorStop(0, 'rgba(255,240,190,.95)'); sun.addColorStop(1, 'rgba(255,240,190,0)'); ctx.fillStyle = sun; ctx.fillRect(0, 0, W, groundY);
  repeatX(ctx, CLOUDS(), camX * ppm * 0.12, groundY * 0.08, W);
  repeatX(ctx, ISLES(), camX * ppm * 0.3, groundY * 0.45, W, 0.9);
  // the garden floor
  ctx.fillStyle = lg(ctx, 0, groundY, 0, H, ['#7ccf5e', '#3f9a4a']); ctx.fillRect(0, groundY, W, H - groundY);
  for (let i = 0; i < 30; i++) { const x = ((i * 53 - camX * ppm) % (W + 60) + W + 60) % (W + 60) - 30; ctx.fillStyle = ['#ff6b8b', '#ffd84a', '#fff', '#c49bf0'][i % 4]; ctx.beginPath(); ctx.arc(x, groundY + 10 + (i % 3) * 8, 3, 0, TAU); ctx.fill(); }
  // gates: flower-hedge columns with a ribboned gap
  for (const g of F.sky.gates) { const x0 = sx(g.x); if (x0 < -80 || x0 > W + 40) continue; const gy = gateY(g, F.t), w = g.w * ppm, top = sy(gy + g.gap / 2), bot = sy(gy - g.gap / 2);
    for (const [y0, y1] of [[-10, top], [bot, groundY + 6]]) { ctx.fillStyle = lg(ctx, x0, 0, x0 + w, 0, ['#7ccf5e', '#4fae6a', '#2f8a4a']); ctx.beginPath(); ctx.roundRect(x0, y0, w, y1 - y0, 10); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      for (let k = y0 + 14; k < y1 - 6; k += 22) { ctx.fillStyle = ['#ff6b8b', '#ffd84a', '#fff', '#c49bf0'][Math.floor(k / 22) % 4]; ctx.beginPath(); ctx.arc(x0 + w * (0.3 + ((k / 22) % 2) * 0.4), k, 4.5, 0, TAU); ctx.fill(); } }
    ctx.strokeStyle = g.moving ? '#ffd84a' : '#ff9fc4'; ctx.lineWidth = 4; for (const y of [top, bot]) { ctx.beginPath(); ctx.moveTo(x0 - 4, y); ctx.lineTo(x0 + w + 4, y); ctx.stroke(); } }
  for (const pe of F.sky.petals) { if (pe.got) continue; const x = sx(pe.x); if (x < -20 || x > W + 20) continue; ctx.fillStyle = '#ff9fc4'; ctx.beginPath(); ctx.ellipse(x, sy(pe.y), 6, 4, Math.sin(T * 3 + pe.x), 0, TAU); ctx.fill(); }
  for (const b of F.sky.bubbles) { if (b.got) continue; const x = sx(b.x); if (x < -30 || x > W + 30) continue; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5; ctx.fillStyle = 'rgba(180,235,255,.35)'; ctx.beginPath(); ctx.arc(x, sy(b.y), 15, 0, TAU); ctx.fill(); ctx.stroke(); ctx.font = '16px system-ui'; ctx.textAlign = 'center'; ctx.fillText({ shield: '🫧', magnet: '🧲', lift: '🎈' }[b.item], x, sy(b.y) + 6); }
  for (const r of F.sky.rares) { if (r.got) continue; const x = sx(r.x); if (x < -30 || x > W + 30) continue; const fl = Math.sin(T * 12) * 4; ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.ellipse(x - 6, sy(r.y), 7, 5 + fl * 0.3, -0.4, 0, TAU); ctx.ellipse(x + 6, sy(r.y), 7, 5 + fl * 0.3, 0.4, 0, TAU); ctx.fill(); }
  const fx = sx(F.sky.finishX); if (fx < W + 40) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(fx, 0, 8, groundY); pill(ctx, fx + 4, groundY * 0.2, 'FINISH', '#ff6b8b'); }
  // Pudding in a balloon harness, tilting with her climb
  const px = sx(F.p.x), py = sy(F.p.y), tilt = Math.max(-0.5, Math.min(0.5, -F.p.vy * 0.06)) + (F.phase === 'falling' ? Math.sin(T * 20) * 0.3 : 0);
  ctx.strokeStyle = 'rgba(90,70,60,.8)'; ctx.lineWidth = 1.2; for (const dx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(px, py - 52); ctx.lineTo(px + dx * 1.6, py - 92); ctx.stroke(); }
  [['#ff6b8b', -14], ['#ffd84a', 0], ['#4fc3f7', 14]].forEach(([c, dx], i) => blob(ctx, px + dx, py - 104 - (i % 2) * 8 + Math.sin(T * 3 + i) * 2, 15, c));
  if (F.shield) { ctx.strokeStyle = 'rgba(79,195,247,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py - 40, 44, 0, TAU); ctx.stroke(); }
  if (F.invuln > 0 && Math.floor(T * 12) % 2) ctx.globalAlpha = 0.5;
  ctx.save(); ctx.translate(px, py); ctx.rotate(tilt); ctx.scale(0.42, 0.42); drawPudding(ctx, { view: 'side', phase: F.phase === 'falling' ? 'land' : F.p.vy > 1 ? 'binky' : 'hop', u: 0.5, t: T, pal: env.pal }); ctx.restore(); ctx.globalAlpha = 1;
  // HUD
  const top = SAT() + 10;
  ctx.fillStyle = 'rgba(43,35,80,.8)'; ctx.beginPath(); ctx.roundRect(10, top, W - 20, 44, 22); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`🎈 ${F.passed}/${FLIGHT.gates} gates`, 24, top + 28); ctx.textAlign = 'right'; ctx.fillText(`${F.score} pts${F.recover ? ' · ✚' : ''}`, W - 66, top + 28);
  const ops = activeFlightOps(F); if (ops.length && !F.ended) pill(ctx, W / 2, top + 66, '📸 ' + FLIGHT_HOOKS[ops[0]], 'rgba(79,195,247,.92)');
  toasts.draw(ctx, W, top + 100);
  if (F.phase === 'ready') bigText(ctx, 'Tap FLAP to fly!', W / 2, H * 0.3, 26, '#ffd84a');
  if (F.phase === 'falling') bigText(ctx, F.recover ? 'TAP SAVE ✚' : 'Whoops!', W / 2, H * 0.3, 30, '#ffd84a');
  if (legendT > 0) drawLegend(ctx, W, H, 'flight', Math.min(1, legendT / 0.4));
  if (F.ended) { const r = F.result, y = H * 0.18; ctx.fillStyle = 'rgba(43,35,80,.9)'; ctx.beginPath(); ctx.roundRect(20, y, W - 40, 150, 24); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); bigText(ctx, r.completed ? 'COURSE COMPLETE!' : `${r.gates} GATES`, W / 2, y + 46, 26, '#ffd84a'); ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`Score ${r.score} · Petals ${r.petals} · +${r.coins} coins`, W / 2, y + 80); ctx.fillText('↻ RETRY on the right toe · 📸 SNAP · centre to collect', W / 2, y + 118); }
}
