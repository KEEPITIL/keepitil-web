/* Poka Race — simulation (C1.2). Pure and deterministic: no DOM, a seeded
   RNG and a fixed 1/60 s step, so a seeded race always finishes the same
   way (tools/tests/v22.mjs). race.js only draws what this produces.

   Reference: Fun Run 4's side-view four-racer energy (owner-locked), built
   original and family-friendly. Auto-run; one JUMP verb (tap again in the
   air for a high jump); one ITEM verb; SNAP stays available.

   Racer SLOTS are an abstraction: each slot has a controller ('human',
   'bot', later 'remote'). The renderer and rules never ask which kind a
   racer is, so networked players can replace bots without a rewrite. */
import { rng } from './core.js';

export const RACE = {
  length: 860,              // metres
  targetS: [90, 120],       // configured duration envelope (seconds)
  timeoutS: 140,            // safety: anything unfinished resolves by distance
  speed: 8.6,               // m/s cruise
  accel: 5.5,
  g: 19, jumpV: 6.4, highV: 7.2, springV: 10.5, rampV: 7.8,
  racerR: 0.32, racerH: 0.62, rollT: 0.55, rollH: 0.3, platTop: 1.3,
  boostGain: { clear: 0.14, pod: 0.1, treat: 0.015 }, boostT: 1.8,
  dt: 1 / 60,
};
/* Every effect a hit can cause. Cartoon only: tumble, spin, poof, stars, bounce. */
export const EFFECTS = ['tumble', 'spin', 'poof', 'stars', 'bounce', 'slow', 'boost', 'shield', 'decoy', 'wind', 'spring', 'magnet'];
export const ITEMS = {
  superTreat:   { name: 'Super Treat',   icon: '🥕', kind: 'self',   desc: 'Short speed boost' },
  superBall:    { name: 'Super Ball',    icon: '🔵', kind: 'shot',   desc: 'Rolls to the racer ahead: harmless tumble' },
  bubbleShield: { name: 'Bubble Shield', icon: '🫧', kind: 'self',   desc: 'Blocks one bump or effect' },
  squeakyDecoy: { name: 'Squeaky Decoy', icon: '🧸', kind: 'area',   desc: 'Distracts a nearby rival' },
  stickyPuddle: { name: 'Sticky Puddle', icon: '🍯', kind: 'drop',   desc: 'Leaves a short slow zone behind' },
  tailwind:     { name: 'Tailwind',      icon: '🍃', kind: 'self',   desc: 'A gust pushes you forward' },
  pawSpring:    { name: 'Paw Spring',    icon: '🌀', kind: 'self',   desc: 'Next jump goes extra high' },
  toyMagnet:    { name: 'Toy Magnet',    icon: '🧲', kind: 'self',   desc: 'Pulls in nearby treats' },
};
export const ITEM_IDS = Object.keys(ITEMS);
/* Obstacles. solid = cannot be passed through; h = height to clear (m). */
export const OBSTACLES = {
  hurdle:     { solid: true,  h: 0.55, w: 0.3,  name: 'Hurdle' },
  log:        { solid: true,  h: 0.5,  w: 0.9,  name: 'Log' },
  inflatable: { solid: true,  h: 1.25, w: 1.0,  name: 'Bouncy wall' },      // needs a high jump
  gate:       { solid: true,  h: 2.4,  w: 0.4,  name: 'Swing gate', period: 3.2, open: 1.9 },
  ball:       { solid: true,  h: 0.7,  w: 0.7,  name: 'Rolling toy ball', moving: -2.4 },
  branch:     { solid: true,  h: 0, low: 0.55, w: 1.4, name: 'Low branch' },  // ROLL under it: a standing racer is too tall
  puddle:     { solid: false, w: 3.2, slow: 0.55, name: 'Puddle' },
  ramp:       { solid: false, w: 2.0, launch: true, name: 'Ramp' },
  spring:     { solid: false, w: 0.8, spring: true, name: 'Spring pad' },
  tunnel:     { solid: false, w: 4.5, name: 'Tunnel' },
};
export const PHOTO_OPS = ['airborne-hurdle', 'overtake', 'close-pass', 'power-up', 'tumble', 'sprint-finish', 'comeback', 'near-tie', 'podium', 'celebration'];
export const ALBUM_HOOKS = { 'airborne-hurdle': 'Hurdle Hero', overtake: 'Overtake!', 'close-pass': 'Neck and Neck', 'power-up': 'Power-Up Face', tumble: 'Funny Tumble', 'sprint-finish': 'Sprint Finish', comeback: 'Comeback Celebration', 'near-tie': 'Photo Finish', podium: 'Podium Paws', celebration: 'First Place Finish' };

