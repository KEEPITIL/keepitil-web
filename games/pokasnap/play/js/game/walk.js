/* WALK WITH YOUR PET — game logic over a step COUNT (no GPS, no history).
   ---------------------------------------------------------------------------
   The fantasy: your pet went with you. PokaSnap stores only game-derived
   facts -- today's highest milestone reached, the last step reading of the
   day and an active walk session -- never a raw health history, and step data
   never goes to analytics or advertising (tests enforce it).

   Rewards: step milestones (once per milestone per day), Walk Session time
   milestones, and Journey Snap opportunities. Impossible jumps are FLAGGED,
   not paid; the game keeps working. Denied/unavailable steps change nothing
   else: every other path still earns. */

import { EARN, XP, STEP_MILESTONES, WALK_SESSION_MILESTONES, JOURNEY, WALK_CHEST, CAPS } from '../data/economy.js';
import * as ledger from './ledger.js';
import { grantXP } from './progress.js';

export function ensure(st) {
  st.walk = st.walk || { day: null, steps: 0, milestone: 0, lastReadAt: 0, session: null, journeys: { day: null, earned: 0, ready: 0 }, permission: 'unknown' };
  return st.walk;
}

/** Feed a fresh "steps today" reading. Returns { milestones:[..], flagged, journeyReady }. */
export function readSteps(st, steps, now = Date.now()) {
  const W = ensure(st), day = ledger.dayKey(now), out = { milestones: [], flagged: false, journeyReady: false };
  if (W.day !== day) { W.day = day; W.steps = 0; W.milestone = 0; W.lastReadAt = 0; }
  steps = Math.max(0, Math.floor(steps || 0));
  if (!ledger.clockOk(st, now)) { W.steps = Math.max(W.steps, steps); return { ...out, clock: true }; }
  const jump = steps - W.steps, mins = W.lastReadAt ? (now - W.lastReadAt) / 60e3 : Infinity;
  if (steps > CAPS.stepsSanityPerDay || (W.lastReadAt && jump > CAPS.stepsSanityPer10Min * Math.max(1, mins / 10))) {
    ledger.flag(st, 'steps', { steps, jump: Math.round(jump), mins: Math.round(mins) });
    out.flagged = true; W.steps = Math.max(W.steps, Math.min(steps, CAPS.stepsSanityPerDay)); W.lastReadAt = now; return out;
  }
  W.steps = Math.max(W.steps, steps); W.lastReadAt = now;
  for (const m of STEP_MILESTONES) {
    if (W.steps < m || W.milestone >= m) continue;
    W.milestone = m;
    const r = { steps: m, coins: ledger.earn(st, { id: `steps:${day}:${m}`, source: 'steps', amount: EARN.stepMilestones[m] || 0, now }).amount };
    if (XP.stepMilestones[m]) { grantXP(st, XP.stepMilestones[m]); r.xp = XP.stepMilestones[m]; }
    if (m === 10000) r.chest = WALK_CHEST;
    if (m === JOURNEY.unlockAtSteps) { addJourney(st, now); r.journey = true; out.journeyReady = true; }
    out.milestones.push(r);
  }
  return out;
}

/* ---------------------------------------------------------------- session -- */
export function startSession(st, stepsNow = null, now = Date.now()) {
  const W = ensure(st);
  if (W.session) return W.session;
  W.session = { start: now, startSteps: stepsNow, paid: {} };
  return W.session;
}
/** Check elapsed minutes and pay time milestones once. Safe to call every tick. */
export function tickSession(st, now = Date.now()) {
  const W = ensure(st), s = W.session; if (!s) return [];
  const mins = (now - s.start) / 60e3, out = [];
  for (const m of WALK_SESSION_MILESTONES) {
    if (mins < m || s.paid[m]) continue;
    s.paid[m] = now;
    const r = { minutes: m, coins: ledger.earn(st, { id: `walk:${s.start}:${m}`, source: 'walk', amount: EARN.walkSession[m] || 0, now }).amount };
    if (XP.walkSession[m]) { grantXP(st, XP.walkSession[m]); r.xp = XP.walkSession[m]; }
    if (m === JOURNEY.unlockAtWalkMinutes) { addJourney(st, now); r.journey = true; }
    if (m === 30) r.chest = WALK_CHEST;
    out.push(r);
  }
  return out;
}
export function endSession(st, stepsNow = null, now = Date.now()) {
  const W = ensure(st), s = W.session; if (!s) return null;
  const paid = tickSession(st, now);
  W.session = null;
  const steps = s.startSteps != null && stepsNow != null ? Math.max(0, stepsNow - s.startSteps) : null;
  return { minutes: Math.floor((now - s.start) / 60e3), steps, paid };
}

/* ---------------------------------------------------------------- journeys -- */
function journeys(st, now) {
  const W = ensure(st), day = ledger.dayKey(now);
  if (W.journeys.day !== day) W.journeys = { day, earned: 0, ready: 0 };
  return W.journeys;
}
export function addJourney(st, now = Date.now()) { const J = journeys(st, now); if (J.earned + J.ready < JOURNEY.perDay) J.ready++; return J.ready; }
export function journeyReady(st, now = Date.now()) { return journeys(st, now).ready > 0; }
/** A Journey Snap was taken: consumes one opportunity; paid within the daily limit. */
export function useJourney(st, snapId, now = Date.now()) {
  const J = journeys(st, now); if (!J.ready) return null;
  J.ready--; J.earned++;
  const coins = ledger.earn(st, { id: `journey:${snapId}`, source: 'journeySnap', amount: EARN.journeySnap, cap: JOURNEY.perDay, now }).amount;
  grantXP(st, XP.journeySnap);
  return { coins, xp: XP.journeySnap };
}
