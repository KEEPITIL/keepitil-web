/* PROGRESSION v2 — the 100-level spine, mechanic gates, level rewards,
   post-100 Mastery, photo score (0-100), stars and the Star track.
   ---------------------------------------------------------------------------
   Four separate systems (never blurred):
     PHOTO SCORE  0-100 quality of one photo (game/score.js -> rate())
     STARS        0-5 per challenge, permanent mastery, never bought, never farmed
     XP / LEVEL   1-100, then Mastery ranks
     CURRENCIES   Poka Coins + Poka Diamonds (game/ledger.js)
   Every number is tunable here; tools/sim/simulate.mjs checks the pacing. */

export const MAX_LEVEL = 100;
/* cumulative XP to REACH level L (L>=2): A*(L-1)^B + linear*(L-1). Tuned by the 90-day
   simulation so an Extreme (5 h/day) player is nowhere near 100 in week one,
   while Casual players still level every day or two early on. The exponent
   steepens the top end (L100 ~ 650k XP). 1.2 saves never lose a level:
   game/state.js tops their XP up to their stored level once (additive). */
export const XP_CURVE = { A: 26, B: 2.2, linear: 50 };   // the linear term keeps the first levels from blurring together
export function xpToReach(L) { return L <= 1 ? 0 : Math.round(XP_CURVE.A * Math.pow(L - 1, XP_CURVE.B) + XP_CURVE.linear * (L - 1)); }
export const LEVEL_XP = Array.from({ length: MAX_LEVEL + 1 }, (_, L) => xpToReach(L));

/* After 100: Mastery ranks, each a fixed XP block, forever. */
export const MASTERY = { xpPerRank: 12000, maxShown: 999 };

/* Mechanic gates — each one visibly changes how you play. */
export const GATES = [
  { level: 1,   id: 'fundamentals', name: 'Fundamentals',        icon: '📸', blurb: 'Position, scale, poses, framing, simple missions.' },
  { level: 20,  id: 'props',        name: 'Prop Play',            icon: '🎾', blurb: 'Toss, place and play with props in the camera. Your pet catches, holds, chases and reacts.' },
  { level: 40,  id: 'filters',      name: 'Creative Camera',      icon: '🎞️', blurb: 'Filters and effects — warm, vintage, dreamy, snow, sparkle — and missions that need them.' },
  { level: 60,  id: 'time',         name: 'Time Adventures',      icon: '🌅', blurb: 'Morning, sunset and night missions on your own clock.' },
  { level: 80,  id: 'combo',        name: 'Combination Challenges', icon: '🧩', blurb: 'Challenges that need outfit + prop + pose + place, planned together.' },
  { level: 100, id: 'master',       name: 'Master Photographer',  icon: '🏅', blurb: 'Master challenges, sequences, limited assistance — and Mastery ranks forever.' },
];
export const gateUnlocked = (level, id) => level >= (GATES.find(g => g.id === id)?.level ?? 999);

/* Level-up rewards: coins every level, a diamond sprinkle at milestones,
   and catalog items at the levels items.js declares (LEVEL route). */
export function levelReward(L) {
  const r = { coins: 20 + Math.floor(L / 5) * 5 };
  if (L % 10 === 0) r.diamonds = 10;
  if (L % 25 === 0) r.diamonds = 25;
  return r;
}

/* ---------------------------------------------------------------- score 0-100 -- */
export const SCORE_WEIGHTS = { objective: 25, pose: 20, composition: 20, scale: 15, timing: 10, creative: 10 };
export const SCORE_LABELS = { objective: 'MISSION OBJECTIVE', pose: 'POSE / ACTION', composition: 'COMPOSITION', scale: 'POSITION / SCALE', timing: 'TIMING / INTERACTION', creative: 'CREATIVE / GEAR' };
export const STAR_BANDS = [[90, 5], [80, 4], [70, 3], [60, 2], [50, 1], [0, 0]];
export function starsFor(score) { return STAR_BANDS.find(([min]) => score >= min)[1]; }
export const STAR_TEXT = n => '★'.repeat(n) + '☆'.repeat(5 - n);

/* Star track: cumulative permanent stars -> rewards. Money cannot buy stars. */
export const STAR_TRACK = [
  { stars: 25,  coins: 150, label: 'Rising Snapper' },
  { stars: 50,  item: 'frame_starlight', label: 'Starlight Frame' },
  { stars: 75,  diamonds: 20, coins: 200 },
  { stars: 100, item: 'prop_goldball', label: 'Golden Ball prop' },
  { stars: 150, item: 'filter_stardust', label: 'Stardust filter' },
  { stars: 200, item: 'head_starcrown', label: 'Star Crown' },
  { stars: 250, diamonds: 40, title: 'Star Collector' },
  { stars: 300, item: 'body_cape_constellation', label: 'Constellation Cape' },
  { stars: 400, item: 'bg_observatory', label: 'Observatory background' },
  { stars: 500, item: 'neck_master_lens', label: 'Master Lens pendant', title: 'Five Hundred Stars' },
  { stars: 575, diamonds: 60 },
  { stars: 650, item: 'body_suit_aurora', label: 'Aurora Suit', title: 'Aurora' },
];
