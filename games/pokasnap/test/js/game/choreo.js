/* PokaSnap 1.5 — Homeland choreography.
   Pure, DOM-free: the Homeland screen calls start() when a pet picks a behaviour and
   step() every frame, then draws actor.pose / actor.fx. Positions are 0..1 of the stage width.

   What it adds over 1.4 (where pets slid to a spot and swapped pose):
   - real locomotion: acceleration, top speed, walk/run gait, facing;
   - Chase: anticipation crouch → sprint after a rolling toy (or a fleeing pet) → catch → celebrate;
   - every relationship type has its own visible choreography;
   - care state changes body language (speed, distance, orientation, idle behaviour). */

export const MOOD = {
  healthy:   { speed: 1,    idle: null,       social: 1,   dim: 0,    label: 'engaged' },
  lonely:    { speed: 0.7,  idle: 'look',     social: 1.6, dim: 0,    label: 'seeks attention', front: true },
  stressed:  { speed: 1.25, idle: 'confused', social: 0.6, dim: 0,    label: 'restless', pace: true },
  snappy:    { speed: 0.9,  idle: 'surprised', social: 0,  dim: 0,    label: 'turns away', turnAway: true, grumble: true },
  withdrawn: { speed: 0.45, idle: 'lay',      social: 0,   dim: 0.25, label: 'distant', edge: true },
  critical:  { speed: 0.3,  idle: 'sleep',    social: 0,   dim: 0.45, label: 'weak — needs you', edge: true, curl: true },
  memorial:  { speed: 0,    idle: 'sleep',    social: 0,   dim: 1,    label: 'memorial' },
};
export const moodOf = id => MOOD[id] || MOOD.healthy;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TRICKS = ['jump', 'spin', 'salute', 'highfive'];

/** A pet chose behaviour b (from W.pickBehavior). Sets its script and, for duo behaviours, its partner's. */
export function start(a, b, actors, sc, now, rnd = Math.random) {
  const partner = b.with ? actors.find(x => x.pet.id === b.with) : null;
  const m = moodOf(a.mood);
  a.beh = b; a.fx = []; a.t0 = now;
  // care state first: an unhappy pet does not join in
  if ((m.edge || m.social === 0) && partner) { script(a, m.edge ? 'retreat' : 'refuse', { from: partner }); return a; }
  if (m.pace && rnd() < 0.7) { script(a, 'pace', { left: clamp(a.x - 0.12, 0.1, 0.9), right: clamp(a.x + 0.12, 0.1, 0.9) }); return a; }
  if (m.front && !partner && rnd() < 0.7) { script(a, 'seek', {}); return a; }
  if (m.edge) { script(a, 'retreat', {}); return a; }

  const id = b.id;
  if (id === 'use_object' && b.object) {
    const obj = sc.OBJECTS?.[b.object], i = sc.placed.indexOf(b.object), ox = 0.2 + i * 0.3;
    if (obj?.behavior === 'chase' || obj?.behavior === 'bounce') { script(a, 'chase', { toy: { x: ox, vx: (rnd() < 0.5 ? -1 : 1) * 0.32, y: 0, vy: 0, kind: b.object } }); return a; }
    script(a, 'goto', { x: ox + 0.08, then: b.pose || 'idle' }); return a;
  }
  if (!partner) { if (id === 'wander') script(a, 'goto', { x: 0.14 + rnd() * 0.72, then: 'idle' }); else script(a, 'hold', { pose: b.pose || 'idle' }); return a; }

  const pm = moodOf(partner.mood);
  if (pm.social === 0) { script(a, 'approach', { to: partner, gap: 0.2, then: 'look' }); return a; }   // partner is unwell: stays near, gently
  switch (id) {
    case 'chase': script(a, 'chase', { prey: partner }); script(partner, 'flee', { from: a }); break;
    case 'race': { const dir = (a.x + partner.x) / 2 < 0.5 ? 1 : -1, finish = dir > 0 ? 0.84 : 0.16, line = dir > 0 ? 0.16 : 0.84, sp = [0.9 + rnd() * 0.3, 0.9 + rnd() * 0.3];
      script(a, 'race', { finish, line, boost: sp[0], rival: partner }); script(partner, 'race', { finish, line: line + dir * 0.02, boost: sp[1], rival: a }); break; }
    case 'tug': { const mid = clamp((a.x + partner.x) / 2, 0.3, 0.7); script(a, 'tug', { at: mid - 0.13, other: partner }); script(partner, 'tug', { at: mid + 0.13, other: a, lead: false }); break; }
    case 'cuddle': case 'comfort': { const mid = clamp((a.x + partner.x) / 2, 0.18, 0.82); script(a, 'snuggle', { at: mid - 0.05, other: partner, pose: id === 'comfort' ? 'heart' : 'sleep' }); script(partner, 'snuggle', { at: mid + 0.05, other: a, pose: 'sleep' }); break; }
    case 'explore_together': case 'sniff_together': { const dir = rnd() < 0.5 ? 1 : -1, goal = dir > 0 ? 0.86 : 0.14;
      script(a, 'explore', { goal, lane: 0, other: partner }); script(partner, 'explore', { goal: goal - dir * 0.22, lane: 1, other: a }); break; }
    case 'practice_together': { const x0 = clamp(Math.min(a.x, partner.x), 0.2, 0.6); script(a, 'drill', { at: x0, delay: 0 }); script(partner, 'drill', { at: x0 + 0.24, delay: 0 }); break; }
    case 'teach': { const x0 = clamp(a.x, 0.2, 0.58); script(a, 'drill', { at: x0, delay: 0, mentor: true }); script(partner, 'drill', { at: x0 + 0.26, delay: 700, student: true }); break; }
    case 'play_together': case 'share_toy': case 'dance_together': { const mid = clamp((a.x + partner.x) / 2, 0.28, 0.72); script(a, 'turns', { at: mid - 0.12, other: partner, phase: 0, pose: b.pose }); script(partner, 'turns', { at: mid + 0.12, other: a, phase: 1, pose: b.pose }); break; }
    default: script(a, 'approach', { to: partner, gap: 0.24, then: b.pose || 'wave' });
  }
  if (partner && partner.s) partner.t0 = now;   // the partner's choreography starts on the same beat
  return a;
}
function script(a, kind, o) { a.s = { kind, ...o }; a.fx = []; }