/* -------------------------------------------------------------- course -- */
export function buildCourse(seed = 7) {
  const r = rng(seed), obs = [], pods = [], treats = [];
  const pattern = ['hurdle', 'log', 'puddle', 'hurdle', 'ramp', 'hurdle', 'log', 'ball', 'tunnel', 'hurdle', 'spring', 'inflatable', 'log', 'branch', 'hurdle', 'gate', 'puddle', 'ramp', 'hurdle', 'log', 'ball', 'hurdle', 'inflatable', 'branch', 'hurdle', 'gate', 'log', 'hurdle', 'spring', 'puddle', 'ramp', 'hurdle', 'ball', 'hurdle', 'log', 'inflatable', 'hurdle', 'gate', 'hurdle', 'branch', 'log', 'hurdle'];
  let x = 34;
  for (let i = 0; i < pattern.length && x < RACE.length - 40; i++) {
    const type = pattern[i], o = OBSTACLES[type];
    obs.push({ id: 'o' + i, type, x, w: o.w, phase: r() * 3 });
    x += o.w + 16 + r() * 8;
  }
  // upper routes: a ramp launches onto a wooden bridge that carries the racer over the next stretch
  const plats = obs.filter(o => o.type === 'ramp').map((o, i) => ({ id: 'p' + i, x0: o.x + o.w + 1.2, x1: o.x + o.w + 1.2 + 26, top: RACE.platTop }));
  for (let px = 70; px < RACE.length - 60; px += 105) pods.push({ x: px + r() * 10, taken: {} });
  for (let px = 50; px < RACE.length - 30; px += 9) treats.push({ x: px + r() * 3, y: 0.4 + r() * 0.9, got: {} });
  return { obs, pods, treats, plats, length: RACE.length };
}
/* Rolling hills for the shared course. Heights are RELATIVE to this ground, so the terrain
   is scenery the camera travels through while every collision rule stays exact. */
export function terrain(x) { return 0.9 * Math.sin(x / 41) + 0.45 * Math.sin(x / 15 + 1.3) + 0.6 * Math.max(0, Math.sin(x / 97)); }
export function obstacleState(o, t, racers = null) {   // gates swing open on a timer and never close on a racer in the doorway
  if (o.type === 'gate') { const T = OBSTACLES.gate.period, k = ((t + o.phase) % T) / T, busy = !!racers && racers.some(r => r.x > o.x - RACE.racerR && r.x < o.x + o.w + RACE.racerR); return { open: busy || k < OBSTACLES.gate.open / T, x: o.x, busy }; }
  if (o.type === 'ball') return { open: false, x: o.x + OBSTACLES.ball.moving * Math.max(0, t - 8) * 0 };   // rolls in place (spins) so its footprint stays fair
  return { open: false, x: o.x };
}

/* -------------------------------------------------------------- racers -- */
export const SLOT_KINDS = ['human', 'bot', 'remote'];
export function makeRacers(slots) {
  return slots.map((s, i) => ({ slot: i, id: s.id, name: s.name, kind: s.kind, lane: s.lane ?? i, skill: s.skill ?? 1, pal: s.pal || null,
    x: 0, y: 0, vy: 0, v: 0, air: false, high: false, springNext: false, item: null, shield: false,
    tumble: 0, spin: 0, slow: 0, boost: 0, wind: 0, decoy: 0, magnet: 0, stars: 0, poof: 0,
    roll: 0, boostM: 0, plat: null, finished: false, time: null, cleared: 0, hits: 0, treats: 0, uses: 0, rolls: 0, boosts: 0, place: 0 }));
}
export const DEFAULT_SLOTS = (pal) => [
  { id: 'pudding', name: 'Pudding', kind: 'human', lane: 3, pal },
  { id: 'bot-mocha', name: 'Mocha', kind: 'bot', lane: 0, skill: 1.035, pal: { base: '#c79a72', shade: '#a5784f', deep: '#7d5636', belly: '#f2dcc4', inner: '#f2a7b7', eye: '#3b2d4f', nose: '#e07a8f', line: '#5e3f28' } },
  { id: 'bot-pepper', name: 'Pepper', kind: 'bot', lane: 1, skill: 1.0, pal: { base: '#b9bcc8', shade: '#9396a6', deep: '#6d7084', belly: '#eef0f6', inner: '#f2b4c4', eye: '#3b2d4f', nose: '#e07a8f', line: '#4f5266' } },
  { id: 'bot-ginger', name: 'Ginger', kind: 'bot', lane: 2, skill: 0.975, pal: { base: '#f2b37a', shade: '#e09350', deep: '#b86e30', belly: '#fff0dc', inner: '#f6b4c4', eye: '#3b2d4f', nose: '#e07a8f', line: '#8a4f20' } },
];

