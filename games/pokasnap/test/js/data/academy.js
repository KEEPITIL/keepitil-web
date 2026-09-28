/* TRAINING ACADEMY — six disciplines x 10 ranks x 5 nodes = 300 nodes.
   ---------------------------------------------------------------------------
   Nodes are GENERATED from a seeded recipe per discipline, so there is no
   hand-copied level list and the same node is identical on every device.
   Rank bands: 1-3 Normal, 4-6 Intermediate, 7-8 Hard, 9 Expert, 10 Master.
   Each node pays a little XP and, the first time only, 3 stars' worth of
   progress toward the rank. Rewards are tricks, poses, cosmetics, titles,
   attribute growth and Threads -- never an infinite coin tap (coins are
   per-node first clear only and capped by the ledger's daily 'academy' cap). */

import { ITEMS } from './items.js';

export const RANKS = 10, NODES_PER_RANK = 5;
export const BAND = r => (r <= 3 ? 'Normal' : r <= 6 ? 'Intermediate' : r <= 8 ? 'Hard' : r === 9 ? 'Expert' : 'Master');
export const BAND_COLOR = { Normal: '#53d3a2', Intermediate: '#5ec8f2', Hard: '#ffb347', Expert: '#ff6b8b', Master: '#a98bf0' };

export const DISCIPLINES = [
  { id: 'yarn',    name: 'Yarn Lab',       icon: '🧶', attr: 'focus',       game: 'yarn',    blurb: 'Sort tangled yarn by colour into spools. Plan ahead — each spool holds one colour.' },
  { id: 'agility', name: 'Agility Course', icon: '💨', attr: 'agility',     game: 'agility', blurb: 'Tap in rhythm as your pet jumps hurdles and weaves poles.' },
  { id: 'fetch',   name: 'Fetch Training', icon: '🎾', attr: 'playfulness', game: 'fetch',   blurb: 'Time your throw so the toy lands in the target zone.' },
  { id: 'scent',   name: 'Scent Hunt',     icon: '🔍', attr: 'curiosity',   game: 'scent',   blurb: 'Follow warmer/colder clues to find the hidden treat.' },
  { id: 'trick',   name: 'Trick Studio',   icon: '🎩', attr: 'bond',        game: 'trick',   blurb: 'Repeat the command sequence to teach a new trick.' },
  { id: 'focus',   name: 'Focus Training', icon: '🎯', attr: 'focus',       game: 'focus',   blurb: 'Hold “stay” — tap only when the signal shows, ignore distractions.' },
];

/* Small deterministic PRNG so a node's puzzle never changes. */
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s >>>= 0) / 4294967296)); }
export const hash = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/* Per-discipline difficulty recipe: rank r (1-10), node n (1-5) -> parameters. */
const RECIPE = {
  // node 2 = perfect clear (no undo), node 4 from rank 4 = timed, rank 8+ = move limit
  yarn:    (r, n) => { const colors = Math.min(3 + Math.floor((r - 1) * 0.8) + (n > 3 ? 1 : 0), 12);
    return { colors, height: r >= 7 ? 5 : 4, empty: r >= 9 ? 1 : 2, locked: r >= 6 ? Math.min(r - 5, 2) : 0, moves: r >= 8 ? 40 + r * 4 : 0,
      mode: n === 2 ? 'perfect' : n === 4 && r >= 4 ? 'timed' : null, seconds: n === 4 && r >= 4 ? 45 + colors * 12 : 0 }; },
  agility: (r, n) => ({ beats: 8 + r * 2 + n, bpm: 70 + r * 8 + n * 2, window: Math.max(90, 220 - r * 12 - n * 2), obstacles: r >= 4 ? ['hurdle', 'weave', 'tunnel'] : ['hurdle'] }),
  fetch:   (r, n) => ({ throws: 3 + Math.ceil(r / 3), zone: Math.max(0.08, 0.28 - r * 0.018 - n * 0.004), wind: r >= 5 ? (r - 4) * 0.06 : 0, moving: r >= 7 }),
  scent:   (r, n) => ({ grid: 4 + Math.floor(r / 2), sniffs: Math.max(4, 12 - Math.floor(r * 0.7)), decoys: r >= 4 ? Math.floor(r / 3) : 0 }),
  trick:   (r, n) => ({ length: 2 + Math.floor(r / 2) + (n >= 4 ? 1 : 0), showMs: Math.max(420, 900 - r * 45), symbols: Math.min(4 + Math.floor(r / 3), 7) }),
  focus:   (r, n) => ({ duration: 10 + r * 2, signals: 4 + r, distractors: r * 2 + n, window: Math.max(260, 700 - r * 40) }),
};

