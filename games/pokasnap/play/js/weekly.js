/* PokaSnap 2.2 C1.2 — the four owner-locked weekly games, as ONE registry.
   Race is fully built (raceSim.js + race.js). Dance, Flight and Switch are
   CONTRACTS: architecture, input mapping, event currency, Album hooks and
   the centre-diorama metadata are locked here so later phases build them
   without reinventing them. Their input functions are real code because the
   contract is enforced by tests (tools/tests/v22.mjs), not by prose.

   Reference matrix (principle borrowed → what is never copied):
     Race   — Fun Run 4: side view, 4 racers, mystery pickups, placement, podium
              → no characters, maps, weapons, traps, UI, sound, gore.
     Dance  — Tap Tap Music + DDR: incoming beats, hit zone, timing grades, combos
              → no lane art, note gems, judgement art, typography, choreography.
     Flight — Flappy-style one-touch: tap lift, gravity, gaps, quick retry
              → no pipes, bird, fonts, sound or trade dress.
     Switch — Subway Surfers: chase camera, 3 lanes, swipe L/R/up/down
              → no world, characters, props, collectibles or art. */

export const WEEKLY_MODES = {
  race: {
    id: 'race', name: 'Poka Race', status: 'built', reference: 'Fun Run 4 (feel only)',
    input: { scheme: 'paw', center: 'JUMP', left: 'ITEM', upRight: 'SNAP', right: 'EXIT', upLeft: null, doubleTap: 'high jump' },
    currency: { id: 'raceFlags', name: 'Race Flags', earnedBy: 'main-board photography + Training Trail' },
    rewards: ['participation', 'milestone', 'performance', 'prestige'],
    albumHooks: ['Hurdle Hero', 'Neck and Neck', 'Power-Up Face', 'Funny Tumble', 'Sprint Finish', 'Comeback Celebration', 'Photo Finish', 'Podium Paws', 'First Place Finish'],
    diorama: { kind: 'track', radius: 3.45, parts: ['oval track', 'start gate', 'hurdles', 'grandstands', 'crowd', 'banners', 'podium'], motion: 'four racers lap the oval' },
  },
  dance: {
    id: 'dance', name: 'Poka Dance', status: 'contract', reference: 'Tap Tap Music + DDR (concept only)',
    input: { scheme: 'paw', lanes: { left: 0, upLeft: 1, upRight: 2, right: 3 }, center: 'SNAP (photo moments only)', centerChanges: false },
    timing: { perfectMs: 45, greatMs: 90, goodMs: 140 },                  // |error| windows; beyond good = miss
    grades: { perfect: 'Purrfect', great: 'Great', good: 'Good', miss: 'Miss' },   // PokaSnap-original presentation words
    combo: { drives: ['choreography', 'stage lights', 'crowd', 'score'], never: 'pet strength' },
    currency: { id: 'beatTickets', name: 'Beat Tickets', earnedBy: 'main-board photography' },
    rewards: ['participation', 'milestone', 'performance', 'prestige'],
    albumHooks: ['Perfect Streak', 'In Sync', 'Costume Flourish', 'Spin Move', 'Finale Pose', 'Encore Bow'],
    diorama: { kind: 'stage', radius: 3.2, parts: ['round stage', 'four light towers', 'speaker stacks', 'crowd', 'rhythm runway'], motion: 'lights pulse to the beat; the performer dances centre stage' },
  },
  flight: {
    id: 'flight', name: 'Poka Flight', status: 'contract', reference: 'Flappy-style one-touch (grammar only)',
    input: { scheme: 'tap', tap: 'fixed lift impulse', hold: 'nothing (no continuous lift)', center: 'SNAP (special moments only)' },
    physics: { gravity: 22, lift: 7.4, maxFall: -11, forward: 4.2 },
    obstacles: { kind: 'garden gaps', vary: ['speed', 'gap height', 'moving gaps', 'wind', 'collectible routing'], never: 'more buttons' },
    themes: ['balloon harness', 'bubble flight', 'glider costume', 'wind tunnel', 'floating garden', 'festival sky course'],
    currency: { id: 'flightTokens', name: 'Flight Tokens', earnedBy: 'main-board photography' },
    rewards: ['participation', 'milestone', 'performance', 'prestige'],
    albumHooks: ['Gap Clear', 'Near Miss', 'Rare Floater', 'Sky Vista', 'Touchdown Cheer'],
    diorama: { kind: 'sky-garden', radius: 3.3, parts: ['floating flower islands', 'balloon arches', 'wind ribbons', 'cloud puffs'], motion: 'a balloon-harnessed flyer bobs through the arches' },
  },
  switch: {
    id: 'switch', name: 'Poka Switch', status: 'contract', reference: 'Subway Surfers (input + lane readability only)',
    input: { scheme: 'swipe', swipeLeft: 'lane left', swipeRight: 'lane right', swipeUp: 'jump', swipeDown: 'slide', buttons: false, snap: 'compact SNAP control' },
    lanes: 3, camera: 'behind the Poka (chase)',
    currency: { id: 'runPasses', name: 'Run Passes', earnedBy: 'main-board photography' },
    rewards: ['participation', 'milestone', 'performance', 'prestige'],
    albumHooks: ['Barrier Jump', 'Near Miss', 'Pickup Streak', 'Slide Under', 'Finish Pose'],
    diorama: { kind: 'lane-run', radius: 3.3, parts: ['three-lane garden path', 'arches', 'barrier gates', 'treat lines'], motion: 'the runner switches lanes down the path' },
  },
};
export const MODE_IDS = Object.keys(WEEKLY_MODES);