/* ------------------------------------------------------------- the race -- */
export function createRace({ seed = 22, slots, autopilot = false } = {}) {
  const R = { seed, rnd: rng(seed * 7 + 3), t: 0, acc: 0, course: buildCourse(seed), racers: makeRacers(slots), finishOrder: [], ended: false, autopilot,
              zones: [], shots: [], events: [], ops: {}, opsLog: [], lastPlaces: [], placeHist: [], inputQ: [], uid: 0, appliedEffects: new Set(), phase: 'countdown', countdown: 3 };
  return R;
}
const ev = (R, type, data) => { const e = { id: ++R.uid, t: +R.t.toFixed(3), type, ...data }; R.events.push(e); if (R.events.length > 200) R.events.shift(); return e; };
export function human(R) { return R.racers.find(r => r.kind === 'human'); }
export function places(R) {
  const done = R.finishOrder.slice(), rest = R.racers.filter(r => !r.finished).sort((a, b) => b.x - a.x || a.slot - b.slot);
  return [...done.map(id => R.racers.find(r => r.id === id)), ...rest];
}
export function placeOf(R, id) { return places(R).findIndex(r => r.id === id) + 1; }

/* Inputs are queued and consumed on the next fixed step: 'jump' | 'item'. */
export function input(R, racerId, action) { R.inputQ.push({ racerId, action }); }

export function step(R, dt) {
  R.acc += dt;
  while (R.acc >= RACE.dt) { R.acc -= RACE.dt; fixed(R, RACE.dt); }
}
function fixed(R, dt) {
  if (R.ended) return;
  if (R.phase === 'countdown') { R.countdown -= dt; if (R.countdown <= 0) { R.phase = 'run'; ev(R, 'go', {}); } return; }
  if (R.phase !== 'run') return;
  R.t += dt;
  for (const q of R.inputQ.splice(0)) { const r = R.racers.find(x => x.id === q.racerId); if (r) act(R, r, q.action); }
  for (const r of R.racers) { if (r.kind === 'bot' || (R.autopilot && r.kind === 'human')) brain(R, r); move(R, r, dt); }
  for (const s of R.shots) shotStep(R, s, dt);
  R.shots = R.shots.filter(s => !s.done);
  R.zones = R.zones.filter(z => z.until > R.t);
  photoOps(R);
  if (R.racers.every(r => r.finished)) end(R, 'all-finished');
  else if (R.t >= RACE.timeoutS) end(R, 'timeout');
}
function end(R, why) {
  // anyone still running resolves safely by distance, so all four always get a placement
  for (const r of R.racers.filter(x => !x.finished).sort((a, b) => b.x - a.x || a.slot - b.slot)) { r.finished = true; r.time = null; r.resolved = true; R.finishOrder.push(r.id); }
  R.racers.forEach(r => { r.place = R.finishOrder.indexOf(r.id) + 1; });
  R.ended = true; R.phase = 'podium'; R.endWhy = why; ev(R, 'end', { why, order: R.finishOrder.slice() });
}

function act(R, r, a) {
  if (r.finished || r.tumble > 0) return;
  if (a === 'jump') {
    if (!r.air) { r.vy = r.springNext ? RACE.springV : RACE.jumpV; r.air = true; r.high = false; if (r.springNext) { r.springNext = false; ev(R, 'effect', { racer: r.id, effect: 'spring' }); } }
    else if (!r.high) { r.vy = Math.max(r.vy, RACE.highV); r.high = true; }
  } else if (a === 'item' && r.item) useItem(R, r);
  else if (a === 'dodge' && !r.air && r.roll <= 0) { r.roll = RACE.rollT; r.rolls++; ev(R, 'roll', { racer: r.id }); }
  else if (a === 'boost' && r.boostM >= 1) { r.boostM = 0; r.boost = RACE.boostT; r.boosts++; ev(R, 'boost', { racer: r.id }); }
}
/* One use resolves exactly once: the item is consumed before its effect is applied,
   and every effect carries an id that can only be applied a single time. */
