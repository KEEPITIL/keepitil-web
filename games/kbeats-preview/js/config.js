/* KBeats tunables. Every gameplay/financial number lives here (or in the backend copy of it),
   never inline in the engine, so timing and scoring can be tuned after device testing without
   touching judgement code. Times in milliseconds unless the key says Sec. */
export const CONFIG = {
  windows: { perfect: 45, great: 90, good: 135, miss: 180 },
  accuracyWeight: { perfect: 1, great: 0.75, good: 0.5, miss: 0 },
  points: { perfect: 300, great: 200, good: 100, miss: 0 },
  /* combo → multiplier; first tier whose `at` the combo has reached (highest wins) */
  comboTiers: [{ at: 0, x: 1 }, { at: 10, x: 2 }, { at: 25, x: 4 }, { at: 50, x: 8 }],
  hype: { perfect: 0.035, great: 0.02, good: 0, miss: -0.06, durationSec: 8, multiplier: 2 },
  health: { start: 0.6, perfect: 0.015, great: 0.01, good: 0.004, miss: -0.07 },
  grades: [['S+', 0.98], ['S', 0.95], ['A', 0.9], ['B', 0.8], ['C', 0.7], ['D', 0]],
  stars: [0.6, 0.75, 0.85, 0.92, 0.97],      // accuracy for 1..5 stars on a cleared track
  holdReleaseGraceMs: 120,                   // a hold released this close to its tail still completes
  expireLagMs: 60,                           // live frame loop expires notes this late (see judge.js)
  swipeMinPx: 34,
  leadSec: { easy: 1.9, normal: 1.6, expert: 1.3, god: 1.0 },
  chordWindowMs: 8,
  minLaneGapMs: { easy: 340, normal: 150, expert: 85, god: 70 },
  maxNps: { easy: 3.2, normal: 6.5, expert: 12, god: 16 },
  maxRepeatSameLane: 8,
  gridToleranceMs: 6,
};

/* Revenue split is contract-versioned backend data; this copy only drives the landing-page
   explanation and the ledger unit tests. */
export const REVENUE = { platform_fee_bps: 1000, artist_share_bps: 9000, agreement_version: 'kbeats-artist-2026-10-draft' };

export const FLAGS = {
  soundcloud_oauth_enabled: false,     // no approved SoundCloud API credentials exist yet
  soundcloud_metadata_enabled: false,
  soundcloud_outbound_enabled: true,   // plain permalink links only, no API
  live_1v1_public: false,              // public Live 1v1 entry on the home screen; OFF until the private beta passes and the owner approves
  god_difficulty_enabled: false,       // GOD is architecture only this release: never playable, purchasable or unlockable while false
};

/* Difficulty identifiers are the stored ones (easy / normal / expert) so existing scores, sessions and
   leaderboards keep their meaning; the player-facing names are Easy / Medium / Hard. The lane count belongs
   to the CHART (kbeats.chart v2 carries `lanes`); a v1 chart is always four lanes whatever its difficulty,
   so historical charts and scores are never reinterpreted. These are the lane counts v2 charts are built with. */
export const DIFFICULTIES = {
  easy:   { label: 'Easy',   lanes: 3 },
  normal: { label: 'Medium', lanes: 4 },
  expert: { label: 'Hard',   lanes: 5 },
  god:    { label: 'God',    lanes: 5, locked: true },
};
export const PLAYABLE_DIFFICULTIES = ['easy', 'normal', 'expert'];
/* Future GOD unlock rule (not active). Verified Hard results only; thresholds are configurable here. */
export const GOD_UNLOCK = { from: 'expert', minAccuracy: 95, minVerifiedClears: 5, requireLanes: 5 };

const C = { cyan: ['#22d3ee', '#0ea5e9'], pink: ['#e540ff', '#c026d3'], gold: ['#facc15', '#eab308'], green: ['#22e07a', '#16a34a'], orange: ['#ff8a3d', '#f97316'] };
const lane = (key, alts, c, dir, glyph) => ({ key, alt: alts[0] || '', alts, color: C[c][0], glow: C[c][1], dir, glyph });
/* Keyboard layouts per lane count: home-row keys plus arrows; the centre lane of 3 and 5 is Space. */
export const LANE_SETS = {
  3: [lane('F', ['ArrowLeft'], 'cyan', 'left', '◀'), lane(' ', ['ArrowDown', 'ArrowUp'], 'gold', 'center', '●'), lane('J', ['ArrowRight'], 'green', 'right', '▶')],
  4: [lane('D', ['ArrowLeft'], 'cyan', 'left', '◀'), lane('F', ['ArrowDown'], 'pink', 'down', '▼'), lane('J', ['ArrowUp'], 'gold', 'up', '▲'), lane('K', ['ArrowRight'], 'green', 'right', '▶')],
  5: [lane('D', ['ArrowLeft'], 'cyan', 'left', '◀'), lane('F', ['ArrowDown'], 'pink', 'down', '▼'), lane(' ', ['G', 'H'], 'orange', 'center', '●'), lane('J', ['ArrowUp'], 'gold', 'up', '▲'), lane('K', ['ArrowRight'], 'green', 'right', '▶')],
};
export const LANES = LANE_SETS[4];
export const lanesFor = n => LANE_SETS[n] || LANE_SETS[4];
export const keyLabel = k => k === ' ' ? 'Space' : k;

/* Private preview build (served under /kbeats-preview/). Its known issues are shown to every tester. */
export const PREVIEW = typeof location !== 'undefined' && /\/kbeats-preview\//.test(location.pathname);
export const PREVIEW_NOTICE = 'PRIVATE PREVIEW · Easy/Medium/Hard charts are automatic and not yet refined (real-song audit: all songs need refinement) · multi-device start sync is a software estimate and can exceed the 50 ms target · runs are practice only and never ranked';
