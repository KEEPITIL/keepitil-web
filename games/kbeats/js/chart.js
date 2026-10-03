/* KBeats beatmap format (kbeats.chart v1), hashing and the playability validator.
   Compact: notes are arrays [tMs, lane, typeCode, durMs, dirCode] — see BEATMAP_FORMAT.md. */
import { CONFIG } from './config.js';

export const TYPES = ['tap', 'hold', 'swipe'];
export const DIRS = ['left', 'down', 'up', 'right'];

export function fnv64(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0; h2 ^= h2 >>> 15;
  }
  return h1.toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function canonicalBody(chart) {
  const { trackId, chartVersion, difficulty, bpm, offsetMs, durationMs, notes } = chart;
  return JSON.stringify({ trackId, chartVersion, difficulty, bpm, offsetMs, durationMs, notes });
}
export const hashChart = c => fnv64(canonicalBody(c));

export function encodeNotes(notes) {
  return notes.map(n => [Math.round(n.t * 1000), n.lane, TYPES.indexOf(n.type), n.type === 'hold' ? Math.round(n.dur * 1000) : 0,
    n.type === 'swipe' ? DIRS.indexOf(n.dir) : -1]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
export function decodeNotes(arr) {
  return arr.map(([t, lane, ty, d, dir]) => {
    const n = { t: t / 1000, lane, type: TYPES[ty] };
    if (n.type === 'hold') n.dur = d / 1000;
    if (n.type === 'swipe') n.dir = DIRS[dir];
    return n;
  });
}

export function makeChart({ trackId, chartVersion = 1, difficulty, bpm, offsetMs = 0, durationMs, notes }) {
  const c = { format: 'kbeats.chart', v: 1, trackId, chartVersion, difficulty, bpm, offsetMs, durationMs, notes: encodeNotes(notes) };
  c.hash = hashChart(c);
  return c;
}

export function loadChart(c) {
  if (!c || c.format !== 'kbeats.chart' || c.v !== 1 || !Array.isArray(c.notes)) throw new Error('corrupt chart: bad header');
  if (hashChart(c) !== c.hash) throw new Error('corrupt chart: hash mismatch');
  return decodeNotes(c.notes);
}

/* Validator. Returns { ok, errors[], warnings[] }. Hard errors block publish. */
export function validate(chart, cfg = CONFIG) {
  const errors = [], warnings = [];
  const diff = chart.difficulty;
  const N = chart.notes;
  if (!['easy', 'normal', 'expert'].includes(diff)) errors.push('unknown difficulty');
  if (hashChart(chart) !== chart.hash) errors.push('hash mismatch');
  if (!N.length) errors.push('empty chart');
  const gap = cfg.minLaneGapMs[diff] || 85;
  const lastOnLane = [-1e9, -1e9, -1e9, -1e9];
  const holdEnd = [-1e9, -1e9, -1e9, -1e9];
  const seen = new Set();
  let run = 0, runLane = -1, lo = 0;
  for (let i = 0; i < N.length; i++) {
    const [t, lane, ty, d, dir] = N[i];
    const key = t + ':' + lane;
    if (seen.has(key)) errors.push(`duplicate note at ${t}ms lane ${lane}`); seen.add(key);
    if (lane < 0 || lane > 3 || !(ty in TYPES)) errors.push(`bad note at ${t}ms`);
    if (t < 0 || t + d > chart.durationMs) errors.push(`note outside track at ${t}ms`);
    if (i && t < N[i - 1][0]) errors.push('notes not sorted');
    if (t - lastOnLane[lane] < gap && t !== lastOnLane[lane]) errors.push(`lane ${lane} too dense at ${t}ms`);
    if (t <= holdEnd[lane]) errors.push(`note inside hold on lane ${lane} at ${t}ms`);
    if (ty === 2 && (dir < 0 || dir > 3)) errors.push(`swipe without direction at ${t}ms`);
    if (ty === 1 && d < 120) errors.push(`hold too short at ${t}ms`);
    // simultaneous requirement: notes starting here + holds still held must be ≤ 2 fingers
    let fingers = 0, swipeHere = false;
    while (lo < i && N[lo][0] < t - 20000) lo++;        // holds never exceed 20 s
    for (let k = lo; k < N.length; k++) {
      const o = N[k];
      if (o[0] > t + cfg.chordWindowMs) break;
      const start = Math.abs(o[0] - t) <= cfg.chordWindowMs;
      const held = o[2] === 1 && o[0] < t && o[0] + o[3] > t;
      if (start || held) { fingers++; if (start && o[2] === 2) swipeHere = true; }
    }
    if (fingers > 2) errors.push(`>2 simultaneous inputs at ${t}ms`);
    if (swipeHere && fingers > 1 && N.some(o => o[2] === 1 && o[0] < t && o[0] + o[3] > t)) errors.push(`swipe while holding at ${t}ms`);
    if (lane === runLane) run++; else { run = 1; runLane = lane; }
    if (run > cfg.maxRepeatSameLane) warnings.push(`lane ${lane} repeated ${run}× at ${t}ms`);
    lastOnLane[lane] = t; if (ty === 1) holdEnd[lane] = t + d;
    if (chart.bpm) {
      const step = 60000 / chart.bpm / 4, rel = (t - chart.offsetMs) / step;
      if (Math.abs(rel - Math.round(rel)) * step > cfg.gridToleranceMs) warnings.push(`off-grid note at ${t}ms`);
    }
  }
  if (N.length) {
    const secs = (N[N.length - 1][0] - N[0][0]) / 1000 || 1;
    const nps = N.length / secs;
    if (nps > (cfg.maxNps[diff] || 99)) errors.push(`density ${nps.toFixed(1)} nps exceeds ${diff} limit`);
    // windowed density (4 s) for easy charts
    if (diff === 'easy') for (let i = 0, j = 0; i < N.length; i++) {
      while (N[i][0] - N[j][0] > 4000) j++;
      if ((i - j + 1) / 4 > cfg.maxNps.easy * 1.25) { errors.push(`easy burst too dense near ${N[i][0]}ms`); break; }
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)].slice(0, 30) };
}

/* Repair pass used by the generator: drops whatever note causes a hard error, then rehashes. */
export function repair(chart, cfg = CONFIG) {
  const gap = cfg.minLaneGapMs[chart.difficulty] || 85;
  const out = [];
  const lastOnLane = [-1e9, -1e9, -1e9, -1e9], holdEnd = [-1e9, -1e9, -1e9, -1e9];
  const seen = new Set();
  for (const n of [...chart.notes].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const [t, lane, ty, d] = n;
    if (t < 0 || t + d > chart.durationMs) continue;
    if (seen.has(t + ':' + lane)) continue;
    if (t - lastOnLane[lane] < gap || t <= holdEnd[lane]) continue;
    const starting = out.filter(o => Math.abs(o[0] - t) <= cfg.chordWindowMs);
    const held = out.filter(o => o[2] === 1 && o[0] < t && o[0] + o[3] > t);
    if (starting.length + held.length >= 2) continue;
    if (ty === 2 && held.length) continue;
    if (ty === 1 && (starting.some(o => o[2] === 2))) continue;
    out.push(n); seen.add(t + ':' + lane); lastOnLane[lane] = t; if (ty === 1) holdEnd[lane] = t + d;
  }
  const c = { ...chart, notes: out };
  c.hash = hashChart(c);
  return c;
}