function useItem(R, r) {
  const item = r.item; r.item = null; r.uses++;
  const e = ev(R, 'use', { racer: r.id, item });
  const apply = (target, effect, fn) => { const key = `${e.id}:${target.id}`; if (R.appliedEffects.has(key)) return false; R.appliedEffects.add(key); fn(target); ev(R, 'effect', { racer: target.id, effect, by: r.id, item, use: e.id }); return true; };
  switch (item) {
    case 'superTreat': apply(r, 'boost', t => { t.boost = 2.2; }); break;
    case 'tailwind': apply(r, 'wind', t => { t.wind = 1.6; }); break;
    case 'bubbleShield': apply(r, 'shield', t => { t.shield = true; }); break;
    case 'pawSpring': apply(r, 'spring', t => { t.springNext = true; }); break;
    case 'toyMagnet': apply(r, 'magnet', t => { t.magnet = 4; }); break;
    case 'stickyPuddle': R.zones.push({ x: r.x - 3, w: 3, until: R.t + 6, by: r.id, slow: 0.5 }); ev(R, 'effect', { racer: r.id, effect: 'slow', zone: true, use: e.id }); break;
    case 'squeakyDecoy': { const near = R.racers.filter(o => o !== r && !o.finished && Math.abs(o.x - r.x) < 14).sort((a, b) => Math.abs(a.x - r.x) - Math.abs(b.x - r.x))[0]; if (near) apply(near, 'decoy', t => hit(R, t, 'decoy', r)); break; }
    case 'superBall': { const ahead = R.racers.filter(o => o !== r && !o.finished && o.x > r.x).sort((a, b) => a.x - b.x)[0] || R.racers.filter(o => o !== r && !o.finished).sort((a, b) => b.x - a.x)[0]; if (ahead) R.shots.push({ use: e.id, by: r.id, target: ahead.id, x: r.x + 0.6, v: RACE.speed * 1.9, done: false }); break; }
  }
}
function shotStep(R, s, dt) {
  const t = R.racers.find(r => r.id === s.target); if (!t || t.finished) { s.done = true; return; }
  s.x += Math.sign(t.x - s.x || 1) * s.v * dt;
  if (Math.abs(s.x - t.x) < 0.5 && t.roll > 0) { s.done = true; ev(R, 'dodge', { racer: t.id, use: s.use }); return; }
  if (Math.abs(s.x - t.x) < 0.5) { s.done = true; const key = `${s.use}:${t.id}`; if (!R.appliedEffects.has(key)) { R.appliedEffects.add(key); hit(R, t, 'tumble', R.racers.find(r => r.id === s.by)); ev(R, 'effect', { racer: t.id, effect: 'tumble', by: s.by, item: 'superBall', use: s.use }); } }
}
/* A harmless cartoon hit: spin, stars, poof, a short slow recovery. A shield pops instead. */
function hit(R, r, kind, by) {
  if (r.shield) { r.shield = false; r.poof = 0.6; ev(R, 'effect', { racer: r.id, effect: 'poof', blocked: kind }); return false; }
  r.tumble = kind === 'decoy' ? 0.8 : 1.0; r.spin = 1; r.stars = 1.2; r.poof = 0.5; r.hits++; r.v = Math.min(r.v, 2);
  return true;
}