/** Advance one actor by dt seconds. Sets a.x, a.vx, a.pose, a.flip, a.gait (0 still .. 1 sprint), a.fx. */
export function step(a, dt, now, world = {}) {
  const m = moodOf(a.mood), s = a.s || { kind: 'hold', pose: 'idle' }, el = (now - (a.t0 || now)) / 1000;
  const top = 0.28 * m.speed, acc = 0.9 * m.speed;
  let target = null, pose = s.pose || m.idle || 'idle', face = null; a.fx = [];
  const moveTo = (x, speed = top) => { target = clamp(x, 0.14, 0.86); a._top = speed; };
  switch (s.kind) {
    case 'goto': moveTo(s.x); pose = Math.abs(a.x - s.x) < 0.02 ? (s.then || 'idle') : 'idle'; break;
    case 'hold': if (m.idle) pose = m.idle; break;
    case 'seek': moveTo(0.5, top * 0.8); pose = 'look'; a.y = Math.min(a.y + dt * 0.02, 0.9); face = 0; break;   // comes to the front, faces the player
    case 'pace': { const leg = Math.floor(el / 1.1) % 2; moveTo(leg ? s.left : s.right, top * 1.1); pose = 'confused'; a.fx.push('sweat'); break; }
    case 'retreat': moveTo(a.x < 0.5 ? 0.1 : 0.9, top * 0.6); pose = m.curl ? 'sleep' : m.idle || 'lay'; break;
    case 'refuse': { const away = s.from ? (a.x < s.from.x ? -1 : 1) : 1; moveTo(a.x + away * 0.15, top); pose = m.idle || 'surprised'; face = away; if (m.grumble) a.fx.push('grumble'); break; }
    case 'approach': { const o = s.to; moveTo(o.x + (a.x < o.x ? -s.gap : s.gap)); pose = Math.abs(target - a.x) < 0.02 ? s.then : 'idle'; face = o.x > a.x ? 1 : -1; break; }
    case 'chase': {
      if (s.toy) {                                                     // rolling toy: physics
        const T = s.toy;
        if (!s.caught && el > 0.45) { T.x += T.vx * dt; T.vx *= Math.pow(0.55, dt); if (T.x < 0.16 || T.x > 0.84) { T.vx = -T.vx * 0.8; T.x = clamp(T.x, 0.16, 0.84); T.vy = -0.9; } }
        T.vy += 3 * dt; T.y = Math.min(0, T.y + T.vy * dt); if (T.y === 0) T.vy = Math.min(0, T.vy);
        if (el < 0.45) { pose = 'bow'; face = T.x > a.x ? 1 : -1; }               // anticipation crouch
        else if (!s.caught) { moveTo(T.x, top * 1.6); pose = 'leap'; if (Math.abs(T.x - a.x) < 0.035 && el > 0.8) { s.caught = el; T.vx = 0; } }
        else { T.x = a.x + (a.flip || 1) * 0.03; pose = el - s.caught < 0.8 ? 'catch' : 'happy'; if (el - s.caught > 0.8) a.fx.push('sparkle'); }
        a.fx.push({ toy: T });
      } else {                                                         // chasing a pet
        const p = s.prey; moveTo(p.x - (p.x > a.x ? 0.05 : -0.05), top * 1.4); pose = el < 0.4 ? 'bow' : Math.abs(p.x - a.x) < 0.07 ? 'happy' : 'leap';
      }
      break; }
    case 'flee': { const f = s.from; moveTo(a.x + (a.x < f.x ? -0.3 : 0.3), top * 1.3); pose = el < 0.4 ? 'surprised' : 'leap'; if (a.x < 0.1 || a.x > 0.9) pose = 'happy'; break; }
    case 'race': {
      if (el < 4.5 && !s.set) { moveTo(s.line, top * 1.2); pose = 'idle'; if (Math.abs(a.x - s.line) < 0.01) s.set = el; break; }   // walk to the start line
      if (!s.go) { const r = s.rival.s; if (s.set && r?.set) s.go = el + 0.8; else if (el > 5) s.go = el; }
      if (!s.go || el < s.go) { pose = 'bow'; face = s.finish > a.x ? 1 : -1; a.fx.push('ready'); break; }
      if (!s.done) { moveTo(s.finish, top * 1.7 * s.boost); pose = 'leap'; if (Math.abs(a.x - s.finish) < 0.015) { s.done = el; if (!world.raceWinner) world.raceWinner = a; } }
      else pose = world.raceWinner === a ? 'champion' : 'surprised';
      break; }
    case 'tug': moveTo(s.at); face = s.other.x > a.x ? 1 : -1; pose = 'catch'; a.tug = Math.sin(el * 5) * 0.012 * (s.lead === false ? -1 : 1); if (s.lead !== false) a.fx.push({ rope: s.other }); break;
    case 'snuggle': moveTo(s.at, top * 0.8); face = s.other.x > a.x ? 1 : -1; pose = Math.abs(a.x - s.at) < 0.02 ? s.pose : 'idle'; if (pose !== 'idle') a.fx.push('hearts'); break;
    case 'explore': { const lane = s.lane || 0; moveTo(el < 2.6 ? s.goal : s.goal, top * 0.75); pose = Math.abs(a.x - s.goal) < 0.03 ? (lane ? 'look' : 'sniff') : 'sniff'; a.fx.push('pawprints'); break; }
    case 'drill': {                                                    // training partners: in sync. mentor/student: student copies with a delay
      moveTo(s.at); face = s.student ? -1 : 1; if (s.mentor) face = 1;
      const k = Math.floor(Math.max(0, el * 1000 - (s.delay || 0)) / 1100); pose = el * 1000 < (s.delay || 0) ? 'look' : TRICKS[k % TRICKS.length];
      if (s.mentor) a.fx.push('teach'); if (!s.mentor && !s.student) a.fx.push('sync'); break; }
    case 'turns': moveTo(s.at); face = s.other.x > a.x ? 1 : -1; pose = (Math.floor(el / 0.8) + s.phase) % 2 ? (s.pose || 'jump') : 'happy'; break;
  }
  // locomotion
  if (target != null) {
    const d = target - a.x, want = clamp(d * 4, -(a._top || top), a._top || top);
    a.vx = (a.vx || 0) + clamp(want - (a.vx || 0), -acc * dt, acc * dt);
    if (Math.abs(d) < 0.004 && Math.abs(a.vx) < 0.02) a.vx = 0;
  } else a.vx = (a.vx || 0) * Math.pow(0.02, dt);
  a.x = clamp(a.x + (a.vx || 0) * dt, 0.14, 0.86);
  a.gait = Math.min(1, Math.abs(a.vx || 0) / 0.3);
  a.flip = face != null ? (face >= 0 ? 1 : -1) : Math.abs(a.vx) > 0.01 ? Math.sign(a.vx) : (a.flip || 1);
  // moving + a still pose would look like sliding: walk/run cycle
  if (a.gait > 0.15 && ['idle', 'look', 'sit', 'wave'].includes(pose)) pose = a.gait > 0.7 ? 'leap' : 'idle';
  a.pose = pose;
  return a;
}