/* Rank rewards — every rank pays something that matters, nothing infinite.
   ITEMS come from the catalog itself (any item with a TRAINING {discipline, rank}
   route), so the store's "how to get it" and the Academy can never disagree. */
const RANK_EXTRA = {
  yarn:    { 3: { threads: 1 }, 5: { grow: 3 }, 7: { threads: 2 }, 9: { grow: 3 }, 10: { title: 'Yarn Master', threads: 3, grow: 4 } },
  agility: { 2: { trick: 'weave' }, 3: { threads: 1 }, 5: { grow: 3 }, 7: { threads: 2 }, 9: { grow: 3 }, 10: { title: 'Agility Ace', threads: 3, grow: 4 } },
  fetch:   { 3: { threads: 1 }, 4: { grow: 3 }, 8: { threads: 2 }, 9: { grow: 3 }, 10: { title: 'Fetch Legend', threads: 3, grow: 4 } },
  scent:   { 3: { threads: 1 }, 4: { grow: 3 }, 8: { threads: 2 }, 9: { grow: 3 }, 10: { title: 'Master Sleuth', threads: 3, grow: 4 } },
  trick:   { 1: { trick: 'roll' }, 4: { trick: 'bow', grow: 3 }, 6: { threads: 1 }, 8: { threads: 2 }, 9: { grow: 3 }, 10: { title: 'Trick Star', threads: 3, grow: 4 } },
  focus:   { 3: { threads: 1 }, 5: { grow: 3 }, 8: { threads: 2 }, 9: { grow: 3 }, 10: { title: 'Zen Master', threads: 3, grow: 4 } },
};
const itemsFor = (d, r) => ITEMS.filter(it => it.paths.some(p => p.type === 'TRAINING' && p.discipline === d && p.rank === r)).map(it => it.itemID);
export function rankReward(d, r) {
  const x = { ...(RANK_EXTRA[d][r] || {}) }, items = itemsFor(d, r);
  if (items.length) x.items = items;
  return Object.keys(x).length ? x : null;
}

export const nodeId = (d, r, n) => `${d}-${r}-${n}`;
export function node(d, r, n) {
  const disc = DISCIPLINES.find(x => x.id === d);
  const seed = hash(nodeId(d, r, n));
  return {
    id: nodeId(d, r, n), discipline: d, rank: r, index: n, band: BAND(r), seed,
    params: RECIPE[d](r, n), boss: n === NODES_PER_RANK,
    xp: 12 + r * 6 + (n === NODES_PER_RANK ? 20 : 0),
    coins: n === NODES_PER_RANK ? 10 + r * 4 : 0,           // first clear of the rank's final node only
    attr: disc.attr,
    reward: n === NODES_PER_RANK ? rankReward(d, r) : null,
  };
}
export const ALL_NODES = DISCIPLINES.flatMap(d => Array.from({ length: RANKS }, (_, i) => Array.from({ length: NODES_PER_RANK }, (_, j) => node(d.id, i + 1, j + 1))).flat());

/* Daily Yarn: one shared puzzle per local day. Endless: rising difficulty, best height kept. */
export const dailyYarn = dayKey => ({ id: `yarn-daily-${dayKey}`, discipline: 'yarn', seed: hash('daily' + dayKey), params: RECIPE.yarn(5, 3), daily: true, xp: 40, coins: 15 });
export const endlessYarn = level => ({ id: `yarn-endless-${level}`, discipline: 'yarn', seed: hash('endless' + level), params: RECIPE.yarn(Math.min(10, 1 + Math.floor(level / 3)), 1 + (level % 5)), endless: true, xp: Math.min(30, 4 + level) });

/* Long-session care: a gentle, optional prompt. Never locks anything. */
export const WALK_PROMPT = { afterMinutes: 45, snoozeMinutes: 60, text: "You've had a big PokaSnap session! {name} has been training hard — want to continue your Adventure on a walk?", options: ['WALK WITH {NAME}', 'Keep playing'] };
