/* PokaSnap 2.2 board core — pure rules, no DOM. Tested by tools/tests/v22.mjs.
   Movement is unlimited; photography (Snap Roll) is the spendable resource.
   Phase C1: 40 spaces, landmark contracts, species-driven reaction families,
   batch review recommendation, and the Poka Radio catalog rules. */
import { BOARD, BOARD_HALF, SPACE_COUNT, SPACES, LANDMARKS, CATEGORIES, OBJECTS, SPECIES, MULTIPLIERS, MULTIPLIER_LADDER, SNAP_ROLL, SNAP_COINS, BATCH_OPTIONS, SPEEDS, RADIO, LANE } from './config.js';

/* ------------------------------------------------------------ randomness -- */
export function rng(seed = 1) {           // mulberry32: reproducible for tests and evidence
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ----------------------------------------------------------------- board -- */
const wrap = i => ((i % SPACE_COUNT) + SPACE_COUNT) % SPACE_COUNT;
/* Space i -> world (x, z) at the centre of the space. The trail is a square
   ring; the origin is the board centre. Side 0 runs along +z (front edge,
   left to right), then up the right side, back across, and down the left. */
export function spacePos(i) {
  const n = BOARD.perSide, C = BOARD.corner, T = BOARD.tile, H = BOARD_HALF, e = H - C / 2;
  const k = wrap(i), side = Math.floor(k / n), j = k % n;
  // start corner and walking direction for each side
  const S = [[-e, e], [e, e], [e, -e], [-e, -e]][side], D = [[1, 0], [0, -1], [-1, 0], [0, 1]][side];
  if (j === 0) return { x: S[0], z: S[1], side, corner: true, w: C, d: C };
  const along = C / 2 + (j - 0.5) * T;
  return { x: S[0] + D[0] * along, z: S[1] + D[1] * along, side, corner: false, w: T, d: C, dir: D };
}
export function spaceInfo(i) { return SPACES[wrap(i)]; }
export function landmarkAt(i) { const s = spaceInfo(i); return s.landmark ? LANDMARKS.find(l => l.id === s.landmark) : null; }
/* Outward normal of the side a space sits on (where its landmark/prop stands). */
export function outward(i) { const { side } = spacePos(i); return [[0, 1], [1, 0], [0, -1], [-1, 0]][side]; }

/* Point along the trail at fractional position p (spaces). Interpolates
   between space centres so corners are walked, not cut. */
export function lanePos(i) {
  const p = spacePos(i);
  if (p.corner) return { ...p, x: p.x - Math.sign(p.x) * LANE, z: p.z - Math.sign(p.z) * LANE };
  const [nx, nz] = outward(i); return { ...p, x: p.x - nx * LANE, z: p.z - nz * LANE };
}
export function trailPoint(p) {
  const i = Math.floor(p), f = p - i;
  const a = lanePos(i), b = lanePos(i + 1);
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: turnHeading(i, f) };
}
/* Heading turns smoothly through a corner instead of snapping: within TURN of
   a node where the walking direction changes, it eases between the two legs. */
const TURN = 0.4;
const segHeading = i => { const a = lanePos(i), b = lanePos(i + 1); return Math.atan2(b.x - a.x, b.z - a.z); };
const angMix = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
export function turnHeading(i, f) {
  const h = segHeading(i);
  if (f < TURN) { const hp = segHeading(i - 1); if (Math.abs(Math.sin(hp - h)) > 0.1) return angMix(hp, h, 0.5 + 0.5 * f / TURN); }
  if (f > 1 - TURN) { const hn = segHeading(i + 1); if (Math.abs(Math.sin(hn - h)) > 0.1) return angMix(h, hn, 0.5 * (f - (1 - TURN)) / TURN); }
  return h;
}

/* ------------------------------------------------------- object behaviour -- */
export function rollDistance(objectId, rand) {
  const o = OBJECTS[objectId]; if (!o) throw new Error('unknown object ' + objectId);
  return o.min + Math.floor(rand() * (o.max - o.min + 1));
}
export function reactionFor(speciesId, objectId) {
  const sp = SPECIES[speciesId]; if (!sp) throw new Error('unknown species ' + speciesId);
  const r = sp.reactions[objectId]; if (!r) throw new Error(`${speciesId} has no reaction for ${objectId}`);
  return r;
}

/* A run is the full timed plan of one object use for one species. The
   multiplier is accepted and recorded ONLY so tests can prove it changes
   nothing here. Families are species-plausible: a rabbit never retrieves. */
