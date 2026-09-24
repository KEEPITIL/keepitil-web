/* PROGRESSION — tiny on purpose: PLAY -> REWARD -> CUSTOMIZE -> PLAY AGAIN.
   Levels 1-10. XP from missions; coins from missions buy cosmetics. */

import { ITEMS } from '../data/items.js';
import { POSES } from '../data/poses.js';
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
    poses: Object.values(POSES).filter(p => p.unlockLevel === level && level > 1),
  };
}

export function poseUnlocked(poseId, level) { return (POSES[poseId]?.unlockLevel || 1) <= level; }

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
  const oldLevel = p.level;
  p.xp += xpGain; p.coins += coinGain; p.snaps += 1;
  p.missions[missionId] = Math.max(prevBest, total);
  const personalBest = total > p.bestScore;
  p.bestScore = Math.max(p.bestScore, total);
  p.level = levelFor(p.xp);
  // grant level items immediately so the closet reflects the reward
  const granted = [];
  for (let l = oldLevel + 1; l <= p.level; l++)
    for (const it of unlocksAt(l).items) if (!st.inventory.includes(it.itemID)) { st.inventory.push(it.itemID); granted.push(it); }
  return { xpGain, coinGain, first, personalBest, missionBest: total > prevBest, levelUp: p.level > oldLevel ? p.level : 0, granted };
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
