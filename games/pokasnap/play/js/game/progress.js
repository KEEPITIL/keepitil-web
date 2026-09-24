/* PROGRESSION — tiny on purpose: PLAY -> REWARD -> CUSTOMIZE -> PLAY AGAIN.
   Levels 1-10. XP from missions (and a little from care/training); coins buy
   cosmetics. Tricks are learned in TRAIN, and a learned trick becomes a pose. */

import { ITEMS } from '../data/items.js';
import { POSES } from '../data/poses.js';
import { SKILLS, TRICKS, REPS, skill as skillOf } from '../data/skills.js';
import { activeMissions, mission as missionOf } from '../data/missions.js';

export const MAX_LEVEL = 10;
// cumulative XP needed to REACH each level (index = level)
export const LEVEL_XP = [0, 0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];

export function levelFor(xp) {
  let l = 1;
  for (let i = 2; i <= MAX_LEVEL; i++) if (xp >= LEVEL_XP[i]) l = i;
  return l;
}
export function levelProgress(xp) {
  const l = levelFor(xp);
  if (l >= MAX_LEVEL) return { level: l, into: 1, need: 1, pct: 1 };
  const a = LEVEL_XP[l], b = LEVEL_XP[l + 1];
  return { level: l, into: xp - a, need: b - a, pct: (xp - a) / (b - a) };
}

/* What a level newly unlocks -- shown on the level-up card. */
export function unlocksAt(level) {
  return {
    items: ITEMS.filter(i => i.unlockRequirement.type === 'level' && i.unlockRequirement.level === level),
    tricks: level > 1 ? TRICKS.filter(s => s.level === level) : [],
    poses: [],   // poses now come from training; kept for callers
  };
}

/* ---- poses & skills ---- */
export function learned(st) { return st.skills?.learned || SKILLS.filter(s => s.starter).map(s => s.id); }
/** Can the pet strike this pose right now? Trick poses need the trick. */
export function poseAvailable(st, poseId) {
  const p = POSES[poseId]; if (!p) return false;
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

/* ---- XP from anywhere ---- */
export function grantXP(st, xp, coins = 0) {
  const p = st.progress, oldLevel = p.level;
  p.xp += xp; p.coins += coins; p.level = levelFor(p.xp);
  const granted = [];
  for (let l = oldLevel + 1; l <= p.level; l++)
    for (const it of unlocksAt(l).items) if (!st.inventory.includes(it.itemID)) { st.inventory.push(it.itemID); granted.push(it); }
  return { levelUp: p.level > oldLevel ? p.level : 0, granted };
}

/**
 * Apply a finished snap. First completion of a mission pays full XP; replays
 * pay half, so the loop always rewards a new mission most.
 */
export function applySnap(st, missionId, total) {
  const m = missionOf(missionId), p = st.progress;
  const first = !(missionId in p.missions);
  const prevBest = p.missions[missionId] || 0;
  const xpGain = Math.round((first ? m.XPReward : m.XPReward * 0.5) + (total / 5000) * 40);
  const coinGain = m.coinReward + (total >= 4000 ? 10 : 0);
  p.snaps += 1;
  p.missions[missionId] = Math.max(prevBest, total);
  const personalBest = total > p.bestScore;
  p.bestScore = Math.max(p.bestScore, total);
  const g = grantXP(st, xpGain, coinGain);
  return { xpGain, coinGain, first, prevBest, personalBest, missionBest: !first && total > prevBest, levelUp: g.levelUp, granted: g.granted };
}

/* The next mission: the first one not yet completed, else a replay. */
export function nextMission(st, afterId) {
  const list = activeMissions();
  const todo = list.filter(m => !(m.missionID in st.progress.missions));
  if (todo.length) {
    const i = list.findIndex(m => m.missionID === afterId);
    return (todo.find(m => list.indexOf(m) > i) || todo[0]).missionID;
  }
  const i = list.findIndex(m => m.missionID === afterId);
  return list[(i + 1) % list.length].missionID;
}