export function planRun(objectId, from, rand, multiplier = 1, speciesId = 'rabbit') {
  const o = OBJECTS[objectId], rx = reactionFor(speciesId, objectId);
  const distance = rollDistance(objectId, rand);
  const travelS = distance / o.speed;
  const beats = [];
  let t = 0;
  const push = (phase, dur, extra = {}) => { beats.push({ phase, t0: t, t1: t + dur, ...extra }); t += dur; };
  const hopsOver = (n, a0, a1, from0 = 0, to1 = 1, apexK = 1) => { for (let h = 0; h < n; h++) push('hop', (a1 - a0) / n, { p0: from0 + (to1 - from0) * h / n, p1: from0 + (to1 - from0) * (h + 1) / n, apex: (0.22 + rand() * 0.14) * apexK }); };
  switch (rx.family) {
    case 'nudge': {     // rabbit + ball: hop-chase, catch up, nose-nudge it on, binky when it settles
      push('ready', 0.45);
      hopsOver(Math.max(2, Math.round(distance * 1.6)), 0, travelS * 0.7, 0, 0.72);
      push('nudge', 0.5, { p0: 0.72, p1: 0.86 });
      push('nudge', 0.5, { p0: 0.86, p1: 1.0 });
      push('binky', 0.55, { apex: 0.5 + rand() * 0.2 });
      push('happy', 0.9);
      break;
    }
    case 'hopchase': {  // rabbit + frisbee: hops after it, finds it on the ground, sniffs, binky
      push('ready', 0.5);
      hopsOver(Math.max(2, Math.round(distance * 1.5)), 0, travelS, 0, 1, 1.15);
      push('sniff', 0.9);
      push('binky', 0.55, { apex: 0.55 + rand() * 0.2 });
      push('happy', 0.8);
      break;
    }
    case 'savor': {
      push('sniff', 0.8 + rand() * 0.6);
      push('approach', travelS, { p0: 0, p1: 1 });
      push('eat', 1.6 + rand() * 0.8);
      push('savor', 1.2);
      push('happy', 0.9);
      break;
    }
    case 'hop': {       // bubbles: travel in hops; the number of rears/paws varies
      push('curious', 0.6);
      hopsOver(Math.max(2, distance * 2), 0, travelS, 0, 1, 1.4);
      const rears = 1 + Math.floor(rand() * 3);
      for (let r = 0; r < rears; r++) { push('rear', 0.55); push('paw', 0.45, { pop: rand() < 0.6 }); }
      push('happy', 0.9);
      break;
    }
    default: throw new Error('unknown family ' + rx.family);
  }
  return { object: objectId, species: speciesId, family: rx.family, from, to: from + distance, distance, duration: t, beats, multiplier };
}

/* State of a run at time t: which beat, where on the trail, height above ground. */
export function sampleRun(run, t) {
  const b = run.beats.find(x => t >= x.t0 && t < x.t1) || run.beats[run.beats.length - 1];
  const u = Math.min(1, Math.max(0, (t - b.t0) / (b.t1 - b.t0)));
  let prog = 0;
  for (const x of run.beats) { if (x.p1 == null) continue; if (t >= x.t1) prog = x.p1; else if (t >= x.t0) prog = x.p0 + (x.p1 - x.p0) * ease(u, x.phase); }
  let y = 0;
  if (b.phase === 'hop' || b.phase === 'binky') y = Math.sin(Math.PI * u) * b.apex;
  if (b.phase === 'rear') y = Math.sin(Math.PI * u) * 0.12;
  if (b.phase === 'nudge') y = Math.abs(Math.sin(Math.PI * u * 2)) * 0.05;
  return { phase: b.phase, u, pos: run.from + run.distance * prog, y, done: t >= run.duration, beat: b };
}
function ease(u, phase) { return phase === 'approach' ? u * u * (3 - 2 * u) : phase === 'hop' ? u : u; }

/* ------------------------------------------------------------- landing -- */
/* What a landing resolves to. Landmarks use their contract; other spaces use
   the category purpose. Economic payout stays with Snaps: landing gives small
   coins / flags / mood, never the primary reward. */
export function resolveLanding(i, rand = Math.random) {
  const s = spaceInfo(i), lm = landmarkAt(i);
  if (lm) {
    const reaction = lm.landing.reactions[Math.floor(rand() * lm.landing.reactions.length)];
    return { space: s, landmark: lm, label: lm.name, purpose: lm.landing.photoHooks[0], reaction, output: lm.landing.output, hue: CATEGORIES.landmark.hue };
  }
  const cat = CATEGORIES[s.cat];
  const output = s.cat === 'reward' ? { coins: 25 + Math.floor(rand() * 4) * 5 } : s.cat === 'event' ? { raceFlags: 1 } : s.cat === 'care' ? { mood: +1 } : s.cat === 'mystery' ? { mystery: ['butterfly', 'coin-shower', 'visitor'][Math.floor(rand() * 3)] } : {};
  return { space: s, landmark: null, label: s.name, purpose: cat.purpose, reaction: null, output, hue: cat.hue };
}