/* Data-driven rotation: roughly one featured mode per week, each event 3–7 days. */
export const ROTATION = { anchor: Date.UTC(2026, 9, 5), days: 7, order: ['race', 'dance', 'flight', 'switch'] };
export function activeMode(now = Date.now(), rot = ROTATION) {
  const k = Math.floor((now - rot.anchor) / (rot.days * 864e5));
  return rot.order[((k % rot.order.length) + rot.order.length) % rot.order.length];
}
/* Only the active event's currency can be spent; inactive modes are read-only. */
export function canSpend(modeId, currencyId, now = Date.now(), rot = ROTATION) {
  const m = WEEKLY_MODES[modeId]; if (!m) return false;
  return activeMode(now, rot) === modeId && m.currency.id === currencyId;
}

/* ---- Dance: four toes = four lanes; timing grade from the hit error ---- */
export function danceLane(role) { const l = WEEKLY_MODES.dance.input.lanes[role]; return l === undefined ? null : l; }
export function danceGrade(errorMs) {
  const t = WEEKLY_MODES.dance.timing, e = Math.abs(errorMs);
  return e <= t.perfectMs ? 'perfect' : e <= t.greatMs ? 'great' : e <= t.goodMs ? 'good' : 'miss';
}

/* ---- Flight: a TAP is one fixed impulse; holding adds nothing ---- */
export function flightStep(s, dt, events = []) {
  const P = WEEKLY_MODES.flight.physics; let vy = s.vy;
  for (const e of events) if (e === 'tapdown') vy = P.lift;           // only the press edge lifts
  vy = Math.max(P.maxFall, vy - P.gravity * dt);
  return { y: s.y + vy * dt, vy, x: s.x + P.forward * dt };
}

/* ---- Switch: swipes only; three lanes; buttons are not part of the contract ---- */
export function switchInput(s, gesture) {
  if (gesture.type !== 'swipe') return { ...s, rejected: gesture.type };
  const n = { ...s };
  if (gesture.dir === 'left') n.lane = Math.max(0, s.lane - 1);
  else if (gesture.dir === 'right') n.lane = Math.min(WEEKLY_MODES.switch.lanes - 1, s.lane + 1);
  else if (gesture.dir === 'up') n.action = 'jump';
  else if (gesture.dir === 'down') n.action = 'slide';
  return n;
}
export function swipeFrom(dx, dy, minPx = 24) {   // raw touch delta → swipe gesture
  if (Math.max(Math.abs(dx), Math.abs(dy)) < minPx) return { type: 'tap' };
  return { type: 'swipe', dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up') };
}
