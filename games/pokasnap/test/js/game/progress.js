/* PROGRESSION — tiny on purpose: PLAY -> REWARD -> CUSTOMIZE -> PLAY AGAIN.
   Levels 1-10. XP from missions (and a little from care/training); coins buy
   cosmetics. Tricks are learned in TRAIN, and a learned trick becomes a pose. */

import { ITEMS } from '../data/items.js';
import { POSES } from '../data/poses.js';
import { SKILLS, TRICKS, REPS, skill as skillOf } from '../data/skills.js';
import { activeMissions, mission as missionOf } from '../data/missions.js';
import { hasAccess } from './entitlements.js';

import { MAX_LEVEL, LEVEL_XP, MASTERY, GATES, levelReward, starsFor, STAR_TRACK } from '../data/progression.js';
import { path as itemPath } from '../data/items.js';
export { MAX_LEVEL, LEVEL_XP };

export function levelFor(xp) {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (xp >= LEVEL_XP[m]) lo = m; else hi = m - 1; }
  return lo;
}
/** Mastery rank after Level 100 (0 before). Never ends. */
export function masteryFor(xp) { return xp < LEVEL_XP[MAX_LEVEL] ? 0 : Math.floor((xp - LEVEL_XP[MAX_LEVEL]) / MASTERY.xpPerRank) + 1; }
export function levelProgress(xp) {
  const l = levelFor(xp);
  if (l >= MAX_LEVEL) { const into = (xp - LEVEL_XP[MAX_LEVEL]) % MASTERY.xpPerRank; return { level: l, mastery: masteryFor(xp), into, need: MASTERY.xpPerRank, pct: into / MASTERY.xpPerRank }; }
  const a = LEVEL_XP[l], b = LEVEL_XP[l + 1];
  return { level: l, mastery: 0, into: xp - a, need: b - a, pct: (xp - a) / (b - a) };
}

/* What a level newly unlocks -- shown on the level-up card. */
export function unlocksAt(level) {
  return {
    items: ITEMS.filter(i => itemPath(i, 'LEVEL')?.level === level),
    tricks: level > 1 ? TRICKS.filter(s => s.level === level) : [],
    gate: GATES.find(g => g.level === level && level > 1) || null,
    reward: levelReward(level),
    poses: [],
  };
}

/* ---- poses & skills ---- */
export function learned(st) { return st.skills?.learned || SKILLS.filter(s => s.starter).map(s => s.id); }
/** Can the pet strike this pose right now? Trick poses need the trick. */
export function poseAvailable(st, poseId) {
  const p = POSES[poseId]; if (!p) return false;
  if (p.item) return hasAccess(st, p.item);           // catalog poses: owned (or Plus access)
  return !p.skill || learned(st).includes(p.skill);
}
/** Legacy level check (kept for old callers): every pose is level 1 now. */
export function poseUnlocked(poseId, level) { return (POSES[poseId]?.unlockLevel || 1) <= level; }

export function canTrain(st, skillId) {
  const s = skillOf(skillId);
  return !!s && !s.starter && !learned(st).includes(skillId) && (s.level || 1) <= st.progress.level;
}
/** One finished training game = one rep. Returns { reps, learnedNow }. */
export function practice(st, skillId) {
  if (!canTrain(st, skillId)) return { reps: st.skills.practice[skillId] || 0, learnedNow: false };
  const reps = (st.skills.practice[skillId] || 0) + 1;
  st.skills.practice[skillId] = reps;
  if (reps >= REPS) { st.skills.learned.push(skillId); return { reps, learnedNow: true }; }
  return { reps, learnedNow: false };
}

/* ---- XP (Bond) from anywhere. Coins never move here directly: level rewards
   go through game/ledger.js with once-only ids. ---- */
import * as ledgerMod from './ledger.js';
import { capLevel } from './chapters.js';
import { registerGrant, earnRevivalTreats } from './world.js';
export function grantXP(st, xp) {
  if (arguments.length > 2 && arguments[2]) throw new Error('grantXP no longer pays coins; use the ledger');
  const p = st.progress, oldLevel = p.level;
  p.xp += xp; p.level = capLevel(st, levelFor(p.xp));   // 1.4: certifications gate 50/60/70/80/90/100
  for (let l = oldLevel + 1; l <= p.level; l++) {
    const rw = levelReward(l);
    ledgerMod.earn(st, { id: `level:${l}`, source: 'level', amount: rw.coins });
    if (rw.diamonds) ledgerMod.earn(st, { id: `level:${l}:dia`, source: 'level', amount: rw.diamonds, currency: 'dia' });
  }
  const d = new Date(), day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;   // Bond earned today (recap)
  p.xpToday = p.xpToday?.day === day ? { day, xp: p.xpToday.xp + xp } : { day, xp };
  const granted = [];
  for (let l = oldLevel + 1; l <= p.level; l++)
    for (const it of unlocksAt(l).items) if (!st.inventory.includes(it.itemID)) { st.inventory.push(it.itemID); granted.push(it); }
  if (p.level >= 50) earnRevivalTreats(st);
  if (p.level >= 100 && !(st.titles || []).includes('Master Photographer')) { st.titles = [...(st.titles || []), 'Master Photographer']; st.monuments = [...(st.monuments || []), 'master']; }   // earn-only, never sold
  return { levelUp: p.level > oldLevel ? p.level : 0, granted };
}
registerGrant((st, xp) => grantXP(st, xp));