function move(R, r, dt) {
  if (r.finished) { r.v = Math.max(0, r.v - 6 * dt); r.x += r.v * dt; return; }
  // speed: cruise × skill, with boosts, slows and recovery
  let target = RACE.speed * r.skill;
  if (r.boost > 0) target *= 1.45; if (r.wind > 0) target *= 1.3;
  if (r.tumble > 0) target *= 0.25;
  const inZone = !r.air && (R.zones.some(z => z.by !== r.id && r.x > z.x && r.x < z.x + z.w) || R.course.obs.some(o => o.type === 'puddle' && r.x > o.x && r.x < o.x + o.w));
  if (inZone) target *= OBSTACLES.puddle.slow;
  r.v += Math.sign(target - r.v) * Math.min(Math.abs(target - r.v), RACE.accel * dt * (target < r.v ? 3 : 1));
  for (const k of ['boost', 'wind', 'tumble', 'spin', 'stars', 'poof', 'slow', 'magnet', 'roll']) if (r[k] > 0) r[k] = Math.max(0, r[k] - dt);
  // vertical: gravity, ground, springs and ramps
  // ground level: 0, or a bridge top while the racer is on it (bridges are real upper routes)
  const plat = R.course.plats.find(p => r.x >= p.x0 && r.x <= p.x1);
  if (r.plat && (!plat || plat.id !== r.plat)) { r.plat = null; if (r.y > 0 && !r.air) { r.air = true; r.vy = 0; } }
  const gl = r.plat ? plat.top : 0;
  if (r.air) { const py = r.y; r.vy -= RACE.g * dt; r.y += r.vy * dt;
    if (plat && !r.plat && r.vy < 0 && py >= plat.top - 0.02 && r.y <= plat.top) { r.y = plat.top; r.vy = 0; r.air = false; r.high = false; r.plat = plat.id; ev(R, 'bridge', { racer: r.id, plat: plat.id }); }
    else if (r.y <= gl) { r.y = gl; r.vy = 0; r.air = false; r.high = false; } }
  let nx = r.x + r.v * dt;
  for (const o of R.course.obs) {
    const spec = OBSTACLES[o.type], x0 = o.x, x1 = o.x + o.w;
    if (!spec.solid) {
      if (r.x < x0 && nx >= x0 && !r.air) { if (spec.launch) { r.vy = RACE.rampV; r.air = true; } if (spec.spring) { r.vy = RACE.springV; r.air = true; r.high = true; ev(R, 'effect', { racer: r.id, effect: 'bounce' }); } }
      continue;
    }
    if (o.type === 'gate' && obstacleState(o, R.t, R.racers.filter(q => q !== r)).open && !(r.x <= o.x - RACE.racerR && !obstacleState(o, R.t).open && !obstacleState(o, R.t, R.racers).busy)) continue;
    // SOLID: the racer's body may not overlap the obstacle volume
    const front = x0 - RACE.racerR, back = x1 + RACE.racerR;
    if (nx > front && r.x < back) {
      const clears = o.type === 'branch' ? r.y + (r.roll > 0 ? RACE.rollH : RACE.racerH) < spec.low || r.y >= 1 : r.y >= spec.h;
      if (!clears) {
        if (r.x <= front + 1e-6) {   // ran into its face: stop there, never inside
          nx = front;
          if (r.shield) { r.shield = false; r.vy = RACE.highV; r.air = true; r.high = true; r.poof = 0.6; ev(R, 'effect', { racer: r.id, effect: 'bounce', blocked: o.type }); }
          else if (r.tumble <= 0 && r.v > 2.5) { r.tumble = 0.7; r.spin = 0.7; r.stars = 1; r.hits++; r.v = 0; ev(R, 'bump', { racer: r.id, obstacle: o.id, obstacleType: o.type }); }
          else r.v = Math.min(r.v, 1.5);   // pressed against it (climbing or recovering): no repeat bump
        } else if (r.air) { r.y = Math.max(r.y, spec.h); }   // grazing the top while airborne: ride over it
      } else if (r.x < x0 && nx >= x0) { r.cleared++; r.boostM = Math.min(1, r.boostM + RACE.boostGain.clear); if (r.kind === 'human') R.lastClear = { t: R.t, id: o.id, type: o.type }; }
    }
  }
  // the racer cannot be pushed backward into an obstacle it already passed
  r.x = Math.max(r.x, Math.min(nx, R.course.length + 3));
  // pickups: a Paw Pod gives one random item if the racer has none
  for (const p of R.course.pods) if (!p.taken[r.id] && Math.abs(p.x - r.x) < 0.6) { p.taken[r.id] = true; r.boostM = Math.min(1, r.boostM + RACE.boostGain.pod); if (!r.item) { r.item = ITEM_IDS[Math.floor(R.rnd() * ITEM_IDS.length)]; ev(R, 'pickup', { racer: r.id, item: r.item }); } }
  for (const tr of R.course.treats) if (!tr.got[r.id] && Math.abs(tr.x - r.x) < (r.magnet > 0 ? 3.5 : 0.5) && (r.magnet > 0 || Math.abs(tr.y - r.y - 0.3) < 0.55)) { tr.got[r.id] = true; r.treats++; r.boostM = Math.min(1, r.boostM + RACE.boostGain.treat); }
  if (r.x >= R.course.length && !r.finished) { r.finished = true; r.time = +R.t.toFixed(2); R.finishOrder.push(r.id); ev(R, 'finish', { racer: r.id, place: R.finishOrder.length, time: r.time }); }
}

