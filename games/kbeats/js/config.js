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
  leadSec: { easy: 1.9, normal: 1.6, expert: 1.3 },
  chordWindowMs: 8,
  minLaneGapMs: { easy: 340, normal: 150, expert: 85 },
  maxNps: { easy: 3.2, normal: 6.5, expert: 12 },
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
};

export const LANES = [
  { key: 'D', alt: 'ArrowLeft',  color: '#22d3ee', glow: '#0ea5e9', dir: 'left',  glyph: '◀' },
  { key: 'F', alt: 'ArrowDown',  color: '#e540ff', glow: '#c026d3', dir: 'down',  glyph: '▼' },
  { key: 'J', alt: 'ArrowUp',    color: '#facc15', glow: '#eab308', dir: 'up',    glyph: '▲' },
  { key: 'K', alt: 'ArrowRight', color: '#22e07a', glow: '#16a34a', dir: 'right', glyph: '▶' },
];