/* -------------------------------------------------------------- economy -- */
export function createRoll(now = 0, units = SNAP_ROLL.start) { return { units, at: now }; }
export function regen(roll, now) {
  if (roll.units >= SNAP_ROLL.cap) return { units: roll.units, at: now };
  const chunks = Math.floor((now - roll.at) / SNAP_ROLL.regenEveryMs);
  if (chunks <= 0) return roll;
  const units = Math.min(SNAP_ROLL.cap, roll.units + chunks * (SNAP_ROLL.regenChunk || 1));   // C1.5: regen arrives in chunks, never past the soft cap
  return { units, at: units >= SNAP_ROLL.cap ? now : roll.at + chunks * SNAP_ROLL.regenEveryMs };
}
/* Only a successful SNAP spends. Returns null if the roll can't cover it. */
export function spendSnap(roll, multiplier) {
  if (!MULTIPLIERS.includes(multiplier)) throw new Error('bad multiplier ' + multiplier);
  if (roll.units < multiplier) return null;
  return { ...roll, units: roll.units - multiplier };
}
/* The wallet may sit above the soft cap (gifts, events, purchases). */
export function addRoll(roll, units) { return { ...roll, units: roll.units + units }; }
/* Highest multiplier the wallet currently allows (ladder in config). */
export function maxMultiplier(units, ladder = MULTIPLIER_LADDER) { let m = 1; for (const r of ladder) if (units >= r.min) m = r.max; return m; }
export function legalMultipliers(units) { const mx = maxMultiplier(units); return MULTIPLIERS.filter(m => m <= mx && m <= Math.max(1, units)); }
/* Next multiplier when the toe is tapped: cycles only through legal values. */
export function nextMultiplier(current, units) { const L = legalMultipliers(units); const i = L.indexOf(current); return L[(i + 1) % L.length] ?? 1; }
/* If the wallet dropped below the selected rung, step down to the highest legal value. */
export function stepDown(current, units) { const L = legalMultipliers(units); return L.includes(current) ? current : (L[L.length - 1] ?? 1); }
/* Slow motion scales VISUAL playback time only. */
export function playbackDt(dt, speedId) { const sp = SPEEDS.find(x => x.id === speedId); if (!sp) throw new Error('bad speed ' + speedId); return dt * sp.factor; }
export function nextSpeed(id) { const i = SPEEDS.findIndex(x => x.id === id); return SPEEDS[(i + 1) % SPEEDS.length].id; }
/* What one SNAP costs and pays. Speed is accepted and must change nothing. */
export function snapOutcome(multiplier, speedId = 'normal', qualifying = true) { return { cost: multiplier, coins: snapReward(multiplier, qualifying) }; }

/* Moving, throwing, looking, zooming: free. Exists so the rule is explicit and testable. */
export function moveCost() { return 0; }
/* Coins a qualifying snap mints: multiplier scales ECONOMIC output only. */
export function snapReward(multiplier, qualifying = true) { return qualifying ? SNAP_COINS * multiplier : 0; }

/* --------------------------------------------------------- photo scoring -- */
/* A transparent, deterministic artistic score (0..100) from what the shot
   captured. It never reads the multiplier. Phase C1 keeps it simple: action
   timing, framing (camera preset), landmark backdrop, expression. */
const PHASE_SCORE = { binky: 34, hop: 26, nudge: 22, paw: 28, rear: 26, eat: 24, savor: 22, happy: 30, sniff: 14, approach: 12, ready: 10, curious: 12, idle: 8 };
const VIEW_SCORE = { front: 18, 'side-l': 22, 'side-r': 22, back: 10, elevated: 20, aerial: 12 };
export function scorePhoto(p) {
  let s = 20 + (PHASE_SCORE[p.phase] ?? 8) + (VIEW_SCORE[p.view] ?? 8);
  if (p.airborne) s += 10;
  if (p.landmark) s += 12;
  if (p.preset === 'board') s -= 15;         // an overview is not a portrait
  return Math.max(1, Math.min(100, Math.round(s)));
}
/* Batch review: small batches recommend the best 1, larger batches the top 3.
   Stable: ties keep capture order. */