/**
 * Apply a finished snap: XP, snap count and best scores. First completion of a
 * mission pays full XP; replays pay half. COINS are decided by
 * game/adventure.onSnap through the ledger (first clears only -- no farming).
 */
export function applySnap(st, missionId, total) {
  const m = missionOf(missionId), p = st.progress;
  const first = !(missionId in p.missions);
  const prevBest = p.missions[missionId] || 0;
  const score = Math.min(100, total);   // 1.3: 0-100 score
  const xpGain = Math.round((first ? m.XPReward : m.XPReward * 0.35) + (score / 100) * 30);
  p.snaps += 1;
  if (!m.isDaily) p.missions[missionId] = Math.max(prevBest, score);   // the Daily Snap is not a mission clear
  const personalBest = score > p.bestScore;
  p.bestScore = Math.max(p.bestScore, score);
  // STARS: permanent best per challenge; a replay only adds the difference.
  st.stars = st.stars || {};
  const prevStars = st.stars[missionId] || 0, nowStars = m.isDaily ? 0 : starsFor(score);
  const starsGained = Math.max(0, nowStars - prevStars);
  if (starsGained) st.stars[missionId] = nowStars;
  const track = starsGained ? claimStarTrack(st) : [];
  const g = grantXP(st, xpGain);
  return { xpGain, first, prevBest, personalBest, missionBest: !first && score > prevBest, levelUp: g.levelUp, granted: g.granted, stars: nowStars, prevStars, starsGained, starTotal: totalStars(st), track };
}

export const totalStars = st => Object.values(st.stars || {}).reduce((a, b) => a + b, 0);
/** Pay every Star Track milestone reached and not yet claimed (idempotent by ledger id). */
export function claimStarTrack(st, now = Date.now()) {
  st.starTrack = st.starTrack || { claimed: {} };
  const have = totalStars(st), out = [];
  for (const m of STAR_TRACK) {
    if (have < m.stars || st.starTrack.claimed[m.stars]) continue;
    st.starTrack.claimed[m.stars] = now;
    const r = { stars: m.stars, label: m.label || m.title || `${m.stars} stars` };
    if (m.coins) r.coins = ledgerMod.earn(st, { id: `stars:${m.stars}`, source: 'stars', amount: m.coins, now }).amount;
    if (m.diamonds) r.diamonds = ledgerMod.earn(st, { id: `stars:${m.stars}:dia`, source: 'stars', amount: m.diamonds, currency: 'dia', now }).amount;
    if (m.item && !(st.inventory || []).includes(m.item)) { st.inventory.push(m.item); st.ownership = st.ownership || {}; st.ownership[m.item] = { via: 'STAR', at: now, ref: `stars:${m.stars}` }; r.item = m.item; }
    if (m.title) { st.titles = st.titles || []; if (!st.titles.includes(m.title)) st.titles.push(m.title); r.title = m.title; }
    out.push(r);
  }
  // STAR-route catalog items unlock at their star threshold (free, earn-only by stars)
  for (const it of ITEMS) {
    const sp = itemPath(it, 'STAR');
    if (sp && have >= sp.stars && !(st.inventory || []).includes(it.itemID)) { st.inventory.push(it.itemID); st.ownership = st.ownership || {}; st.ownership[it.itemID] = { via: 'STAR', at: now, ref: `stars:${sp.stars}` }; out.push({ stars: sp.stars, item: it.itemID, label: it.name }); }
  }
  return out;
}

/* The next mission: the first one not yet completed, else a replay. */
export function nextMission(st, afterId) {
  const list = activeMissions(new Date(), st.progress.level || 1);
  const todo = list.filter(m => !(m.missionID in st.progress.missions));
  if (todo.length) {
    const i = list.findIndex(m => m.missionID === afterId);
    return (todo.find(m => list.indexOf(m) > i) || todo[0]).missionID;
  }
  const i = list.findIndex(m => m.missionID === afterId);
  return list[(i + 1) % list.length].missionID;
}