/* Bots (and the test autopilot) read the same course a player sees. */
function brain(R, r) {
  if (r.finished || r.tumble > 0) return;
  const look = R.course.obs.find(o => o.x + o.w > r.x - 0.2 && OBSTACLES[o.type].solid && !(o.type === 'gate' && obstacleState(o, R.t + (o.x - r.x) / Math.max(1, r.v)).open));
  const br = R.course.obs.find(o => o.type === 'branch' && o.x + o.w > r.x && o.x - r.x < r.v * 0.18 + 0.7);
  if (br && !r.air && r.roll <= 0 && r.y < 1) { act(R, r, 'dodge'); return; }
  if (r.boostM >= 1 && R.rnd() < 0.02) act(R, r, 'boost');
  if (look && look.type !== 'branch') {
    const d = look.x - r.x, lead = r.v * (0.12 + 0.05 * (1 - r.skill) * 10) + 0.4 + (R.rnd() - 0.5) * 0.25;
    if (!r.air && d < lead + 0.8 && d > 0) act(R, r, 'jump');
    if (r.air && !r.high && OBSTACLES[look.type].h > 0.9 && r.vy < 1.5 && d < 2.2) act(R, r, 'jump');
  }
  if (r.item && R.rnd() < 0.012) act(R, r, 'item');
}

/* Photo opportunities: windows during which a SNAP is a race photo of that kind. */
function photoOps(R) {
  const h = human(R); if (!h) return;
  const open = (k, dur = 1.2) => { const was = R.ops[k] && R.ops[k] > R.t; R.ops[k] = R.t + dur; if (!was) R.opsLog.push({ op: k, t: +R.t.toFixed(2) }); };
  const near = R.course.obs.find(o => o.type === 'hurdle' && Math.abs(o.x - h.x) < 2);
  if (h.air && near && h.y > 0.3) open('airborne-hurdle', 0.6);
  if (h.tumble > 0) open('tumble', 1.0);
  if (R.events.some(e => e.type === 'use' && e.racer === h.id && R.t - e.t < 0.05) || R.events.some(e => e.type === 'effect' && e.racer === h.id && R.t - e.t < 0.05)) open('power-up', 1.4);
  const pl = placeOf(R, h.id), prev = R.lastPlaces;
  if (prev.length && prev[prev.length - 1] !== pl && R.racers.some(o => o !== h && Math.abs(o.x - h.x) < 1.6)) open('close-pass', 1.0);
  if (prev.length && pl < prev[prev.length - 1]) { open('overtake', 1.4); ev(R, 'overtake', { racer: h.id, place: pl }); }
  R.lastPlaces.push(pl); if (R.lastPlaces.length > 60 * 10) R.lastPlaces.shift();
  if (R.lastPlaces.length >= 60 * 8 && R.lastPlaces[0] - pl >= 2) open('comeback', 2);
  if (!h.finished && R.course.length - h.x < 45) open('sprint-finish', 0.4);
  if (h.finished && R.finishOrder.length >= 2) { const i = R.finishOrder.indexOf(h.id), mine = h.time, others = R.racers.filter(o => o !== h && o.finished && o.time != null); if (others.some(o => Math.abs(o.time - mine) < 0.5)) open('near-tie', 2); }
}
export function activeOps(R) { return Object.entries(R.ops).filter(([, until]) => until > R.t).map(([k]) => k).concat(R.phase === 'podium' ? ['podium', ...(human(R)?.place === 1 ? ['celebration'] : [])] : []); }

/* Four reward layers (participation, milestone, performance, prestige). */
export function rewards(R) {
  const h = human(R), pl = h.place || placeOf(R, h.id);
  return { place: pl, participation: { coins: 40 }, milestone: h.cleared >= 20 ? { roll: 5 } : null,
           performance: { coins: [120, 80, 60, 40][pl - 1], roll: pl <= 3 ? 10 : 5 }, prestige: pl === 1 ? { cosmetic: 'Golden Paw Ribbon' } : null };
}
/* Headless full race (tests, evidence planning). */
export function simulate(seed, slots, opts = {}) {
  const R = createRace({ seed, slots, autopilot: true, ...opts });
  for (let i = 0; i < 60 * 200 && !R.ended; i++) step(R, RACE.dt);
  return R;
}