export function recommend(photos, batchSize) {
  const scored = photos.map((p, i) => ({ i, p, score: scorePhoto(p) }));
  const n = (batchSize === 'MAX' || batchSize > 10) ? 3 : 1;
  return scored.slice().sort((a, b) => b.score - a.score || a.i - b.i).slice(0, Math.min(n, scored.length));
}
export function batchThreshold(option, cap = 100) { if (!BATCH_OPTIONS.includes(option)) throw new Error('bad batch ' + option); return option === 'MAX' ? cap : option; }

/* ------------------------------------------------------- camera relation -- */
/* Which directional art the camera sees, from the Poka's heading and the
   camera's position. 0 = camera faces the Poka's face. Elevated is a true
   three-quarter photographic angle, chosen by pitch; it still mirrors by
   screen direction like the side views. */
export function viewFor(petHeading, camYawWorld, pitch) {
  // C1.2: direction always decides. Approaching the lens shows the face, departing
  // shows the back, crossing shows a side; from high angles the crossing views use
  // the three-quarter 'elevated' art. No single static sprite slides around.
  let d = camYawWorld - petHeading;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const a = Math.abs(d);
  if (a < Math.PI * 0.25) return 'front';
  if (a > Math.PI * 0.75) return 'back';
  if (pitch >= 1.0) return 'aerial';
  if (pitch > 0.62) return 'elevated';
  return d > 0 ? 'side-l' : 'side-r';
}
export function isCameraMode(presetId) { return presetId !== 'board'; }

/* ----------------------------------------------------------------- radio -- */
/* The default library is chosen by catalog METADATA (album field) and
   trimmed by explicit per-track tags. A track that merely looks like it
   belongs (same artwork, null album) is not included until it is mapped. */
export function radioLibrary(tracks, albumId = RADIO.defaultAlbum, radio = RADIO) {
  const album = radio.albums.find(a => a.id === albumId); if (!album) throw new Error('unknown album ' + albumId);
  return tracks.filter(t => Object.entries(album.match).every(([k, v]) => t[k] === v))
               .filter(t => !(radio.tags[t.id] || []).some(tag => album.excludeTags.includes(tag)));
}
export function radioExcluded(tracks, albumId = RADIO.defaultAlbum, radio = RADIO) {
  const album = radio.albums.find(a => a.id === albumId);
  return tracks.filter(t => Object.entries(album.match).every(([k, v]) => t[k] === v)).filter(t => (radio.tags[t.id] || []).some(tag => album.excludeTags.includes(tag)));
}

/* -------------------------------------------------- solid world (C1.2) -- */
/* Solid things stay solid. These two rules replace C1.1's ghost opacity:
   (1) the trail lane never enters a footprint (pathClearance), and
   (2) in Camera Mode the lens orbits to a clear line of sight (clearYaw). */
export function pathClearance(solids, petR, steps = 8) {
  let worst = { gap: Infinity };
  for (let k = 0; k < SPACE_COUNT * steps; k++) {
    const tp = trailPoint(k / steps);
    for (const s of solids) { const gap = Math.hypot(tp.x - s.x, tp.z - s.z) - s.r - petR; if (gap < worst.gap) worst = { gap, at: +(k / steps).toFixed(3), solid: s.id || s.type }; }
  }
  return worst;
}
/* The first solid that blocks the sight line from the camera to the Poka, or null.
   yaw/pitch/dist describe the camera orbit around the Poka (as world.frame does). */
export function lineBlocked(pet, yaw, pitch, dist, solids, petR = 0.26) {
  const ux = Math.sin(yaw), uz = Math.cos(yaw), reach = dist * Math.cos(pitch), tp = Math.tan(pitch);
  for (const s of solids) {
    const dx = s.x - pet.x, dz = s.z - pet.z, t = dx * ux + dz * uz;
    if (t <= petR || t > reach) continue;
    if (Math.abs(dx * uz - dz * ux) > s.r + 0.12) continue;
    if ((pet.y || 0) + 0.3 + (t - s.r) * tp > s.h) continue;   // the sight line passes over it
    return s;
  }
  return null;
}
export const NUDGES = [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.1, -1.1, 1.5, -1.5];
export function clearYaw(pet, baseYaw, pitch, dist, solids, prev = 0) {
  if (!lineBlocked(pet, baseYaw + prev, pitch, dist, solids)) return { yaw: baseYaw + prev, nudge: prev };   // hysteresis: keep a clear nudge
  for (const k of NUDGES) if (!lineBlocked(pet, baseYaw + k, pitch, dist, solids)) return { yaw: baseYaw + k, nudge: k };
  return { yaw: baseYaw, nudge: 0, blocked: true };
}
