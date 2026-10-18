/* Chart challenge metrics, computed only from the chart itself (no invented data). Used by the chart-quality
   audit, the tests that keep Hard harder than Medium, and the song library's overall challenge level. */
import { CONFIG } from './config.js';
import { chartLanes } from './chart.js';

export function chartStats(c) {
  const N = c.notes, lanes = chartLanes(c), lead = CONFIG.leadSec[c.difficulty] || 1.6;
  const times = [...new Set(N.map(n => n[0]))], span = N.length > 1 ? (N[N.length - 1][0] - N[0][0]) / 1000 : 1;
  let peak = 0;                                             // densest 2-second window
  for (let i = 0, j = 0; i < N.length; i++) { while (N[i][0] - N[j][0] > 2000) j++; peak = Math.max(peak, (i - j + 1) / 2); }
  // lane movement between consecutive note groups (a chord is one group): a group moves when it needs a lane
  // the previous group did not use; the jump is that lane's distance to the nearest previously used lane
  let moves = 0, travel = 0, prev = null;
  for (const t of times) {
    const at = N.filter(n => n[0] === t).map(n => n[1]);
    if (prev) { const fresh = at.filter(l => !prev.includes(l)); if (fresh.length) { moves++; travel += Math.max(...fresh.map(l => Math.min(...prev.map(p => Math.abs(l - p))))); } }
    prev = at;
  }
  const chords = N.length - times.length;
  return {
    notes: N.length, lanes, nps: +(N.length / span).toFixed(2), peakNps: +peak.toFixed(2), chords,
    holds: N.filter(n => n[2] === 1).length, swipes: N.filter(n => n[2] === 2).length,
    laneChangeRate: +(moves / Math.max(1, times.length - 1)).toFixed(3), meanJump: +(travel / Math.max(1, moves)).toFixed(2), leadSec: lead,
  };
}

/* One overall challenge number for a song: the Hard chart (else the hardest available) — notes per second
   scaled by the reading-time pressure of its approach speed, plus chords and lane travel. 1–10, rounded.
   It is a property of the published charts, so it changes only when a chart version changes. */
export function songChallenge(charts) {
  const c = charts.expert || charts.normal || charts.easy; if (!c) return null;
  const s = chartStats(c), raw = s.nps * (1.6 / s.leadSec) + 0.6 * s.peakNps / 2 + 2 * s.chords / Math.max(1, s.notes) + 0.5 * s.meanJump * s.laneChangeRate;
  return Math.max(1, Math.min(10, Math.round(raw * 1.1)));
}
export const CHALLENGE_BANDS = [[1, 3, 'Beginner'], [4, 5, 'Intermediate'], [6, 7, 'Advanced'], [8, 10, 'Expert']];
export const challengeBand = v => v == null ? null : CHALLENGE_BANDS.find(([a, b]) => v >= a && v <= b)?.[2];
